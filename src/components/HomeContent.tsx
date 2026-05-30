"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type ReactNode } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { Preferences, Theme, loadPreferences, savePreferences, encodeFavorites, decodeFavorites } from "@/lib/preferences";
import { fetchAllLeagues, ALL_LEAGUES, isLeagueActive } from "@/lib/espn";
import { isDemoModeActive, applyDemoMode, isNoHitAlertDemoActive, applyNoHitAlertDemo } from "@/lib/demoMode";
import LeagueColumn from "@/components/LeagueColumn";
import FeedbackBox from "@/components/FeedbackBox";
import NewsColumn, { NewsColumnTitle, NewsSource, PlayHandler } from "@/components/NewsColumn";
import SettingsPanel from "@/components/SettingsPanel";
import { fetchLeagueNews, fetchPrebaked, leagueSourceCascade, GENERIC_CASCADE, ColumnSource, classifySource } from "@/lib/news";
import DateNav, { getDateString, CalendarDropdown, getETHour } from "@/components/DateNav";
import VideoModal from "@/components/VideoModal";
import AlignedVideoStrip from "@/components/AlignedVideoStrip";

function getResolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function getSmartDefaultOffset(cutoffHour = 13): number {
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
        onClick={() => onChange(mode)}
        title={title}
        aria-label={title}
        aria-pressed={active}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors select-none ${inline ? "h-12" : "h-14"}`}
        style={{
          color: active ? "var(--accent)" : "var(--text-muted)",
          // Filled background on the selected tab so it reads as a toggle/
          // segmented-control selection rather than just recolored text.
          background: active ? "var(--bg-card-hover)" : "transparent",
          fontWeight: active ? 600 : 400,
        }}
      >
        <span className={`flex items-center justify-center transition-opacity ${active ? "opacity-100" : "opacity-70"}`}>
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
          </svg>,
          "News",
          "News (full spoilers)",
        )}
      </div>
    </nav>
  );
}

// Yesterday/Today/Tomorrow-style pill row used for news global filters
// (source type, focus league). Selected pill gets a faint card background
// + bold text; unselected stay muted. Same visual language as DateNav.
function NewsPillRow({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0.5 flex-wrap">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3 py-1 sm:py-1.5 rounded text-[11px] sm:text-sm whitespace-nowrap transition-colors text-center cursor-pointer"
            style={
              active
                ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 600 }
                : { color: "var(--text-muted)", background: "transparent" }
            }
          >
            {opt.label}
          </button>
        );
      })}
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


export default function HomeContent({ initialOffset }: { initialOffset?: number }) {
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
  const [videoModal, setVideoModal] = useState<{ videoId: string; fallbackUrl: string; playbackUrl?: string | null; imageUrl?: string | null; embedUrl?: string | null; poster?: string | null; sourceLabel?: string | null; headline?: string | null; byline?: string | null; published?: string | null; body?: string | null } | null>(null);
  const [showNews, setShowNews] = useState(false);
  const [showNewsExplainer, setShowNewsExplainer] = useState(false);
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
        }
        if (decoded.theme) loaded.theme = decoded.theme;
        if (decoded.defaultDateMode) loaded.defaultDateMode = decoded.defaultDateMode;
        if (decoded.defaultLandingView) loaded.defaultLandingView = decoded.defaultLandingView;
        if (decoded.defaultRatings) loaded.defaultRatings = decoded.defaultRatings;
        if (decoded.newsThirdLeague) loaded.newsThirdLeague = decoded.newsThirdLeague;
        savePreferences(loaded);
        const keep = new URLSearchParams();
        if (sharedVideoId) keep.set("v", sharedVideoId);
        const qs = keep.toString();
        window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      }
      if (sharedVideoId) {
        setVideoModal({ videoId: sharedVideoId, fallbackUrl: "" });
      }
    }
    // Ratings on launch: respect defaultRatings pref.
    //   auto (default) → keep the morning-safety reset (off before noon ET)
    //   off            → always off on launch
    //   on             → always on on launch
    // News view explicitly does NOT reset — it's a viewer choice, not a
    // spoiler surface, so it persists across refresh.
    const ratingsMode = loaded.defaultRatings ?? "auto";
    if (ratingsMode === "on") {
      loaded.showRatings = true;
    } else if (ratingsMode === "off") {
      loaded.showRatings = false;
    } else {
      const hour = getETHour();
      const morningReset = hour < 12;
      if (morningReset) loaded.showRatings = false;
    }
    setPrefs(loaded);
    // Landing view: defaultLandingView pref decides whether to honor the
    // remembered showNews state, force scores, or force news on launch.
    const landing = loaded.defaultLandingView ?? "remember";
    if (landing === "news") setShowNews(true);
    else if (landing === "scores") setShowNews(false);
    else if (loaded.showNews) setShowNews(true);
    document.documentElement.setAttribute("data-theme", getResolvedTheme(loaded.theme));
  }, []);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.theme]);

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

  const openVideoModal = useCallback((videoId: string, fallbackUrl: string) => {
    setVideoModal({ videoId, fallbackUrl });
    const params = new URLSearchParams(window.location.search);
    params.set("v", videoId);
    window.history.pushState({ videoModal: true }, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  // Game-card click → play a non-YouTube embed (NHL recaps via Brightcove)
  // inside the same modal. No ?v= param: the embed URL isn't a shareable
  // YouTube id, so we just push a history entry so Back / Esc dismiss it.
  const openEmbedModal = useCallback((embedUrl: string, fallbackUrl: string, sourceLabel: string) => {
    setVideoModal({ videoId: "", fallbackUrl, embedUrl, sourceLabel });
    window.history.pushState({ videoModal: true }, "", window.location.href);
  }, []);

  // News video card click → open the in-app modal. The card passes either a
  // prebake-matched YouTube videoId OR a direct HLS stream URL (MLB). If the
  // stream is available we play it directly; otherwise we fall back to the
  // YouTube iframe path. Cards with no inline option skip this handler and
  // render as plain anchors to the source URL.
  const playNewsVideo = useCallback<PlayHandler>((opts) => {
    setVideoModal({
      videoId: opts.videoId || "",
      playbackUrl: opts.playbackUrl || null,
      imageUrl: opts.imageUrl || null,
      poster: opts.poster || null,
      fallbackUrl: opts.fallbackUrl,
      sourceLabel: opts.sourceLabel || null,
      headline: opts.headline || null,
      byline: opts.byline || null,
      published: opts.published || null,
      body: opts.body || null,
    });
    if (opts.videoId) {
      const params = new URLSearchParams(window.location.search);
      params.set("v", opts.videoId);
      window.history.pushState({ videoModal: true }, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

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

  const fetchData = useCallback(async (
    date: string,
    thirdLeague?: Sport | "empty",
    slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty" },
    silent = false,
  ) => {
    // silent=true skips the global skeleton — used when only one slot changed
    // (header dropdown or settings panel). Old data stays visible until the
    // new pull resolves, which prevents the "all 3 columns flash gray" effect.
    if (!silent) setLoading(true);
    setError(false);
    try {
      let data = await fetchAllLeagues(date, thirdLeague, slotOverrides);
      if (isDemoModeActive()) data = applyDemoMode(data);
      if (isNoHitAlertDemoActive()) data = applyNoHitAlertDemo(data);
      setLeagues(data);
    } catch {
      setLeagues([]);
      setError(true);
    }
    if (!silent) setLoading(false);
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
    }, false);
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    if (!mountedRef.current || !selectedDate) return;
    fetchData(selectedDate, prefs.thirdLeague, {
      first: prefs.firstLeague,
      second: prefs.secondLeague,
      third: prefs.thirdLeague,
    }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague]);

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
      }, true);
    }, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLiveGames, selectedDate, prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague]);

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

  const shareFavorites = () => {
    const params = encodeFavorites(
      prefs.favoriteTeams,
      prefs.favoriteLeagues,
      prefs.thirdLeague,
      [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague],
      {
        theme: prefs.theme,
        defaultDateMode: prefs.defaultDateMode,
        defaultLandingView: prefs.defaultLandingView,
        defaultRatings: prefs.defaultRatings,
        newsThirdLeague: prefs.newsThirdLeague,
      },
    );
    const url = `${window.location.origin}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
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
    const params = encodeFavorites(
      prefs.favoriteTeams,
      prefs.favoriteLeagues,
      prefs.thirdLeague,
      [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague],
      {
        theme: prefs.theme,
        defaultDateMode: prefs.defaultDateMode,
        defaultLandingView: prefs.defaultLandingView,
        defaultRatings: prefs.defaultRatings,
        newsThirdLeague: prefs.newsThirdLeague,
      },
    );
    const url = `${window.location.origin}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
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

  // When the user picks a league (or Empty) for one column, lock the other two
  // to whatever's currently displayed so the auto-picker doesn't shuffle them.
  // Without this, picking NCAAM for slot 2 (with slots 1+3 unset) re-runs auto-pick
  // for the others and can bump NHL out of slot 3 — see lib/espn.ts fetchAllLeagues.
  // Duplicates are allowed; "empty" hides the slot; Auto (undefined) only unsets
  // that one slot, so consecutive Auto clicks across all three drop back to default.
  const setSlotLeague = (slotIdx: number, sport: Sport | "empty" | undefined) => {
    let resolved: (Sport | "empty" | undefined)[];
    if (sport === undefined) {
      resolved = [...selectedSlotLeagues];
      resolved[slotIdx] = undefined;
    } else {
      const displayed = sortedLeagues.map((l) => l.sport);
      resolved = [0, 1, 2].map((i) => selectedSlotLeagues[i] ?? displayed[i]);
      resolved[slotIdx] = sport;
    }
    updatePrefs({
      firstLeague: resolved[0],
      secondLeague: resolved[1],
      thirdLeague: resolved[2],
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
    const baseline: (Sport | "empty" | undefined)[] = [0, 1, 2].map((i) => {
      const pref = selectedSlotLeagues[i];
      if (pref === "empty") return "empty";
      if (pref) return pref;
      // Auto/unset → use whichever league is currently in this slot's position.
      // leagueQueue is in slot order (empties already dropped by fetchAllLeagues).
      return leagueQueue[queueIdx++];
    });
    [baseline[fromIdx], baseline[toIdx]] = [baseline[toIdx], baseline[fromIdx]];
    updatePrefs({
      firstLeague: baseline[0],
      secondLeague: baseline[1],
      thirdLeague: baseline[2],
    });
  };

  const selectedSlotLeagues: (Sport | "empty" | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
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
  // after `allFirstAreVideo` flips true (which depends on async data) —
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

  const resolvedTheme = getResolvedTheme(prefs.theme);

  // Pull-to-refresh visual: a small spinner pill that descends from below the
  // header proportional to pullDelta, latches into a spinning state during
  // refresh, then fades out. translate3d so it composites on the GPU and
  // doesn't drop frames on iOS during the pull gesture.
  const ptrProgress = Math.min(pullDelta / 70, 1);
  const ptrVisible = pullDelta > 0 || refreshing;
  const ptrTranslateY = refreshing ? 28 : Math.max(0, pullDelta - 12);

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
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
              style={{
                transform: refreshing ? undefined : `rotate(${ptrProgress * 270}deg)`,
                animation: refreshing ? "ptr-spin 700ms linear infinite" : undefined,
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
        </div>
      )}
      <header ref={headerRef} className="px-4 sticky top-0 z-40" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(8px)", paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}>
        <div className="max-w-6xl mx-auto relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <a
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
          </a>

          {/* Top-row middle (col 2): the view tabs on sm+ (page-centered between
              two 1fr cols → lines up with the middle MLB column). On small screens
              the tabs drop to the fixed bottom bar, so the date nav takes this slot
              instead (scores/rated only) — sitting cleanly in the top row. */}
          <div className="justify-self-center col-start-2">
            <div className="hidden sm:block w-80">
              <BottomTabBar viewMode={viewMode} onChange={handleViewModeClick} placement="inline" />
            </div>
            {/* Date nav lives in its own row below the header on ALL sizes now
                (moved out of this cramped top-middle on mobile so the right-side
                theme + settings icons don't overflow off-screen on phones). */}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 justify-self-end col-start-3">
            {/* Share — web only (xl+). On mobile the same action lives at the
                bottom of the settings panel. */}
            {hasFavorites && (
              <button
                onClick={shareFavorites}
                className="monkey-toggle hidden xl:flex w-10 h-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: showShareCopied ? "var(--accent)" : "var(--text-muted)",
                }}
                title={showShareCopied ? "Link copied!" : "Copy settings link"}
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

            {/* News cluster: source filter popover. (The 1/2/3 column-count
                selector was removed 5/30 — desktop is a fixed 3 columns, mobile
                is a single stacked column. Backlogged to re-add if wanted.) */}
            {showNews && (
              <>
                {/* Source-type + focus-league filters live in a funnel popover
                    instead of always-on header pill rows — keeps the news header
                    clean like hidescore.com while keeping the filters reachable. */}
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
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {newsTypeFilter !== "all" && !newsFilterOpen && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                    )}
                  </button>
                  {newsFilterOpen && (
                    <div
                      className="absolute top-full mt-1 right-0 rounded-lg shadow-lg z-50 p-3 min-w-[210px]"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Source</div>
                      <NewsPillRow
                        options={[
                          { value: "all", label: "All" },
                          { value: "topvideos", label: "Top videos" },
                          { value: "espn", label: "ESPN" },
                          { value: "homepage", label: "Homepage" },
                        ]}
                        value={newsTypeFilter}
                        onChange={(v) => setNewsTypeFilter(v as "all" | "topvideos" | "espn" | "reddit" | "homepage")}
                      />
                      {/* League filtering removed (Jacob 5/29) — clicking a
                          column's league name does the same thing. Source only. */}
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
                {/* ☰ source-order / hide menu removed for now (Jacob 5/29) —
                    mainly useful in single-column view; backlogged for later. */}
              </>
            )}

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
      {/* Date nav sits BELOW the header divider line on ALL sizes. (Was
          top-row-middle on mobile, but that overflowed the right-side icons —
          its own centered row is cleaner.) Scores/rated only; centered in
          max-w-6xl to line up with the middle (MLB) column. */}
      {!showNews && (
        <div className="flex max-w-6xl mx-auto px-4 justify-center pt-2 pb-1">
          <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} trailing={
            <span className="relative inline-flex">
              <button
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
            </span>
          } />
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 pt-0 pb-6 flex-1 w-full">
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
          const renderSourcesFor = (entry: typeof visibleNewsEntries[number]): NewsSource[] => {
            const filtered = entry.orderedCascade
              .filter((s) => newsTypeFilter === "all" || classifySource(s) === newsTypeFilter)
              .filter((s) => !newsHiddenSources.includes(s.label));
            return cascadeToSources(filtered);
          };

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

          // Convenience aliases — the aligned-video-strip logic below still
          // references col1All/col2All/col3All directly to detect the all-
          // video case (3-col only). Use the rendered (post-filter) sources
          // since the strip activation should track what's visible.
          const col1All = focusedEntries[0] ? renderSourcesFor(focusedEntries[0]) : [];
          const col2All = focusedEntries[1] ? renderSourcesFor(focusedEntries[1]) : [];
          const col3All = focusedEntries[2] ? renderSourcesFor(focusedEntries[2]) : [];
          // When all 3 columns lead with a video source, lift those into the
          // aligned strip so video N in every column is the same vertical
          // size. Otherwise let each column render its own first card.
          const allFirstAreVideo =
            col1All[0]?.variant === "video" &&
            col2All[0]?.variant === "video" &&
            col3All[0]?.variant === "video";
          // Which entries actually render: 1-col stacks ALL focused leagues
          // (Jacob's "single column view should have all leagues"); 2/3-col
          // takes the first N entries side-by-side. AlignedVideoStrip only
          // makes sense at exactly 3 side-by-side cols with all video-first.
          // When a Focus league is set, there's only one entry — force 1-col.
          // Phones → 1 stacked column; desktop → fixed 3 across. (A Focus
          // league also collapses to 1.) The user-facing 1/2/3 selector is gone.
          const effectiveColCount = (newsFocusLeague || isMobile) ? 1 : 3;
          const renderedEntries = effectiveColCount === 1
            ? focusedEntries
            : focusedEntries.slice(0, effectiveColCount);
          const stripActive = effectiveColCount === 3
            && focusedEntries.length === 3
            && allFirstAreVideo;
          const useEspnTopTail = stripActive && !prefs.newsThirdLeague;
          // Sources stripped of the video lead when the strip is active.
          const sourcesForEntry = (entry: typeof renderedEntries[number], idx: number) => {
            const all = renderSourcesFor(entry);
            if (!stripActive) return all;
            if (idx === 2 && useEspnTopTail) {
              return all.slice(1).filter((s) => s.label !== "ESPN");
            }
            return all.slice(1);
          };

          const wideCol = "flex-1 min-w-0 max-w-[420px] xl:max-w-[520px]";
          const narrowCol = "flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]";
          // News + button: same pattern as scores. When user picks Empty on a
          // news league column, the underlying scores slot becomes empty too,
          // so this finds the first empty slot and refills it on click.
          const newsFirstEmptySlot = [0, 1, 2].find((i) => selectedSlotLeagues[i] === "empty");
          const newsOnAddColumn = newsFirstEmptySlot !== undefined && leagueEntries.length < 3
            ? () => {
                const shown = leagueEntries.map((e) => e.sport);
                const eligible = thirdLeagueOptions.filter((o) => !shown.includes(o.sport));
                const pick = eligible[0]?.sport ?? thirdLeagueOptions[0]?.sport;
                if (pick) setSlotLeague(newsFirstEmptySlot, pick);
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
                            swappableOptions={thirdLeagueOptions}
                            shownElsewhere={otherSports}
                            selectedSport={entry.sport}
                            onSwapLeague={isEspn ? ((s) => { if (s === "empty") setSlotLeague(2, "empty"); else if (s) setNewsThirdLeague(s); }) : ((s) => newsSwapFor(entry.slotIdx)(s))}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <AlignedVideoStrip
                    key={`avs-${newsRefreshKey}`}
                    sources={[col1All[0], col2All[0], col3All[0]]}
                    onPlay={playNewsVideo}
                    tailFetch={useEspnTopTail ? () => fetchPrebaked("espn-top") : undefined}
                    tailColIdx={useEspnTopTail ? 2 : undefined}
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
                {renderedEntries.map((entry, idx) => {
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
                      swappableOptions={thirdLeagueOptions}
                      shownElsewhere={otherSports}
                      selectedSport={entry.sport}
                      onSwapLeague={isEspn ? ((s) => { if (s === "empty") setSlotLeague(2, "empty"); else if (s) setNewsThirdLeague(s); }) : ((s) => newsSwapFor(entry.slotIdx)(s))}
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
            {[1, 2, 3].map((i) => (
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
              selectedDate,
              onRetry: () => doRefreshRef.current(),
            };
            // Per-slot swap dropdowns: every column lists every in-season
            // league. Leagues already shown in another column come through
            // greyed (via shownElsewhere) but stay selectable — picking one
            // gives you a second column of that league.
            const displayedSports = sortedLeagues.map((l) => l.sport);
            const swapPropsForSlot = (idx: number) => ({
              swappableOptions: thirdLeagueOptions,
              shownElsewhere: displayedSports.filter((_, i) => i !== idx),
              selectedThirdLeague: selectedSlotLeagues[idx],
              onSwapLeague: (s: Sport | "empty" | undefined) => setSlotLeague(idx, s),
            });
            // Slot fetched-league queue: fetchAllLeagues skipped empty slots,
            // so we walk slot prefs and pull from the fetched queue for non-
            // empty slots. Empty slots collapse the column entirely (no stub
            // rendered); the + button at the end of the row brings them back.
            const leagueQueue = [...sortedLeagues];
            const slotEntries = [0, 1, 2].map((slotIdx) => {
              if (selectedSlotLeagues[slotIdx] === "empty") return null;
              const league = leagueQueue.shift();
              if (!league) return null;
              return { slotIdx, league, isEmpty: false as const };
            }).filter((e): e is NonNullable<typeof e> => e !== null);

            // + button: first slot the user explicitly emptied gets repopulated
            // with the first eligible league (not currently shown in another
            // visible column). Only shown when there's room (<3 visible cols).
            const firstEmptySlot = [0, 1, 2].find((i) => selectedSlotLeagues[i] === "empty");
            const onAddColumn = firstEmptySlot !== undefined && slotEntries.length < 3
              ? () => {
                  const shown = slotEntries.map((e) => e.league.sport);
                  const eligible = thirdLeagueOptions.filter((o) => !shown.includes(o.sport));
                  const pick = eligible[0]?.sport ?? thirdLeagueOptions[0]?.sport;
                  if (pick) setSlotLeague(firstEmptySlot, pick);
                }
              : undefined;

            // Full-width flex row so the flex-1 columns distribute across the
            // viewport (up to their max-w) and the group centers — matches
            // hidescore.com. The + button is a trailing flex child (like the
            // news view) so it tags along without forcing a content-width group
            // (the old inline-flex wrapper shrank the columns — Jacob 5/29).
            if (showFinalSplit) {
              return (
                <div className="relative flex flex-row justify-center items-stretch gap-2 sm:gap-4">
                  {/* Invisible leading spacer balances the trailing + button so
                      the columns stay centered when a slot has been emptied. */}
                  {onAddColumn && <div aria-hidden className="shrink-0" style={{ width: 44 }} />}
                  {slotEntries.map((entry) => (
                    <LeagueColumn
                      key={`${entry.league.sport}-${entry.slotIdx}`}
                      league={entry.league}
                      slotIdx={entry.slotIdx}
                      onReorderSlots={reorderSlots}
                      {...commonProps}
                      showFinalSeparator
                      {...swapPropsForSlot(entry.slotIdx)}
                    />
                  ))}
                  {onAddColumn && (
                    <div className="flex items-start pt-7 shrink-0">
                      <AddColumnButton onClick={onAddColumn} />
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="relative flex flex-row justify-center items-stretch gap-2 sm:gap-4">
                {/* Invisible leading spacer balances the trailing + button so
                    the columns stay centered when a slot has been emptied. */}
                {onAddColumn && <div aria-hidden className="shrink-0" style={{ width: 44 }} />}
                {slotEntries.map((entry) => (
                  <LeagueColumn
                    key={`${entry.league.sport}-${entry.slotIdx}`}
                    league={entry.league}
                    slotIdx={entry.slotIdx}
                    onReorderSlots={reorderSlots}
                    {...commonProps}
                    {...swapPropsForSlot(entry.slotIdx)}
                  />
                ))}
                {onAddColumn && (
                  <div className="flex items-start pt-7 shrink-0">
                    <AddColumnButton onClick={onAddColumn} />
                  </div>
                )}
              </div>
            );
          })()
        )}
      </main>

      <footer className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_5rem)] sm:pb-5 text-center text-sm flex flex-col items-center gap-1" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <span>Catch up on games without spoilers.</span>
        <span className="inline-flex items-center gap-1">Select {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/monkey-see-no-evil.svg" alt="see-no-evil monkey" width={14} height={14} className="inline-block align-text-bottom" draggable={false} /> to show ratings and sort by top records.</span>
        <FeedbackBox />
        {!isNativeApp && (
          <div className="flex items-center gap-2 mt-1">
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
            {/* Android download pill tabled — Android app is being handled
                separately; un-table (and fix the "Google Play" label, which
                links a sideload .apk, not a Play listing) when it's ready. */}
          </div>
        )}
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
            <h3 className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>Show Game Ratings?</h3>
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
            <h3 className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>
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
          onClose={closeVideoModal}
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
      />

      <button
        type="button"
        aria-label="Scroll to top"
        title="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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
