"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type ReactNode } from "react";
import { LeagueData, Sport, Game } from "@/lib/types";
import { buildHighlightShareUrl, type ShareCardMeta } from "@/lib/shareCard";
import { Preferences, Theme, loadPreferences, savePreferences, setRemoteSync, encodeFavorites, decodeFavorites } from "@/lib/preferences";
import { getAuthState, fetchRemotePrefs, pushRemotePrefs } from "@/lib/prefsSync";
import { fetchAllLeagues, ALL_LEAGUES, isLeagueActive, getActiveLeagueCandidates } from "@/lib/espn";
import { isDemoModeActive, applyDemoMode, isNoHitAlertDemoActive, applyNoHitAlertDemo } from "@/lib/demoMode";
import LeagueColumn from "@/components/LeagueColumn";
import GameDetailModal from "@/components/GameDetailModal";
import WorldCupGroupsModal from "@/components/WorldCupGroupsModal";
import FeedbackBox from "@/components/FeedbackBox";
import NewsColumn, { NewsColumnTitle, NewsSource, PlayHandler, PlayOpts } from "@/components/NewsColumn";
import SettingsPanel from "@/components/SettingsPanel";
import { fetchLeagueNews, fetchPrebaked, leagueSourceCascade, GENERIC_CASCADE, MOBILE_NEWS_LEAGUE_ORDER, ColumnSource, classifySource } from "@/lib/news";
import DateNav, { getDateString, CalendarDropdown, getETHour } from "@/components/DateNav";
import VideoModal from "@/components/VideoModal";
import AlignedVideoStrip from "@/components/AlignedVideoStrip";
import Link from "next/link";

function getResolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function getSmartDefaultOffset(cutoffHour = 13): number {
  // The base date this offset applies to (getDateString → getNowET) is shifted:
  // between midnight and 1 AM ET it has ALREADY rolled back to the prior
  // calendar day, whose slate is complete. Subtracting another day here would
  // land two days back (Jacob 6/13), so in that window show the service day
  // as-is (offset 0). Gated on the ET hour to match getNowET's shift basis.
  if (getETHour() < 1) return 0;
  // User-local hour. The cutoff represents "when today's slate has likely
  // started" from the user's wall-clock POV — Pacific user wants their own
  // 1 PM, not 1 PM ET (which is 10 AM for them).
  const hour = new Date().getHours();
  return hour < cutoffHour ? -1 : 0;
}

function resolveDefaultOffset(mode: "smart" | "today" | "yesterday" | undefined, cutoffHour?: number): number {
  if (mode === "today") return 0;
  if (mode === "yesterday") return -1;
  return getSmartDefaultOffset(cutoffHour);
}

type ViewMode = "scores-plain" | "scores-rated" | "news";

// iOS-style fixed bottom tab bar. Always pinned to the viewport bottom, sits
// over scrolled content with a translucent blurred background, three tabs:
// 🙈 No ratings  |  🙉 With ratings  |  📰 News. Selected state uses accent
// color on icon + label (no solid background fill) so it reads "elegant"
// rather than "chunky pill". Home-indicator clearance via safe-area inset.
function BottomTabBar({ viewMode, onChange, placement = "bottom" }: { viewMode: ViewMode; onChange: (m: ViewMode) => void; placement?: "bottom" | "inline" }) {
  const inline = placement === "inline";
  const tab = (mode: ViewMode, icon: ReactNode, label: string, title: string) => {
    const active = viewMode === mode;
    return (
      <button
        type="button"
        data-tab={mode}
        onClick={() => onChange(mode)}
        title={title}
        aria-label={title}
        aria-pressed={active}
        // Active styling (subtle bg-card-hover fill + neutral text, matching the
        // Yesterday/Today/Tomorrow date-nav pill — Jacob 6/1) is driven by CSS
        // keyed on html[data-view] + data-tab, NOT React inline styles, so the
        // pre-paint inline script in layout.tsx can highlight the right tab
        // before hydration. Inline styles would paint the default (Scores) tab
        // first and flash before the prefs effect flips to Ratings (Jacob 6/12).
        className={`view-tab flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors select-none rounded-lg m-1 ${inline ? "h-10" : "h-12"}`}
      >
        <span className="tab-icon flex items-center justify-center transition-opacity">
          {icon}
        </span>
        <span className="text-[10px] sm:text-[11px] font-medium leading-none">{label}</span>
      </button>
    );
  };
  return (
    <nav
      aria-label="View mode"
      className={inline ? "w-full flex justify-center" : "fixed left-0 right-0 bottom-0 z-40"}
      style={{
        background: "transparent",
        ...(inline
          ? {}
          : { background: "var(--bg)", borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }),
      }}
    >
      {/* Inline (desktop): a subtle segmented-control box so the tabs read as a
          deliberate nav, not floating icons. Bottom (mobile): full-width bar. */}
      <div
        className={inline ? "flex items-stretch w-72 rounded-xl overflow-hidden" : "max-w-md mx-auto flex items-stretch"}
        style={inline ? { background: "var(--bg-card)", border: "1px solid var(--border)" } : undefined}
      >
        {tab(
          "scores-plain",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/monkey-see-no-evil.svg" alt="" width={24} height={24} className="w-6 h-6" draggable={false} />,
          "Scores",
          "Scores (no ratings, no spoilers)",
        )}
        {tab(
          "scores-rated",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/monkey-hear-no-evil.svg" alt="" width={24} height={24} className="w-6 h-6" draggable={false} />,
          "Ratings",
          "Scores with ratings (sort by best games)",
        )}
        {tab(
          "news",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/news-emoji.svg" alt="" width={24} height={24} className="w-6 h-6 news-tab-emoji" draggable={false} />,
          "News",
          "News (full spoilers)",
        )}
      </div>
    </nav>
  );
}

// Vertical, one-per-row source-type filter used inside the funnel popover.
// Each row is tappable to select that filter; a drag handle reorders the
// rows (order persisted in prefs). Pointer-based drag (not HTML5) so it
// works on iOS — same approach as NewsOrderMenu. `dropIdx` is the insertion
// slot drawn as a thin accent bar between rows.
function NewsFilterList({ options, value, onSelect, onReorder }: {
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
  onReorder: (order: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [dragVal, setDragVal] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const order = options.map((o) => o.value);

  const startDrag = (e: React.PointerEvent, val: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragVal(val);
    setDropIdx(order.indexOf(val));
    const onMove = (ev: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));
      let next = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { next = i; break; }
      }
      setDropIdx(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragVal((curVal) => {
        setDropIdx((curDrop) => {
          if (curVal != null && curDrop != null) {
            const without = order.filter((v) => v !== curVal);
            const from = order.indexOf(curVal);
            const insertAt = curDrop > from ? curDrop - 1 : curDrop;
            without.splice(insertAt, 0, curVal);
            if (without.some((v, i) => v !== order[i])) onReorder(without);
          }
          return null;
        });
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div ref={listRef} className="select-none">
      {options.map((opt, i) => {
        const active = opt.value === value;
        const isDragging = dragVal === opt.value;
        return (
          <div key={opt.value} className="relative">
            {dropIdx === i && !isDragging && (
              <div className="absolute left-1 right-1 -top-px h-0.5 rounded z-10" style={{ background: "var(--accent)" }} />
            )}
            <div
              data-row
              className="flex items-center gap-1 rounded"
              style={{ background: isDragging ? "var(--bg-card-hover)" : "transparent", opacity: isDragging ? 0.6 : 1, touchAction: "none" }}
            >
              <span
                onPointerDown={(e) => startDrag(e, opt.value)}
                className="shrink-0 px-1 py-2 cursor-grab active:cursor-grabbing"
                style={{ color: "var(--text-muted)" }}
                aria-label="Drag to reorder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
                </svg>
              </span>
              <button
                type="button"
                onClick={() => onSelect(opt.value)}
                className="flex-1 min-w-0 text-left px-2 py-1.5 rounded text-sm whitespace-nowrap transition-colors cursor-pointer"
                style={active
                  ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 600 }
                  : { color: "var(--text-muted)", background: "transparent" }}
              >
                {opt.label}
              </button>
            </div>
          </div>
        );
      })}
      {dropIdx === options.length && (
        <div className="relative h-0.5 -mt-px mx-1 rounded" style={{ background: "var(--accent)" }} />
      )}
    </div>
  );
}

// Resolve sources into the user's preferred order. Unknown labels (e.g. a
// new source added after the user customized their order) fall through to
// the tail in cascade-default order, so new content still surfaces.
function applyOrder<T extends { label: string }>(sources: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return sources;
  const lookup = new Map(sources.map((s) => [s.label, s] as const));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const label of order) {
    const s = lookup.get(label);
    if (s) { out.push(s); seen.add(label); }
  }
  for (const s of sources) {
    if (!seen.has(s.label)) out.push(s);
  }
  return out;
}

// Drag-reorderable list of news source labels inside the ☰ menu. Pointer
// events (not HTML5 drag) so it works on iOS — captured on the handle, then
// window-level move/up listeners track the drag across re-renders even if
// the pointer leaves the row. `dropIdx` is the insertion slot (0..n), drawn
// as a thin accent bar between rows so the user can see where the item
// will land before releasing.
function NewsOrderMenu({
  cascadeOrder,
  currentOrder,
  hiddenLabels,
  onChange,
  onToggleHide,
  onReset,
}: {
  cascadeOrder: string[];        // default order from leagueSourceCascade
  currentOrder: string[] | undefined; // user's custom order, or undefined for Smart
  hiddenLabels: string[];        // sources the user has hidden via checkbox
  onChange: (order: string[]) => void;
  onToggleHide: (label: string) => void;
  onReset: () => void;
}) {
  const smartActive = !currentOrder || currentOrder.length === 0;
  // Visible order = custom (if any), with unknown labels filtered out.
  // When smart, show cascade.
  const visible = smartActive
    ? cascadeOrder
    : applyOrder(cascadeOrder.map((l) => ({ label: l })), currentOrder).map((s) => s.label);
  const listRef = useRef<HTMLDivElement>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const startDrag = (e: React.PointerEvent, label: string) => {
    e.preventDefault();
    setDragLabel(label);
    const startIdx = visible.indexOf(label);
    setDropIdx(startIdx);
    const onMove = (ev: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));
      let next = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { next = i; break; }
      }
      setDropIdx(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragLabel((curLabel) => {
        setDropIdx((curDrop) => {
          if (curLabel != null && curDrop != null) {
            const without = visible.filter((l) => l !== curLabel);
            const from = visible.indexOf(curLabel);
            // When dragging downward, the removal shifts every index after
            // `from` up by 1 — so we have to compensate the insertion slot.
            const insertAt = curDrop > from ? curDrop - 1 : curDrop;
            without.splice(insertAt, 0, curLabel);
            // No-op if order didn't actually change.
            const changed = without.some((l, i) => l !== visible[i]);
            if (changed) onChange(without);
          }
          return null;
        });
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-50 overflow-hidden"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between cursor-pointer transition-colors"
        style={{ color: smartActive ? "var(--accent)" : "var(--text)", borderBottom: "1px solid var(--border)" }}
        onClick={onReset}
        title="Reset to default order"
      >
        <span className="font-medium">Smart {smartActive ? "(default)" : ""}</span>
        {smartActive && <span aria-hidden="true">✓</span>}
      </button>
      <div ref={listRef} className="py-1 select-none">
        {visible.map((label, i) => {
          const isDragging = dragLabel === label;
          return (
            <div key={label} className="relative">
              {/* drop indicator above this row */}
              {dropIdx === i && !isDragging && (
                <div className="absolute left-2 right-2 -top-px h-0.5 rounded" style={{ background: "var(--accent)" }} />
              )}
              <div
                data-row
                className="px-3 py-2 text-sm flex items-center gap-2"
                style={{
                  background: isDragging ? "var(--bg-card-hover)" : "transparent",
                  opacity: isDragging ? 0.6 : 1,
                  touchAction: "none",
                }}
              >
                {/* Drag handle — only this part captures the drag pointer so
                    the checkbox + label remain tappable for their own actions. */}
                <span
                  onPointerDown={(e) => startDrag(e, label)}
                  className="shrink-0 cursor-grab active:cursor-grabbing"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Drag to reorder"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="9" x2="20" y2="9" />
                    <line x1="4" y1="15" x2="20" y2="15" />
                  </svg>
                </span>
                {/* Visibility checkbox — toggles the source on/off without
                    removing it from the order, so user can re-show later. */}
                <button
                  type="button"
                  onClick={() => onToggleHide(label)}
                  className="shrink-0 flex items-center justify-center rounded cursor-pointer"
                  style={{
                    width: "16px",
                    height: "16px",
                    background: hiddenLabels.includes(label) ? "transparent" : "var(--accent)",
                    border: "1px solid " + (hiddenLabels.includes(label) ? "var(--border)" : "var(--accent)"),
                  }}
                  aria-pressed={!hiddenLabels.includes(label)}
                  aria-label={hiddenLabels.includes(label) ? `Show ${label}` : `Hide ${label}`}
                  title={hiddenLabels.includes(label) ? "Hidden — tap to show" : "Visible — tap to hide"}
                >
                  {!hiddenLabels.includes(label) && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span
                  className="flex-1 min-w-0 truncate"
                  style={{ color: hiddenLabels.includes(label) ? "var(--text-muted)" : "var(--text)" }}
                >{label}</span>
              </div>
            </div>
          );
        })}
        {/* drop indicator at the very end */}
        {dropIdx === visible.length && (
          <div className="relative h-0.5 -mt-px mx-2 rounded" style={{ background: "var(--accent)" }} />
        )}
      </div>
    </div>
  );
}

// Subtle + button rendered after the visible league columns when at least
// one slot has been emptied. Click repopulates that slot with the first
// eligible league. Narrow column-shaped target so it visually slots into
// the grid without dominating it.
function AddColumnButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Add a league column"
      aria-label="Add a league column"
      className="flex items-center justify-center rounded-lg cursor-pointer transition-colors"
      style={{
        width: "44px",
        height: "44px",
        background: "transparent",
        border: "1px dashed var(--border)",
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}

// 5-column board breakpoint: at ≥1280px the max-w-7xl board fits five columns
// at ~236px each (above the 225px desktop column cap) — "room for all
// naturally". Below it the board stays at the classic 3 columns.
const WIDE_BOARD_QUERY = "(min-width: 1280px)";
const isWideViewport = () =>
  typeof window !== "undefined" && window.matchMedia(WIDE_BOARD_QUERY).matches;
// All slot indexes the prefs system knows about (slots 4-5 render wide-only).
const SLOT_INDICES = [0, 1, 2, 3, 4];

// Single-column board toggle — sits to the RIGHT of the calendar icon in the
// date-nav (scores view only). Flips prefs.singleColumn: stack every league in
// one wide column with bigger, condensed cards, vs the side-by-side board. The
// glyph shows the CURRENT state (one wide bar when on, two columns when off);
// accent-tinted when single-column is active. Mirrors the bare-icon styling of
// the calendar button it sits beside.
function SingleColToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-0.5 w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
      style={{ color: active ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
      title={active ? "Single-column view (on) — tap for columns" : "Single-column view — one wide column, bigger cards"}
      aria-label="Toggle single-column view"
      aria-pressed={active}
    >
      {active ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="3" width="12" height="18" rx="1.5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="18" rx="1.5" /><rect x="14" y="3" width="7" height="18" rx="1.5" />
        </svg>
      )}
    </button>
  );
}

export default function HomeContent({ initialOffset, worldCupHub }: { initialOffset?: number; worldCupHub?: boolean }) {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  // Compute smart default date client-side only to avoid SSG hydration mismatch.
  // Reads the persisted defaultDateMode pref so "always today" / "always yesterday"
  // overrides win over the smart-time logic.
  useEffect(() => {
    if (selectedDate === "") {
      const stored = loadPreferences();
      setSelectedDate(getDateString(initialOffset ?? resolveDefaultOffset(stored.defaultDateMode, stored.smartCutoffHour)));
    }
  }, [initialOffset, selectedDate]);
  const [showRatingsExplainer, setShowRatingsExplainer] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showFavToast, setShowFavToast] = useState(false);
  // World Cup banner: "Add" expands into a replace-which-column picker when
  // there's no emptied slot to fill (Jacob 6/11).
  const [wcReplaceOpen, setWcReplaceOpen] = useState(false);
  const [videoModal, setVideoModal] = useState<{ videoId: string; fallbackUrl: string; playbackUrl?: string | null; imageUrl?: string | null; embedUrl?: string | null; poster?: string | null; sourceLabel?: string | null; headline?: string | null; byline?: string | null; published?: string | null; body?: string | null; siblings?: PlayOpts[] | null; sibIndex?: number | null; shareCard?: ShareCardMeta | null } | null>(null);
  // Spoiler-safe game-details popup, opened by tapping a score card body.
  const [detailGame, setDetailGame] = useState<Game | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  // A WC group to spotlight in the groups overlay (tapped from a game card).
  const [groupsHighlight, setGroupsHighlight] = useState<string | null>(null);
  const [showNews, setShowNews] = useState(false);
  const [showNewsExplainer, setShowNewsExplainer] = useState(false);
  // Escape closes the ratings/news explainer warnings, matching their existing
  // backdrop-tap dismissal and the rest of the app's modals (GameDetailModal,
  // VideoModal, WorldCupGroupsModal all close on Escape).
  useEffect(() => {
    if (!showRatingsExplainer && !showNewsExplainer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowRatingsExplainer(false);
      setShowNewsExplainer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showRatingsExplainer, showNewsExplainer]);
  // First-run league picker (shown once, only on a brand-new install — see the
  // mount effect). pickerSel is the ordered set of chosen leagues (max 3, mapped
  // to slots 1/2/3 on confirm); firstRunRef captures "no stored prefs" at mount
  // so a later savePreferences() can't retroactively hide the picker.
  const [showLeaguePicker, setShowLeaguePicker] = useState(false);
  const [pickerSel, setPickerSel] = useState<Sport[]>([]);
  const firstRunRef = useRef(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // sortByMatchups removed — monkey toggle now controls both ratings visibility AND sort order
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
    skipExplainer: false,
    skipNewsExplainer: false,
    showNews: false,
  });

  useEffect(() => {
    const loaded = loadPreferences();
    // First-run detection for the league picker: a brand-new install has no
    // stored prefs blob yet. Capture this BEFORE the share-link path below can
    // call savePreferences() (which would write the blob and hide the signal).
    // A share link carries explicit league choices, so those visitors skip the
    // picker too.
    let noStored = typeof window !== "undefined" && !localStorage.getItem("nss-preferences");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sharedVideoId = params.get("v");
      if (
        params.has("f") || params.has("l") || params.has("fl") || params.has("t") ||
        params.has("th") || params.has("dd") || params.has("dv") || params.has("dr") || params.has("n")
      ) {
        // Support new compact format (f=m1.n15&l=m.n) and old format (f=mlb-1,mlb-2&fl=mlb,nba)
        const oldTeams = params.get("f")?.includes("-") ? params.get("f")!.split(",").filter(Boolean) : null;
        const oldLeagues = params.get("fl")?.split(",").filter(Boolean) as Sport[] | null;
        const decoded = decodeFavorites(params);
        loaded.favoriteTeams = oldTeams ?? decoded.teams ?? loaded.favoriteTeams;
        loaded.favoriteLeagues = oldLeagues ?? decoded.leagues ?? loaded.favoriteLeagues;
        if (decoded.thirdLeague) loaded.thirdLeague = decoded.thirdLeague;
        if (decoded.slotLeagues) {
          loaded.firstLeague = decoded.slotLeagues[0];
          loaded.secondLeague = decoded.slotLeagues[1];
          if (decoded.slotLeagues[2]) loaded.thirdLeague = decoded.slotLeagues[2];
          loaded.fourthLeague = decoded.slotLeagues[3];
          loaded.fifthLeague = decoded.slotLeagues[4];
        }
        if (decoded.theme) loaded.theme = decoded.theme;
        if (decoded.defaultDateMode) loaded.defaultDateMode = decoded.defaultDateMode;
        if (decoded.defaultLandingView) loaded.defaultLandingView = decoded.defaultLandingView;
        if (decoded.defaultRatings) loaded.defaultRatings = decoded.defaultRatings;
        if (decoded.newsThirdLeague) loaded.newsThirdLeague = decoded.newsThirdLeague;
        noStored = false; // shared setup = explicit league choices, skip the picker
        savePreferences(loaded);
        const keep = new URLSearchParams();
        // Preserve any highlight deep-link params (?v= and the h*-prefixed media
        // a non-YouTube clip carries) while stripping the consumed pref params.
        for (const k of ["v", "hs", "he", "hi", "hp", "hu", "hl", "ht", "c"]) {
          const val = params.get(k);
          if (val) keep.set(k, val);
        }
        const qs = keep.toString();
        window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      }
      // Reopen a shared highlight on cold load. YouTube clips need only ?v= (the
      // modal re-embeds by id); non-YouTube clips (redd.it/streamff MP4,
      // Brightcove embeds, image posts) carry their media in h*-prefixed params
      // built by buildHighlightShareUrl. The source URL/label/headline keep the
      // "Open on …" button + title correct even without the live feed.
      const hStream = params.get("hs");
      const hEmbed = params.get("he");
      const hImage = params.get("hi");
      const hSource = params.get("hu") || "";
      const hLabel = params.get("hl");
      const hHead = params.get("ht");
      const hPoster = params.get("hp");
      if (sharedVideoId) {
        setVideoModal({ videoId: sharedVideoId, fallbackUrl: hSource, sourceLabel: hLabel, headline: hHead, poster: hPoster });
      } else if (hStream || hEmbed || hImage) {
        setVideoModal({
          videoId: "",
          fallbackUrl: hSource,
          playbackUrl: hStream || null,
          embedUrl: hEmbed || null,
          imageUrl: hImage || null,
          poster: hImage || hPoster || null,
          sourceLabel: hLabel || null,
          headline: hHead || null,
        });
      }
    }
    // Apply launch-time normalization to a prefs blob: push it into React
    // state, run the ratings morning-safety reset + landing-view choice, and
    // set the theme attribute. Factored into a function so the cross-device
    // reconcile below can re-run it on the server copy without duplicating the
    // spoiler-safety logic.
    //   Ratings on launch: respect defaultRatings pref.
    //     auto (default) → keep the morning-safety reset (off before noon ET)
    //     off            → always off on launch
    //     on             → always on on launch
    //   News view does NOT reset — it's a viewer choice, not a spoiler surface.
    const applyLaunchState = (p: Preferences) => {
      const ratingsMode = p.defaultRatings ?? "auto";
      if (ratingsMode === "on") {
        p.showRatings = true;
      } else if (ratingsMode === "off") {
        p.showRatings = false;
      } else if (getETHour() < 12) {
        p.showRatings = false;
      }
      setPrefs(p);
      // Landing view: "remember" restores the last view EXCEPT across a day
      // boundary — a new calendar day (ET) since the last open drops a remembered
      // News view to Scores so the user never lands on yesterday's spoilers
      // (Jacob 6/19). Same-day reopens still restore News.
      const landing = p.defaultLandingView ?? "remember";
      const newDayPassed = !!p.lastOpenDay && p.lastOpenDay !== getDateString(0);
      if (landing === "news") setShowNews(true);
      else if (landing === "scores") setShowNews(false);
      else if (p.showNews && !newDayPassed) setShowNews(true);
      document.documentElement.setAttribute("data-theme", getResolvedTheme(p.theme));
      // Apply the headline reveal state at launch (mirrored in the effect below)
      // so reveal-on users don't see a one-frame blur flash before it runs.
      document.documentElement.classList.toggle("reveal-news-titles", !!p.revealNewsTitles);
    };
    const storedShowRatings = loaded.showRatings;
    applyLaunchState(loaded);
    // Stamp today's open so the next launch can detect a day rollover. Persist
    // lastOpenDay but NOT the morning ratings reset applyLaunchState applied (a
    // view-only reset, not a settings change) so the stored showRatings is intact.
    const todayOpen = getDateString(0);
    savePreferences({ ...loaded, showRatings: storedShowRatings, lastOpenDay: todayOpen });
    loaded.lastOpenDay = todayOpen;
    // Arm the first-run league picker for genuinely new installs. The actual
    // open waits until the in-season league list (thirdLeagueOptions) is ready,
    // in a separate effect below.
    firstRunRef.current = noStored && !loaded.leaguesOnboarded;

    // Cross-device preference sync (Sign in with Apple). Entirely a no-op for
    // signed-out users: getAuthState() reports signedIn:false and we stop, so
    // anonymous behavior (localStorage only) is unchanged. For signed-in users
    // we register the debounced uploader so future pref changes sync, then
    // reconcile this device with the server — the server copy wins when it
    // exists (it's the user's canonical setup across devices), otherwise we
    // seed the server from this device's local prefs.
    (async () => {
      try {
        const auth = await getAuthState();
        if (!auth.signedIn) return;
        setRemoteSync(pushRemotePrefs);
        const remote = await fetchRemotePrefs();
        if (remote && Object.keys(remote).length > 0) {
          const merged = { ...loadPreferences(), ...remote };
          savePreferences(merged); // persist locally (and re-affirm to server via the hook)
          applyLaunchState(merged);
        } else {
          pushRemotePrefs(loadPreferences()); // first sign-in for this account
        }
      } catch {
        /* sync is best-effort; the app stays fully functional without it */
      }
    })();
  }, []);

  // Track the OS color scheme in state so `resolvedTheme` re-derives live when
  // the system flips while theme === "system" (otherwise the data-theme attr
  // recolors the page but the "Currently rendering" readout stays stale).
  // Initialize to `true` on BOTH the server and the first client render so this
  // component's first paint resolves the same theme the SSR markup did
  // (getResolvedTheme's window-less fallback is "dark"). Reading the real OS
  // scheme in the initializer made the first client render disagree with the
  // server on light systems (sun vs moon icon, "Switch to light/dark" title) —
  // a hydration mismatch that forced React to recover the whole document,
  // momentarily wiping the inline-script data-theme attr and flipping the page
  // to light, which left the header theme/settings buttons flashing white
  // (their .monkey-toggle background transition lags the rest snapping back).
  // The mount effect below sets the real OS value immediately after.
  const [systemDark, setSystemDark] = useState<boolean>(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Only a REAL OS change event may write data-theme: this effect's mount
    // run happens while prefs is still the pre-localStorage default
    // ("system"), so writing here stomps the saved dark/light theme the load
    // effect just applied (every refresh flipped back to the OS color).
    const handler = () => {
      setSystemDark(mq.matches);
      if (prefs.theme === "system") {
        document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
      }
    };
    setSystemDark(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.theme]);

  // Reveal/blur news headlines globally. .news-title is blurred by default in
  // CSS (spoiler-safe); adding .reveal-news-titles to <html> un-blurs every
  // headline at once across columns, the video strip, and the modal — driven
  // by the eye toggle in the news header. On <html> (like data-theme) so it
  // reaches the modal regardless of where it mounts in the tree.
  useEffect(() => {
    document.documentElement.classList.toggle("reveal-news-titles", !!prefs.revealNewsTitles);
  }, [prefs.revealNewsTitles]);

  // Track narrow viewports so the news view can force a single stacked column
  // on phones (Jacob 5/30 — mobile news = 1 col, order News → the two score
  // leagues). Desktop stays at the fixed 3-column layout.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Track WIDE viewports for the 5-column board (Jacob 6/10 — "show 5 leagues
  // if there's room for all naturally"). State drives the render; the fetches
  // read the live matchMedia value via isWideViewport() so the very first load
  // already pulls 5 leagues on a desktop (no 3-then-5 double fetch).
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_BOARD_QUERY);
    const handler = () => setIsWide(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  // Scores-board slot count: 5 wide, 3 otherwise. News view stays 3-column.
  const slotCount = isWide ? 5 : 3;

  // The shareable hidescore link for a modal payload — identical to the modal's
  // own "Copy link" (see buildHighlightShareUrl). Returned root-relative ("/?…")
  // so (a) pushState is same-origin in every shell (prod / iOS app / localhost)
  // and (b) it lands on "/", where the worker injects the per-share OG preview.
  // Carries NO pref params, so copying the address bar shares the clip cleanly —
  // the recipient keeps their own leagues — exactly like Copy link. Syncing this
  // into the URL bar is why "copy the URL bar" == "Copy link".
  const modalShareHref = useCallback((m: {
    videoId?: string | null; playbackUrl?: string | null; embedUrl?: string | null;
    imageUrl?: string | null; poster?: string | null; fallbackUrl?: string | null;
    sourceLabel?: string | null; headline?: string | null; shareCard?: ShareCardMeta | null;
  }) => {
    const abs = buildHighlightShareUrl({
      videoId: m.videoId || null,
      playbackUrl: m.playbackUrl || null,
      embedUrl: m.embedUrl || null,
      imageUrl: m.imageUrl || null,
      posterUrl: m.poster || null,
      sourceUrl: m.fallbackUrl || null,
      sourceLabel: m.sourceLabel || null,
      headline: m.headline || null,
      cardKey: m.shareCard?.key ?? null,
    });
    return abs ? abs.replace(/^https?:\/\/[^/]+/, "") : null;
  }, []);

  const openVideoModal = useCallback((videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => {
    setVideoModal({ videoId, fallbackUrl, shareCard });
    const href = modalShareHref({ videoId, fallbackUrl, shareCard });
    if (href) window.history.pushState({ videoModal: true }, "", href);
  }, [modalShareHref]);

  // Game-card click → play a non-YouTube embed (NHL recaps via Brightcove)
  // inside the same modal. Pushes the shareable deep-link (?he=…&c=…) so Back /
  // Esc dismiss it AND copying the URL bar matches Copy link (the matchup card).
  const openEmbedModal = useCallback((embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null) => {
    setVideoModal({ videoId: "", fallbackUrl, embedUrl, sourceLabel, shareCard });
    const href = modalShareHref({ embedUrl, fallbackUrl, sourceLabel, shareCard });
    window.history.pushState({ videoModal: true }, "", href ?? window.location.href);
  }, [modalShareHref]);

  // News video card click → open the in-app modal. The card passes either a
  // prebake-matched YouTube videoId OR a direct HLS stream URL (MLB). If the
  // stream is available we play it directly; otherwise we fall back to the
  // YouTube iframe path. Cards with no inline option skip this handler and
  // render as plain anchors to the source URL.
  // PlayOpts → modal-state shape. Shared by the click handler and prev/next
  // paging so both produce the same modal object (incl. the sibling list).
  const optsToModal = useCallback((opts: PlayOpts) => ({
    videoId: opts.videoId || "",
    playbackUrl: opts.playbackUrl || null,
    embedUrl: opts.embedUrl || null,
    imageUrl: opts.imageUrl || null,
    poster: opts.poster || null,
    fallbackUrl: opts.fallbackUrl,
    sourceLabel: opts.sourceLabel || null,
    headline: opts.headline || null,
    byline: opts.byline || null,
    published: opts.published || null,
    body: opts.body || null,
    siblings: opts.siblings || null,
    sibIndex: opts.index ?? null,
  }), []);
  const playNewsVideo = useCallback<PlayHandler>((opts) => {
    const m = optsToModal(opts);
    setVideoModal(m);
    // Sync the address bar to the share link for EVERY news item (pics, redd.it
    // videos, NHL embeds — not just YouTube), so copying the URL bar previews the
    // pic/video just like Copy link. Back/Esc still dismiss (?v-less links close
    // via the popstate handler below, which fires on any non-?v entry).
    const href = modalShareHref(m);
    if (href) window.history.pushState({ videoModal: true }, "", href);
  }, [optsToModal, modalShareHref]);
  // Page to the previous/next post in the same Reddit column without closing the
  // modal (dir = -1 / +1). No-op past either edge. replaceState (not push) keeps
  // the URL bar pointed at the post you're actually looking at, without spamming
  // history with one entry per arrow press.
  const stepVideo = useCallback((dir: number) => {
    setVideoModal((m) => {
      if (!m?.siblings || m.sibIndex == null) return m;
      const ni = m.sibIndex + dir;
      if (ni < 0 || ni >= m.siblings.length) return m;
      const nm = optsToModal({ ...m.siblings[ni], siblings: m.siblings, index: ni });
      if (typeof window !== "undefined") {
        const href = modalShareHref(nm);
        if (href) window.history.replaceState(window.history.state, "", href);
      }
      return nm;
    });
  }, [optsToModal, modalShareHref]);

  const closeVideoModal = useCallback(() => {
    setVideoModal(null);
    if (typeof window !== "undefined" && window.history.state?.videoModal) {
      window.history.back();
    }
  }, []);

  // Sync modal with browser back/forward — close if ?v disappears from URL
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("v")) setVideoModal(null);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Safety net so the skeleton can never be permanent. The scoreboard +
  // enrichment fetches in lib/espn.ts are each individually bounded now, but
  // if a future fetch is ever added without a timeout, force the error/retry
  // state after 40s (above the ~31s worst-case real load) rather than hang.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchData = useCallback(async (
    date: string,
    thirdLeague?: Sport | "empty",
    slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty"; fourth?: Sport | "empty"; fifth?: Sport | "empty" },
    silent = false,
  ) => {
    // silent=true skips the global skeleton — used when only one slot changed
    // (header dropdown or settings panel). Old data stays visible until the
    // new pull resolves, which prevents the "all 3 columns flash gray" effect.
    if (!silent) setLoading(true);
    setError(false);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if (!silent) {
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        setLoading(false);
        setError(true);
      }, 40_000);
    }
    try {
      // Slot count reads the live viewport so the initial desktop load fetches
      // all 5 leagues in one pass (isWide state hasn't flipped yet on mount).
      let data = await fetchAllLeagues(date, thirdLeague, slotOverrides, isWideViewport() ? 5 : 3);
      if (isDemoModeActive()) data = applyDemoMode(data);
      if (isNoHitAlertDemoActive()) data = applyNoHitAlertDemo(data);
      setLeagues(data);
      // Real data won — clear any error the watchdog may have raised so a
      // slow-but-successful load still shows the board instead of the retry UI.
      setError(false);
    } catch {
      setLeagues([]);
      setError(true);
    } finally {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (!silent) setLoading(false);
    }
  }, []);

  // Two-effect split so slot/league pref changes don't flash the global
  // skeleton: the date-driven effect shows loading (initial mount + day swap
  // genuinely need the placeholder); the prefs-driven effect runs silently.
  // mountedRef gates the prefs effect so it doesn't double-fire on mount.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!selectedDate) return;
    fetchData(selectedDate, prefs.thirdLeague, {
      first: prefs.firstLeague,
      second: prefs.secondLeague,
      third: prefs.thirdLeague,
      fourth: prefs.fourthLeague,
      fifth: prefs.fifthLeague,
    }, false);
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // isWide is a dep so resizing across the 5-column breakpoint silently
  // fetches (or drops) the extra two leagues.
  useEffect(() => {
    if (!mountedRef.current || !selectedDate) return;
    fetchData(selectedDate, prefs.thirdLeague, {
      first: prefs.firstLeague,
      second: prefs.secondLeague,
      third: prefs.thirdLeague,
      fourth: prefs.fourthLeague,
      fifth: prefs.fifthLeague,
    }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague, isWide]);

  // Live-clock polling: while any game on the board is in-progress, silently
  // refetch every 10s so the Q4/period and clock keep advancing (matches
  // Google's sports-card behavior — clock jumps every poll, not every second).
  // Pauses when the tab is hidden so background tabs don't burn ESPN calls.
  const hasLiveGames = leagues.some(l => l.games.some(g => g.state === "in"));
  useEffect(() => {
    if (!hasLiveGames || !selectedDate) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      fetchData(selectedDate, prefs.thirdLeague, {
        first: prefs.firstLeague,
        second: prefs.secondLeague,
        third: prefs.thirdLeague,
        fourth: prefs.fourthLeague,
        fifth: prefs.fifthLeague,
      }, true);
    }, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLiveGames, selectedDate, prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague]);

  const updatePrefs = (update: Partial<Preferences>) => {
    const next = { ...prefs, ...update };
    setPrefs(next);
    savePreferences(next);
  };

  // Three-state view toggle: scores-plain (🙈) | scores-rated (🙉) | news.
  // Single segmented control in the header replaces the old separate
  // monkey + news buttons. Switching INTO news/ratings runs the same
  // explainer modals as before; switching out is silent.
  const viewMode: ViewMode = showNews ? "news" : prefs.showRatings ? "scores-rated" : "scores-plain";

  const handleViewModeClick = (mode: ViewMode) => {
    if (mode === viewMode) return;
    if (mode === "scores-plain") {
      if (showNews) setShowNews(false);
      updatePrefs({ showNews: false, showRatings: false });
      return;
    }
    if (mode === "scores-rated") {
      if (showNews) setShowNews(false);
      if (!prefs.showRatings && !prefs.skipExplainer) {
        // First time only: show the explainer AND mark it seen now, so it
        // never reappears regardless of the "don't show again" checkbox
        // (Jacob 5/30 — popup should fire exactly once). Ratings flip on
        // when the explainer confirms.
        updatePrefs({ showNews: false, skipExplainer: true });
        setShowRatingsExplainer(true);
      } else {
        updatePrefs({ showNews: false, showRatings: true });
      }
      return;
    }
    // mode === "news"
    if (prefs.skipNewsExplainer) {
      setShowNews(true);
      updatePrefs({ showNews: true });
    } else {
      // First time only — mark seen immediately so it never reappears.
      updatePrefs({ skipNewsExplainer: true });
      setShowNewsExplainer(true);
    }
  };

  // Param kept optional + ignored: callers may still pass the old
  // "don't show again" checkbox value, but the popup is now first-time-only
  // (always marked seen), so the value no longer matters.
  const confirmRatings = (_dontShowAgain?: boolean) => {
    setShowRatingsExplainer(false);
    updatePrefs({ showRatings: true, skipExplainer: true });
  };

  const confirmNews = (_dontShowAgain?: boolean) => {
    setShowNewsExplainer(false);
    setShowNews(true);
    updatePrefs({ showNews: true, skipNewsExplainer: true });
  };

  const setNewsThirdLeague = (sport: Sport | undefined) => {
    updatePrefs({ newsThirdLeague: sport });
  };

  // Update favicon based on ratings toggle
  useEffect(() => {
    const emoji = prefs.showRatings ? "🙉" : "🙈";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="24" text-anchor="middle" font-size="28">${emoji}</text></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
    if (link) {
      link.href = url;
    } else {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = url;
      document.head.appendChild(link);
    }
    return () => URL.revokeObjectURL(url);
  }, [prefs.showRatings]);

  // Keep <html data-view> in sync with the active tab and remember it. The
  // pre-paint inline script in layout.tsx replays this value on the next
  // refresh so the correct tab is highlighted before hydration — otherwise the
  // static HTML paints with Scores active and flashes to Ratings once the prefs
  // effect runs (Jacob 6/12). Storing the already-resolved viewMode (rather than
  // re-deriving the launch rules in the inline script) keeps the two in lockstep
  // and self-corrects on the rare morning-reset boundary.
  useEffect(() => {
    document.documentElement.setAttribute("data-view", viewMode);
    try {
      localStorage.setItem("nss-last-view", viewMode);
    } catch {}
  }, [viewMode]);

  // The full settings-restore URL for the current prefs. Recomputed each
  // render so the Settings panel's draggable bookmark chip always carries an
  // up-to-date href (the bookmark is created from the live DOM at drag time).
  const buildShareUrl = () => {
    if (typeof window === "undefined") return "";
    const params = encodeFavorites(
      prefs.favoriteTeams,
      prefs.favoriteLeagues,
      prefs.thirdLeague,
      [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague],
      {
        theme: prefs.theme,
        defaultDateMode: prefs.defaultDateMode,
        defaultLandingView: prefs.defaultLandingView,
        defaultRatings: prefs.defaultRatings,
        newsThirdLeague: prefs.newsThirdLeague,
      },
    );
    return `${window.location.origin}?${params.toString()}`;
  };

  const shareFavorites = () => {
    navigator.clipboard.writeText(buildShareUrl()).then(() => {
      setShowShareCopied(true);
      setTimeout(() => setShowShareCopied(false), 2000);
    });
  };

  const hasFavorites = prefs.favoriteTeams.length > 0 || prefs.favoriteLeagues.length > 0;

  // Dismiss fav toast when all favorites removed
  useEffect(() => {
    if (!hasFavorites) {
      setShowFavToast(false);
      setShowShareCopied(false);
    }
  }, [hasFavorites]);

  const [favToastCopied, setFavToastCopied] = useState(false);

  const showFavSavedToast = () => {
    setShowFavToast(true);
    setFavToastCopied(false);
  };

  const dismissFavToast = () => {
    setShowFavToast(false);
  };

  const copyFavLink = () => {
    navigator.clipboard.writeText(buildShareUrl()).then(() => {
      setFavToastCopied(true);
      setTimeout(() => {
        dismissFavToast();
      }, 1200);
    });
  };

  const toggleFavoriteTeam = (teamId: string) => {
    const current = prefs.favoriteTeams;
    if (current.includes(teamId)) {
      updatePrefs({ favoriteTeams: current.filter((id) => id !== teamId) });
    } else {
      updatePrefs({ favoriteTeams: [...current, teamId] });
      showFavSavedToast();
    }
  };

  const isToday = selectedDate === getDateString(0);

  // Compute which leagues are available for the 3rd slot dropdown
  const thirdLeagueOptions = useMemo(() => {
    if (!selectedDate) return [];
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    // Get all active leagues for this date, deduplicated by sport
    const seen = new Set<Sport>();
    const options: { sport: Sport; label: string }[] = [];
    for (const league of ALL_LEAGUES) {
      if (seen.has(league.sport)) continue;
      if (!isLeagueActive(league, viewDate)) continue;
      seen.add(league.sport);
      options.push({ sport: league.sport, label: league.label });
    }
    return options;
  }, [selectedDate]);

  // Open the first-run league picker once we know which leagues are in season
  // (thirdLeagueOptions populates after selectedDate resolves). firstRunRef was
  // armed at mount for new installs only; clearing it here opens exactly once.
  useEffect(() => {
    if (firstRunRef.current && !prefs.leaguesOnboarded && thirdLeagueOptions.length > 0) {
      firstRunRef.current = false;
      setShowLeaguePicker(true);
    }
  }, [thirdLeagueOptions, prefs.leaguesOnboarded]);

  const togglePick = (sport: Sport) => {
    setPickerSel((sel) =>
      sel.includes(sport)
        ? sel.filter((s) => s !== sport)
        : sel.length >= 3
          ? sel
          : [...sel, sport],
    );
  };

  // Confirm the picker: map the chosen leagues (in tap order) onto the three
  // column slots — reusing the SAME slot prefs Settings writes (firstLeague /
  // secondLeague / thirdLeague), so no new league logic is introduced. An
  // unfilled slot becomes "empty" so only the chosen leagues show; choosing
  // none falls through to the in-season auto-picker, identical to "Use defaults".
  const confirmLeaguePicker = () => {
    const picks = pickerSel.slice(0, 3);
    updatePrefs({
      firstLeague: picks[0] ?? undefined,
      secondLeague: picks[1] ?? (picks.length ? "empty" : undefined),
      thirdLeague: picks[2] ?? (picks.length ? "empty" : undefined),
      leaguesOnboarded: true,
    });
    setShowLeaguePicker(false);
  };

  const skipLeaguePicker = () => {
    updatePrefs({ leaguesOnboarded: true });
    setShowLeaguePicker(false);
  };

  // Homepage switcher options = the active leagues minus the ones the user
  // removed in Settings (hiddenLeagues). Drives the header dropdown/arrow
  // cycling, the news swap menus, and the + button's picks. Label lookups and
  // Settings' slot pickers keep the full thirdLeagueOptions list so a hidden
  // league can still be pinned (or re-enabled) deliberately.
  const switcherOptions = useMemo(
    () => thirdLeagueOptions.filter((o) => !prefs.hiddenLeagues?.includes(o.sport)),
    [thirdLeagueOptions, prefs.hiddenLeagues],
  );

  // Switcher sports in RELEVANCE order — the auto-picker's own ranking
  // (firstPref pins like the World Cup first, then LEAGUE_PRIORITY). Drives
  // the ‹ › arrow cycling so the right arrow surfaces the most relevant
  // unused league first (Jacob 6/11). Anything the relevance list doesn't
  // know about tails on in menu order so it's still reachable.
  const switcherSportsByRelevance = useMemo(() => {
    if (!selectedDate) return [] as Sport[];
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    const { firstPref, rest } = getActiveLeagueCandidates(viewDate);
    const allowed = new Set(switcherOptions.map((o) => o.sport));
    const ordered: Sport[] = [];
    for (const cfg of [...firstPref, ...rest]) {
      if (allowed.has(cfg.sport) && !ordered.includes(cfg.sport)) ordered.push(cfg.sport);
    }
    for (const o of switcherOptions) {
      if (!ordered.includes(o.sport)) ordered.push(o.sport);
    }
    return ordered;
  }, [selectedDate, switcherOptions]);

  // ‹ › cycling cursor, per slot. Lives up here (in a ref) because the column
  // component remounts whenever its league changes — per-column state would
  // reset every press and recomputing "most relevant unused" from scratch each
  // time ping-pongs between the top two leagues. The session freezes the
  // browse order at the first press: right walks most→least relevant through
  // the then-unused leagues and wraps back to the starting league; left walks
  // the same ring backwards (so right-then-left returns where you started).
  const cycleSessionsRef = useRef<Map<number, { key: string; list: Sport[]; idx: number }>>(new Map());

  // When the user picks a league (or Empty) for one column, lock the other two
  // to whatever's currently displayed so the auto-picker doesn't shuffle them.
  // Without this, picking NCAAM for slot 2 (with slots 1+3 unset) re-runs auto-pick
  // for the others and can bump NHL out of slot 3 — see lib/espn.ts fetchAllLeagues.
  // Duplicates are allowed; "empty" hides the slot; Auto (undefined) only unsets
  // that one slot, so consecutive Auto clicks across all three drop back to default.
  const setSlotLeague = (slotIdx: number, sport: Sport | "empty" | undefined) => {
    let resolved: (Sport | "empty" | undefined)[];
    if (sport === undefined) {
      resolved = SLOT_INDICES.map((i) => selectedSlotLeagues[i]);
      resolved[slotIdx] = undefined;
    } else {
      // Walk the displayed-league queue: every non-empty slot consumed one
      // rendered column (a pinned slot's column IS its pref), so unset slots
      // lock to the league actually on screen at their position — empty slots
      // consume nothing, keeping later slots aligned.
      const displayed = sortedLeagues.map((l) => l.sport);
      let queueIdx = 0;
      resolved = SLOT_INDICES.map((i) => {
        const pref = selectedSlotLeagues[i];
        if (pref === "empty") return "empty";
        const shown = displayed[queueIdx++];
        return pref ?? shown;
      });
      resolved[slotIdx] = sport;
    }
    updatePrefs({
      firstLeague: resolved[0],
      secondLeague: resolved[1],
      thirdLeague: resolved[2],
      fourthLeague: resolved[3],
      fifthLeague: resolved[4],
    });
  };

  // Drag-to-swap: dropping column A onto column B trades their positions
  // (not splice/insertion — that shuffles the middle column too). All-Auto
  // layouts get pinned to explicit prefs first so the swap actually sticks.
  // Empty slots swap as "empty" so the gap moves with the drag.
  const reorderSlots = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const leagueQueue = sortedLeagues.map((l) => l.sport);
    let queueIdx = 0;
    const baseline: (Sport | "empty" | undefined)[] = SLOT_INDICES.map((i) => {
      const pref = selectedSlotLeagues[i];
      if (pref === "empty") return "empty";
      // Every non-empty slot consumed one rendered column (a pinned slot's
      // column IS its pref), so advance the queue for pinned slots too —
      // otherwise an auto slot after a pinned one reads the wrong column.
      const shown = leagueQueue[queueIdx++];
      return pref ?? shown;
    });
    [baseline[fromIdx], baseline[toIdx]] = [baseline[toIdx], baseline[fromIdx]];
    updatePrefs({
      firstLeague: baseline[0],
      secondLeague: baseline[1],
      thirdLeague: baseline[2],
      fourthLeague: baseline[3],
      fifthLeague: baseline[4],
    });
  };

  const selectedSlotLeagues: (Sport | "empty" | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
    prefs.fourthLeague,
    prefs.fifthLeague,
  ];

  // Render in slot order as returned by fetchAllLeagues. The old favoriteLeagues
  // sort is dead — the star UI that set it has been removed; keeping the sort
  // around could still reorder columns for users with stale localStorage prefs,
  // breaking the "Auto on col N = the column's default" guarantee.
  const sortedLeagues = leagues;

  // News-order persistence. Custom per-sport ordering of the source labels
  // inside a single news column. Drag-reorder in the ☰ menu writes here;
  // applyOrder reads from it to reshuffle the cascade-default source list
  // (unknown labels fall through to the tail so new sources still surface).
  // The ☰ dropdown manages whichever league is currently "primary": the
  // focused league if Focus is set, otherwise the first visible scores slot.
  // ESPN focus is handled separately (sport=undefined → dropdown isn't
  // sport-keyed; we'll wire ESPN order using a sentinel key in prefs).
  const newsCol1Sport: Sport | undefined = (prefs.newsFocusLeague && prefs.newsFocusLeague !== "espn")
    ? prefs.newsFocusLeague
    : sortedLeagues[0]?.sport;
  const newsOrderForCol1: string[] | undefined = newsCol1Sport
    ? prefs.newsSourceOrder?.[newsCol1Sport]
    : undefined;
  const setNewsSourceOrder = (sport: Sport, order: string[]) => {
    const existing = prefs.newsSourceOrder ?? {};
    updatePrefs({ newsSourceOrder: { ...existing, [sport]: order } });
  };
  const clearNewsSourceOrder = (sport: Sport) => {
    const existing = prefs.newsSourceOrder ?? {};
    if (!existing[sport]) return;
    const next = { ...existing };
    delete next[sport];
    updatePrefs({ newsSourceOrder: next });
  };
  const newsTypeFilter = prefs.newsTypeFilter ?? "all";
  const setNewsTypeFilter = (t: "all" | "topvideos" | "espn" | "reddit" | "homepage") => updatePrefs({ newsTypeFilter: t });
  // Source-filter options + the user's drag-reordered order. Unknown labels in
  // the saved order are ignored; new options not yet in the saved order fall
  // through to the tail in default order.
  const NEWS_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: "all", label: "All" },
    { value: "topvideos", label: "Top videos" },
    { value: "reddit", label: "Reddit" },
    { value: "espn", label: "ESPN" },
    { value: "homepage", label: "Homepage" },
  ];
  const orderedNewsFilterOptions = applyOrder(
    NEWS_FILTER_OPTIONS.map((o) => ({ ...o, label: o.value })),
    prefs.newsTypeFilterOrder,
  ).map((o) => NEWS_FILTER_OPTIONS.find((n) => n.value === o.value)!);
  const setNewsTypeFilterOrder = (order: string[]) => updatePrefs({ newsTypeFilterOrder: order });
  // The news "focus league" pill UI was removed (5/29), but its pref can still
  // be set in stale localStorage from an earlier staging build — which silently
  // forced the news view to a single wide column with no way to clear it. Ignore
  // it so the 1/2/3 column selector (default 3) is authoritative.
  const newsFocusLeague: Sport | "espn" | undefined = undefined;
  const newsHiddenSources = prefs.newsHiddenSources ?? [];
  const toggleNewsSourceHidden = (label: string) => {
    const next = newsHiddenSources.includes(label)
      ? newsHiddenSources.filter((l) => l !== label)
      : [...newsHiddenSources, label];
    updatePrefs({ newsHiddenSources: next });
  };
  // Focus-pill options for the news view header. Built at component level
  // so the header can render the pills regardless of where in the render
  // tree visibleNewsEntries is computed. ESPN is always present + each
  // non-empty league slot appears.
  const newsHeaderFocusOptions: { value: string; label: string }[] = (() => {
    const opts: { value: string; label: string }[] = [
      { value: "all", label: "All" },
      { value: "espn", label: "ESPN" },
    ];
    [0, 1, 2].forEach((slotIdx) => {
      if (selectedSlotLeagues[slotIdx] === "empty") return;
      const sport = slotIdx === 2 && prefs.newsThirdLeague ? prefs.newsThirdLeague : sortedLeagues[slotIdx]?.sport;
      if (!sport) return;
      const label = thirdLeagueOptions.find((o) => o.sport === sport)?.label ?? sport.toUpperCase();
      opts.push({ value: sport, label });
    });
    return opts;
  })();

  const headerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;
    const measure = () => {
      const h = header.getBoundingClientRect().height;
      root.style.setProperty("--header-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    // On iOS the safe-area inset (env(safe-area-inset-top)) settles a frame
    // or two AFTER orientationchange/visualViewport-resize fire, so a measure
    // taken on the ResizeObserver tick reads the stale pre-rotation header
    // height — which left the sticky column titles pinned mid-screen in
    // landscape. Two RAFs proved too short on real devices (the inset can
    // take a few hundred ms to settle through the rotation animation), so
    // we fan out a burst of re-measures: two animation frames plus several
    // timeouts spanning ~600ms to catch whenever the inset finally lands.
    let raf1 = 0;
    let raf2 = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const remeasureSoon = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      timers.forEach(clearTimeout);
      timers.length = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(measure);
      });
      for (const ms of [60, 150, 300, 500]) {
        timers.push(setTimeout(measure, ms));
      }
    };
    window.addEventListener("orientationchange", remeasureSoon);
    window.addEventListener("resize", remeasureSoon);
    window.visualViewport?.addEventListener("resize", remeasureSoon);
    screen.orientation?.addEventListener("change", remeasureSoon);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      timers.forEach(clearTimeout);
      window.removeEventListener("orientationchange", remeasureSoon);
      window.removeEventListener("resize", remeasureSoon);
      window.visualViewport?.removeEventListener("resize", remeasureSoon);
      screen.orientation?.removeEventListener("change", remeasureSoon);
    };
  }, []);

  // Measure the news-view league-title strip so per-source sticky headers
  // pin flush against its bottom edge (top: header-h + news-titlebar-h).
  // Callback ref instead of useEffect because the title row only mounts
  // after `stripActive` flips true (which depends on async data) —
  // a deps-based effect on [showNews] fires too early and finds null.
  const newsTitleRowRoRef = useRef<ResizeObserver | null>(null);
  const newsTitleRowRef = useCallback((row: HTMLDivElement | null) => {
    const root = rootRef.current;
    if (newsTitleRowRoRef.current) {
      newsTitleRowRoRef.current.disconnect();
      newsTitleRowRoRef.current = null;
    }
    if (!root) return;
    if (!row) {
      root.style.removeProperty("--news-titlebar-h");
      return;
    }
    const measure = () => {
      const h = row.getBoundingClientRect().height;
      root.style.setProperty("--news-titlebar-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    newsTitleRowRoRef.current = ro;
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Pull-to-refresh ────────────────────────────────────────────────
  // Touch-only gesture. iOS WKWebView's native bounce sits on top of this so
  // the visual feedback during pull is the spinner we render here, while the
  // page itself bounces underneath — feels native on iOS and works on Safari
  // mobile + Chrome Android where the browser has no built-in PTR.
  //
  // Trigger reaches both the scoreboard (re-call fetchData) and the news view
  // (bump newsRefreshKey → SourceSection + AlignedVideoStrip components see a
  // new key and remount, which re-runs their fetch effects). Cleaner than
  // wiring imperative refresh signals through every news component.
  const [newsRefreshKey, setNewsRefreshKey] = useState(0);
  const [pullDelta, setPullDelta] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullDeltaRef = useRef(0);
  const refreshingRef = useRef(false);
  // doRefresh closes over the latest selectedDate/prefs/showNews. We stash
  // the current callable in a ref so the touch handler (bound once below)
  // always calls today's logic without re-binding the listeners on every
  // state change — pull events fire faster than React re-renders.
  const doRefreshRef = useRef<() => void>(() => {});
  doRefreshRef.current = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      if (showNews) {
        // News view → remount sources to re-fetch their feeds.
        setNewsRefreshKey((k) => k + 1);
      } else if (selectedDate) {
        // silent — the descending spinner pill is the refresh feedback, so
        // keep the current board up and swap data in place when the pull
        // resolves. Without this, refresh flashes the whole board to the gray
        // skeleton and rebuilds it, which reads as a slow reload.
        await fetchData(selectedDate, prefs.thirdLeague, {
          first: prefs.firstLeague,
          second: prefs.secondLeague,
          third: prefs.thirdLeague,
          fourth: prefs.fourthLeague,
          fifth: prefs.fifthLeague,
        }, true);
      }
    } finally {
      // Min spinner display so the refresh feels confirmed even on instant
      // cache hits — otherwise it'd flash off in <50ms.
      window.setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      }, 500);
    }
  };

  useEffect(() => {
    const PULL_THRESHOLD = 70;
    const MAX_VISUAL = 110;
    const DAMP = 0.5;
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) return;
      pullStartYRef.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pullStartYRef.current === null) return;
      const delta = e.touches[0].clientY - pullStartYRef.current;
      if (delta < 0) {
        // User pulled up → cancel. Don't reset start so they can re-pull from
        // the new position by inverting direction; simpler to fully cancel.
        pullStartYRef.current = null;
        pullDeltaRef.current = 0;
        setPullDelta(0);
        return;
      }
      const damped = Math.min(delta * DAMP, MAX_VISUAL);
      pullDeltaRef.current = damped;
      setPullDelta(damped);
    };
    const onTouchEnd = () => {
      if (pullStartYRef.current === null) return;
      const finalDelta = pullDeltaRef.current;
      pullStartYRef.current = null;
      pullDeltaRef.current = 0;
      setPullDelta(0);
      if (finalDelta >= PULL_THRESHOLD) {
        doRefreshRef.current();
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const [isNativeApp, setIsNativeApp] = useState(false);
  useEffect(() => {
    type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
    const cap = (window as unknown as CapacitorGlobal).Capacitor;
    setIsNativeApp(!!cap?.isNativePlatform?.());
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newsOrderOpen, setNewsOrderOpen] = useState(false);
  const newsOrderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newsOrderOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (newsOrderRef.current && !newsOrderRef.current.contains(e.target as Node)) {
        setNewsOrderOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [newsOrderOpen]);
  // News filter popover (source type + focus league) — same click-away pattern.
  const [newsFilterOpen, setNewsFilterOpen] = useState(false);
  const newsFilterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newsFilterOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (newsFilterRef.current && !newsFilterRef.current.contains(e.target as Node)) {
        setNewsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [newsFilterOpen]);
  const newsColCount = (prefs.newsColCount ?? 3) as 1 | 2 | 3;
  const setNewsColCount = (n: 1 | 2 | 3) => updatePrefs({ newsColCount: n });
  // Aggregate teams seen across loaded leagues so the settings panel can map
  // favorite-team IDs to display names + logos. Teams favorited but not
  // currently in any loaded game fall through to "id-only" rendering.
  const knownTeams = useMemo(() => {
    const seen = new Map<string, { id: string; sport: Sport; displayName: string; logo?: string }>();
    for (const league of leagues) {
      for (const game of league.games) {
        for (const team of [game.homeTeam, game.awayTeam]) {
          if (!seen.has(team.id)) {
            seen.set(team.id, { id: team.id, sport: league.sport, displayName: team.displayName, logo: team.logo });
          }
        }
      }
    }
    return Array.from(seen.values());
  }, [leagues]);

  const resolvedTheme: "dark" | "light" =
    prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme;

  // Pull-to-refresh visual: a small spinner pill that descends from below the
  // header proportional to pullDelta, latches into a spinning state during
  // refresh, then fades out. translate3d so it composites on the GPU and
  // doesn't drop frames on iOS during the pull gesture.
  const ptrProgress = Math.min(pullDelta / 70, 1);
  const ptrVisible = pullDelta > 0 || refreshing;
  const ptrTranslateY = refreshing ? 28 : Math.max(0, pullDelta - 12);

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Keyboard skip link (WCAG 2.4.1) — visually hidden until focused, then
          jumps a Tab user past the sticky header / date nav straight to the
          scores board. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:px-4 focus:py-2 focus:shadow-lg focus:outline-none"
        style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
      >
        Skip to main content
      </a>
      {ptrVisible && (
        <div
          aria-hidden="true"
          className="fixed left-1/2 z-50 pointer-events-none"
          style={{
            top: "calc(env(safe-area-inset-top) + var(--header-h, 4rem))",
            transform: `translate3d(-50%, ${ptrTranslateY}px, 0)`,
            transition: refreshing ? "transform 200ms ease-out" : "none",
            opacity: refreshing ? 1 : ptrProgress,
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shadow-md"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--accent)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? "ptr-spinner" : undefined}
              style={{
                transform: refreshing ? undefined : `rotate(${ptrProgress * 270}deg)`,
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
        </div>
      )}
      <header ref={headerRef} className="px-4 sticky top-0 z-40" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(8px)", paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}>
        {/* Mobile uses auto_1fr_auto so the middle column gets all the leftover
            width (logo + icons size to content) → the date nav fits on one line
            without pushing the settings gear off-screen. Desktop keeps the
            symmetric 1fr_auto_1fr so the view tabs sit dead-center under MLB. */}
        <div className="max-w-6xl mx-auto relative grid grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <Link
            href="/"
            onClick={(e) => {
              // In the news view, the logo acts as "back to scores" — toggle
              // news off in place instead of navigating, since "/" would
              // just rehydrate news from prefs.showNews and bounce the user
              // right back into the news view.
              if (showNews) {
                e.preventDefault();
                setShowNews(false);
                updatePrefs({ showNews: false });
                window.scrollTo({ top: 0, behavior: "auto" });
              }
            }}
            className="hover:opacity-80 transition-opacity flex items-center flex-shrink-0 justify-self-start col-start-1"
            style={{ color: "var(--text)" }}
          >
            <span className="hidden xl:inline text-lg font-bold tracking-tight">HideScore</span>
            <svg className="xl:hidden w-7 h-7 header-logo" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" className="header-logo-bg" />
              <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
            </svg>
          </Link>

          {/* Top-row middle (col 2): the view tabs on sm+ (page-centered between
              two 1fr cols → lines up with the middle MLB column). On small screens
              the tabs drop to the fixed bottom bar, so the date nav takes this slot
              instead (scores/rated only) — sitting cleanly in the top row. */}
          {/* Mobile: center the date nav within col 2 so it sits evenly
              between the H logo and the theme toggle (Jacob 6/1). Desktop is
              already centered (the view tabs line up under the middle MLB
              column). The leading spacer is dropped on phones so the centering
              is true (not biased by the trailing calendar icon). */}
          <div className="justify-self-center col-start-2 min-w-0">
            <div className="hidden sm:block w-80">
              <BottomTabBar viewMode={viewMode} onChange={handleViewModeClick} placement="inline" />
            </div>
            {/* Mobile: date nav sits inline in the header middle (the view tabs
                live in the fixed bottom bar on phones, so this slot is free).
                Scores/Rated only. Calendar = bare icon after the › arrow. */}
            {!showNews && (
              <div className="sm:hidden flex justify-center">
                <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} initialOffset={initialOffset} trailing={
                  <span className="relative inline-flex items-center">
                    <button
                      data-cal-toggle
                      onClick={() => setCalendarOpen(!calendarOpen)}
                      className="ml-1 w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                      style={{ color: calendarOpen ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
                      title="Pick a date"
                      aria-label="Pick a date"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </button>
                    {calendarOpen && (
                      <CalendarDropdown selectedDate={selectedDate} onDateChange={(d) => { setSelectedDate(d); setCalendarOpen(false); }} onClose={() => setCalendarOpen(false)} />
                    )}
                    {/* The single-column "II" toggle used to sit here, but on a
                        phone it crowded col 2 and visually collided with the moon
                        in col 3 (Jacob 6/18). It's redundant with Settings → Board
                        layout → Single column, so it's dropped from the mobile
                        header; desktop keeps its own copy below. */}
                  </span>
                } />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 justify-self-end col-start-3">
            {/* Share — web only (xl+). On mobile the same action lives at the
                bottom of the settings panel. */}
            {hasFavorites && (
              <button
                type="button"
                onClick={shareFavorites}
                className="monkey-toggle hidden xl:flex w-10 h-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: showShareCopied ? "var(--accent)" : "var(--text-muted)",
                }}
                title={showShareCopied ? "Link copied!" : "Copy settings link"}
                aria-label={showShareCopied ? "Link copied!" : "Copy settings link"}
              >
                {showShareCopied ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </button>
            )}

            {/* News source filter popover. Sits to the LEFT of the theme
                toggle (Jacob 5/31). Source-type filters live in a funnel
                popover instead of always-on header pill rows — keeps the news
                header clean like hidescore.com while keeping them reachable. */}
            {showNews && !isMobile && (
              <SingleColToggle
                active={prefs.newsSingleColumn ?? false}
                onClick={() => updatePrefs({ newsSingleColumn: !prefs.newsSingleColumn })}
              />
            )}
            {showNews && (
              <div ref={newsFilterRef} className="relative">
                <button
                  onClick={() => setNewsFilterOpen(!newsFilterOpen)}
                  className="monkey-toggle relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                  style={{
                    background: newsFilterOpen ? "var(--accent)" : "var(--bg-card)",
                    border: `1px solid ${newsFilterOpen ? "var(--accent)" : "var(--border)"}`,
                    color: newsFilterOpen ? "white" : "var(--text-muted)",
                  }}
                  title="Filter news"
                  aria-label="Filter news"
                  aria-haspopup="true"
                  aria-expanded={newsFilterOpen}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                </button>
                {newsFilterOpen && (
                  <div
                    className="absolute top-full mt-1 right-0 rounded-lg shadow-lg z-50 p-3 min-w-[210px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Source</div>
                    {/* One per row + drag-to-reorder (order saved to prefs). */}
                    <NewsFilterList
                      options={orderedNewsFilterOptions}
                      value={newsTypeFilter}
                      onSelect={(v) => setNewsTypeFilter(v as "all" | "topvideos" | "espn" | "reddit" | "homepage")}
                      onReorder={setNewsTypeFilterOrder}
                    />
                    {newsTypeFilter !== "all" && (
                      <button
                        onClick={() => setNewsTypeFilter("all")}
                        className="mt-3 text-xs underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Standalone theme toggle (sits where the calendar button used to;
                the calendar moved to a bare icon at the end of the DateNav row).
                Shown in every view. */}
            <button
              onClick={() => {
                const next = resolvedTheme === "dark" ? "light" : "dark";
                updatePrefs({ theme: next });
                document.documentElement.setAttribute("data-theme", next);
              }}
              className="monkey-toggle w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="monkey-toggle w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{
                background: settingsOpen ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${settingsOpen ? "var(--accent)" : "var(--border)"}`,
                color: settingsOpen ? "white" : "var(--text-muted)",
              }}
              title="Settings"
              aria-label="Open settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

      </header>
      {/* sm+ only: date nav sits BELOW the header divider line (desktop has the
          view tabs in the top-row middle, so the date nav drops here). On mobile
          it's inline in the header middle instead (above). Scores/rated only;
          centered in max-w-6xl to line up with the middle (MLB) column. */}
      {!showNews && (
        <div className="hidden sm:flex max-w-6xl mx-auto px-4 justify-center pt-2 pb-1">
          <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} initialOffset={initialOffset} trailing={
            <span className="relative inline-flex items-center">
              <button
                data-cal-toggle
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="ml-1 w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                style={{ color: calendarOpen ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
                title="Pick a date"
                aria-label="Pick a date"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {calendarOpen && (
                <CalendarDropdown selectedDate={selectedDate} onDateChange={(d) => { setSelectedDate(d); setCalendarOpen(false); }} onClose={() => setCalendarOpen(false)} />
              )}
              <SingleColToggle active={prefs.singleColumn ?? false} onClick={() => updatePrefs({ singleColumn: !prefs.singleColumn })} />
            </span>
          } />
        </div>
      )}

      {/* News view: a clear, labeled spoiler toggle one row below the header,
          in the content flow with the news columns (far more discoverable than
          a header icon, and shown on mobile + desktop). Headlines are blurred
          by default; tap to reveal/hide them all. */}
      {showNews && (
        <div className="max-w-6xl mx-auto px-4 flex justify-center pt-2 pb-1">
          <button
            onClick={() => updatePrefs({ revealNewsTitles: !prefs.revealNewsTitles })}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 cursor-pointer"
            style={{
              background: prefs.revealNewsTitles ? "var(--accent)" : "var(--bg-card)",
              border: `1px solid ${prefs.revealNewsTitles ? "var(--accent)" : "var(--border)"}`,
              color: prefs.revealNewsTitles ? "white" : "var(--text-muted)",
            }}
            title="Headlines are spoilers — blurred by default. Tap to show or hide them all."
            aria-pressed={!!prefs.revealNewsTitles}
          >
            {prefs.revealNewsTitles ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            <span>{prefs.revealNewsTitles ? "Headlines shown" : "Headlines hidden"}</span>
          </button>
        </div>
      )}

      {/* Scores board stretches to max-w-7xl when five columns are actually
          RENDERING — keyed off the fetched data, not the viewport, so crossing
          the 1280px breakpoint doesn't widen the still-3-column board while
          the extra leagues load; the layout swaps once, when they arrive
          (Jacob 6/11). The skeleton keys off the viewport (no data yet). */}
      <main id="main-content" tabIndex={-1} className={`${!showNews && (sortedLeagues.length > 3 || (loading && slotCount === 5)) ? "max-w-7xl" : "max-w-6xl"} mx-auto px-4 pt-0 pb-6 flex-1 w-full focus:outline-none`}>
        {/* World Cup hub framing — only on /worldcup. The WC column is already
            auto-pinned to the board below (it's an active firstPref league
            through 07-19), so this banner just sets the context for marketing
            traffic landing on the route and gives the page a real <h1>. */}
        {worldCupHub && (
          <section
            className="mt-3 mb-4 rounded-xl px-4 py-3.5 sm:px-5 sm:py-4"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <h1 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
              <span aria-hidden="true">⚽</span>
              <span>2026 World Cup, spoiler-free</span>
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              104 matches, June 11 – July 19, across the US, Canada &amp; Mexico — most kicking off at 1, 4 and 7 PM ET on weekdays.
              Watch every match on your own schedule: scores stay hidden until you tap, and the{" "}
              <span style={{ color: "var(--text)" }}>competitiveness rating</span> tells you which games were instant classics
              <span style={{ color: "var(--text)" }}> without revealing who won</span>. The World Cup column is below.
            </p>
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Free · no tracking cookies · also on the App Store ·{" "}
              <a
                href="/watch-world-cup-without-spoilers"
                className="underline underline-offset-2"
                style={{ color: "var(--accent)" }}
              >
                How to watch without spoilers →
              </a>
            </p>
          </section>
        )}
        {showNews ? (() => {
          const cascadeToSources = (cascade: ColumnSource[]): NewsSource[] =>
            cascade.map((c) => ({
              label: c.label,
              logoUrl: c.logoUrl,
              variant: c.variant,
              fetch: c.kind === "espn-league" && c.sport
                ? () => fetchLeagueNews(c.sport!, 10)
                : () => fetchPrebaked(c.key),
            }));
          // Build visible news entries, mirroring how scores collapses Empty
          // slots. Each entry carries its sport, label, full cascade (for
          // dropdown management), and the user-ordered cascade (post-applyOrder).
          // Type/hidden filters are applied at render-time so the dropdown
          // can still display + re-enable hidden sources.
          const orderFor = (sport?: Sport) => sport ? prefs.newsSourceOrder?.[sport] : undefined;
          // Col-3 fallback = hidescore.com's "News" feed. Use GENERIC_CASCADE,
          // which leads with ESPN Videos (a video) — so all 3 columns lead with
          // video and the AlignedVideoStrip activates → clean aligned grid like
          // live. ESPN top headlines fill the tail below (useEspnTopTail).
          // Labeled "News" (swappable to a 3rd league) to match hidescore.com.
          const espnEntry = {
            slotIdx: -1,
            sport: undefined as Sport | undefined,
            id: "espn" as const,
            label: "News",
            orderedCascade: applyOrder(GENERIC_CASCADE, prefs.newsSourceOrder?.["espn"]),
          };
          const leagueEntries = [0, 1, 2].map((slotIdx) => {
            if (selectedSlotLeagues[slotIdx] === "empty") return null;
            const sport: Sport | undefined = slotIdx === 2 && prefs.newsThirdLeague
              ? prefs.newsThirdLeague
              : sortedLeagues[slotIdx]?.sport;
            if (!sport) return null;
            const label = thirdLeagueOptions.find((o) => o.sport === sport)?.label ?? sport.toUpperCase();
            const cascade = leagueSourceCascade(sport);
            const orderedCascade = applyOrder(cascade, orderFor(sport));
            return { slotIdx, sport, id: sport as string, label, orderedCascade };
          }).filter((e): e is NonNullable<typeof e> => e !== null);
          // Match hidescore.com's default column order: the two scores leagues
          // fill cols 1-2, and col 3 is the chosen 3rd news league if set, else
          // the ESPN/general feed — NOT a forced ESPN first column. (Reverted the
          // 5/28 ESPN-first default per Jacob 5/29; ESPN stays reachable as the
          // col-3 fallback and the focus/order controls are unchanged.)
          const firstTwoEntries = leagueEntries.filter((e) => e.slotIdx === 0 || e.slotIdx === 1);
          // Col 3 = the chosen 3rd league, else the News (ESPN) feed — UNLESS
          // the user emptied slot 3 (then the column is hidden and the + button
          // refills it). "Empty" on the News column routes through setSlotLeague(2)
          // so it reuses the scores-view empty/refill mechanism.
          const thirdColEntry = selectedSlotLeagues[2] === "empty"
            ? null
            : prefs.newsThirdLeague
              ? leagueEntries.find((e) => e.slotIdx === 2)
              : espnEntry;
          // Mobile (single stacked column): lead with News, then the two score
          // leagues (Jacob 5/30 — "news, then mlb, then nba"). Desktop keeps the
          // 3-across order: the two leagues, then the News/3rd-league column.
          const visibleNewsEntries = isMobile
            ? [espnEntry, ...firstTwoEntries]
            : [...firstTwoEntries, ...(thirdColEntry ? [thirdColEntry] : [])];

          // Apply Focus league (drops other entries) then per-entry filter
          // by type + hidden labels. Type "all" is a no-op; hidden labels
          // are removed via Array.filter so they vanish from view but stay
          // togglable in the dropdown.
          const focusedEntries = newsFocusLeague
            ? visibleNewsEntries.filter((e) => e.id === newsFocusLeague)
            : visibleNewsEntries;
          const orderedColumnSourcesFor = (entry: typeof visibleNewsEntries[number]): ColumnSource[] => {
            const filtered = entry.orderedCascade
              .filter((s) => newsTypeFilter === "all" || classifySource(s) === newsTypeFilter)
              .filter((s) => !newsHiddenSources.includes(s.label));
            // When viewing "All", honor the user's source-type order from the
            // funnel popover (Jacob 6/1) — dragging a source higher makes its
            // items lead in every column. Stable within a type so the per-sport
            // cascade order is preserved among same-type sources.
            const typeOrder = prefs.newsTypeFilterOrder;
            return (newsTypeFilter === "all" && typeOrder && typeOrder.length)
              ? filtered
                  .map((s, i) => [s, i] as const)
                  .sort(([a, ai], [bz, bi]) => {
                    const ra = typeOrder.indexOf(classifySource(a));
                    const rb = typeOrder.indexOf(classifySource(bz));
                    return (ra === -1 ? typeOrder.length : ra) - (rb === -1 ? typeOrder.length : rb) || ai - bi;
                  })
                  .map(([s]) => s)
              : filtered;
          };
          const renderSourcesFor = (entry: typeof visibleNewsEntries[number]): NewsSource[] =>
            cascadeToSources(orderedColumnSourcesFor(entry));

          // Swap on a news column: slot 2 with a newsThirdLeague override
          // touches that pref alone (keeps scores untouched); other columns
          // share scores' slot prefs so news + scores stay in sync.
          const newsSwapFor = (slotIdx: number) =>
            (s: Sport | "empty" | undefined) => {
              // Auto (undefined): clear newsThirdLeague override for slot 2,
              // otherwise clear the scores slot pref too.
              if (slotIdx === 2 && prefs.newsThirdLeague && s !== "empty") {
                setNewsThirdLeague(s as Sport | undefined);
                return;
              }
              setSlotLeague(slotIdx, s);
            };
          // Force the ESPN "Top news" feed back as a column: clear any 3rd-league
          // override and, if the 3rd slot was emptied, re-open it (Auto) so the
          // espn fallback renders there again. Reachable from every column's swap
          // menu + the + button, so the feed can't get stranded.
          const pickEspn = () => {
            setNewsThirdLeague(undefined);
            if (selectedSlotLeagues[2] === "empty") setSlotLeague(2, undefined);
          };

          // Which entries actually render: 1-col (mobile / Focus league) stacks
          // ALL focused leagues; otherwise the first N entries side-by-side.
          const effectiveColCount = (newsFocusLeague || isMobile || (prefs.newsSingleColumn ?? false)) ? 1 : 3;
          const renderedEntries = effectiveColCount === 1
            ? focusedEntries
            : focusedEntries.slice(0, effectiveColCount);
          // Aligned video strip: when EVERY rendered side-by-side column leads
          // with a video source, lift those leads into the strip (CSS subgrid)
          // so video N is the same height across columns and the columns line
          // up. Works for 2 OR 3 columns now (the strip grid + max-width scale
          // with sources.length) — previously hard-gated to exactly 3, which
          // left the 2-column view (e.g. one league + the ESPN "News" column)
          // unaligned (Jacob 6/15). Only 1-col opts out. stripCols is the per-
          // column source list, reused for the strip's `sources` below.
          const stripCols = renderedEntries.map((e) => renderSourcesFor(e));
          const stripActive = effectiveColCount !== 1
            && renderedEntries.length >= 2
            && stripCols.every((sources) => sources[0]?.variant === "video");
          // The ESPN "News" column's top headlines fold into the strip's tail so
          // they don't push that column's reddit section below the others. Its
          // index is dynamic (col 2 in a 3-col board, col 1 in a 2-col one).
          const espnColIdx = renderedEntries.findIndex((e) => e.id === "espn");
          const useEspnTopTail = stripActive && espnColIdx >= 0 && !prefs.newsThirdLeague;
          // Sources stripped of the video lead when the strip is active.
          const sourcesForEntry = (entry: typeof renderedEntries[number], idx: number) => {
            const all = renderSourcesFor(entry);
            if (!stripActive) return all;
            if (idx === espnColIdx && useEspnTopTail) {
              return all.slice(1).filter((s) => s.label !== "ESPN");
            }
            return all.slice(1);
          };

          // Mobile single feed: instead of three stacked league sections, merge
          // every card into ONE fixed, hand-ordered list (Jacob 6/1). Rank by
          // (column role, source type) — "news" = the ESPN/general column,
          // "A"/"B" = the higher/lower-priority in-season score league. The A/B
          // split is NOT the user's column order (which is NBA-first by the app's
          // canonical precedence) — it's MOBILE_NEWS_LEAGUE_ORDER, a fixed global
          // order so the feed always reads MLB-before-NBA regardless of how the
          // scores columns are arranged. Per-source granular reordering (via the
          // filter button) is backlogged. Unknown combos fall to the tail in
          // cascade order. Resulting feed:
          //   1 ESPN headlines  2 ESPN Videos  3 A Top Videos  4 r/<A>
          //   5 r/<B>  6 r/sports  7 B Top Videos  8 A.com  9 B.com
          //   10 ESPN A  11 ESPN B
          const MOBILE_SOURCE_RANK: Record<string, number> = {
            "news:espn": 1,
            "news:topvideos": 2,
            "A:topvideos": 3,
            "A:reddit": 4,
            "B:reddit": 5,
            "news:reddit": 6,
            "B:topvideos": 7,
            "A:homepage": 8,
            "B:homepage": 9,
            "A:espn": 10,
            "B:espn": 11,
          };
          const mobileMergedSources = (): NewsSource[] => {
            // Sort the score-league entries by the fixed global priority so role
            // A is always the higher-priority league (MLB ahead of NBA), not
            // whatever sits in scores column 1.
            const newsEntry = renderedEntries.filter((e) => e.id === "espn");
            const leagueEntries = renderedEntries
              .filter((e) => e.id !== "espn")
              .sort((a, b) => {
                const ra = a.sport ? MOBILE_NEWS_LEAGUE_ORDER.indexOf(a.sport) : -1;
                const rb = b.sport ? MOBILE_NEWS_LEAGUE_ORDER.indexOf(b.sport) : -1;
                return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
              });
            const ordered = [...newsEntry, ...leagueEntries];
            const ranked = ordered.flatMap((entry) => {
              const role = entry.id === "espn"
                ? "news"
                : leagueEntries.indexOf(entry) === 0 ? "A" : "B";
              return orderedColumnSourcesFor(entry).map((cs, subIdx) => ({
                cs,
                rank: MOBILE_SOURCE_RANK[`${role}:${classifySource(cs)}`] ?? 900 + subIdx,
                subIdx,
              }));
            });
            ranked.sort((a, b) => a.rank - b.rank || a.subIdx - b.subIdx);
            return cascadeToSources(ranked.map((r) => r.cs));
          };

          const wideCol = "flex-1 min-w-0 max-w-[420px] xl:max-w-[520px]";
          const narrowCol = "flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]";
          // News + button: same pattern as scores. When user picks Empty on a
          // news league column, the underlying scores slot becomes empty too,
          // so this finds the first empty slot and refills it on click.
          const newsFirstEmptySlot = [0, 1, 2].find((i) => selectedSlotLeagues[i] === "empty");
          // Same as scores: only offer the + when there's a league not already
          // shown, so refilling never duplicates a visible column.
          const newsAddEligibleSport = switcherOptions.find(
            (o) => !leagueEntries.some((e) => e.sport === o.sport),
          )?.sport;
          const newsOnAddColumn = newsFirstEmptySlot !== undefined && leagueEntries.length < 3
            ? () => {
                // News view: refill the 3rd column with the ESPN "Top news" feed
                // (its natural default) rather than a random league.
                if (newsFirstEmptySlot === 2) pickEspn();
                else if (newsAddEligibleSport) setSlotLeague(newsFirstEmptySlot, newsAddEligibleSport);
              }
            : undefined;
          const containerCls = effectiveColCount === 1
            ? "flex flex-col items-center gap-8"
            : "flex flex-row justify-center items-stretch gap-2 sm:gap-4";
          const widthClassFor = () =>
            effectiveColCount === 1 ? wideCol : narrowCol;

          return (
            <>
              {stripActive && (
                <>
                  {/* League titles render above AlignedVideoStrip so the league
                      labels sit at the top — otherwise the video strip pushes
                      them below it. Sticky so they stay under the app header
                      while scrolling. Ref drives --news-titlebar-h. */}
                  <div
                    ref={newsTitleRowRef}
                    className="flex flex-row justify-center items-stretch gap-2 sm:gap-4 league-sticky-top sticky z-30"
                    style={{ background: "var(--bg)" }}
                  >
                    {renderedEntries.map((entry, idx) => {
                      const otherSports = renderedEntries
                        .filter((_, i) => i !== idx)
                        .map((e) => e.sport)
                        .filter((s): s is Sport => !!s);
                      // "News" (ESPN) col is swappable to a 3rd league via
                      // setNewsThirdLeague — matches hidescore.com's "News ▾".
                      const isEspn = entry.id === "espn";
                      return (
                        <div key={`title-${entry.id}`} className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
                          <NewsColumnTitle
                            title={entry.label}
                            swappableOptions={switcherOptions}
                            shownElsewhere={otherSports}
                            selectedSport={entry.sport}
                            onSwapLeague={isEspn ? ((s) => { if (s === "empty") setSlotLeague(2, "empty"); else if (s) setNewsThirdLeague(s); }) : ((s) => newsSwapFor(entry.slotIdx)(s))}
                            onPickEspn={pickEspn}
                            espnActive={isEspn}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <AlignedVideoStrip
                    key={`avs-${newsRefreshKey}`}
                    sources={stripCols.map((s) => s[0])}
                    onPlay={playNewsVideo}
                    tailFetch={useEspnTopTail ? () => fetchPrebaked("espn-top") : undefined}
                    tailColIdx={useEspnTopTail ? espnColIdx : undefined}
                  />
                </>
              )}
              {/* Use regular flex (not inline-flex) so multi-col layouts
                  distribute flex-1 children across the viewport instead of
                  sizing to content + overflowing on narrow mobile widths. */}
              <div className={containerCls}>
                {/* Leading spacer balances the trailing + button so the news
                    columns stay centered (multi-column only; 1-col centers the
                    + below the single column). */}
                {newsOnAddColumn && effectiveColCount !== 1 && <div aria-hidden className="shrink-0" style={{ width: 44 }} />}
                {isMobile && renderedEntries.length > 1 ? (
                  // Phones: one merged, hand-ordered feed (no per-league titles —
                  // the cards span every league, so a single league header would
                  // be misleading). See mobileMergedSources for the order.
                  <NewsColumn
                    key={`nc-mobile-${newsRefreshKey}`}
                    title=""
                    sources={mobileMergedSources()}
                    hideTitle
                    onPlayVideo={playNewsVideo}
                    widthClassName={widthClassFor()}
                  />
                ) : renderedEntries.map((entry, idx) => {
                  const otherSports = renderedEntries
                    .filter((_, i) => i !== idx)
                    .map((e) => e.sport)
                    .filter((s): s is Sport => !!s);
                  const isEspn = entry.id === "espn";
                  return (
                    <NewsColumn
                      key={`nc-${entry.id}-${newsRefreshKey}`}
                      title={entry.label}
                      sources={sourcesForEntry(entry, idx)}
                      swappableOptions={switcherOptions}
                      shownElsewhere={otherSports}
                      selectedSport={entry.sport}
                      onSwapLeague={isEspn ? ((s) => { if (s === "empty") setSlotLeague(2, "empty"); else if (s) setNewsThirdLeague(s); }) : ((s) => newsSwapFor(entry.slotIdx)(s))}
                      onPickEspn={pickEspn}
                      espnActive={isEspn}
                      hideTitle={stripActive}
                      onPlayVideo={playNewsVideo}
                      widthClassName={widthClassFor()}
                    />
                  );
                })}
                {newsOnAddColumn && (
                  effectiveColCount === 1 ? (
                    <div className="mt-2"><AddColumnButton onClick={newsOnAddColumn} /></div>
                  ) : (
                    <div className="flex items-start pt-7 shrink-0"><AddColumnButton onClick={newsOnAddColumn} /></div>
                  )
                )}
              </div>
            </>
          );
        })() : loading ? (
          <div className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
            {Array.from({ length: slotCount }, (_, i) => i + 1).map((i) => (
              <div key={i} className="min-w-0 flex-1 max-w-[225px] xl:max-w-[280px]">
                <div className="flex flex-col items-center pb-2 sm:pb-3" style={{ paddingTop: "1.75rem" }}>
                  <div className="h-6 sm:h-7 w-20 sm:w-24 rounded" style={{ background: "var(--bg-card)" }} />
                  <span className="text-[9px] sm:text-[10px] italic mt-0.5 block" style={{ color: "transparent" }}>{"\u00A0"}</span>
                </div>
                {/* Skeleton cards mirror GameCard's geometry — same padding,
                    a status-bar slot, and two team rows sized to the logo —
                    so live cards land where the placeholders sat and the
                    grid doesn't reflow when data arrives (keeps CLS low). */}
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 mb-2 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div className="h-[18px] mb-1 sm:mb-2 flex items-center">
                      <div className="h-2.5 w-12 rounded" style={{ background: "var(--bg-card-hover)" }} />
                    </div>
                    <div className="flex flex-col gap-y-0.5">
                      {[0, 1].map((row) => (
                        <div key={row} className="flex items-center gap-1 sm:gap-1.5">
                          <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full shrink-0" style={{ background: "var(--bg-card-hover)" }} />
                          <div className="h-3 rounded" style={{ width: row === 0 ? "8rem" : "7rem", background: "var(--bg-card-hover)" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p style={{ color: "var(--text-muted)" }}>Failed to load games</p>
            <button
              onClick={() => fetchData(selectedDate)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Retry
            </button>
          </div>
        ) : (
          (() => {
            const isPast = selectedDate < getDateString(0);
            const hasNonFinished = !isPast && sortedLeagues.some(l => l.games.some(g => g.state !== "post"));
            const hasFinished = !isPast && sortedLeagues.some(l => l.games.some(g => g.state === "post"));
            const showFinalSplit = hasNonFinished && hasFinished;
            const commonProps = {
              favoriteTeams: prefs.favoriteTeams,
              onToggleFavoriteTeam: toggleFavoriteTeam,
              showRatings: prefs.showRatings,
              isPastDate: isPast,
              isToday,
              sortByMatchups: prefs.showRatings,
              onPlayHighlight: openVideoModal,
              onPlayEmbed: openEmbedModal,
              onShowDetails: (g: Game) => setDetailGame(g),
              onShowGroups: () => { setGroupsHighlight(null); setGroupsOpen(true); },
              selectedDate,
              onRetry: () => doRefreshRef.current(),
              showTeamStars: !prefs.hideTeamStars,
            };
            // Per-slot swap dropdowns: every column lists every in-season
            // league. Leagues already shown in another column come through
            // greyed (via shownElsewhere) but stay selectable — picking one
            // gives you a second column of that league.
            const displayedSports = sortedLeagues.map((l) => l.sport);
            const swapPropsForSlot = (idx: number) => ({
              swappableOptions: switcherOptions,
              shownElsewhere: displayedSports.filter((_, i) => i !== idx),
              onSwapLeague: (s: Sport | "empty" | undefined) => setSlotLeague(idx, s),
              showSwapChevron: !prefs.hideLeagueChevrons,
              switcherMode: prefs.leagueSwitcherMode ?? ("dropdown" as const),
            });
            // Slot fetched-league queue: fetchAllLeagues skipped empty slots,
            // so we walk slot prefs and pull from the fetched queue for non-
            // empty slots. Empty slots collapse the column entirely (no stub
            // rendered); the + button at the end of the row brings them back.
            const visibleSlotIndices = SLOT_INDICES.slice(0, slotCount);
            const leagueQueue = [...sortedLeagues];
            const slotEntries = visibleSlotIndices.map((slotIdx) => {
              if (selectedSlotLeagues[slotIdx] === "empty") return null;
              const league = leagueQueue.shift();
              if (!league) return null;
              return { slotIdx, league, isEmpty: false as const };
            }).filter((e): e is NonNullable<typeof e> => e !== null);

            // ‹ › arrow cycling for a column (arrows switcher mode). The
            // browse ring = the leagues no visible column is using, most→least
            // relevant, with the starting league appended so the cycle wraps
            // home. The cursor lives in cycleSessionsRef (see its comment);
            // the session rebuilds when the other columns change, when the
            // slot is switched from elsewhere (dropdown/Settings), or when
            // the relevance list itself changes.
            const cycleForEntry = (entry: { slotIdx: number; league: LeagueData }) => (dir: 1 | -1) => {
              const pref = selectedSlotLeagues[entry.slotIdx];
              // Prefer the pref over the rendered league: right after a press
              // the column still shows the old league until the silent refetch
              // lands, and validating against it would reset the session.
              const cur = pref && pref !== "empty" ? pref : entry.league.sport;
              const shown = slotEntries
                .filter((e) => e.slotIdx !== entry.slotIdx)
                .map((e) => e.league.sport);
              const key = `${[...shown].sort().join(".")}|${switcherSportsByRelevance.join(".")}`;
              const sessions = cycleSessionsRef.current;
              let s = sessions.get(entry.slotIdx);
              if (!s || s.key !== key || s.list[s.idx] !== cur) {
                const unused = switcherSportsByRelevance.filter(
                  (sp) => sp !== cur && !shown.includes(sp),
                );
                s = { key, list: [...unused, cur], idx: unused.length };
                sessions.set(entry.slotIdx, s);
              }
              if (s.list.length <= 1) return;
              s.idx = (s.idx + dir + s.list.length) % s.list.length;
              setSlotLeague(entry.slotIdx, s.list[s.idx]);
            };

            // + button: first slot the user explicitly emptied gets repopulated
            // with the first eligible league (not currently shown in another
            // visible column). Only shown when there's room (< slotCount cols).
            const firstEmptySlot = visibleSlotIndices.find((i) => selectedSlotLeagues[i] === "empty");
            // The first available league not already on screen. If every active,
            // non-hidden league is shown there's nothing to add, so the + is
            // hidden — refilling would just duplicate a visible column.
            const addEligibleSport = switcherOptions.find(
              (o) => !slotEntries.some((e) => e.league.sport === o.sport),
            )?.sport;
            const onAddColumn = firstEmptySlot !== undefined && slotEntries.length < slotCount && addEligibleSport
              ? () => setSlotLeague(firstEmptySlot, addEligibleSport)
              : undefined;

            // World Cup quick-add (Jacob 6/11): during the tournament window,
            // anyone whose visible columns don't include the World Cup gets a
            // slim banner. With an emptied slot the add is one click (nothing
            // is displaced); otherwise the Add button expands into a "replace
            // which column?" picker so the user chooses what the WC bumps
            // (Jacob 6/11 #2). Dismiss persists.
            const wcActive = thirdLeagueOptions.some((o) => o.sport === "fifa");
            const showWcBanner = wcActive
              && !displayedSports.includes("fifa")
              && !prefs.wcBannerDismissed;
            const wcBanner = showWcBanner ? (
              <div
                className="relative mt-6 mb-3 rounded-lg px-3 py-2 pr-10 flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}
              >
                <span className="text-sm" style={{ color: "var(--text)" }}>
                  <span aria-hidden="true">⚽ </span>The 2026 World Cup is on — every match, spoiler-free.
                </span>
                {firstEmptySlot !== undefined ? (
                  <button
                    onClick={() => setSlotLeague(firstEmptySlot, "fifa")}
                    className="text-sm font-medium px-3 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    Add the World Cup column
                  </button>
                ) : !wcReplaceOpen ? (
                  <button
                    onClick={() => setWcReplaceOpen(true)}
                    className="text-sm font-medium px-3 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    Add the World Cup column
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>Replace:</span>
                    {slotEntries.map((entry) => (
                      <button
                        key={entry.slotIdx}
                        onClick={() => { setSlotLeague(entry.slotIdx, "fifa"); setWcReplaceOpen(false); }}
                        className="text-sm font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                        style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        title={`Show the World Cup instead of ${entry.league.label}`}
                      >
                        {entry.league.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setWcReplaceOpen(false)}
                      className="text-sm px-1.5 py-1 cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      title="Cancel"
                    >
                      Cancel
                    </button>
                  </span>
                )}
                <button
                  onClick={() => updatePrefs({ wcBannerDismissed: true })}
                  aria-label="Dismiss World Cup banner"
                  title="Dismiss"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  ✕
                </button>
              </div>
            ) : null;

            // Single-column board (Settings → Board layout): stack every league
            // in one centered, wider column with bigger cards. The .ns-cards-lg
            // class scales up logos + team names (see globals.css); colWidthClass
            // widens each column and drops the min-h-[60vh] floor so short
            // leagues don't leave big vertical gaps when stacked. The leading
            // spacer + trailing + are horizontal-centering devices for the row
            // layout, so in column mode the + button moves directly below.
            const singleColumn = prefs.singleColumn ?? false;
            // Phones cap each row column at ~225px, so when only 1–2 leagues are
            // showing the cards stay narrow with dead side-space (Jacob 6/15).
            // Let them fill the screen — and scale up a lone column's logos/names
            // via ns-cards-lg — so they read bigger and are easier to tap. Desktop
            // and the 3-column layout are untouched.
            const mobileCols = !singleColumn && isMobile ? slotEntries.length : 0;
            // 3 columns on a ~390px phone leaves each card ~98px of content width,
            // so the trailing W-L record overflowed the card's overflow-hidden and
            // got clipped ("scores bleed off" — Jacob 6/18). ns-board-tight drops the
            // #rank chip and tightens gaps on that one layout, freeing the ~22px the
            // record needs. 1–2 column mobile + desktop are untouched.
            const boardTight = mobileCols >= 3;
            const boardRowCls = singleColumn
              ? "relative flex flex-col items-center gap-5 ns-cards-lg"
              : `relative flex flex-row justify-center items-stretch gap-2 sm:gap-4${mobileCols === 1 ? " ns-cards-lg" : ""}${boardTight ? " ns-board-tight" : ""}`;
            const colWidthClass = singleColumn
              ? "w-full max-w-[560px]"
              : mobileCols === 1
                ? "flex-1 min-w-0 max-w-[560px] min-h-[60vh]"
                : mobileCols === 2
                  ? "flex-1 min-w-0 min-h-[60vh]"
                  : undefined;
            const addButton = onAddColumn ? (
              singleColumn ? (
                <div className="mt-1"><AddColumnButton onClick={onAddColumn} /></div>
              ) : (
                <div className="flex items-start pt-7 shrink-0"><AddColumnButton onClick={onAddColumn} /></div>
              )
            ) : null;

            // Full-width flex row so the flex-1 columns distribute across the
            // viewport (up to their max-w) and the group centers — matches
            // hidescore.com. The + button is a trailing flex child (like the
            // news view) so it tags along without forcing a content-width group
            // (the old inline-flex wrapper shrank the columns — Jacob 5/29).
            if (showFinalSplit) {
              return (
                <>
                {wcBanner}
                <div className={boardRowCls}>
                  {/* Invisible leading spacer balances the trailing + button so
                      the columns stay centered when a slot has been emptied
                      (row layout only — single column centers the + below). */}
                  {onAddColumn && !singleColumn && <div aria-hidden className="shrink-0" style={{ width: 44 }} />}
                  {slotEntries.map((entry) => (
                    <LeagueColumn
                      key={`${entry.league.sport}-${entry.slotIdx}`}
                      league={entry.league}
                      slotIdx={entry.slotIdx}
                      onReorderSlots={reorderSlots}
                      {...commonProps}
                      showFinalSeparator
                      {...swapPropsForSlot(entry.slotIdx)}
                      onCycleLeague={cycleForEntry(entry)}
                      widthClassName={colWidthClass}
                      condense={singleColumn}
                    />
                  ))}
                  {addButton}
                </div>
                </>
              );
            }

            return (
              <>
              {wcBanner}
              <div className={boardRowCls}>
                {/* Invisible leading spacer balances the trailing + button so
                    the columns stay centered when a slot has been emptied
                    (row layout only — single column centers the + below). */}
                {onAddColumn && !singleColumn && <div aria-hidden className="shrink-0" style={{ width: 44 }} />}
                {slotEntries.map((entry) => (
                  <LeagueColumn
                    key={`${entry.league.sport}-${entry.slotIdx}`}
                    league={entry.league}
                    slotIdx={entry.slotIdx}
                    onReorderSlots={reorderSlots}
                    {...commonProps}
                    {...swapPropsForSlot(entry.slotIdx)}
                    onCycleLeague={cycleForEntry(entry)}
                    widthClassName={colWidthClass}
                    condense={singleColumn}
                  />
                ))}
                {addButton}
              </div>
              </>
            );
          })()
        )}
      </main>

      <footer className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_5rem)] sm:pb-5 text-center text-sm flex flex-col items-center gap-1" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        {/* Normally the page's only <h1>. On /worldcup the banner above already
            provides that route's <h1>, so demote this one to <h2> there — keeping
            exactly one <h1> per page instead of two. Styled to match the footer
            text (Tailwind's preflight makes headings inherit size/weight, so it
            renders identically to the old <span> regardless of level) — it just
            carries the keyword copy SEO needs without changing the look. */}
        {(() => {
          const Heading = worldCupHub ? "h2" : "h1";
          return <Heading className="text-sm font-normal m-0">Catch up on games without spoilers — spoiler-free sports scores &amp; highlights.</Heading>;
        })()}
        <span className="inline-flex items-center gap-1">Select {/* eslint-disable-line @next/next/no-img-element */}<img src="/monkey-see-no-evil.svg" alt="see-no-evil monkey" width={14} height={14} className="inline-block align-text-bottom" draggable={false} /> to show ratings and sort by top records.</span>
        <FeedbackBox />

        {/* SEO content + internal links, "rolled up" under the feedback box so it
            adds crawlable copy and a link graph without changing the visual layout.
            Google renders and indexes content inside collapsed <details>, and plain
            <a href> (not next/link) is what the crawler needs to follow the routes. */}
        <details className="my-2 max-w-2xl text-left text-xs leading-relaxed">
          <summary className="cursor-pointer select-none text-center" style={{ color: "var(--text-muted)" }}>
            About HideScore
          </summary>
          <div className="mt-2 space-y-2" style={{ color: "var(--text-muted)" }}>
            <p>
              HideScore is the spoiler-free way to follow sports. Check scores for the NBA, NFL, NHL,
              MLB, MLS, the Premier League, the 2026 World Cup and golf without ever seeing who won —
              every score and result stays hidden until you choose to reveal it.
            </p>
            <p>
              Before you commit to a replay, our competitiveness rating tells you whether a game was a
              blowout or an instant classic, so you can watch the best sports highlights without
              spoilers and skip the duds — all without learning the final score.
            </p>
            <p>
              It&apos;s free, has no tracking cookies, and works in any browser or as an iOS app. Jump to{" "}
              <a href="/today" style={{ textDecoration: "underline" }}>today&apos;s games</a>,{" "}
              <a href="/tomorrow" style={{ textDecoration: "underline" }}>tomorrow&apos;s schedule</a>,{" "}
              <a href="/yesterday" style={{ textDecoration: "underline" }}>yesterday&apos;s results</a>, the{" "}
              <a href="/worldcup" style={{ textDecoration: "underline" }}>2026 World Cup hub</a>, or the{" "}
              <a href="/faq" style={{ textDecoration: "underline" }}>FAQ</a> — all spoiler-free.
            </p>
          </div>
        </details>

        {!isNativeApp && (
          <div className="flex items-center gap-2">
            {/* Official Apple "Download on the App Store" badge. */}
            <a
              href="https://apps.apple.com/app/hidescore/id6766885311"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download HideScore on the App Store"
              className="inline-block transition-opacity hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} className="block h-10 w-auto" />
            </a>
            {/* Compact custom Apple-logo pill — replaced by the official badge
                above. Kept commented in case we want the smaller text version back.
            <a
              href="https://apps.apple.com/app/hidescore/id6766885311"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              aria-label="Download HideScore on the App Store"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 12.04c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.41-1.07-3.97-1.04-2.04.03-3.93 1.19-4.98 3.02-2.13 3.69-.54 9.13 1.52 12.12 1.01 1.46 2.21 3.1 3.78 3.04 1.52-.06 2.09-.98 3.93-.98 1.83 0 2.36.98 3.97.95 1.64-.03 2.68-1.49 3.69-2.96 1.16-1.69 1.64-3.34 1.66-3.42-.04-.02-3.19-1.22-3.21-4.84zM14.05 3.27c.83-1.01 1.39-2.41 1.24-3.81-1.2.05-2.65.8-3.51 1.81-.77.89-1.45 2.32-1.27 3.69 1.34.1 2.71-.68 3.54-1.69z" />
              </svg>
              <span>App Store</span>
            </a>
            */}
            {/* Android download — HIDDEN until the Play Store closed test is
                public. When it ships, this becomes the OFFICIAL Google Play
                badge linking the Play listing (not the /HideScore.apk sideload).
                Un-comment + swap href to the Play URL once it's live.
            <a
              href="https://play.google.com/store/apps/details?id=com.jacobhl.hidescore"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get HideScore on Google Play"
              className="inline-block transition-opacity hover:opacity-80"
            >
              <img src="/google-play-badge.svg" alt="Get it on Google Play" height={40} className="block h-10 w-auto" />
            </a>
            */}
          </div>
        )}

        {/* Tip jar — temporarily hidden 2026-06-24; restore by un-commenting:
        <a
          href="https://ko-fi.com/jacobhl"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          aria-label="Support HideScore on Ko-fi"
        >
          <span aria-hidden="true">☕</span>
          HideScore is free &amp; ad-free — support it
        </a>
        */}
      </footer>

      {showFavToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg animate-fade-in max-w-xs w-[calc(100%-2rem)]"
          style={{ background: "linear-gradient(var(--bg-card), var(--bg-card)), var(--bg)", border: "1px solid var(--border)" }}
        >
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Favorites saved to this browser
              </p>
              <button
                onClick={dismissFavToast}
                className="text-xs shrink-0 mt-0.5 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                aria-label="Dismiss"
              >
                {"\u2715"}
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Bookmark or copy link to keep across devices
            </p>
            <button
              onClick={copyFavLink}
              className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {favToastCopied ? "Copied!" : "Copy favorites link"}
            </button>
          </div>
        </div>
      )}

      {showRatingsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRatingsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ratings-explainer-title"
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 id="ratings-explainer-title" className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>Show Game Ratings?</h3>
            {/* Previous wording (finished games only):
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              This will reveal how competitive each game was. Ratings are based on how close the game was —<br />not who won — but they can hint at the outcome.
            </p>
            */}
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Ratings show how competitive each game is:<br />based on <strong>score closeness</strong>, not who&apos;s winning.<br />They can hint at the outcome.
            </p>
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Games will also be reordered by <strong>top records and best matchups</strong>. <em>This is my preferred view!</em>
            </p>
            <div className="rounded-lg p-3 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>RATING SCALE</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white w-14 text-center">GREAT</span>
                  <span style={{ color: "var(--text-secondary)" }}>Must-watch — down to the wire</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600 text-white w-14 text-center">GOOD</span>
                  <span style={{ color: "var(--text-secondary)" }}>Competitive and entertaining</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white w-14 text-center">MEH</span>
                  <span style={{ color: "var(--text-secondary)" }}>One-sided, but watchable</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-700 text-white w-14 text-center">SKIP</span>
                  <span style={{ color: "var(--text-secondary)" }}>Blowout — skip unless your team</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRatingsExplainer(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cb = document.getElementById("dont-show-explainer") as HTMLInputElement | null;
                  confirmRatings(cb?.checked ?? false);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                Show Ratings
              </button>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none justify-end">
              <input type="checkbox" id="dont-show-explainer" className="accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Don&apos;t show this again</span>
            </label>
          </div>
        </div>
      )}

      {showNewsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-explainer-title"
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 id="news-explainer-title" className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>
              Warning
              <br />
              FULL OF SPOILERS
            </h3>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
              News headlines and images give away game results, player performance, and outcomes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewsExplainer(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cb = document.getElementById("dont-show-news-explainer") as HTMLInputElement | null;
                  confirmNews(cb?.checked ?? false);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                Show News
              </button>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none justify-end">
              <input type="checkbox" id="dont-show-news-explainer" className="accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Don&apos;t show this again</span>
            </label>
          </div>
        </div>
      )}

      {showLeaguePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={skipLeaguePicker}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="league-picker-title"
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none" aria-hidden>
                <rect width="32" height="32" rx="6" className="header-logo-bg" />
                <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
              </svg>
            </div>
            <h3 id="league-picker-title" className="font-bold text-lg mb-1 text-center" style={{ color: "var(--text)" }}>Pick your leagues</h3>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
              Choose up to <strong>3 leagues</strong> for your score columns.<br />You can change these anytime in Settings.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {thirdLeagueOptions.map((o) => {
                const idx = pickerSel.indexOf(o.sport);
                const on = idx >= 0;
                const full = pickerSel.length >= 3 && !on;
                return (
                  <button
                    key={o.sport}
                    type="button"
                    disabled={full}
                    onClick={() => togglePick(o.sport)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={on
                      ? { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" }
                      : { background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
                  >
                    {on ? `${idx + 1}. ` : ""}{o.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={skipLeaguePicker}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Use defaults
              </button>
              <button
                onClick={confirmLeaguePicker}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                {pickerSel.length ? `Show ${pickerSel.length} league${pickerSel.length > 1 ? "s" : ""}` : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}

      {videoModal && (
        <VideoModal
          videoId={videoModal.videoId}
          fallbackUrl={videoModal.fallbackUrl}
          playbackUrl={videoModal.playbackUrl}
          imageUrl={videoModal.imageUrl}
          embedUrl={videoModal.embedUrl}
          poster={videoModal.poster}
          sourceLabel={videoModal.sourceLabel}
          headline={videoModal.headline}
          byline={videoModal.byline}
          published={videoModal.published}
          body={videoModal.body}
          shareCard={videoModal.shareCard}
          maskVideoTitle={prefs.maskVideoTitle ?? true}
          maskVideoBottom={prefs.maskVideoBottom ?? true}
          youtubeNativeControls={prefs.youtubeNativeControls ?? false}
          seekControl={prefs.videoSeekControl ?? "both"}
          seekFill={prefs.videoSeekFill ?? "off"}
          allowEnd={prefs.videoAllowEnd ?? false}
          warnHalfway={prefs.videoWarnHalfway ?? false}
          onPrev={videoModal.siblings && (videoModal.sibIndex ?? 0) > 0 ? () => stepVideo(-1) : undefined}
          onNext={videoModal.siblings && (videoModal.sibIndex ?? 0) < videoModal.siblings.length - 1 ? () => stepVideo(1) : undefined}
          onClose={closeVideoModal}
        />
      )}

      {detailGame && (
        <GameDetailModal
          game={detailGame}
          showRatings={prefs.showRatings}
          onClose={() => setDetailGame(null)}
          leagueLabel={thirdLeagueOptions.find((o) => o.sport === detailGame.sport)?.label ?? detailGame.sport.toUpperCase()}
          onPlayHighlight={openVideoModal}
          onPlayEmbed={openEmbedModal}
          onShowGroup={(groupName) => { setGroupsHighlight(groupName); setDetailGame(null); setGroupsOpen(true); }}
        />
      )}

      {groupsOpen && (
        <WorldCupGroupsModal
          highlightGroup={groupsHighlight}
          onClose={() => { setGroupsOpen(false); setGroupsHighlight(null); }}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        updatePrefs={updatePrefs}
        resolvedTheme={resolvedTheme}
        thirdLeagueOptions={thirdLeagueOptions}
        displayedLeagues={sortedLeagues}
        knownTeams={knownTeams}
        onShareFavorites={shareFavorites}
        shareCopied={showShareCopied}
        shareUrl={buildShareUrl()}
      />

      <button
        type="button"
        aria-label="Scroll to top"
        title="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className={`monkey-toggle fixed z-40 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 shadow-lg ${showScrollTop ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{
          right: "2rem",
          // Lifted clear of the fixed bottom tab bar (h-14 + safe-area) so
          // the two don't overlap in the corner.
          bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)",
          // var(--bg) instead of --bg-card so the button stays opaque over
          // arbitrary scrolled content — bg-card is rgba(.., .05) in dark mode
          // and would make the button nearly invisible over a Reddit thumbnail.
          background: "var(--bg)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <div className="sm:hidden">
        <BottomTabBar viewMode={viewMode} onChange={handleViewModeClick} />
      </div>
    </div>
  );
}
