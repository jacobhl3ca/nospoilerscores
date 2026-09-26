"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type ReactNode } from "react";
import { LeagueData, Sport, Game, LeagueEventCard, FightBout } from "@/lib/types";
import { buildHighlightShareUrl, highlightSharePath, type ShareCardMeta } from "@/lib/shareCard";
import { enabledCategories } from "@/lib/sensitiveNews";
import { Preferences, Theme, loadPreferences, savePreferences, setRemoteSync, encodeFavorites, decodeFavorites } from "@/lib/preferences";
import { sessionLaunchPatch } from "@/lib/sessionVisits";
import { mergeDismissedKeys } from "@/lib/dismissals";
import { keepDeviceLocalPrefs } from "@/lib/devicePrefs";
import { upcomingRecordLeagues } from "@/lib/upcomingRecords";
import type { BestYesterdayOptions, TopEventsOptions } from "@/lib/espn";
import { TOP_EVENTS_ENABLED } from "@/lib/topEvents";
import { BEST_YESTERDAY_ENABLED, BEST_YESTERDAY_LABEL, bestYesterdaySourceSports, prevYmd } from "@/lib/bestYesterday";
import { fromYmd } from "@/lib/etDay";
import { lockSlotsToBoard, swapBoardSlots } from "@/lib/boardSlots";
import { getAuthState, fetchRemotePrefs, pushRemotePrefs } from "@/lib/prefsSync";
import { syncPicksWithAccount } from "@/lib/picksAccount";
import { fetchAllLeagues, ALL_LEAGUES, isLeagueActive, isLeagueUpcoming, getActiveLeagueCandidates, pickAndAssignLeagues, getLeagueKickoff, formatKickoffShort, formatKickoffLong, sportGlyph, type LeagueKickoff } from "@/lib/espn";
import { isDemoModeActive, applyDemoMode, isNoHitAlertDemoActive, applyNoHitAlertDemo, isDemoPickerRequested, isDemoRatingsForced, isDemoNewsRequested, getDemoThemeOverride, demoHighlightPoster, DEMO_HIGHLIGHT_HEADLINE, anonymizeLeaguePickerOptions } from "@/lib/demoMode";
import NewsFeed from "@/components/NewsFeed";
import LeagueColumn, { playoffPictureInWindow } from "@/components/LeagueColumn";
import GameDetailModal from "@/components/GameDetailModal";
import EventDetailModal from "@/components/EventDetailModal";
import WorldCupGroupsModal from "@/components/WorldCupGroupsModal";
import SlamBracketModal from "@/components/SlamBracketModal";
import PlayoffPictureModal from "@/components/PlayoffPictureModal";
import FeedbackBox from "@/components/FeedbackBox";
import ControlsHint from "@/components/ControlsHint";
import NewsColumn, { NewsColumnTitle, NewsSource, PlayHandler, PlayOpts } from "@/components/NewsColumn";
import SettingsPanel from "@/components/SettingsPanel";
import { fetchLeagueNews, fetchPrebaked, leagueSourceCascade, GENERIC_CASCADE, MOBILE_NEWS_LEAGUE_ORDER, ColumnSource, classifySource, LEAGUE_LOGO } from "@/lib/news";
import { loadBakedHighlights } from "@/lib/highlights";
import DateNav, { getDateString, CalendarDropdown, getETHour } from "@/components/DateNav";
import VideoModal from "@/components/VideoModal";
import AlignedVideoStrip from "@/components/AlignedVideoStrip";
import WorldCupMattersCard from "@/components/WorldCupMattersCard";
import { parseWorldCupDateParam, worldCup2026Ended, worldCupLastMatchYmd, WORLD_CUP_2026_FINAL } from "@/lib/worldCup2026";
import LeagueRecapCard, { type PlayoffsTab } from "@/components/LeagueRecapCard";
import { getRecapsFor, getRecapsForSync, loadBakedRecaps } from "@/lib/recaps";
import Link from "next/link";

function getResolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

// Before v2, every league absent from hiddenLeagues rendered checked; there was
// no positive allowlist. Preserve that exact legacy state once, then stamp the
// blob so new accounts/installations keep the slimmer defaults. This covers
// both localStorage and signed-in R2 prefs through the merge helper below.
function migrateLegacySwitcherPreferences(prefs: Preferences): Preferences {
  if (prefs.switcherDefaultsVersion === 2) return prefs;
  const hidden = new Set(prefs.hiddenLeagues ?? []);
  const shown = new Set(prefs.shownLeagues ?? []);
  for (const league of ALL_LEAGUES) {
    if (league.excludeFromAuto && !hidden.has(league.sport)) shown.add(league.sport);
  }
  return {
    ...prefs,
    shownLeagues: shown.size ? [...shown] : undefined,
    switcherDefaultsVersion: 2,
  };
}

function mergeRemotePreferences(local: Preferences, remote: Partial<Preferences>): Preferences {
  const merged = {
    ...local,
    ...remote,
    // These arrays use omission to mean the default. Because the account copy
    // is canonical, an omitted remote array must clear a device-only override
    // instead of accidentally inheriting it through the object spread.
    hiddenLeagues: remote.hiddenLeagues,
    shownLeagues: remote.shownLeagues,
    switcherDefaultsVersion: remote.switcherDefaultsVersion,
    // Dismissals only ever accumulate, so they merge as a UNION — never a
    // pick. The reconcile lands 1-3 s after first paint; a banner dismissed
    // inside that window was pushed, then overwritten by the in-flight pull
    // of the server's older list, and came straight back (Jacob 9/4).
    // See lib/dismissals.ts.
    kickoffBannersDismissed: mergeDismissedKeys(local.kickoffBannersDismissed, remote.kickoffBannersDismissed),
    wcBannerDismissed: local.wcBannerDismissed || remote.wcBannerDismissed || undefined,
  };
  // The remote copy is canonical for a signed-in account. Its missing marker,
  // not the new device's local marker, decides whether the account is legacy.
  const reconciled = remote.switcherDefaultsVersion === 2
    ? merged
    : migrateLegacySwitcherPreferences({ ...merged, switcherDefaultsVersion: undefined });
  // Single-column view stays per device: a server blob written before this
  // rule (or by an older client) still carries it, so ignore it on the pull.
  return keepDeviceLocalPrefs(reconciled, local);
}

// What the Top events column reads from prefs. A pure projection so fetchData
// (a stable useCallback) can take it off a ref instead of closing over prefs.
function topEventsOptions(p: Preferences): TopEventsOptions {
  return {
    favoriteTeams: p.favoriteTeams,
    mode: p.topEventsMode,
    leagues: p.topEventsLeagues,
    count: p.topEventsCount,
  };
}

// What the Best of yesterday column pulls, in the user's order: the leagues on
// their board (the pin, else what Auto puts there), then their favorite
// leagues, then the auto-picker's own ranking, then the opt-in switcher
// leagues. Opt-ins go last because they are not a signal: the v2 switcher
// migration opted every legacy user into all of them at once, and ahead of the
// ranking they filled the source cap with five soccer leagues before MLB.
// Only leagues in season YESTERDAY — a pinned offseason league has no games to
// give — and never a hidden one. Pure, for the same reason as topEventsOptions.
function bestYesterdayOptions(p: Preferences, date: string, slotCount: number): BestYesterdayOptions {
  const yesterday = fromYmd(prevYmd(date));
  const inSeason = (s: Sport) => ALL_LEAGUES.some((l) => l.sport === s && isLeagueActive(l, yesterday));
  const auto = pickAndAssignLeagues(fromYmd(date), slotCount, p.hiddenLeagues).map((l) => l.sport);
  const board = [p.firstLeague, p.secondLeague, p.thirdLeague, p.fourthLeague, p.fifthLeague]
    .slice(0, slotCount)
    .map((pref, i) => (pref === undefined ? auto[i] : pref))
    .filter((s): s is Sport => !!s && s !== "empty");
  const { firstPref, rest } = getActiveLeagueCandidates(yesterday);
  const ordered = [
    ...board,
    ...p.favoriteLeagues,
    ...[...firstPref, ...rest].map((cfg) => cfg.sport),
    ...(p.shownLeagues ?? []),
  ];
  return { sources: bestYesterdaySourceSports(ordered.filter(inSeason), p.hiddenLeagues ?? []) };
}

function getSmartDefaultOffset(cutoffHour = 13): number {
  // The base date this offset applies to (getDateString → getNowET) is shifted:
  // between midnight and 1 AM ET it has ALREADY rolled back to the prior
  // calendar day, whose slate is complete. Subtracting another day here would
  // land two days back (Jacob 6/13), so in that window show the service day
  // as-is (offset 0). Gated on the ET hour to match getNowET's shift basis.
  if (getETHour() < 1) return 0;
  // User-local hour in the app's EFFECTIVE zone (getETHour honors the Settings
  // time-zone override, matching the `< 1` rollover guard above and the
  // ratings-auto `< 12` morning check below). The cutoff represents "when
  // today's slate has likely started" from the user's wall-clock POV — a
  // Pacific user wants their own 1 PM, not 1 PM ET (which is 10 AM for them).
  // Reading the raw device zone (new Date().getHours()) instead disagreed with
  // getNowET's override-aware base date, landing override users on the wrong
  // day; with no override, getTimeZone() is the device zone, so this is
  // unchanged for everyone else.
  const hour = getETHour();
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
        {/* The icons carry real alt text (2026-09-25): AI-visibility scanners
            count alt="" as missing, and these 3 icons render twice per board
            page. Screen readers are unaffected — the button's aria-label wins
            over its contents. */}
        {tab(
          "scores-plain",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/monkey-see-no-evil.svg" alt="See-no-evil monkey" width={24} height={24} className="w-6 h-6" draggable={false} />,
          "Scores",
          "Scores (no ratings, no spoilers)",
        )}
        {tab(
          "scores-rated",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/monkey-hear-no-evil.svg" alt="Hear-no-evil monkey" width={24} height={24} className="w-6 h-6" draggable={false} />,
          "Ratings",
          "Scores with ratings (sort by best games)",
        )}
        {tab(
          "news",
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/news-emoji.svg" alt="Newspaper" width={24} height={24} className="w-6 h-6 news-tab-emoji" draggable={false} />,
          "News",
          "News (full spoilers)",
        )}
      </div>
    </nav>
  );
}

type NewsSourceType = "topvideos" | "espn" | "reddit" | "homepage";

// Vertical, one-per-row source-type filter used inside the funnel popover.
// Each source is independently checkable; a drag handle reorders the
// rows (order persisted in prefs). Pointer-based drag (not HTML5) so it
// works on iOS. `dropIdx` is the insertion
// slot drawn as a thin accent bar between rows.
function NewsFilterList({ options, selected, onToggle, onReorder }: {
  options: { value: NewsSourceType; label: string }[];
  selected: NewsSourceType[];
  onToggle: (v: NewsSourceType) => void;
  onReorder: (order: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragListenersRef = useRef<(() => void) | null>(null);
  const [dragVal, setDragVal] = useState<NewsSourceType | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const order = options.map((o) => o.value);

  const startDrag = (e: React.PointerEvent, val: NewsSourceType) => {
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
    const removeListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragListenersRef.current = null;
    };
    const onUp = () => {
      removeListeners();
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
    // If the funnel popover unmounts mid-drag (pointer still down when the
    // popover closes or HomeContent re-renders it away), onUp/onCancel never
    // fire — so hand the teardown to the unmount effect below, which removes
    // these window listeners without leaking the closures over order/onReorder.
    // Mirrors LeagueColumn's dragListenersRef guard for its header drag.
    dragListenersRef.current = removeListeners;
  };

  // Remove any in-flight drag's window listeners if this list unmounts mid-drag
  // (see startDrag). No DOM side-effects to revert here — unlike LeagueColumn's
  // drag, this one appends no body cursor or ghost node — so it only detaches
  // the listeners; it intentionally does NOT fire the reorder/setState onUp runs.
  useEffect(() => () => { dragListenersRef.current?.(); }, []);

  return (
    <div ref={listRef} className="select-none">
      {options.map((opt, i) => {
        const active = selected.includes(opt.value);
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
                // Pointer-only reorder handle (onPointerDown drag, no HTML5 DnD so
                // it works on iOS) with no keyboard/AT equivalent. It used to carry
                // aria-label="Drag to reorder" on this bare, non-focusable span,
                // which advertised a "Drag to reorder" control to screen readers
                // that a keyboard/SR user then had no way to operate. Selecting a
                // filter is already fully keyboard-accessible via the row's <button>
                // below; reordering is a pointer-only enhancement whose persisted
                // order degrades gracefully (applyOrder tolerates any/no custom
                // order). So hide the handle from assistive tech — the honest state
                // for an inoperable affordance — matching the aria-hidden the
                // decorative grip glyph inside already carries.
                aria-hidden="true"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
                </svg>
              </span>
              <label
                className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded text-sm whitespace-nowrap transition-colors cursor-pointer"
                style={active
                  ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 600 }
                  : { color: "var(--text-muted)", background: "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={active && selected.length === 1}
                  onChange={() => onToggle(opt.value)}
                  className="cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
                  title={active && selected.length === 1 ? "Keep at least one source selected" : undefined}
                />
                <span>{opt.label}</span>
              </label>
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
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}

// 5-column board breakpoint: at ≥1280px the max-w-7xl board fits five columns
// at ~236px each (above the 225px desktop column cap) — "room for all
// naturally". Below it the board stays at the classic 3 columns.
// Copy for the season-kickoff banner. Kept apart from the markup because the
// wording is the whole point of the banner: for a league someone already
// follows, the useful fact is WHEN, and "Friday, Aug 21" carries that better
// than a countdown ("in 13 days" makes a reader do arithmetic). The 2026-27
// Premier League is the case that prompted this — a World Cup summer pushed
// kickoff a week later than usual, so even regular viewers have the wrong date.
// Paused (Jacob 9/10): the season-kickoff banner — the one-line "<League> kicks
// off Friday / Add the <League> column" strip above the board — is off. Every
// piece of it below is intact; flip this to true to bring it back, and the
// per-season dismissal keys pick up where they left off.
const KICKOFF_BANNER_ENABLED = false;

function kickoffMessage(k: LeagueKickoff): string {
  const name = k.config.label === "Premier League" ? "The Premier League" : k.config.label;
  if (k.phase === "underway") return `${name} is underway — every match, spoiler-free.`;
  if (k.phase === "today" || k.daysUntil === 0) return `${name} kicks off today — spoiler-free from the first whistle.`;
  if (k.daysUntil === 1) return `${name} kicks off tomorrow — spoiler-free from day one.`;
  return `${name} kicks off ${formatKickoffLong(k.kickoff)} — spoiler-free from day one.`;
}

// Seeds the message when the feedback modal is opened from Settings' "Request
// a league" link. A prefilled first line is what makes these arrive sortable —
// the 2026-08-03 league request landed as an anonymous bare sentence and there
// was nothing in it to file against.
const FEEDBACK_LEAGUE_PREFILL = "League request: ";

// Build day (YYYY-MM-DD, New York), set in next.config.ts. Unset in tests.
const BUILT_ON = process.env.NEXT_PUBLIC_BUILT_ON;
// "September 25, 2026". Noon UTC is the same calendar day in New York, and a
// fixed timeZone keeps the server and client strings identical.
const formatBuiltOn = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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
// the calendar button it sits beside. `compact` = the phone header copy, sized
// like the phone's 28px calendar icon, and only at 390px and up: below that the
// header row is already full (the calendar reaches the moon at 375), so a
// narrower phone keeps Settings → Board layout as its switch.
function SingleColToggle({ active, onClick, compact }: { active: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${compact ? "hidden min-[390px]:flex w-7 h-7 shrink-0" : "flex ml-0.5 w-8 h-8"} items-center justify-center rounded-full transition-colors cursor-pointer`}
      style={{ color: active ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
      title={active ? "Single-column view (on) — tap for columns" : "Single-column view — one wide column, bigger cards"}
      aria-label="Toggle single-column view"
      aria-pressed={active}
    >
      {active ? (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="translate-y-px">
          <rect x="6" y="4" width="12" height="16" rx="1.5" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="translate-y-px">
          <rect x="4" y="4" width="6" height="16" rx="1.5" /><rect x="14" y="4" width="6" height="16" rx="1.5" />
        </svg>
      )}
    </button>
  );
}

// A labeled on/off chip for the news toolbar (Headlines / Videos / Text posts).
// Filled accent = ON, outline = OFF — one consistent shape so the row is easy to
// read and toggle (Jacob 7/14).
// `disabled` = the chip's pref is currently OVERRIDDEN by another chip (Text
// posts while Videos only is on). It renders dimmed + aria-disabled but still
// toggles, so the pref can be pre-set for when the override lifts — a real
// disabled button would trap the user in the override.
function NewsToggleChip({ active, onClick, title, ariaLabel, disabled, children }: {
  active: boolean; onClick: () => void; title: string; ariaLabel: string; disabled?: boolean; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-disabled={disabled || undefined}
      // The visible text label is display:none below 640px (`hidden sm:inline`)
      // and the icon is aria-hidden, so on phones the only name source left is
      // `title` — which iOS VoiceOver doesn't reliably announce for buttons,
      // leaving these chips as unnamed "button, pressed/not pressed". Pin an
      // explicit aria-label so the name survives on every viewport, matching the
      // icon-button convention used elsewhere (e.g. SingleColToggle above).
      aria-label={ariaLabel}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
      style={{
        background: active ? "var(--accent)" : "var(--bg-card)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "white" : "var(--text-muted)",
        opacity: disabled ? 0.45 : undefined,
      }}
    >
      {children}
    </button>
  );
}

type WorldCupHubMode = "today" | "tomorrow" | "highlights";

const POPULAR_WORLD_CUP_TEAMS = [
  { name: "United States", slug: "united-states", flag: "🇺🇸" },
  { name: "Argentina", slug: "argentina", flag: "🇦🇷" },
  { name: "Brazil", slug: "brazil", flag: "🇧🇷" },
  { name: "England", slug: "england", flag: "ENG" },
  { name: "Mexico", slug: "mexico", flag: "🇲🇽" },
  { name: "Canada", slug: "canada", flag: "🇨🇦" },
];

// How long the first-run league picker waits on the sign-in reconcile before
// giving up and opening anyway. Long enough for /api/me on a normal connection,
// short enough that a new user never notices the hold.
const PICKER_AUTH_GRACE_MS = 1500;

export default function HomeContent({
  initialOffset,
  initialDate,
  worldCupHub,
  worldCupHubMode = "today",
}: {
  initialOffset?: number;
  // Absolute YYYYMMDD to open on; wins over initialOffset. The World Cup hub
  // routes use it to open on a past match day once the tournament is over.
  initialDate?: string;
  worldCupHub?: boolean;
  worldCupHubMode?: WorldCupHubMode;
}) {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  // Compute smart default date client-side only to avoid SSG hydration mismatch.
  // Reads the persisted defaultDateMode pref so "always today" / "always yesterday"
  // overrides win over the smart-time logic.
  // On the World Cup hub, `?d=YYYYMMDD` (a 2026 match day) wins over both: the
  // hub's team pills and "The final" button link to /worldcup?d=... . Read from
  // window.location here rather than useSearchParams, which would force a
  // Suspense boundary around the whole statically exported board.
  useEffect(() => {
    if (selectedDate === "") {
      const queryDate = worldCupHub
        ? parseWorldCupDateParam(new URLSearchParams(window.location.search).get("d"))
        : null;
      const startDate = queryDate ?? initialDate;
      if (startDate) {
        setSelectedDate(startDate);
        return;
      }
      const stored = loadPreferences();
      setSelectedDate(getDateString(initialOffset ?? resolveDefaultOffset(stored.defaultDateMode, stored.smartCutoffHour)));
    }
  }, [initialOffset, initialDate, worldCupHub, selectedDate]);
  // First-time notice for the Ratings tab. Was a blocking confirm dialog until
  // 2026-08-04 — see the inline-bar note on handleViewModeClick.
  const [ratingsNotice, setRatingsNotice] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showFavToast, setShowFavToast] = useState(false);
  // World Cup banner: "Add" expands into a replace-which-column picker when
  // there's no emptied slot to fill (Jacob 6/11).
  const [wcReplaceOpen, setWcReplaceOpen] = useState(false);
  const [kickoffReplaceOpen, setKickoffReplaceOpen] = useState(false);
  // Bumped by Settings' "Request a league" link to pop the footer feedback
  // modal. A counter rather than a boolean so FeedbackBox keeps owning its own
  // open/closed state — see the openSignal note there.
  const [feedbackSignal, setFeedbackSignal] = useState(0);
  // What that modal opens WITH. Settings has two entry points now — "Request a
  // league" (seeded, so the request is filable) and the quiet Feedback link in
  // the legal row (empty, because it's a general-purpose report).
  const [feedbackPrefill, setFeedbackPrefill] = useState(FEEDBACK_LEAGUE_PREFILL);
  type VideoModalState = { videoId: string; fallbackUrl: string; playbackUrl?: string | null; imageUrl?: string | null; images?: string[] | null; embedUrl?: string | null; poster?: string | null; sourceLabel?: string | null; headline?: string | null; byline?: string | null; published?: string | null; body?: string | null; siblings?: PlayOpts[] | null; sibIndex?: number | null; shareCard?: ShareCardMeta | null; alternates?: { label: string; videoId: string }[]; forceTitleMask?: boolean };
  const [videoModal, setVideoModal] = useState<VideoModalState | null>(null);
  // Undo-close for that modal. Its whole surface dismisses on click (backdrop,
  // image, headline, the area around the player), so one mis-tap while reading
  // a story or watching a highlight dumps you back to the board with no way
  // back — the news list may have re-rendered and the item can be pages away.
  // Every close therefore parks the payload for REOPEN_MS and offers a one-tap
  // Reopen. The ref mirrors the live payload so the popstate handler (Back /
  // Android back gesture) can capture what it is closing without re-subscribing
  // on every modal change.
  const REOPEN_MS = 8000;
  const videoModalRef = useRef<VideoModalState | null>(null);
  useEffect(() => { videoModalRef.current = videoModal; }, [videoModal]);
  const [reopenVideo, setReopenVideo] = useState<VideoModalState | null>(null);
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReopen = useCallback(() => {
    if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
    reopenTimerRef.current = null;
    setReopenVideo(null);
  }, []);
  const armReopen = useCallback((m: VideoModalState) => {
    if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
    setReopenVideo(m);
    reopenTimerRef.current = setTimeout(() => { reopenTimerRef.current = null; setReopenVideo(null); }, REOPEN_MS);
  }, []);
  useEffect(() => () => { if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current); }, []);
  // Spoiler-safe game-details popup, opened by tapping a score card body.
  const [detailGame, setDetailGame] = useState<Game | null>(null);
  // The same, for the EVENT tiles (races, UFC bouts, boxing, chess, poker).
  // Separate state because an event tile is not a Game; `fight` is set only
  // when one bout of a UFC card was tapped rather than the card as a whole.
  const [detailEvent, setDetailEvent] = useState<{ event: LeagueEventCard; fight?: FightBout; leagueLabel?: string } | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  // The tennis draw and the MLB playoff picture. Both open from the league
  // column's subtitle line and both gate their own contents behind a reveal —
  // see SlamBracketModal / PlayoffPictureModal.
  const [slamBracketOpen, setSlamBracketOpen] = useState(false);
  const [playoffPictureOpen, setPlayoffPictureOpen] = useState(false);
  // The recap-row "Playoffs" pill opens the playoff picture on the tab it names.
  const [playoffPictureTab, setPlayoffPictureTab] = useState<PlayoffsTab | undefined>(undefined);
  // A WC group to spotlight in the groups overlay (tapped from a game card).
  const [groupsHighlight, setGroupsHighlight] = useState<string | null>(null);
  const [showNews, setShowNews] = useState(false);
  // Same, for the News tab's spoiler warning.
  const [newsNotice, setNewsNotice] = useState(false);
  // Per-column team-name abbreviation reports (keyed by slot; null-report =
  // column left/has no names). Any abbreviated game column → namesCompact, so
  // the UFC column's fighter names shrink exactly when the team names beside
  // them do — the game columns' flip depends on the day's longest team name,
  // which no width threshold inside the UFC column could know.
  const [colAbbrev, setColAbbrev] = useState<Record<string, boolean>>({});
  const onAbbrevReport = useCallback((key: string, abbrev: boolean | null) => {
    setColAbbrev((prev) => {
      if (abbrev === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev[key] === abbrev ? prev : { ...prev, [key]: abbrev };
    });
  }, []);
  const namesCompact = Object.values(colAbbrev).some(Boolean);
  // Dialog container for the first-run league picker — see its Escape/scroll-lock/
  // focus effect. The ratings/news explainers used to need the same treatment;
  // as of 2026-08-04 they're non-modal inline bars, so they need none of it.
  const leaguePickerRef = useRef<HTMLDivElement>(null);
  // First-run league picker (shown once, only on a brand-new install — see the
  // mount effect). pickerSel is the ordered set of chosen leagues (max 3, mapped
  // to slots 1/2/3 on confirm); firstRunRef captures "no stored prefs" at mount
  // so a later savePreferences() can't retroactively hide the picker.
  const [showLeaguePicker, setShowLeaguePicker] = useState(false);
  const [pickerSel, setPickerSel] = useState<Sport[]>([]);
  const firstRunRef = useRef(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Px the scroll-to-top button is pushed up so it clears the footer instead of
  // overlapping its text once you reach the bottom of the page.
  const [scrollTopLift, setScrollTopLift] = useState(0);
  const footerRef = useRef<HTMLElement>(null);
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
  // `prefs` above starts as hardcoded defaults and is replaced from
  // localStorage in an effect, so the first paint of every reload runs against
  // a blob with no saved columns and no dismissals. Anything conditioned on a
  // stored preference therefore flashes on and off — which is exactly what the
  // kickoff banner did after being dismissed, or after the league was added
  // (Jacob 8/9). This flips true once the stored blob is in state.
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  // Latest prefs for the stable fetchData callback (its deps are []).
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  // Whether the sign-in reconcile has had its say about this device's prefs.
  // Only the first-run league picker waits on it — see the mount effect.
  const [authSettled, setAuthSettled] = useState(false);
  // A signed-in account that has already used the downloaded app does not need
  // an install prompt on the web. This is account history from /api/me, not a
  // guess based on the current browser's user agent.
  //
  // null means UNKNOWN, which is NOT the same as "no app" — /api/me takes about
  // a second and a half to answer for a signed-in account, and starting at
  // false meant the footer asserted "you don't have the app" for that whole
  // window and then took it back. The pre-paint script in layout.tsx covers the
  // gap from the cached answer; the effect below hands the class back once this
  // is no longer null. Widened from ios-only to either platform on 2026-08-24,
  // when the Play listing went public: an Android app user signed in on the web
  // was still being offered both stores.
  const [appAccountUse, setAppAccountUse] = useState<boolean | null>(null);
  // Plain "is there an account behind this session", separate from the iOS
  // history above. The footer's Play badge only offers its dismiss control to
  // signed-in users, since only they sync the prefs blob that records it.
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const loaded = migrateLegacySwitcherPreferences(loadPreferences());
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
        const fParam = params.get("f");
        const oldTeams = fParam?.includes("-") ? fParam.split(",").filter(Boolean) : null;
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
      // A shared-highlight link cold-loaded with ?demo=1 still on (sessionStorage
      // sticky, see demoMode.ts) is the same real-content leak openVideoModal/
      // openEmbedModal guard against — this reopen path sets videoModal state
      // directly, bypassing both. Same placeholder substitution here.
      if (isDemoModeActive() && (sharedVideoId || hStream || hEmbed || hImage)) {
        setVideoModal({ videoId: "", fallbackUrl: "", imageUrl: demoHighlightPoster(), headline: DEMO_HIGHLIGHT_HEADLINE, sourceLabel: "Stream" });
      } else if (sharedVideoId) {
        // A clip opened on /watch is any link someone pasted: nothing vetted
        // its title, and there is no blurred headline under the player to fall
        // back on. So the title cover is on here whatever the Settings toggle
        // says (it defaults off since 9/8). It still lifts once the title reads clean.
        const forceTitleMask = /^\/watch\/?$/.test(window.location.pathname);
        setVideoModal({ videoId: sharedVideoId, fallbackUrl: hSource, sourceLabel: hLabel, headline: hHead, poster: hPoster, forceTitleMask });
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
      const landing = p.defaultLandingView ?? "remember";
      const ratingsMode = p.defaultRatings ?? "auto";
      if (ratingsMode === "on") {
        p.showRatings = true;
      } else if (ratingsMode === "off") {
        p.showRatings = false;
      } else if (getETHour() < 12) {
        p.showRatings = false;
      }
      // Landing on Ratings is as explicit an opt-in as "Ratings on launch: on",
      // so it wins over the auto morning reset above — otherwise choosing it
      // would silently do nothing before noon ET. Resolved before setPrefs so
      // the first render already has it.
      if (landing === "ratings") p.showRatings = true;
      // ?demo=1 screenshot overrides — a capture session states exactly what it
      // wants (ratings on, a theme) via URL flags instead of clicking through
      // the UI, and skips the ratings explainer bar so the shot is clean. News
      // is handled below (it wants its bar VISIBLE, the opposite of ratings).
      if (isDemoRatingsForced()) { p.showRatings = true; p.skipExplainer = true; }
      const demoTheme = getDemoThemeOverride();
      if (demoTheme) p.theme = demoTheme;
      setPrefs(p);
      // Stored prefs are now in state. Anything that would otherwise render
      // once against the hardcoded defaults above — and then vanish a frame
      // later — must wait on this. See prefsHydrated's declaration.
      setPrefsHydrated(true);
      // Landing view: "remember" restores the last view EXCEPT across a day
      // boundary — a new calendar day (ET) since the last open drops a remembered
      // News view to Scores so the user never lands on yesterday's spoilers
      // (Jacob 6/19). Same-day reopens still restore News.
      const newDayPassed = !!p.lastOpenDay && p.lastOpenDay !== getDateString(0);
      const demoNews = isDemoNewsRequested();
      if (demoNews || landing === "news") setShowNews(true);
      else if (landing === "scores" || landing === "ratings") setShowNews(false);
      else if (p.showNews && !newDayPassed) setShowNews(true);
      // ?demo=1&view=news wants the first-time spoiler-warning bar ON SCREEN
      // for the shot, not skipped like every other first-time explainer here.
      if (demoNews) setNewsNotice(true);
      document.documentElement.setAttribute("data-theme", getResolvedTheme(p.theme));
      // Apply the headline reveal state at launch (mirrored in the effect below)
      // so reveal-on users don't see a one-frame blur flash before it runs.
      document.documentElement.classList.toggle("reveal-news-titles", !!p.revealNewsTitles);
      document.documentElement.classList.toggle("show-text-posts", !!p.showTextPosts);
      document.documentElement.classList.toggle("blur-news-media", p.revealNewsMedia !== true);
    };
    // Stars on game cards teach a brand-new user which cards are theirs. By the
    // third visit that lesson has landed and the ★ is just noise, so the app
    // turns it off itself, once, at the start of that session (Jacob 8/31).
    // Guard rails:
    //  - only when hideTeamStars is still undefined, i.e. the user has never
    //    touched the toggle. An explicit choice either way is never overridden.
    //  - counting stops at STARS_AUTO_HIDE_SESSION, so this can fire at most
    //    once: turn stars back on afterwards and they stay on.
    //  - a "session" needs a 30-minute gap, so refreshes and tab revisits
    //    inside one sitting don't burn through the count in a minute.
    // Applied to `loaded` BEFORE applyLaunchState so the very first render is
    // already starless — no frame where the stars flash and vanish.
    const sessionPatch = sessionLaunchPatch(loaded, Date.now());
    if (sessionPatch.hideTeamStars) loaded.hideTeamStars = true;
    const storedShowRatings = loaded.showRatings;
    applyLaunchState(loaded);
    // Stamp today's open so the next launch can detect a day rollover. Persist
    // lastOpenDay but NOT the morning ratings reset applyLaunchState applied (a
    // view-only reset, not a settings change) so the stored showRatings is intact.
    const todayOpen = getDateString(0);
    savePreferences({ ...loaded, showRatings: storedShowRatings, lastOpenDay: todayOpen, ...sessionPatch });
    loaded.lastOpenDay = todayOpen;
    Object.assign(loaded, sessionPatch);
    // Arm the first-run league picker for genuinely new installs. The actual
    // open waits until the in-season league list (thirdLeagueOptions) is ready,
    // in a separate effect below.
    firstRunRef.current = noStored && !loaded.leaguesOnboarded;

    // Hold the first-run picker until the sign-in reconcile below has had its
    // say. firstRunRef is armed off localStorage ALONE, so a SIGNED-IN user on a
    // fresh browser profile (or after clearing site data) saw the picker before
    // their synced prefs — which may already carry leaguesOnboarded and a chosen
    // set of columns — came back, and picking again overwrote the setup they
    // already had on another device. Capped by a grace timer so a slow or
    // hanging /api/me can never withhold onboarding from a genuinely new user:
    // whichever lands first wins, and the picker opens at most PICKER_AUTH_GRACE_MS late.
    let settled = false;
    const settleAuth = () => { if (!settled) { settled = true; setAuthSettled(true); } };
    const graceTimer = window.setTimeout(settleAuth, PICKER_AUTH_GRACE_MS);

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
        setIsSignedIn(Boolean(auth.signedIn));
        setAppAccountUse(Boolean(auth.signedIn && (auth.platforms?.ios || auth.platforms?.android)));
        if (!auth.signedIn) return;
        setRemoteSync(pushRemotePrefs);
        // A device that submitted a bracket before the account knew about it
        // hands its picks token up now, so the account's other devices can
        // adopt it without anyone opening the Picks tab here (lib/picksAccount).
        void syncPicksWithAccount();
        const remote = await fetchRemotePrefs();
        if (remote && Object.keys(remote).length > 0) {
          const merged = mergeRemotePreferences(loadPreferences(), remote);
          savePreferences(merged); // persist locally (and re-affirm to server via the hook)
          applyLaunchState(merged);
        } else {
          pushRemotePrefs(loadPreferences()); // first sign-in for this account
        }
      } catch {
        /* sync is best-effort; the app stays fully functional without it */
      } finally {
        settleAuth();
      }
    })();
    return () => window.clearTimeout(graceTimer);
  }, []);

  // The pre-paint scripts in layout.tsx hide the store badges from a cached
  // guess. React owns them from the moment it has a real answer, so drop each
  // class then — otherwise a stale nss-auth blob (signed out on another device,
  // app deleted) would keep the badges hidden with nothing left to correct it.
  // Ordering matters: by the time these run, the state they defer to has already
  // been committed, so the row is either unmounted or correctly rendered and
  // uncovering it cannot flash.
  useEffect(() => {
    if (appAccountUse === null) return;
    document.documentElement.classList.remove("hs-has-app");
  }, [appAccountUse]);

  useEffect(() => {
    if (!prefsHydrated) return;
    document.documentElement.classList.remove("hs-play-dismissed");
  }, [prefsHydrated]);

  // Cross-device sync on RESUME. The mount effect above only reconciles with the
  // server on a COLD launch, so a change made on another device — e.g. removing
  // a league column on the web — never reached an already-open app (a backgrounded
  // phone that's resumed, not relaunched) until a full restart (Jacob 7/14). Re-pull
  // the server copy whenever the tab/app becomes visible again and apply it live.
  // Signed-out users never fetch (getAuthState → signedIn:false, bail). We only
  // touch the UI when the server actually differs, and we deliberately DON'T re-run
  // the launch-only resets (morning ratings reset, landing-view) so switching back
  // to the app doesn't bounce the current view — just the synced settings/columns.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const auth = await getAuthState();
        setIsSignedIn(Boolean(auth.signedIn));
        setAppAccountUse(Boolean(auth.signedIn && (auth.platforms?.ios || auth.platforms?.android)));
        if (!auth.signedIn || !alive) return;
        const remote = await fetchRemotePrefs();
        if (!remote || !alive || Object.keys(remote).length === 0) return;
        const local = loadPreferences();
        const merged = mergeRemotePreferences(local, remote);
        if (JSON.stringify(merged) === JSON.stringify(local)) return; // no change → don't disturb
        savePreferences(merged);
        setPrefs(merged);
        document.documentElement.setAttribute("data-theme", getResolvedTheme(merged.theme));
        document.documentElement.classList.toggle("reveal-news-titles", !!merged.revealNewsTitles);
        document.documentElement.classList.toggle("show-text-posts", !!merged.showTextPosts);
        document.documentElement.classList.toggle("blur-news-media", merged.revealNewsMedia !== true);
      } catch {
        /* best-effort; ignore transient failures */
      }
    };
    const onVis = () => { void pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
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

  // Show/hide headline-only posts independently from headline blur.
  // .show-text-posts on <html> reaches every column and card.
  useEffect(() => {
    document.documentElement.classList.toggle("show-text-posts", !!prefs.showTextPosts);
  }, [prefs.showTextPosts]);

  // Media previews are visible by default; users can independently blur them
  // without changing headline or text-post visibility. The class lives on html
  // so it also reaches the feed and every news-card layout.
  useEffect(() => {
    document.documentElement.classList.toggle("blur-news-media", prefs.revealNewsMedia !== true);
  }, [prefs.revealNewsMedia]);

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
  // Exception: a YouTube clip on /watch stays on /watch (see highlightSharePath),
  // so its preview is the generic card, not the thumbnail.
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
      path: highlightSharePath(),
    });
    return abs ? abs.replace(/^https?:\/\/[^/]+/, "") : null;
  }, []);

  const openVideoModal = useCallback((videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null, alternates?: { label: string; videoId: string }[]) => {
    clearReopen();
    // See demoHighlightPoster's comment in demoMode.ts: a resolved videoId can
    // still be a real clip even off an anonymized card, because it's keyed by
    // the untouched real game.id. Swap it for the placeholder here, at the one
    // place every highlight button's tap ends up, instead of chasing each
    // button. No share URL either — a demo tap has nothing real to share.
    if (isDemoModeActive()) {
      setVideoModal({ videoId: "", fallbackUrl: "", imageUrl: demoHighlightPoster(), headline: DEMO_HIGHLIGHT_HEADLINE, sourceLabel: "Stream" });
      return;
    }
    setVideoModal({ videoId, fallbackUrl, shareCard, alternates });
    const href = modalShareHref({ videoId, fallbackUrl, shareCard });
    if (href) window.history.pushState({ videoModal: true }, "", href);
  }, [modalShareHref, clearReopen]);

  // Game-card click → play a non-YouTube embed (NHL recaps via Brightcove)
  // inside the same modal. Pushes the shareable deep-link (?he=…&c=…) so Back /
  // Esc dismiss it AND copying the URL bar matches Copy link (the matchup card).
  const openEmbedModal = useCallback((embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => {
    clearReopen();
    // Same demo substitution as openVideoModal above — an NHL/MLB Brightcove
    // recap is exactly as real (and exactly as keyed off the untouched
    // game.id) as a YouTube one.
    if (isDemoModeActive()) {
      setVideoModal({ videoId: "", fallbackUrl: "", imageUrl: demoHighlightPoster(), headline: DEMO_HIGHLIGHT_HEADLINE, sourceLabel: "Stream" });
      return;
    }
    setVideoModal({ videoId: "", fallbackUrl, embedUrl, playbackUrl: playbackUrl || null, poster: poster || null, sourceLabel, shareCard });
    const href = modalShareHref({ embedUrl, fallbackUrl, playbackUrl: playbackUrl || null, sourceLabel, shareCard });
    window.history.pushState({ videoModal: true }, "", href ?? window.location.href);
  }, [modalShareHref, clearReopen]);

  // News-card click → open the in-app modal. The shared payload covers YouTube,
  // HLS, embeds, images, and headline-only text posts.
  // PlayOpts → modal-state shape. Shared by the click handler and prev/next
  // paging so both produce the same modal object (incl. the sibling list).
  const optsToModal = useCallback((opts: PlayOpts) => ({
    videoId: opts.videoId || "",
    playbackUrl: opts.playbackUrl || null,
    embedUrl: opts.embedUrl || null,
    imageUrl: opts.imageUrl || null,
    images: opts.images || null,
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
    clearReopen();
    // News posts embed real third-party photos/clips (Reddit, ESPN) that the
    // board-side anonymizer never touches — same substitution as the two
    // highlight modals above, so opening a story from the News tab under
    // ?demo=1 can't put a real thumbnail or video on screen either.
    if (isDemoModeActive()) {
      setVideoModal({ videoId: "", fallbackUrl: "", imageUrl: demoHighlightPoster(), headline: DEMO_HIGHLIGHT_HEADLINE, sourceLabel: "Stream" });
      return;
    }
    const m = optsToModal(opts);
    setVideoModal(m);
    // Sync the address bar to the share link for EVERY news item (pics, redd.it
    // videos, NHL embeds — not just YouTube), so copying the URL bar previews the
    // pic/video just like Copy link. Back/Esc still dismiss (?v-less links close
    // via the popstate handler below, which fires on any non-?v entry).
    const href = modalShareHref(m);
    if (href) window.history.pushState({ videoModal: true }, "", href);
  }, [optsToModal, modalShareHref, clearReopen]);
  // Page to the previous/next post in the same news list without closing the
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

  // Wipe the highlight deep-link params (?v / ?h* / ?c) out of the address bar,
  // leaving anything else on the URL alone. Used on every dismiss that does NOT
  // rewind history — a COLD-LOADED share link has no videoModal entry to pop,
  // so before this the params survived the close and any refresh (or a logo tap,
  // which only toggles the view) reopened the very item you just dismissed.
  const stripHighlightParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    for (const k of ["v", "hs", "he", "hi", "hp", "hu", "hl", "ht", "c"]) {
      if (params.has(k)) { params.delete(k); changed = true; }
    }
    if (!changed) return;
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, []);

  // Reopen exactly what was just closed, re-pushing its share URL so Back / Esc
  // dismiss it again the same way the original open did.
  const reopenVideoModal = useCallback(() => {
    const m = reopenVideo;
    if (!m) return;
    clearReopen();
    setVideoModal(m);
    if (typeof window !== "undefined") {
      const href = modalShareHref(m);
      // Skip the push when the address bar is already on this item — closing a
      // COLD-LOADED share link never rewinds history (there's no videoModal
      // entry to pop), so re-pushing the identical URL would just stack a
      // duplicate entry that Back can't do anything useful with.
      const here = window.location.pathname + window.location.search;
      if (href && href !== here) window.history.pushState({ videoModal: true }, "", href);
    }
  }, [reopenVideo, clearReopen, modalShareHref]);

  // `reason` comes from VideoModal: its ✕ buttons say "explicit", everything
  // else (backdrop, bubbling content tap, Esc) is "accidental" and gets the
  // undo pill. A deliberate ✕ never does — the pill would just be noise.
  const closeVideoModal = useCallback((reason: "explicit" | "accidental" = "accidental") => {
    const closing = videoModalRef.current;
    if (closing && reason !== "explicit") armReopen(closing);
    setVideoModal(null);
    if (typeof window === "undefined") return;
    if (window.history.state?.videoModal) window.history.back();
    else stripHighlightParams();
  }, [armReopen, stripHighlightParams]);

  // Sync modal with browser back/forward — close if ?v disappears from URL
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("v")) {
        // Back / the Android back gesture is the other accidental dismiss, so it
        // arms the same undo. closeVideoModal's own history.back() lands here
        // too, by which point the ref is already null — no double-arm.
        const closing = videoModalRef.current;
        if (closing) armReopen(closing);
        setVideoModal(null);
        // Back can land ON the cold-load entry, whose URL still carries the
        // h*-params — the same stuck-refresh trap, so clear them here too.
        stripHighlightParams();
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [armReopen, stripHighlightParams]);

  // Safety net so the skeleton can never be permanent. The scoreboard +
  // enrichment fetches in lib/espn.ts are each individually bounded now, but
  // if a future fetch is ever added without a timeout, force the error/retry
  // state after 40s (above the ~31s worst-case real load) rather than hang.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so out-of-order responses can't repaint the board.
  // fetchData has five concurrent callers (the date effect, the prefs effect,
  // the 10s live-poll, pull-to-refresh, and the retry button); fetchAllLeagues
  // latency varies per day/endpoint, so a slower earlier pull could resolve
  // AFTER a newer one and clobber it — e.g. the live-poll for today lands after
  // the user has already navigated to yesterday, showing today's games under a
  // "Yesterday" nav. Each call claims the next id and only applies its result
  // if it's still the latest.
  const reqSeqRef = useRef(0);
  const fetchData = useCallback(async (
    date: string,
    thirdLeague?: Sport | "empty",
    slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty"; fourth?: Sport | "empty"; fifth?: Sport | "empty" },
    silent = false,
  ) => {
    const myReq = ++reqSeqRef.current;
    // silent=true skips the global skeleton — used when only one slot changed
    // (header dropdown or settings panel). Old data stays visible until the
    // new pull resolves, which prevents the "all 3 columns flash gray" effect.
    if (!silent) setLoading(true);
    setError(false);
    // Watchdog lifecycle across fetchData's five concurrent callers, all sharing
    // one watchdogRef slot. Capture THIS call's timer locally so the finally can
    // tell whether the shared ref still points at our timer or a newer call's.
    // Only a non-silent call owns a watchdog: clear the previous one and install
    // ours here, guarded by !silent so a silent poll can't clear a visible load's
    // watchdog and then install no replacement (that left the skeleton with no
    // safety net).
    let myWatchdog: ReturnType<typeof setTimeout> | null = null;
    if (!silent) {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      myWatchdog = setTimeout(() => {
        watchdogRef.current = null;
        setLoading(false);
        setError(true);
      }, 40_000);
      watchdogRef.current = myWatchdog;
    }
    try {
      // Slot count reads the live viewport so the initial desktop load fetches
      // all 5 leagues in one pass (isWide state hasn't flipped yet on mount).
      let [data] = await Promise.all([
        fetchAllLeagues(
          date, thirdLeague, slotOverrides, isWideViewport() ? 5 : 3,
          topEventsOptions(prefsRef.current),
          bestYesterdayOptions(prefsRef.current, date, isWideViewport() ? 5 : 3),
          prefsRef.current.hiddenLeagues,
        ),
        loadBakedHighlights(),
        // Recaps too, so the "Best of day" / "Week N" pill is in the board's
        // first paint. Without this the pill's fetch only started once the
        // columns had rendered — one extra round trip after every card was
        // already up, and the sibling columns' first cards jumped down when
        // the row got reserved (Jacob 9/26). The loader never rejects; the
        // race caps what a stalled R2 read can cost the board — past it the
        // pill falls back to landing when the file does, as before.
        Promise.race([loadBakedRecaps(), new Promise<void>((r) => setTimeout(r, 1500))]),
      ]);
      // A newer fetch started while we awaited — discard this now-stale result
      // rather than paint the wrong day's board over the current one.
      if (myReq !== reqSeqRef.current) return;
      if (isDemoModeActive()) data = applyDemoMode(data);
      if (isNoHitAlertDemoActive()) data = applyNoHitAlertDemo(data);
      setLeagues(data);
      // Real data won — clear any error the watchdog may have raised so a
      // slow-but-successful load still shows the board instead of the retry UI.
      setError(false);
    } catch {
      // Ignore a superseded request's failure so it can't flip the current,
      // successfully-loaded board into the retry state.
      if (myReq !== reqSeqRef.current) return;
      setLeagues([]);
      setError(true);
    } finally {
      // Clear the shared watchdog only if it's still OURS. A newer non-silent
      // fetch may have replaced it while we awaited; cancelling that call's timer
      // (the old bug) would defeat the very safety net it just installed, so an
      // earlier call resolving must leave the latest call's watchdog running.
      if (myWatchdog && watchdogRef.current === myWatchdog) { clearTimeout(myWatchdog); watchdogRef.current = null; }
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
  // fetches (or drops) the extra two leagues. hiddenKey is one too: turning a
  // league off in Settings moves its column to the next league at once.
  const hiddenKey = (prefs.hiddenLeagues ?? []).join(",");
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
  }, [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague, isWide, hiddenKey]);

  // The Top events column is the one column whose CONTENTS depend on prefs
  // other than its slot — the ranking pool (auto/manual), the count and the
  // starred teams. Re-pull silently when any of those change while a Top
  // events column is on the board; every other column is unaffected.
  useEffect(() => {
    if (!mountedRef.current || !selectedDate) return;
    const slots = [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague];
    if (!TOP_EVENTS_ENABLED || !slots.includes("top")) return;
    fetchData(selectedDate, prefs.thirdLeague, {
      first: prefs.firstLeague,
      second: prefs.secondLeague,
      third: prefs.thirdLeague,
      fourth: prefs.fourthLeague,
      fifth: prefs.fifthLeague,
    }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.topEventsMode, prefs.topEventsLeagues, prefs.topEventsCount, prefs.favoriteTeams]);

  // Same for Best of yesterday: its pool is the user's leagues, so starring or
  // opting into one re-pulls the column while it is showing. (Hiding one
  // re-pulls the whole board — see hiddenKey above.)
  const bestOnBoard = leagues.some((l) => l.sport === "best");
  useEffect(() => {
    if (!mountedRef.current || !selectedDate || !bestOnBoard) return;
    fetchData(selectedDate, prefs.thirdLeague, {
      first: prefs.firstLeague,
      second: prefs.secondLeague,
      third: prefs.thirdLeague,
      fourth: prefs.fourthLeague,
      fifth: prefs.fifthLeague,
    }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.favoriteLeagues, prefs.shownLeagues]);

  // Live-clock polling: while any game on the board is in-progress, silently
  // refetch every 10s so the Q4/period and clock keep advancing (matches
  // Google's sports-card behavior — clock jumps every poll, not every second).
  // Pauses when the tab is hidden so background tabs don't burn ESPN calls.
  // Golf and F1/UFC columns carry no `games` — their live state lives on
  // `golfTournament`/`eventCard` — so they must be checked too, or a Sunday
  // final round (or a live race/fight card) that's the only live thing on the
  // board would never start the poll and freeze at its load-time state. Golf
  // gates on `roundStatus`, not the tournament-level `state` (which stays "in"
  // for the whole multi-day event), so we poll only while players are actually
  // on course — the same "live now" signal isGolfLive uses — not all night
  // between rounds.
  const hasLiveGames = leagues.some(l =>
    l.games.some(g => g.state === "in") ||
    l.golfTournament?.roundStatus === "in" ||
    l.eventCard?.state === "in"
  );
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

  const updatePrefs = useCallback((update: Partial<Preferences>) => {
    const next = { ...prefs, ...update };
    setPrefs(next);
    savePreferences(next);
  }, [prefs]);

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
      // The tab always takes effect immediately. Until 2026-08-04 the first
      // click on Ratings / News opened a blocking confirm dialog instead, so a
      // brand-new visitor hit three modals in a row (league picker, then these
      // two) before ever seeing the product work — the drop-off cost of that
      // was the reason for the change, ahead of the Product Hunt launch. The
      // explanation still shows, as a dismissible bar above the board, and is
      // still first-time-only: skipExplainer/skipNewsExplainer are set the
      // moment the notice appears, so it never fires twice.
      const firstTime = !prefs.showRatings && !prefs.skipExplainer;
      updatePrefs({ showNews: false, showRatings: true, skipExplainer: true });
      if (firstTime) setRatingsNotice(true);
      return;
    }
    // mode === "news"
    setShowNews(true);
    updatePrefs({ showNews: true, skipNewsExplainer: true });
    if (!prefs.skipNewsExplainer) setNewsNotice(true);
  };

  const setNewsThirdLeague = (sport: Sport | undefined) => {
    updatePrefs({
      newsThirdLeague: sport,
      newsGenericHidden: false,
      // Keep a one-column Focus view pointed at the replacement column.
      newsFocusLeague: prefs.newsFocusLeague ? (sport ?? "espn") : undefined,
    });
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
    // ?. guards the non-secure-context case where navigator.clipboard is
    // undefined: reading .writeText off it throws synchronously, before any
    // promise exists, so the trailing .catch can't swallow it — optional
    // chaining short-circuits the whole chain to undefined instead. The .catch
    // still swallows a rejected writeText (document not focused, permission
    // denied) so it can't surface as an unhandled promise rejection — which the
    // console flags and @sentry/nextjs captures as noise. Copy is a throwaway
    // affordance (the link stays visible), matching VideoModal's copyLink.
    navigator.clipboard?.writeText(buildShareUrl()).then(() => {
      setShowShareCopied(true);
      setTimeout(() => setShowShareCopied(false), 2000);
    }).catch(() => {});
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
    // See shareFavorites: ?. guards the undefined-clipboard throw and .catch
    // keeps a failed write from becoming an unhandled rejection / Sentry error.
    // Copy is best-effort here too.
    navigator.clipboard?.writeText(buildShareUrl()).then(() => {
      setFavToastCopied(true);
      setTimeout(() => {
        dismissFavToast();
      }, 1200);
    }).catch(() => {});
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
  // After the 2026 final the hub stops pointing at today's board (which has no
  // World Cup column) and sends readers to the matches themselves: the final,
  // or a team's last match, via /worldcup?d=YYYYMMDD. Keyed off today's date,
  // so before and during the tournament the copy and links below are unchanged.
  const worldCupEnded = worldCup2026Ended();
  const worldCupHubCopy = useMemo(() => {
    if (worldCupEnded) {
      if (worldCupHubMode === "tomorrow") {
        return {
          title: "2026 World Cup schedule, spoiler-free",
          body:
            "The 2026 World Cup ended July 19. This page opens on the final; step back a day at a time for every match without seeing a score.",
          note: "Free · no tracking cookies · works in any browser or the iPhone and Android apps.",
        };
      }
      if (worldCupHubMode === "highlights") {
        return {
          title: "World Cup highlights, spoiler-free",
          body:
            "Catch up on the 2026 World Cup without result thumbnails, scorelines or winner headlines. Start from the final and step back a day at a time; every board keeps the result hidden.",
          note: "Every match, June 11 to July 19, with no score printed.",
        };
      }
      return {
        title: "2026 World Cup, spoiler-free",
        body:
          "The tournament ran June 11 to July 19 across the US, Canada and Mexico. Every match is still here with no score printed anywhere: open the final, or jump to a team's last match, and the optional competitiveness rating tells you which games were instant classics without naming who won.",
        note: "Free · no tracking cookies · also on the App Store and Google Play.",
      };
    }
    if (worldCupHubMode === "tomorrow") {
      return {
        title: "Tomorrow's World Cup, spoiler-free",
        body:
          "Plan the next World Cup match day without seeing scores or headlines. Match times, teams and watch links stay safe, and ratings appear only after games finish.",
        note: "Free · no tracking cookies · works in any browser or the iPhone and Android apps.",
      };
    }
    if (worldCupHubMode === "highlights") {
      return {
        title: "World Cup highlights, spoiler-free",
        body:
          "Catch up on completed World Cup matches without result thumbnails, scorelines or winner headlines. HideScore surfaces official highlights after games finish, and the board they sit on never prints the result at all.",
        note: "Start with yesterday's slate, then jump to today or tomorrow.",
      };
    }
    return {
      title: "2026 World Cup, spoiler-free",
      body:
        "104 matches, June 11 - July 19, across the US, Canada and Mexico - most kicking off at 1, 4 and 7 PM ET on weekdays. Watch every match on your own schedule: no score is printed anywhere, and the optional competitiveness rating tells you which games were instant classics without naming who won.",
      note: "Free · no tracking cookies · also on the App Store and Google Play.",
    };
  }, [worldCupHubMode, worldCupEnded]);

  // Whether the World Cup is in season for the viewed date — gates the
  // "What matters today" card so it doesn't fetch standings year-round.
  const worldCupActive = useMemo(() => {
    if (!selectedDate) return false;
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    const fifa = ALL_LEAGUES.find((l) => l.sport === "fifa");
    return fifa ? isLeagueActive(fifa, viewDate) : false;
  }, [selectedDate]);

  // The one league whose season is about to start (or just did) on the viewed
  // date, if any — drives the kickoff banner below the date nav.
  // Computed from TODAY, not the viewed date (Jacob 9/4). The banner says when
  // a season starts relative to now; driven off the date nav it announced a
  // "kicks off Wednesday, Aug 21" on a 2024 page — one account's dismissal
  // list carries an `epl-2024-08-21` key from exactly that. selectedDate stays
  // the dependency only so it re-evaluates whenever the user moves around.
  const kickoffInfo = useMemo(() => {
    if (!selectedDate) return { kickoff: null, todayYmd: "" };
    const todayYmd = getDateString(0);
    const today = new Date(`${todayYmd.slice(0, 4)}-${todayYmd.slice(4, 6)}-${todayYmd.slice(6, 8)}T12:00:00`);
    // A league unticked in Settings never takes the banner (two of the four
    // accounts that dismissed the UCL banner had hidden UCL first); the next
    // opener does.
    return { kickoff: getLeagueKickoff(today, prefs.hiddenLeagues ?? []), todayYmd };
  }, [selectedDate, prefs.hiddenLeagues]);
  const kickoff = kickoffInfo.kickoff;
  const kickoffTodayYmd = kickoffInfo.todayYmd;

  // Compute which leagues are available for manual selection. Most seasonal
  // leagues disappear outside their season; NBA deliberately remains as a
  // muted "offseason" option so its news + trade board stay reachable early.
  // This does not affect the automatic columns, which still use active leagues.
  //
  // A league inside its KICKOFF_SOON_DAYS window is offered too, labelled with
  // its start date ("Prem · starts Aug 21"). People ask for a column before the
  // season opens and previously had no way to add it — and the column is not
  // blank, since the next-game-day lookahead shows the opening fixtures and the
  // league's news feed bakes year-round. Still manual only: getActiveLeagueCandidates
  // (the auto-picker) is untouched, so nothing reshuffles on its own.
  const thirdLeagueOptions = useMemo(() => {
    if (!selectedDate) return [];
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    // Get active leagues plus the NBA exception, deduplicated by sport.
    //
    // ⚠️ An IN-SEASON config outranks an upcoming one for the same sport, and
    // that is not a tidy-up — first-config-wins produced a row that named the
    // wrong league. A sport can hold several seasonal configs, and NFL holds two
    // whose windows nearly touch: "NFL" (09-07 → 02-16) and "NFL Preseason"
    // (07-21 → 09-03). "NFL" sorts first in ALL_LEAGUES, so from the moment the
    // regular season became UPCOMING (~Aug 22) through Sep 3 the switcher row
    // read "NFL · 9/9" — telling you the league had not started — while the
    // column that click opened was the LIVE preseason one, correctly headed
    // "NFL Preseason" and full of games being played that week. Two names for
    // one click, and the wrong one was the one you chose from.
    // resolveSlot (lib/espn.ts) already prefers the active config; this is the
    // options list finally agreeing with it.
    // Map, not an array + Set: re-setting an existing key keeps its original
    // insertion position, so upgrading a row's label cannot reorder the
    // switcher out from under someone mid-scroll.
    const options = new Map<Sport, { sport: Sport; label: string; offseason?: boolean; upcomingLabel?: string; defaultInSwitcher: boolean }>();
    const satisfiedByActive = new Set<Sport>();
    // The cross-league pill leads every switcher: never offseason, never
    // auto-picked, always addable (Jacob 9/4: "top events special pill").
    // Switched off 9/5 — see TOP_EVENTS_ENABLED.
    if (TOP_EVENTS_ENABLED) options.set("top", { sport: "top", label: "Top events", defaultInSwitcher: true });
    for (const league of ALL_LEAGUES) {
      if (league.hidden) continue; // none currently hidden (UFC back 7/17, F1 back 7/18)
      const active = isLeagueActive(league, viewDate);
      const upcoming = !active && isLeagueUpcoming(league, viewDate);
      if (!active && !upcoming && league.sport !== "nba") continue;
      // Keep the row we have unless this config is active and the incumbent
      // was not — i.e. only an in-season config may displace an existing row.
      if (options.has(league.sport) && (satisfiedByActive.has(league.sport) || !active)) continue;
      if (active) satisfiedByActive.add(league.sport);
      options.set(league.sport, {
        sport: league.sport,
        label: league.label,
        offseason: !active && !upcoming,
        // Bare "8/21", not "starts Aug 21": inside a switcher row that already
        // reads "EPL · …" the words were the part that wrapped it onto a
        // second line, and a date tail on an unstarted league can only mean
        // its opener. The row's tooltip still spells it out (Jacob 8/9).
        upcomingLabel: upcoming ? formatKickoffShort(league.kickoffDate ?? league.startDate, viewDate) : undefined,
        defaultInSwitcher: !league.excludeFromAuto,
      });
    }
    // Best of yesterday: a today-board column (resolveSlot turns it into the
    // Auto league on any other date), so it is only offered there. Last in
    // the map so the + button still adds a real league first; the column
    // switcher floats it to the top itself.
    if (BEST_YESTERDAY_ENABLED && selectedDate === getDateString(0)) {
      options.set("best", { sport: "best", label: BEST_YESTERDAY_LABEL, defaultInSwitcher: true });
    }
    return [...options.values()];
  }, [selectedDate]);

  // First-run picker order (Jacob 8/9). ALL_LEAGUES is ordered for the *season
  // calendar*, which put "Prem · starts Aug 21" and three more soccer leagues
  // above WNBA and the NFL — the opposite of what a US first-timer scans for.
  // This is a deliberate popularity ranking for the signup screen ONLY: the
  // column switcher and Settings keep the calendar order they've always had.
  // Soccer is grouped as one block at the very bottom rather than interleaved,
  // so the domestic leagues read as a set you scroll past or into.
  const PICKER_RANK: Sport[] = [
    // The cross-league pill first: the one option that is never offseason.
    "top",
    // MLB leads: it is the league actually playing games today, and a picker
    // whose first pill is an offseason/preseason league reads as stale (Jacob
    // 8/9). NBA stays ahead of WNBA — his call, even in the NBA offseason.
    "mlb", "nfl", "nba", "wnba", "nhl", "ncaaf", "ncaam", "ncaaw", "ncaah", "cfl", "ncaawh", "ncaavb", "ufl", "ncaabase", "ncaasoft",
    "ufc", "boxing", "golf", "tennis", "f1", "nascar", "indycar", "cricket",
    "chess", "poker", "esports",
    // ── soccer block, bottom ──
    "epl", "ucl", "uel", "uecl", "laliga", "seriea", "bundesliga", "ligue1",
    "mls", "ligamx", "nwsl", "efl", "libertadores", "saudi",
    "facup", "copadelrey", "dfbpokal",
    "fifa", "euro", "afcon",
  ];
  const pickerOptions = useMemo(() => {
    const rank = (s: Sport) => {
      const i = PICKER_RANK.indexOf(s);
      // A league missing from the ranking sorts just before the soccer block
      // rather than vanishing or jumping to the front — adding a new league to
      // ALL_LEAGUES must never silently reorder the top of this screen.
      return i === -1 ? PICKER_RANK.indexOf("epl") - 0.5 : i;
    };
    // The first-run picker chooses leagues for every day's board; Best of
    // yesterday is a today-only column that puts itself on the board anyway.
    return thirdLeagueOptions
      .filter((o) => o.sport !== "best")
      .sort((a, b) => rank(a.sport) - rank(b.sport));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- PICKER_RANK is a literal constant
  }, [thirdLeagueOptions]);

  // Display-only anonymization for the ?demo=1&picker=1 sheet — see
  // anonymizeLeaguePickerOptions in demoMode.ts. null outside that one capture
  // state, so every other session renders the real catalog exactly as before.
  const demoPickerLabels = useMemo(
    () => (isDemoModeActive() && isDemoPickerRequested() ? anonymizeLeaguePickerOptions(pickerOptions) : null),
    [pickerOptions],
  );

  // Settings is the durable league catalog, so it must not hide a saved pick
  // merely because that league is between seasons. A sport can have several
  // seasonal configs (golf majors, tennis Slams); mark it in-season when ANY
  // config for that sport is active on the viewed date.
  //
  // Judged against TODAY, not the viewed date (Jacob 9/4, "let's be precise"):
  // the catalog is a durable "what is on right now", and with the default
  // landing date of yesterday it told a Sep 4 visitor the NFL was in season
  // (the preseason config was active on the 3rd) and would have told a Sep 5
  // visitor it was offseason, four days before kickoff. A league inside its
  // pre-season window is "starts 9/8", not "offseason" — same as the switcher.
  const settingsLeagueOptions = useMemo(() => {
    if (!selectedDate) return [];
    const todayYmd = getDateString(0);
    const today = new Date(`${todayYmd.slice(0, 4)}-${todayYmd.slice(4, 6)}-${todayYmd.slice(6, 8)}T12:00:00`);
    const options = new Map<Sport, { sport: Sport; label: string; offseason?: boolean; upcomingLabel?: string; defaultInSwitcher: boolean }>();
    for (const league of ALL_LEAGUES) {
      if (league.hidden) continue;
      const active = isLeagueActive(league, today);
      const upcoming = !active && isLeagueUpcoming(league, today);
      const upcomingLabel = upcoming ? formatKickoffShort(league.kickoffDate ?? league.startDate, today) : undefined;
      const existing = options.get(league.sport);
      if (!existing) {
        options.set(league.sport, {
          sport: league.sport,
          label: league.label,
          offseason: !active && !upcoming,
          upcomingLabel,
          defaultInSwitcher: !league.excludeFromAuto,
        });
      } else if (active && (existing.offseason || existing.upcomingLabel)) {
        options.set(league.sport, {
          sport: league.sport,
          label: league.label,
          defaultInSwitcher: !league.excludeFromAuto,
        });
      } else if (upcoming && existing.offseason) {
        existing.offseason = false;
        existing.upcomingLabel = upcomingLabel;
      } else if (!active && existing.offseason && !league.excludeFromAuto) {
        existing.defaultInSwitcher = true;
      }
    }
    return [...options.values()];
  }, [selectedDate]);

  // One Set per real change, so the cards don't see a new object every render.
  const recordLeagues = useMemo(
    () => upcomingRecordLeagues({ upcomingRecordLeagues: prefs.upcomingRecordLeagues, hideUpcomingRecords: prefs.hideUpcomingRecords }),
    [prefs.upcomingRecordLeagues, prefs.hideUpcomingRecords],
  );

  const teamLeagueOptions = useMemo(() => {
    const seen = new Set<Sport>();
    return ALL_LEAGUES.flatMap((league) => {
      if (league.hidden || seen.has(league.sport)) return [];
      seen.add(league.sport);
      return [{ sport: league.sport, label: league.label }];
    });
  }, []);

  // Open the first-run league picker once we know which leagues are in season
  // (thirdLeagueOptions populates after selectedDate resolves). firstRunRef was
  // armed at mount for new installs only; clearing it here opens exactly once.
  useEffect(() => {
    if (firstRunRef.current && authSettled && !prefs.leaguesOnboarded && thirdLeagueOptions.length > 0) {
      firstRunRef.current = false;
      // ?demo=1 without &picker=1 must never flash the real, un-anonymized
      // league picker (MLB/NFL/NBA… with real logos — the original 4.1(a)
      // rejection) in front of a screenshot session. Skip straight to the
      // same auto-picked board "Use defaults" produces. ?demo=1&picker=1 is
      // the one capture state that wants the picker sheet itself on screen
      // (applyDemoMode has already anonymized its league list — see
      // demoMode.ts).
      if (isDemoModeActive() && !isDemoPickerRequested()) {
        updatePrefs({ leaguesOnboarded: true });
        return;
      }
      setShowLeaguePicker(true);
    }
  }, [thirdLeagueOptions, prefs.leaguesOnboarded, authSettled, updatePrefs]);

  // How many leagues the picker lets you take = how many columns this viewport
  // will actually render (3 phone / 5 wide). It said "up to 3" on a desktop that
  // has been showing five columns all along (Jacob 8/9).
  const pickerMax = slotCount;
  const togglePick = (sport: Sport) => {
    setPickerSel((sel) =>
      sel.includes(sport)
        ? sel.filter((s) => s !== sport)
        : sel.length >= pickerMax
          ? sel
          : [...sel, sport],
    );
  };

  // Confirm the picker: map the chosen leagues (in tap order) onto the three
  // column slots — reusing the SAME slot prefs Settings writes (firstLeague /
  // secondLeague / thirdLeague), so no new league logic is introduced. An
  // unfilled slot becomes "empty" so only the chosen leagues show; choosing
  // none falls through to the in-season auto-picker, identical to "Use defaults".
  // Slots 4-5 (the wide-viewport 5-column board) must ALSO be pinned "empty"
  // once the user has made any pick — otherwise those unset slots fall through
  // to the auto-picker on wide screens, so "I chose 2 leagues" rendered 4
  // columns (the 2 chosen + 2 auto-filled). The picker only offers 3, so the
  // extra columns should stay hidden until the user adds them in Settings.
  const confirmLeaguePicker = () => {
    const picks = pickerSel.slice(0, pickerMax);
    const chose = picks.length > 0;
    updatePrefs({
      firstLeague: picks[0] ?? undefined,
      secondLeague: picks[1] ?? (chose ? "empty" : undefined),
      thirdLeague: picks[2] ?? (chose ? "empty" : undefined),
      // Slots 4-5 now take real picks on a wide viewport instead of always
      // being pinned "empty" — that pin was what capped the picker at 3.
      fourthLeague: picks[3] ?? (chose ? "empty" : undefined),
      fifthLeague: picks[4] ?? (chose ? "empty" : undefined),
      leaguesOnboarded: true,
    });
    setShowLeaguePicker(false);
  };

  const skipLeaguePicker = useCallback(() => {
    updatePrefs({ leaguesOnboarded: true });
    setShowLeaguePicker(false);
  }, [updatePrefs]);

  // Escape closes the first-run league picker too — same as tapping its
  // backdrop (both fall back to default leagues). Brings it in line with the
  // ratings/news explainers and every other modal in the app, which all
  // dismiss on Escape. This effect also locks body scroll and seats focus into
  // the dialog while it's open — the same treatment the ratings/news explainers
  // (and every other modal) already get, which this first-run picker was the
  // last overlay still missing (it had role="dialog"/aria-modal + Escape but
  // never pinned the feed behind it or moved focus off the trigger).
  useEffect(() => {
    if (!showLeaguePicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { skipLeaguePicker(); return; }
      // Trap Tab within the dialog (WCAG 2.4.3) — same wrap-at-first/last pattern
      // as the ratings/news explainers and GameDetailModal. Without it a keyboard
      // user could Tab off the last league pill into the inert feed behind the
      // overlay. Focusables queried live so the disabled (3-picked) pills and any
      // hidden control are excluded (offsetParent drops display:none).
      if (e.key !== "Tab") return;
      const dialog = leaguePickerRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll (position:fixed + negative top pins iOS WebKit too, where
    // plain overflow:hidden leaks the feed behind the overlay); restore returns
    // you exactly where you were.
    const scrollY = window.scrollY;
    const body = document.body;
    const prevBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    // Focus management (WCAG 2.4.3): move focus into the dialog (the tabIndex=-1
    // container, so no ring shows for mouse users) and restore it to the opener
    // on close.
    const opener = document.activeElement as HTMLElement | null;
    leaguePickerRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.overflow = prevBody.overflow;
      body.style.position = prevBody.position;
      body.style.top = prevBody.top;
      body.style.width = prevBody.width;
      window.scrollTo(0, scrollY);
      opener?.focus?.();
    };
  }, [showLeaguePicker, skipLeaguePicker]);

  // Homepage switcher options = core auto-rotation leagues by default, plus
  // opt-in leagues the user explicitly enabled, minus explicit hides. This
  // keeps a large in-season expansion slate from overwhelming the switcher.
  // Label lookups and Settings' slot pickers keep the full options list so any
  // league can still be pinned or enabled deliberately.
  const switcherOptions = useMemo(
    () => thirdLeagueOptions.filter((o) => {
      if (prefs.hiddenLeagues?.includes(o.sport)) return false;
      if (prefs.shownLeagues?.includes(o.sport)) return true;
      const pinned = [
        prefs.firstLeague,
        prefs.secondLeague,
        prefs.thirdLeague,
        prefs.fourthLeague,
        prefs.fifthLeague,
      ].includes(o.sport);
      return o.defaultInSwitcher || pinned || prefs.favoriteLeagues.includes(o.sport);
    }),
    [thirdLeagueOptions, prefs],
  );
  // The news board has no cross-league feed, so its switchers skip the pills.
  const newsSwitcherOptions = useMemo(() => switcherOptions.filter((o) => o.sport !== "top" && o.sport !== "best"), [switcherOptions]);

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

  // What "Auto" actually resolves to, per slot — the same assignment
  // fetchAllLeagues runs before per-slot overrides are applied. The switcher
  // marks this option "· default" so "Auto" isn't an opaque choice: you can
  // see which league the column falls back to (Jacob 8/9).
  const autoSlotSports = useMemo(() => {
    if (!selectedDate) return [] as Sport[];
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    return pickAndAssignLeagues(viewDate, slotCount, prefs.hiddenLeagues).map((l) => l.sport);
  }, [selectedDate, slotCount, prefs.hiddenLeagues]);

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
      // Unset slots lock to the league actually on screen at their position
      // (an Auto Best of yesterday column stays Auto) — see lockSlotsToBoard.
      resolved = lockSlotsToBoard(SLOT_INDICES.map((i) => selectedSlotLeagues[i]), sortedLeagues.map((l) => l.sport));
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

  // Drag-to-swap: dropping column A onto column B trades their positions. A
  // drag of two other columns leaves an Auto Best of yesterday column on Auto
  // — see swapBoardSlots.
  const reorderSlots = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const baseline = swapBoardSlots(
      SLOT_INDICES.map((i) => selectedSlotLeagues[i]),
      sortedLeagues.map((l) => l.sport),
      fromIdx,
      toIdx,
    );
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

  // Source cards use the current deterministic smart cascade. Ignore stale
  // newsSourceOrder values from the removed drag-reorder UI: otherwise an old
  // local preference can silently bury a newly added source forever.
  const ALL_NEWS_SOURCE_TYPES: NewsSourceType[] = ["topvideos", "reddit", "espn", "homepage"];
  const legacyNewsTypeFilter = prefs.newsTypeFilter ?? "reddit";
  const savedNewsTypeFilters = prefs.newsTypeFilters?.filter(
    (value): value is NewsSourceType => ALL_NEWS_SOURCE_TYPES.includes(value as NewsSourceType),
  );
  const newsTypeFilters: NewsSourceType[] = savedNewsTypeFilters?.length
    ? savedNewsTypeFilters
    : legacyNewsTypeFilter === "all"
      ? ALL_NEWS_SOURCE_TYPES
      : [legacyNewsTypeFilter];
  const setNewsTypeFilters = (types: NewsSourceType[]) => updatePrefs({
    newsTypeFilters: types,
    // Older app versions cannot express a multi-select. "all" is the safest
    // fallback because it never silently hides a source the user enabled here.
    newsTypeFilter: types.length === 1 ? types[0] : "all",
  });
  const toggleNewsTypeFilter = (type: NewsSourceType) => {
    const next = newsTypeFilters.includes(type)
      ? newsTypeFilters.filter((value) => value !== type)
      : [...newsTypeFilters, type];
    if (next.length > 0) setNewsTypeFilters(next);
  };
  // The 🎥 Videos quick-filter is ITEM-level (not source-level) so it includes
  // Reddit video posts (v.redd.it clips), not just the "Top Videos" highlight
  // sources: Cards filters each source's items to those with a clip (NewsColumn
  // `videosOnly`), and Feed filters its merged items (NewsFeed `videosOnly`).
  // Source-filter options + the user's drag-reordered order. Unknown labels in
  // the saved order are ignored; new options not yet in the saved order fall
  // through to the tail in default order.
  const NEWS_FILTER_OPTIONS: { value: NewsSourceType; label: string }[] = [
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

  // Measure the sticky news toolbar so the Cards league titles + per-source
  // headers pin right below it (top: header-h + news-toolbar-h + …). Same
  // callback-ref + ResizeObserver pattern as newsTitleRowRef — the toolbar only
  // mounts in news view, so a deps-based effect would race the mount.
  const newsToolbarRoRef = useRef<ResizeObserver | null>(null);
  const newsToolbarRef = useCallback((el: HTMLDivElement | null) => {
    const root = rootRef.current;
    if (newsToolbarRoRef.current) {
      newsToolbarRoRef.current.disconnect();
      newsToolbarRoRef.current = null;
    }
    if (!root) return;
    if (!el) {
      root.style.removeProperty("--news-toolbar-h");
      return;
    }
    const measure = () => {
      root.style.setProperty("--news-toolbar-h", `${el.getBoundingClientRect().height}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    newsToolbarRoRef.current = ro;
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400);
      // Once the footer scrolls into view the fixed button would sit ON TOP of
      // the footer text (Jacob 8/4). Lift it by however much of the footer is
      // showing so it always rides just above the footer's top border.
      const f = footerRef.current;
      const lift = f ? window.innerHeight - f.getBoundingClientRect().top + 12 : 0;
      setScrollTopLift(lift > 0 ? Math.round(lift) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Content loading in (news cards, score rows) moves the footer WITHOUT a
    // scroll event, which would leave the lift stale — watch the page height.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
    };
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
  // Settings → "Hide upsetting news" has a per-session escape hatch: the
  // "N hidden — Show" line under the feed flips this on, which un-hides the
  // filtered posts until the app is reopened. Deliberately NOT persisted — the
  // stored preference stays true, so the filter is back on next launch and the
  // Settings toggle remains the one durable control.
  const [showSensitiveNews, setShowSensitiveNews] = useState(false);
  // The two toggles resolve to one category list the news surfaces filter on.
  // Memoized so it is a stable dependency for their filter memos.
  const hiddenNewsCategories = useMemo(
    () => (showSensitiveNews ? [] : enabledCategories(prefs.hideSensitiveNews, prefs.hideCrashNews)),
    [showSensitiveNews, prefs.hideSensitiveNews, prefs.hideCrashNews],
  );
  const showSensitive = useCallback(() => setShowSensitiveNews(true), []);
  // Re-arm the escape hatch whenever the preference is turned back on in
  // Settings, so a session override can't silently defeat a fresh opt-in.
  useEffect(() => {
    if (prefs.hideSensitiveNews || prefs.hideCrashNews) setShowSensitiveNews(false);
  }, [prefs.hideSensitiveNews, prefs.hideCrashNews]);
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
    // Escape closes the source-filter popover too — it's a role="dialog", and
    // every other overlay in the app dismisses on Escape (the DateNav calendar
    // popover, GameDetailModal, WorldCupGroupsModal, the ratings/news
    // explainers). This dialog was the lone outlier: a keyboard user who opened
    // it had no keyboard way out short of tabbing back to the toggle or picking
    // an option, so Escape now matches the click-away dismissal already here.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewsFilterOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [newsFilterOpen]);
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

  // Keep the browser-chrome tint (<meta name="theme-color">) in sync with the
  // theme actually rendered, not just the OS scheme. The `viewport` export in
  // layout.tsx emits two media-based theme-color metas (light -> #ffffff,
  // dark -> #0a0a0a), so a user who overrides the theme in Settings against
  // their device scheme (e.g. forces dark on a light-mode phone) got a dark
  // page under a light toolbar. resolvedTheme already folds in both the explicit
  // override and the live OS scheme, so writing its color to BOTH metas makes
  // whichever one the browser picks ("first matching media") show the right
  // color either way. Kept in step with layout.tsx's viewport themeColor values.
  useEffect(() => {
    const color = resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff";
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);

  // Pull-to-refresh visual: a small spinner pill that descends from below the
  // header proportional to pullDelta, latches into a spinning state during
  // refresh, then fades out. translate3d so it composites on the GPU and
  // doesn't drop frames on iOS during the pull gesture.
  const ptrProgress = Math.min(pullDelta / 70, 1);
  const ptrVisible = pullDelta > 0 || refreshing;
  const ptrTranslateY = refreshing ? 28 : Math.max(0, pullDelta - 12);

  // Recap-pill row alignment. When ONE column shows the league recap pill and
  // a sibling has none for its day, the sibling's first card sat ~50px higher
  // (Jacob 9/16). Resolve which visible columns have a recap here — same
  // (sport, ymd) rule as recapTopCard, same slot → league queue as
  // slotEntries — so every LeagueRecapCard can reserve the row. Cheap:
  // getRecapsFor reads the session-cached /news/recaps.json.
  const recapQueryKey = (() => {
    if (selectedDate > getDateString(0)) return "";
    const queue = [...sortedLeagues];
    const pairs: string[] = [];
    for (const slotIdx of SLOT_INDICES.slice(0, slotCount)) {
      if (selectedSlotLeagues[slotIdx] === "empty") continue;
      const league = queue.shift();
      if (!league) continue;
      const ymd = (league.games.length ? null : league.previousGameDay?.date) || selectedDate;
      pairs.push(`${league.sport}:${ymd}`);
    }
    return pairs.join(",");
  })();
  const [recapSports, setRecapSports] = useState<{ key: string; sports: Set<string> }>({ key: "", sports: new Set() });
  const recapPairs = recapQueryKey ? recapQueryKey.split(",").map((p) => p.split(":") as [string, string]) : [];
  // Synchronous answer when recaps.json is already in the session cache
  // (fetchData loads it with the scores), so the row is reserved in the same
  // paint as the cards. null = cache cold, the effect below resolves it.
  const recapSportsSync = (() => {
    if (!recapPairs.length) return null;
    const hits = new Set<string>();
    for (const [sport, ymd] of recapPairs) {
      const list = getRecapsForSync(sport, ymd);
      if (list === null) return null;
      if (list.length) hits.add(sport);
    }
    return hits;
  })();
  useEffect(() => {
    if (!recapQueryKey || recapSportsSync) return;
    let alive = true;
    const pairs = recapQueryKey.split(",").map((p) => p.split(":") as [string, string]);
    Promise.all(pairs.map(([sport, ymd]) => getRecapsFor(sport, ymd).then((list) => (list.length ? sport : null)).catch(() => null)))
      .then((hits) => {
        if (alive) setRecapSports({ key: recapQueryKey, sports: new Set(hits.filter((s): s is string => !!s)) });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recapSportsSync is derived from recapQueryKey + the session cache
  }, [recapQueryKey]);
  // A stale set from the previous date/column mix never reserves a row.
  // Today's MLB column puts a "Playoffs" pill in the same row during
  // the playoff-picture window (LeagueRecapCard onShowPlayoffs), so it reserves
  // the row on sibling columns exactly as a recap does.
  const bracketPillDue = isToday && playoffPictureInWindow("mlb", selectedDate);
  const bracketPillShown = bracketPillDue && sortedLeagues
    .slice(0, SLOT_INDICES.slice(0, slotCount).filter((i) => selectedSlotLeagues[i] !== "empty").length)
    .some((l) => l.sport === "mlb");
  const anyRecap = (recapSportsSync
    ? recapSportsSync.size > 0
    : recapSports.key === recapQueryKey && recapSports.sports.size > 0) || bracketPillShown;

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
            // Honor prefers-reduced-motion for the puck's settle slide, matching
            // the .ptr-spinner guard in globals.css — the spinner inside this same
            // element is already silenced under reduced-motion, so the transform
            // transition was the lone unguarded piece. Read live (an OS toggle
            // takes effect without reload) and only when refreshing gates it on,
            // so matchMedia stays out of the pull-gesture render path.
            transition:
              refreshing &&
              !(typeof window !== "undefined" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches)
                ? "transform 200ms ease-out"
                : "none",
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
      {/* Opaque strip from the viewport top down to wherever the sticky league
          titles pin. Sits under the header, over the cards — see
          .sticky-seam-cover in globals.css for why this exists rather than
          another round of offset arithmetic. */}
      <div className="sticky-seam-cover" aria-hidden="true" data-testid="sticky-seam-cover" data-news={showNews ? "" : undefined} />
      {/* FIXED, not sticky — and the flow space it vacates is given back by
          <div className="header-flow-spacer"> right below </header>, whose
          height is var(--header-h): the SAME variable every sticky row below
          pins at.

          Why this matters (the "first card has no top outline" bug, reported
          repeatedly and 'fixed' three times with padding tweaks): while the
          header was in flow, page content started at the header's REAL height
          but .league-sticky-top pinned at the MEASURED --header-h. Those two
          numbers disagree by exactly the ResizeObserver's lag, and when the
          measurement runs large, `position: sticky` shoves the league title
          DOWN to its pin point — past its natural spot, on top of the first
          game card — where its opaque var(--bg) at z-30 eats the card's 1px
          top border. The seam cover hides the tell-tale gap above the title,
          so it reads as a clipped card rather than a displaced title. Single
          column shows it first because condense mode has only 0.5rem of top
          padding to absorb the drift (row layout has 1.75rem).

          Fixed header + a spacer sized by the same variable makes the two
          numbers the same number: content now starts AT --header-h, so the
          title's natural position is never above its pin point and sticky has
          nothing to shove. The overlap is zero by construction, for any value
          of --header-h, however stale. Guarded by tests/visual/sticky-seam.spec.ts
          ("the first card's top edge survives a stale --header-h"). */}
      <header ref={headerRef} className="px-4 fixed top-0 left-0 right-0 z-40" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(8px)",
        // In the native iOS app the WKWebView reports env(safe-area-inset-top)
        // unreliably — sometimes ~0 (header collides with the status bar),
        // sometimes an inflated stale value from a rotation/resume transition
        // (a large empty gap opens above the header). Clamp it to the real-world
        // range of iPhone insets (20-59px) so either glitch self-corrects; a
        // correctly-reported value anywhere in that range passes through
        // untouched. Web browsers manage their own chrome, so leave the raw
        // inset there.
        paddingTop: isNativeApp ? "calc(clamp(50px, env(safe-area-inset-top), 60px) + 0.5rem)" : "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}>
        {/* Mobile uses auto_1fr_auto so the middle column gets all the leftover
            width (logo + icons size to content) → the date nav fits on one line
            without pushing the settings gear off-screen. Desktop keeps the
            symmetric 1fr_auto_1fr so the view tabs sit dead-center under MLB. */}
        <div className="max-w-6xl mx-auto relative grid grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <Link
            href="/"
            aria-label="HideScore home"
            onClick={(e) => {
              // In the news view, the logo acts as "back to scores" — toggle
              // news off in place instead of navigating, since "/" would
              // just rehydrate news from prefs.showNews and bounce the user
              // right back into the news view.
              if (showNews) {
                e.preventDefault();
                setShowNews(false);
                updatePrefs({ showNews: false });
                // Going "home" must also drop any highlight deep-link params —
                // preventDefault means the URL is never replaced, so without
                // this a refresh reopens the shared item you just left.
                stripHighlightParams();
                window.scrollTo({ top: 0, behavior: "auto" });
              }
            }}
            className="hover:opacity-80 transition-opacity flex items-center flex-shrink-0 justify-self-start col-start-1"
            style={{ color: "var(--text)" }}
          >
            <span className="hidden xl:inline text-lg font-bold tracking-tight">HideScore</span>
            <svg className="xl:hidden w-7 h-7 header-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
                <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} initialOffset={initialOffset} initialDate={initialDate} trailing={
                  <span className="relative inline-flex items-center mr-2 shrink-0">
                    <button
                      type="button"
                      data-cal-toggle
                      onClick={() => setCalendarOpen(!calendarOpen)}
                      className="ml-0.5 w-7 h-7 shrink-0 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                      style={{ color: calendarOpen ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
                      title="Pick a date"
                      aria-label="Pick a date"
                      aria-haspopup="dialog"
                      aria-expanded={calendarOpen}
                    >
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </button>
                    {calendarOpen && (
                      <CalendarDropdown selectedDate={selectedDate} onDateChange={(d) => { setSelectedDate(d); setCalendarOpen(false); }} onClose={() => setCalendarOpen(false)} />
                    )}
                    {/* The single-column toggle left this row on 6/18 (the 32px
                        copy crowded col 2 into the moon in col 3) and Settings
                        was the only way to flip it on a phone. Jacob 9/22 turned
                        it on at the PC, it followed him to the phone, and he had
                        to go landscape to find a button. It is back at the
                        calendar's 28px size, from 390px up (see SingleColToggle). */}
                    <SingleColToggle compact active={prefs.singleColumn ?? false} onClick={() => updatePrefs({ singleColumn: !prefs.singleColumn })} />
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
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
            {/* Read order, immediately LEFT of the funnel (Jacob 8/9). This is a
                reading choice you change mid-scroll — "let me work up from the
                bottom of r/nba" — so it belongs on the news header next to the
                other list controls, not buried in Settings. Same round shape and
                filled-accent = on treatment as the funnel beside it. */}
            {showNews && (
              <button
                type="button"
                onClick={() => updatePrefs({ newsOldestFirst: !prefs.newsOldestFirst })}
                className="monkey-toggle relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  background: prefs.newsOldestFirst ? "var(--accent)" : "var(--bg-card)",
                  border: `1px solid ${prefs.newsOldestFirst ? "var(--accent)" : "var(--border)"}`,
                  color: prefs.newsOldestFirst ? "white" : "var(--text-muted)",
                }}
                title={prefs.newsOldestFirst ? "Oldest first — tap for newest first" : "Newest first — tap for oldest first"}
                aria-label={prefs.newsOldestFirst ? "Sort oldest first (on)" : "Sort newest first"}
                aria-pressed={!!prefs.newsOldestFirst}
              >
                {prefs.newsOldestFirst ? (
                  // Ascending: arrow up + short-to-tall bars.
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 20V6" /><path d="m3 9 3-3 3 3" />
                    <line x1="12" y1="17" x2="15" y2="17" />
                    <line x1="12" y1="12" x2="18" y2="12" />
                    <line x1="12" y1="7" x2="21" y2="7" />
                  </svg>
                ) : (
                  // Descending: arrow down + tall-to-short bars.
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 4v14" /><path d="m3 15 3 3 3-3" />
                    <line x1="12" y1="7" x2="15" y2="7" />
                    <line x1="12" y1="12" x2="18" y2="12" />
                    <line x1="12" y1="17" x2="21" y2="17" />
                  </svg>
                )}
              </button>
            )}
            {showNews && (
              <div ref={newsFilterRef} className="relative">
                <button
                  type="button"
                  onClick={() => setNewsFilterOpen(!newsFilterOpen)}
                  className="monkey-toggle relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                  style={{
                    background: newsFilterOpen ? "var(--accent)" : "var(--bg-card)",
                    border: `1px solid ${newsFilterOpen ? "var(--accent)" : "var(--border)"}`,
                    color: newsFilterOpen ? "white" : "var(--text-muted)",
                  }}
                  title="Filter news"
                  aria-label="Filter news"
                  aria-haspopup="dialog"
                  aria-expanded={newsFilterOpen}
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                </button>
                {newsFilterOpen && (
                  <div
                    // The filter button declares aria-haspopup + aria-expanded, so
                    // give the panel it opens a matching role + accessible name —
                    // otherwise it surfaces to assistive tech as an anonymous,
                    // role-less region. Same role="dialog" + aria-label pattern the
                    // DateNav calendar popover and every other overlay in the app use.
                    role="dialog"
                    aria-label="Filter news by source"
                    className="absolute top-full mt-1 right-0 rounded-lg shadow-lg z-50 p-3 min-w-[210px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Source</div>
                    {/* One per row + drag-to-reorder (order saved to prefs). */}
                    <NewsFilterList
                      options={orderedNewsFilterOptions}
                      selected={newsTypeFilters}
                      onToggle={toggleNewsTypeFilter}
                      onReorder={setNewsTypeFilterOrder}
                    />
                    {newsTypeFilters.length !== ALL_NEWS_SOURCE_TYPES.length && (
                      <button
                        type="button"
                        onClick={() => setNewsTypeFilters(ALL_NEWS_SOURCE_TYPES)}
                        className="mt-3 text-xs underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Select all
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
              type="button"
              onClick={() => {
                const next = resolvedTheme === "dark" ? "light" : "dark";
                updatePrefs({ theme: next });
                document.documentElement.setAttribute("data-theme", next);
              }}
              className="monkey-toggle w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="monkey-toggle w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{
                background: settingsOpen ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${settingsOpen ? "var(--accent)" : "var(--border)"}`,
                color: settingsOpen ? "white" : "var(--text-muted)",
              }}
              title="Settings"
              aria-label="Open settings"
              // This gear opens the SettingsPanel — a role="dialog" aria-modal
              // overlay — so announce that to assistive tech, matching the
              // news-filter + calendar buttons in this same header (both declare
              // aria-haspopup="dialog" + aria-expanded). Without it this button
              // read as a plain action, giving no cue it summons a dialog or
              // whether that dialog is currently open.
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

      </header>
      {/* Gives back the flow space the now-fixed header vacated — sized by
          var(--header-h), the same variable .league-sticky-top pins at, which
          is the whole point (see the header comment above). Its CSS fallbacks
          match .league-sticky-top's byte for byte so the pre-measurement first
          paint agrees too. */}
      <div className="header-flow-spacer" aria-hidden="true" data-testid="header-flow-spacer" />
      {/* sm+ only: date nav sits BELOW the header divider line (desktop has the
          view tabs in the top-row middle, so the date nav drops here). On mobile
          it's inline in the header middle instead (above). Scores/rated only;
          centered in max-w-6xl to line up with the middle (MLB) column. */}
      {!showNews && (
        <div className="hidden sm:flex max-w-6xl mx-auto px-4 justify-center pt-2 pb-1">
          <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} initialOffset={initialOffset} initialDate={initialDate} trailing={
            <span className="relative inline-flex items-center">
              <button
                type="button"
                data-cal-toggle
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="ml-1 w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                style={{ color: calendarOpen ? "var(--accent)" : "var(--text-muted)", background: "transparent" }}
                title="Pick a date"
                aria-label="Pick a date"
                aria-haspopup="dialog"
                aria-expanded={calendarOpen}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* News toolbar — Cards/Feed layout + Headlines / Videos / Text-posts
          toggles. Sits one row below the header (its original spot), but STICKY:
          it pins to the top while scrolling, like the league titles (Jacob 7/14).
          Its measured height drives --news-toolbar-h so the Cards league titles +
          per-source headers stack right below it (see globals.css).

          z-36, NOT z-30. .sticky-seam-cover is a fixed, opaque var(--bg) bar at
          z-35 whose height is header-h + --news-toolbar-h — i.e. it deliberately
          spans this toolbar's whole band. At z-30 the toolbar rendered UNDER it
          and the entire pill row (Headlines / Media / Videos / Text posts) was
          invisible in news view, at every scroll position (Jacob 8/10: "all our
          pills above it with toggles for media etc aren't there"). The toolbar
          paints its own opaque var(--bg), so sitting above the cover — and still
          below the z-40 app header — keeps the seam sealed either way. */}
      {showNews && (
        <div ref={newsToolbarRef} className="news-toolbar-sticky sticky z-[36]" style={{ background: "var(--bg)" }}>
          <div className="max-w-6xl mx-auto px-4 flex justify-center flex-wrap items-center gap-2 pt-2 pb-2">
            <div className="inline-flex rounded-full p-0.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {([["Cards", false], ["Feed", true]] as const).map(([label, on]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => updatePrefs({ newsFeedView: on })}
                  className="px-4 py-1 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                  // Neutral selected segment, not a solid blue pill (Jacob 7/16):
                  // a subtle raised fill + regular text reads as selected without
                  // the loud accent-blue chip on the top row.
                  style={{
                    background: !!prefs.newsFeedView === on ? "var(--bg-card-hover)" : "transparent",
                    color: !!prefs.newsFeedView === on ? "var(--text)" : "var(--text-muted)",
                  }}
                  aria-pressed={!!prefs.newsFeedView === on}
                >
                  {label}
                </button>
              ))}
            </div>
            <NewsToggleChip
              active={!!prefs.revealNewsTitles}
              onClick={() => updatePrefs({ revealNewsTitles: !prefs.revealNewsTitles })}
              title="Headlines are spoilers — blurred by default. Tap to show or hide them all."
              ariaLabel="Toggle headline reveal"
            >
              {prefs.revealNewsTitles ? (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
              ) : (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              )}
              <span>Headlines</span>
            </NewsToggleChip>
            {/* Media sits directly after Headlines (Jacob 8/9): the two
                spoiler-reveal toggles belong next to each other — they do the
                same job to the two halves of a post — while Videos/Text posts
                are content FILTERS. Grouping them by what they do is most of
                what makes this row readable. */}
            <NewsToggleChip
              active={prefs.revealNewsMedia === true}
              onClick={() => updatePrefs({ revealNewsMedia: prefs.revealNewsMedia !== true })}
              title="Show or spoiler-blur news image and video previews"
              ariaLabel="Toggle media reveal"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
              <span>Media</span>
            </NewsToggleChip>
            <NewsToggleChip
              active={!!prefs.newsVideosOnly}
              onClick={() => updatePrefs({ newsVideosOnly: !prefs.newsVideosOnly })}
              title="Show only video posts (highlights + Reddit clips)"
              ariaLabel="Toggle videos-only filter"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m23 7-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              <span>Videos only</span>
            </NewsToggleChip>
            {/* Videos only overrides Text posts (Jacob 9/14): a text post has no
                clip, so it can never pass the Videos filter. Dim this chip while
                that's the case so its state doesn't read as a lie. */}
            <NewsToggleChip
              active={!!prefs.showTextPosts}
              onClick={() => updatePrefs({ showTextPosts: !prefs.showTextPosts })}
              title={prefs.newsVideosOnly ? "Off while Videos only is on" : "Show or hide headline-only text posts"}
              ariaLabel="Toggle text posts"
              disabled={!!prefs.newsVideosOnly}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" /></svg>
              <span>Text posts</span>
            </NewsToggleChip>
          </div>
        </div>
      )}

      {/* Scores board stretches to max-w-7xl when five columns are actually
          RENDERING — keyed off the fetched data, not the viewport, so crossing
          the 1280px breakpoint doesn't widen the still-3-column board while
          the extra leagues load; the layout swaps once, when they arrive
          (Jacob 6/11). The skeleton keys off the viewport (no data yet). */}
      <main id="main-content" tabIndex={-1} className={`${!showNews && (sortedLeagues.length > 3 || (loading && slotCount === 5)) ? "max-w-7xl" : "max-w-6xl"} mx-auto px-4 pt-0 pb-6 flex-1 w-full focus:outline-none`}>
        {/* First-run explanations for the Ratings and News tabs. These replaced
            blocking confirm dialogs on 2026-08-04 (see handleViewModeClick):
            the tab now applies instantly and the reason arrives here, in flow,
            dismissible — same shape as the World Cup banner below. role="status"
            (not "alert") announces them to screen readers without stealing
            focus, which is the whole point of not being a dialog anymore. */}
        {ratingsNotice && (
          <div
            role="status"
            className="relative mt-6 mb-3 rounded-lg px-3 py-2 pr-10"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              <span aria-hidden="true">🙉 </span>
              <strong>Ratings are on.</strong>{" "}They show how competitive a game is — based on score closeness, not who&apos;s winning — so they can hint at the outcome. Games are also reordered — live and finished by rating, upcoming by best matchups.
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--text-muted)" }}>SCALE</span>
              <span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white mr-1">GREAT</span>down to the wire</span>
              <span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600 text-white mr-1">GOOD</span>competitive</span>
              <span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white mr-1">MEH</span>one-sided</span>
              <span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-700 text-white mr-1">SKIP</span>blowout</span>
            </div>
            <button
              type="button"
              onClick={() => setRatingsNotice(false)}
              aria-label="Dismiss ratings explanation"
              className="absolute top-1.5 right-2 text-lg leading-none cursor-pointer transition-opacity hover:opacity-70"
              style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            >
              ×
            </button>
          </div>
        )}
        {newsNotice && (
          <div
            role="status"
            className="relative mt-6 mb-3 rounded-lg px-3 py-2 pr-10"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid #f59e0b" }}
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              <span aria-hidden="true">⚠️ </span>
              <strong>News is full of spoilers.</strong>{" "}Headlines and images give away results, player performance, and outcomes. That&apos;s why they start blurred — tap one to reveal it, or use the Headlines toggle to un-blur everything.
            </p>
            <button
              type="button"
              onClick={() => setNewsNotice(false)}
              aria-label="Dismiss news spoiler warning"
              className="absolute top-1.5 right-2 text-lg leading-none cursor-pointer transition-opacity hover:opacity-70"
              style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            >
              ×
            </button>
          </div>
        )}
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
              <span>{worldCupHubCopy.title}</span>
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {worldCupHubCopy.body}{worldCupEnded ? "" : " The World Cup column is below."}
            </p>
            <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              {worldCupEnded ? (
              <>
              <a
                href={`/worldcup?d=${WORLD_CUP_2026_FINAL}`}
                data-umami-event="wc-hub-final"
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "white" }}
              >
                The final, July 19
              </a>
              <a
                href="/worldcup/highlights"
                data-umami-event="wc-hub-highlights"
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{
                  background: worldCupHubMode === "highlights" ? "var(--accent)" : "var(--bg-card-hover)",
                  border: `1px solid ${worldCupHubMode === "highlights" ? "var(--accent)" : "var(--border)"}`,
                  color: worldCupHubMode === "highlights" ? "white" : "var(--text)",
                }}
              >
                Highlights
              </a>
              </>
              ) : (
              <>
              <a
                href="/worldcup"
                data-umami-event="wc-hub-today"
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{
                  background: worldCupHubMode === "today" ? "var(--accent)" : "var(--bg-card-hover)",
                  border: `1px solid ${worldCupHubMode === "today" ? "var(--accent)" : "var(--border)"}`,
                  color: worldCupHubMode === "today" ? "white" : "var(--text)",
                }}
              >
                Today&apos;s matches
              </a>
              <a
                href="/worldcup/tomorrow"
                data-umami-event="wc-hub-tomorrow"
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{
                  background: worldCupHubMode === "tomorrow" ? "var(--accent)" : "var(--bg-card-hover)",
                  border: `1px solid ${worldCupHubMode === "tomorrow" ? "var(--accent)" : "var(--border)"}`,
                  color: worldCupHubMode === "tomorrow" ? "white" : "var(--text)",
                }}
              >
                Tomorrow
              </a>
              <a
                href="/worldcup/highlights"
                data-umami-event="wc-hub-highlights"
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{
                  background: worldCupHubMode === "highlights" ? "var(--accent)" : "var(--bg-card-hover)",
                  border: `1px solid ${worldCupHubMode === "highlights" ? "var(--accent)" : "var(--border)"}`,
                  color: worldCupHubMode === "highlights" ? "white" : "var(--text)",
                }}
              >
                Spoiler-free highlights
              </a>
              </>
              )}
              <a
                href="/watch-world-cup-without-spoilers"
                data-umami-event="wc-hub-watch-guide"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-center transition-colors"
                style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--accent)" }}
              >
                Watch guide
              </a>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Popular teams
              </p>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_WORLD_CUP_TEAMS.map((team) => {
                  const pillClass = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold";
                  const pillStyle = { background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" };
                  const lastMatch = worldCupEnded ? worldCupLastMatchYmd(team.slug) : null;
                  // A plain <a>, not <Link>: /worldcup → /worldcup?d= is the same
                  // route, so a client-side Link would keep this mounted board
                  // and never re-read ?d=. A full load opens on that date.
                  return lastMatch ? (
                    <a
                      key={team.slug}
                      href={`/worldcup?d=${lastMatch}`}
                      data-umami-event={`wc-hub-popular-${team.slug}`}
                      className={pillClass}
                      style={pillStyle}
                    >
                      <span aria-hidden="true">{team.flag}</span>
                      <span>{team.name}</span>
                    </a>
                  ) : (
                    <Link
                      key={team.slug}
                      href={`/worldcup/teams/${team.slug}`}
                      data-umami-event={`wc-hub-popular-${team.slug}`}
                      className={pillClass}
                      style={pillStyle}
                    >
                      <span aria-hidden="true">{team.flag}</span>
                      <span>{team.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {worldCupHubCopy.note}{" "}
              {worldCupEnded ? (
                <a href={`/worldcup?d=${WORLD_CUP_2026_FINAL}`} data-umami-event="wc-hub-footer-final" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  The final
                </a>
              ) : (
                <a href="/worldcup/tomorrow" data-umami-event="wc-hub-footer-tomorrow" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  Tomorrow&apos;s World Cup schedule
                </a>
              )}{" "}
              -{" "}
              <a href="/worldcup/highlights" data-umami-event="wc-hub-footer-highlights" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                {worldCupEnded ? "Highlights" : "Spoiler-free highlights"}
              </a>{" "}
              -{" "}
              <Link href="/worldcup/teams" data-umami-event="wc-hub-footer-teams" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                All teams
              </Link>
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
          // Build visible news entries. The first two mirror scores columns;
          // the generic News/optional third-news-league column is independent.
          // Type/hidden filters are applied at render-time so the dropdown
          // can still display + re-enable hidden sources.
          // Col-3 fallback = hidescore.com's "News" feed. Use GENERIC_CASCADE,
          // which leads with ESPN Videos (a video) — so all 3 columns lead with
          // video and the AlignedVideoStrip activates → clean aligned grid like
          // live. ESPN top headlines fill the tail below (useEspnTopTail).
          // Labeled "News" (swappable to a 3rd league) to match hidescore.com.
          const espnEntry = {
            slotIdx: 2,
            sport: undefined as Sport | undefined,
            id: "espn" as const,
            label: "News",
            orderedCascade: GENERIC_CASCADE,
          };
          // fetchAllLeagues collapses empty slots out of the returned array, so
          // walk it as a shifting queue — one pull per non-empty slot — exactly
          // like the scores view (see leagueQueue below) and setSlotLeague. A
          // direct sortedLeagues[slotIdx] index is only correct when every empty
          // slot is trailing; an empty slot BEFORE a populated one would shift
          // each later league's index down and drop/mislabel its news column.
          const newsLeagueQueue = [...sortedLeagues];
          const leagueEntries = [0, 1].map((slotIdx) => {
            if (selectedSlotLeagues[slotIdx] === "empty") return null;
            const queued = newsLeagueQueue.shift();
            const sport: Sport | undefined = queued?.sport;
            if (!sport) return null;
            // A Top events / Best of yesterday score column has no news feed
            // of its own (it is a cross-league pick, not a league). The board
            // keeps its other mirror plus the News column rather than an
            // empty "Top events".
            if (sport === "top" || sport === "best") return null;
            const label = thirdLeagueOptions.find((o) => o.sport === sport)?.label ?? sport.toUpperCase();
            const orderedCascade = leagueSourceCascade(sport);
            return { slotIdx, sport, id: sport as string, label, orderedCascade };
          }).filter((e): e is NonNullable<typeof e> => e !== null);
          const thirdLeagueEntry = prefs.newsThirdLeague ? (() => {
            const sport = prefs.newsThirdLeague!;
            const label = thirdLeagueOptions.find((o) => o.sport === sport)?.label ?? sport.toUpperCase();
            return { slotIdx: 2, sport, id: sport as string, label, orderedCascade: leagueSourceCascade(sport) };
          })() : null;
          // Match hidescore.com's default column order: the two scores leagues
          // fill cols 1-2, and col 3 is the chosen 3rd news league if set, else
          // the ESPN/general feed — NOT a forced ESPN first column. (Reverted the
          // 5/28 ESPN-first default per Jacob 5/29; ESPN stays reachable as the
          // col-3 fallback and the focus/order controls are unchanged.)
          const firstTwoEntries = leagueEntries.filter((e) => e.slotIdx === 0 || e.slotIdx === 1);
          // Col 3 naturally exists even when scores slot 3 is Empty. It can be
          // swapped to a league or explicitly removed without touching scores.
          const thirdColEntry = prefs.newsGenericHidden
            ? null
            : thirdLeagueEntry ?? espnEntry;
          // Mobile (single stacked column): lead with News, then the two score
          // leagues (Jacob 5/30 — "news, then mlb, then nba"). Desktop keeps the
          // 3-across order: the two leagues, then the News/3rd-league column.
          // Desktop position of the generic column: last by default, but the
          // user can pull it left by picking "Top news (ESPN)" from any
          // column's switcher (newsGenericSlot). The league columns shift
          // right around it — nothing is dropped. Mobile keeps its fixed
          // news-first stack (Jacob 5/30) regardless.
          const genericPos = Math.min(prefs.newsGenericSlot ?? 2, firstTwoEntries.length);
          const visibleNewsEntries = isMobile
            ? [...(thirdColEntry ? [thirdColEntry] : []), ...firstTwoEntries]
            : thirdColEntry
              ? [...firstTwoEntries.slice(0, genericPos), thirdColEntry, ...firstTwoEntries.slice(genericPos)]
              : [...firstTwoEntries];

          // Apply Focus league (drops other entries) then per-entry filter by
          // the independently checked source types + hidden labels. Hidden
          // labels vanish from view but stay togglable in the dropdown.
          const focusedEntries = newsFocusLeague
            ? visibleNewsEntries.filter((e) => e.id === newsFocusLeague)
            : visibleNewsEntries;
          const orderedColumnSourcesFor = (entry: typeof visibleNewsEntries[number]): ColumnSource[] => {
            const visible = entry.orderedCascade.filter((s) => !newsHiddenSources.includes(s.label));
            const typeMatched = visible.filter((s) => newsTypeFilters.includes(classifySource(s) as NewsSourceType));
            // Not every league has a source of every type — NWSL and cricket
            // have no Reddit card at all (r/soccer is men's club football, so
            // it is deliberately kept out of the NWSL column). Since the
            // legacy default filter is "reddit", a strict filter would render
            // those columns completely blank on first visit with nothing to
            // explain why. Fall back to the league's full cascade whenever the
            // type filter would empty the column, so the filter narrows a
            // column that has the type and is a no-op for one that doesn't.
            // Preserve that legacy fallback until the user touches the new
            // checkboxes. Once newsTypeFilters exists, unchecked types stay
            // unchecked even for a league that has none of the selected type.
            const filtered = typeMatched.length > 0 || prefs.newsTypeFilters
              ? typeMatched
              : visible;
            // When viewing "All", honor the user's source-type order from the
            // funnel popover (Jacob 6/1) — dragging a source higher makes its
            // items lead in every column. Stable within a type so the per-sport
            // cascade order is preserved among same-type sources.
            const typeOrder = prefs.newsTypeFilterOrder;
            return (newsTypeFilters.length > 1 && typeOrder && typeOrder.length)
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

          // News col 3 is independent; the first two league columns continue to
          // mirror their matching score slots.
          const newsSwapFor = (slotIdx: number) =>
            (s: Sport | "empty" | undefined) => {
              if (slotIdx === 2) {
                if (s === "empty") {
                  updatePrefs({
                    newsGenericHidden: true,
                    newsFocusLeague: prefs.newsFocusLeague === (prefs.newsThirdLeague ?? "espn") ? undefined : prefs.newsFocusLeague,
                  });
                } else {
                  setNewsThirdLeague(s as Sport | undefined);
                }
                return;
              }
              setSlotLeague(slotIdx, s);
            };
          // Force the ESPN "Top news" feed back as a column: clear any 3rd-league
          // override and explicitly show the independent generic column.
          // When called from a column's switcher, `position` is that column's
          // index so the feed lands where the user asked for it instead of
          // always in col 3 (which read as "the menu item does nothing" from
          // columns 1-2).
          const pickEspn = (position?: number) => {
            updatePrefs({
              newsThirdLeague: undefined,
              newsGenericHidden: false,
              newsGenericSlot: position === undefined
                ? prefs.newsGenericSlot
                : (Math.max(0, Math.min(2, position)) as 0 | 1 | 2),
              newsFocusLeague: prefs.newsFocusLeague ? "espn" : undefined,
            });
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
          // The tail fetches espn-top DIRECTLY (fetchPrebaked), bypassing the
          // orderedColumnSourcesFor funnel every column goes through — so gate it
          // on the same two things the funnel checks: the "espn" source type is
          // selected and the ESPN label isn't hidden. Otherwise a Reddit-only
          // funnel still showed ESPN headlines in col 3's tail.
          const useEspnTopTail = stripActive && espnColIdx >= 0 && !prefs.newsThirdLeague
            && newsTypeFilters.includes("espn") && !newsHiddenSources.includes("ESPN");
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
          // cascade order. Keep each column together in its natural order:
          // News, then higher-priority league A, then league B. This replaces
          // the old interleaving that put B Reddit before B video.
          const MOBILE_SOURCE_RANK: Record<string, number> = {
            "news:topvideos": 1,
            "news:espn": 2,
            "news:reddit": 3,
            "news:homepage": 4,
            "A:topvideos": 5,
            "A:reddit": 6,
            "A:espn": 7,
            "A:homepage": 8,
            "B:topvideos": 9,
            "B:reddit": 10,
            "B:espn": 11,
            "B:homepage": 12,
            "C:topvideos": 13,
            "C:reddit": 14,
            "C:espn": 15,
            "C:homepage": 16,
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
              const leagueIdx = leagueEntries.indexOf(entry);
              const role = entry.id === "espn"
                ? "news"
                : leagueIdx === 0 ? "A" : leagueIdx === 1 ? "B" : "C";
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
          // News + button restores the natural News column first when removed;
          // otherwise it refills one of the two score-linked league columns.
          const newsFirstEmptySlot = [0, 1].find((i) => selectedSlotLeagues[i] === "empty");
          const newsAddEligibleSport = switcherOptions.find(
            (o) => !visibleNewsEntries.some((e) => e.sport === o.sport),
          )?.sport;
          const newsOnAddColumn = visibleNewsEntries.length < 3 && (prefs.newsGenericHidden || newsFirstEmptySlot !== undefined)
            ? () => {
                if (prefs.newsGenericHidden) pickEspn();
                else if (newsFirstEmptySlot !== undefined && newsAddEligibleSport) setSlotLeague(newsFirstEmptySlot, newsAddEligibleSport);
              }
            : undefined;
          const containerCls = effectiveColCount === 1
            ? "flex flex-col items-center gap-8"
            : "flex flex-row justify-center items-stretch gap-2 sm:gap-4";
          const widthClassFor = () =>
            effectiveColCount === 1 ? wideCol : narrowCol;

          // Feed view (Jacob 7/14): one vertical Reddit-style scroll instead of
          // the multi-column board. Aggregate every visible column's sources into
          // a single stream; NewsFeed fetches + merges + time-sorts them and
          // renders inline posts with blurred top comments.
          if (prefs.newsFeedView) {
            const feedSources = focusedEntries.flatMap((e) => renderSourcesFor(e));
            return (
              <NewsFeed
                key={`feed-${newsRefreshKey}`}
                sources={feedSources}
                onPlay={playNewsVideo}
                showTextPosts={!!prefs.showTextPosts}
                videosOnly={!!prefs.newsVideosOnly}
                oldestFirst={!!prefs.newsOldestFirst}
                hiddenCategories={hiddenNewsCategories}
                onShowSensitive={showSensitive}
              />
            );
          }

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
                        .map((e, i) => ({ sport: e.sport, col: i + 1 }))
                        .filter((_, i) => i !== idx)
                        .filter((e): e is { sport: Sport; col: number } => !!e.sport);
                      // "News" (ESPN) col is swappable to a 3rd league via
                      // setNewsThirdLeague — matches hidescore.com's "News ▾".
                      const isEspn = entry.id === "espn";
                      return (
                        <div key={`title-${entry.id}-${entry.slotIdx}`} className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
                          <NewsColumnTitle
                            title={entry.label}
                            swappableOptions={newsSwitcherOptions}
                            shownElsewhere={otherSports}
                            selectedSport={entry.sport}
                            onSwapLeague={newsSwapFor(entry.slotIdx)}
                            onPickEspn={() => pickEspn(idx)}
                            espnActive={isEspn}
                            autoSport={entry.slotIdx === 2 ? undefined : autoSlotSports[entry.slotIdx]}
                            autoIsEspn={entry.slotIdx === 2}
                            removable={renderedEntries.length > 1}
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
                    showTextPosts={!!prefs.showTextPosts}
                    videosOnly={!!prefs.newsVideosOnly}
                    hiddenCategories={hiddenNewsCategories}
                    oldestFirst={!!prefs.newsOldestFirst}
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
                    videosOnly={!!prefs.newsVideosOnly}
                    showTextPosts={!!prefs.showTextPosts}
                    oldestFirst={!!prefs.newsOldestFirst}
                    hiddenCategories={hiddenNewsCategories}
                    onShowSensitive={showSensitive}
                  />
                ) : renderedEntries.map((entry, idx) => {
                  const otherSports = renderedEntries
                    .map((e, i) => ({ sport: e.sport, col: i + 1 }))
                    .filter((_, i) => i !== idx)
                    .filter((e): e is { sport: Sport; col: number } => !!e.sport);
                  const isEspn = entry.id === "espn";
                  return (
                    <NewsColumn
                      key={`nc-${entry.id}-${entry.slotIdx}-${newsRefreshKey}`}
                      title={entry.label}
                      sources={sourcesForEntry(entry, idx)}
                      swappableOptions={newsSwitcherOptions}
                      shownElsewhere={otherSports}
                      selectedSport={entry.sport}
                      onSwapLeague={newsSwapFor(entry.slotIdx)}
                      onPickEspn={() => pickEspn(idx)}
                      espnActive={isEspn}
                      autoSport={entry.slotIdx === 2 ? undefined : autoSlotSports[entry.slotIdx]}
                      autoIsEspn={entry.slotIdx === 2}
                      hideTitle={stripActive}
                      onPlayVideo={playNewsVideo}
                      widthClassName={widthClassFor()}
                      videosOnly={!!prefs.newsVideosOnly}
                      showTextPosts={!!prefs.showTextPosts}
                      oldestFirst={!!prefs.newsOldestFirst}
                      hiddenCategories={hiddenNewsCategories}
                      onShowSensitive={showSensitive}
                      // Subtle × to drop this column, only when more than one is
                      // showing (never remove the last — Jacob 7/16).
                      removable={renderedEntries.length > 1}
                      // Non-strip layout: the columns render their own titles
                      // (no shared strip row), so ride the same measuring ref on
                      // the first column's title to keep --news-titlebar-h live.
                      // Otherwise it stays 0 and every source header pins behind
                      // the black league title, clipping the first card (the
                      // strip path measures its own row, so skip it there).
                      titleMeasureRef={!stripActive && idx === 0 ? newsTitleRowRef : undefined}
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
          // Screen readers get an announced loading status; the pulsing card
          // placeholders below are purely decorative (empty styled divs), so
          // they're aria-hidden and only the sr-only text is voiced (WCAG 4.1.3,
          // matching the role=status pattern in FeedbackBox / SettingsPanel).
          <div role="status" aria-live="polite" className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
            <span className="sr-only">Loading games…</span>
            {Array.from({ length: slotCount }, (_, i) => i + 1).map((i) => (
              <div key={i} aria-hidden="true" className="min-w-0 flex-1 max-w-[225px] xl:max-w-[280px]">
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
              type="button"
              // Retry with the user's configured columns (thirdLeague + slot
              // overrides), matching every other fetchData call. Passing only
              // the date let thirdLeague/slotOverrides default to undefined, so
              // fetchAllLeagues fell back to the auto-picker — a retry after an
              // error silently discarded the user's board (emptied/pinned
              // columns reverted to auto-picked leagues).
              onClick={() => fetchData(selectedDate, prefs.thirdLeague, {
                first: prefs.firstLeague,
                second: prefs.secondLeague,
                third: prefs.thirdLeague,
                fourth: prefs.fourthLeague,
                fifth: prefs.fifthLeague,
              })}
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
              onShowEventDetails: (event: LeagueEventCard, fight: FightBout | undefined, leagueLabel: string) => setDetailEvent({ event, fight, leagueLabel }),
              onShowGroups: () => { setGroupsHighlight(null); setGroupsOpen(true); },
              onShowSlamBracket: () => setSlamBracketOpen(true),
              selectedDate,
              onRetry: () => doRefreshRef.current(),
              showTeamStars: !prefs.hideTeamStars,
              upcomingRecordLeagues: recordLeagues,
              onAbbrevReport,
              namesCompact,
            };
            // Best of yesterday sits on the today board, but its games are
            // yesterday's: the finished-day card layout, none of the "today"
            // treatment.
            const crossDayProps = (league: LeagueData) =>
              league.sport === "best" ? { isPastDate: true, isToday: false } : {};
            // Per-slot swap dropdowns: every column lists every in-season
            // league plus the explicitly-labelled offseason NBA option.
            // Leagues already shown in another column come through greyed (via
            // shownElsewhere) but stay selectable — picking one gives you a
            // second column of that league.
            const displayedSports = sortedLeagues.map((l) => l.sport);
            // League-wide recap pill on top of each column, past dates only
            // (the ask). Follows the "Last played" slate when the column is
            // showing one, so the NFL Week-1 card tracks Sun 9/13 on Tue/Wed.
            // A column with no recap of its own reserves the pill's row
            // (invisible) when a sibling shows one, so first cards line up.
            // Only when columns sit side by side: boardRowCls below is a
            // flex-row whenever !singleColumn — phones included (2–3 narrow
            // columns) — and a flex-col stack when singleColumn, where there
            // is nothing to align with. A lone column has no sibling either.
            const reserveRecapSlot = anyRecap && !(prefs.singleColumn ?? false)
              && SLOT_INDICES.slice(0, slotCount).filter((i) => selectedSlotLeagues[i] !== "empty").length >= 2
              && sortedLeagues.length >= 2;
            // Today's board shows it too, game day or not: Thursday night and
            // Monday night both want last week's cut sitting above them, and
            // the one day it must NOT appear — the live football Sunday — is
            // held out by the record's own skipDays, not by a rule here.
            // Tomorrow and later stay clear.
            const recapTopCard = (league: LeagueData) => isPast || isToday
              ? (
                <LeagueRecapCard
                  sport={league.sport}
                  date={selectedDate}
                  lastPlayedDate={league.games.length ? null : league.previousGameDay?.date}
                  reserveSlot={reserveRecapSlot}
                  onShowPlayoffs={bracketPillDue && league.sport === "mlb"
                    ? (tab) => { setPlayoffPictureTab(tab); setPlayoffPictureOpen(true); }
                    : null}
                  onPlayList={playNewsVideo}
                />
              )
              : undefined;
            const swapPropsForSlot = (idx: number) => ({
              swappableOptions: switcherOptions,
              // `idx` is the raw slot (0-4), but empty slots collapse, so the
              // column number is the position among the rendered entries.
              shownElsewhere: slotEntries
                .map((e, i) => ({ sport: e.league.sport, col: i + 1, slotIdx: e.slotIdx }))
                .filter((e) => e.slotIdx !== idx)
                .map(({ sport, col }) => ({ sport, col })),
              onSwapLeague: (s: Sport | "empty" | undefined) => setSlotLeague(idx, s),
              // An Auto column that Best of yesterday took over: Auto IS that
              // column today, so it carries the "· default" mark.
              autoSport: selectedSlotLeagues[idx] === undefined
                && slotEntries.some((e) => e.slotIdx === idx && e.league.sport === "best")
                ? "best" as Sport
                : autoSlotSports[idx],
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
            const showWcBanner = prefsHydrated
              && authSettled
              && wcActive
              && !displayedSports.includes("fifa")
              && !prefs.wcBannerDismissed;
            const wcBanner = showWcBanner ? (
              <div
                className="relative mt-6 mb-3 rounded-lg px-3 py-2 pr-10 flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}
                // role="status" so this dismissible in-flow banner announces itself
                // to screen readers without stealing focus — matching its structural
                // twin the kickoff banner below, the ratings/news notices above, and
                // the "same shape as the World Cup banner … role=status" convention
                // spelled out where those notices render. This banner (the pattern's
                // namesake) was the one that never carried the attribute; inert at
                // load like every live region, it only speaks if the banner appears
                // dynamically — the exact behavior the kickoff twin already has.
                role="status"
              >
                <span className="text-sm" style={{ color: "var(--text)" }}>
                  <span aria-hidden="true">⚽ </span>The 2026 World Cup is on — every match, spoiler-free.
                </span>
                {firstEmptySlot !== undefined ? (
                  <button
                    type="button"
                    onClick={() => setSlotLeague(firstEmptySlot, "fifa")}
                    data-umami-event="wc-banner-add-empty-slot"
                    className="text-sm font-medium px-3 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    Add the World Cup column
                  </button>
                ) : !wcReplaceOpen ? (
                  <button
                    type="button"
                    onClick={() => setWcReplaceOpen(true)}
                    data-umami-event="wc-banner-open-replace-picker"
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
                        type="button"
                        key={entry.slotIdx}
                        onClick={() => { setSlotLeague(entry.slotIdx, "fifa"); setWcReplaceOpen(false); }}
                        data-umami-event={`wc-banner-replace-${entry.league.sport}`}
                        className="text-sm font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                        style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        // aria-label mirrors the title so the button's action reaches
                        // screen readers too — in focus mode a user lands on a bare
                        // "NBA"/"MLB" with no cue that activating it replaces that column.
                        aria-label={`Show the World Cup instead of ${entry.league.label}`}
                        title={`Show the World Cup instead of ${entry.league.label}`}
                      >
                        {entry.league.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWcReplaceOpen(false)}
                      data-umami-event="wc-banner-cancel-replace"
                      className="text-sm px-1.5 py-1 cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      title="Cancel"
                    >
                      Cancel
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => updatePrefs({ wcBannerDismissed: true })}
                  data-umami-event="wc-banner-dismiss"
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

            // Season-kickoff banner (Jacob 8/8): the same slim one-line shape as
            // the World Cup banner, but driven by league config instead of a
            // hard-coded sport, so every future season opener gets it for free.
            // Shows in the days before a league starts, on the day itself, and
            // for a few days after (weekend-only users). It shows ONCE: a ✕
            // retires the banner for good, whichever league is next (Jacob 9/5:
            // "banner should only popup once total. not a second reminder").
            // Never renders alongside the World Cup banner — one announcement.
            const showKickoffBanner = KICKOFF_BANNER_ENABLED
              && prefsHydrated
              && !showWcBanner
              && kickoff !== null
              && !displayedSports.includes(kickoff.config.sport)
              // displayedSports comes from the FETCHED board, which lands a few
              // frames after prefs do — so a user who already pinned the league
              // still saw a brief flash of "add it" on reload. The slot prefs
              // are synchronous, so check those too and the flash has no window
              // to happen in.
              && !selectedSlotLeagues.includes(kickoff.config.sport)
              // Any dismissal on record retires the whole family — this is a
              // one-time heads-up, not a reminder that returns with the next
              // opener. Replaced the 7-day snooze on 9/5.
              && !(prefs.kickoffBannersDismissed ?? []).length
              // Wait for the account reconcile: on a second device the local
              // blob paints first and the server copy — which holds the
              // dismissal — lands 1-3 s later, so a banner dismissed elsewhere
              // flashed here. authSettled is capped by PICKER_AUTH_GRACE_MS.
              && authSettled;
            const kickoffAddLabel = kickoff ? `Add the ${kickoff.config.label} column` : "";
            const kickoffBanner = showKickoffBanner && kickoff ? (
              <div
                className="relative mt-6 mb-3 rounded-lg px-3 py-2 pr-10 flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}
                role="status"
              >
                <span className="text-sm" style={{ color: "var(--text)" }}>
                  <span aria-hidden="true">{sportGlyph(kickoff.config.sport)} </span>
                  {kickoffMessage(kickoff)}
                </span>
                {firstEmptySlot !== undefined ? (
                  <button
                    type="button"
                    onClick={() => setSlotLeague(firstEmptySlot, kickoff.config.sport)}
                    data-umami-event={`kickoff-banner-add-empty-slot-${kickoff.config.sport}`}
                    className="text-sm font-medium px-3 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    {kickoffAddLabel}
                  </button>
                ) : !kickoffReplaceOpen ? (
                  <button
                    type="button"
                    onClick={() => setKickoffReplaceOpen(true)}
                    data-umami-event={`kickoff-banner-open-replace-picker-${kickoff.config.sport}`}
                    className="text-sm font-medium px-3 py-1 rounded-md cursor-pointer transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    {kickoffAddLabel}
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>Replace:</span>
                    {slotEntries.map((entry) => (
                      <button
                        type="button"
                        key={entry.slotIdx}
                        onClick={() => { setSlotLeague(entry.slotIdx, kickoff.config.sport); setKickoffReplaceOpen(false); }}
                        data-umami-event={`kickoff-banner-replace-${entry.league.sport}`}
                        className="text-sm font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                        style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        // aria-label mirrors the title so the button's action reaches
                        // screen readers too — in focus mode a user lands on a bare
                        // league label with no cue that activating it replaces that column.
                        aria-label={`Show ${kickoff.config.label} instead of ${entry.league.label}`}
                        title={`Show ${kickoff.config.label} instead of ${entry.league.label}`}
                      >
                        {entry.league.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setKickoffReplaceOpen(false)}
                      data-umami-event="kickoff-banner-cancel-replace"
                      className="text-sm px-1.5 py-1 cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      title="Cancel"
                    >
                      Cancel
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => updatePrefs({
                    kickoffBannersDismissed: [...(prefs.kickoffBannersDismissed ?? []), kickoff.seasonKey].slice(-12),
                  })}
                  data-umami-event={`kickoff-banner-dismiss-${kickoff.config.sport}`}
                  aria-label={`Dismiss ${kickoff.config.label} banner`}
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

            // At most one banner occupies the strip above the board.
            const topBanner = wcBanner ?? kickoffBanner;

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
                {topBanner}
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
                      {...crossDayProps(entry.league)}
                      showFinalSeparator
                      {...swapPropsForSlot(entry.slotIdx)}
                      onCycleLeague={cycleForEntry(entry)}
                      widthClassName={colWidthClass}
                      condense={singleColumn}
                      footer={entry.league.sport === "fifa" && worldCupActive ? <WorldCupMattersCard date={selectedDate} /> : undefined}
                      topCard={recapTopCard(entry.league)}
                    />
                  ))}
                  {addButton}
                </div>
                </>
              );
            }

            return (
              <>
              {topBanner}
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
                    {...crossDayProps(entry.league)}
                    {...swapPropsForSlot(entry.slotIdx)}
                    onCycleLeague={cycleForEntry(entry)}
                    widthClassName={colWidthClass}
                    condense={singleColumn}
                    footer={entry.league.sport === "fifa" && worldCupActive ? <WorldCupMattersCard date={selectedDate} /> : undefined}
                    topCard={recapTopCard(entry.league)}
                  />
                ))}
                {addButton}
              </div>
              </>
            );
          })()
        )}
      </main>

      <footer ref={footerRef} className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)_+_5rem)] sm:pb-4 text-center text-xs flex flex-col items-center gap-2" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        {/* Keep the homepage keyword H1 without making the app footer read like a
            landing page. /worldcup already has a visible H1, so this demotes
            there to avoid duplicate top-level headings. */}
        {(() => {
          const Heading = worldCupHub ? "h2" : "h1";
          return <Heading className="sr-only">Catch up on games without spoilers. Spoiler-free sports scores and highlights.</Heading>;
        })()}

        {/* ONE footer row (Jacob 7/14; reordered 9/25): About · FAQ · Contact ·
            Feedback · Settings · Privacy · Guides. The row is ~340px wide, so on
            a 320px phone it wraps to two lines rather than dropping an item.
            `relative` anchors the Guides panel, which opens ABOVE the row
            (absolute) so opening it never wraps the row. */}
        <div className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a href="/about" className="underline underline-offset-2 hover:opacity-80" style={{ color: "var(--text-muted)" }}>About</a>
          <a href="/faq" className="underline underline-offset-2 hover:opacity-80" style={{ color: "var(--text-muted)" }}>FAQ</a>
          <a href="/contact" className="underline underline-offset-2 hover:opacity-80" style={{ color: "var(--text-muted)" }}>Contact</a>
          <FeedbackBox openSignal={feedbackSignal} prefill={feedbackPrefill} />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="underline underline-offset-2 cursor-pointer hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Settings
          </button>
          <a href="/privacy" className="underline underline-offset-2 hover:opacity-80" style={{ color: "var(--text-muted)" }}>Privacy</a>
          {/* Guides = the SEO copy + internal-link graph, rolled up behind a
              disclosure. Google renders and indexes content inside collapsed
              <details>, and plain <a href> (not next/link) is what the crawler
              needs to follow the routes. */}
          <details>
            <summary className="cursor-pointer select-none underline underline-offset-2 marker:content-none [&::-webkit-details-marker]:hidden" style={{ color: "var(--text-muted)" }}>
              Guides
            </summary>
            {/* Opaque --bg, not --bg-card: in dark mode --bg-card is
                rgba(255,255,255,0.05), so this panel was 95% see-through and
                the game cards it opens over showed straight through the copy
                (unreadable — Jacob 8/22). z-50 matches the app's other
                popovers (news source filter, league swap menu); at z-20 the
                sticky league rows (z-30) painted over the panel as well. */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-[min(42rem,90vw)] max-h-[60vh] overflow-y-auto text-left text-xs leading-relaxed space-y-2 z-50 rounded-lg p-3 shadow-lg" style={{ color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)" }}>
            {/* Headings, sections, a list and a dated <time> (2026-09-25): the
                usegrowhero scan reads only /, /today, /tomorrow and /yesterday,
                all this same shell with the games still loading, and found no
                H2/H3, no <section>, no FAQ, no list and no date on any of them.
                They all live inside this collapsed panel, so the board itself
                looks the same. The answers match /faq. */}
            <section aria-labelledby="about-hidescore" className="space-y-2">
            <h2 id="about-hidescore" className="font-semibold" style={{ color: "var(--text)" }}>What is HideScore?</h2>
            <p>
              HideScore is the spoiler-free way to follow sports. Check scores for the NBA, NFL, NHL,
              MLB, MLS, the Premier League, La Liga, Serie A, the Bundesliga, Ligue 1, the Champions
              League, the 2026 World Cup and golf without ever seeing who won — no score or result
              is written on the board at all.
            </p>
            <p>
              Before you commit to a replay, switch on our competitiveness rating and it tells you
              whether a game was a blowout or an instant classic, so you can watch the best sports
              highlights without spoilers and skip the duds — all without learning the final score.
            </p>
            </section>
            <section id="faq" aria-labelledby="about-faq" className="space-y-2">
            <h2 id="about-faq" className="font-semibold" style={{ color: "var(--text)" }}>Frequently asked questions</h2>
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Is HideScore free?</h3>
            <p>
              Yes. It is free, with no ads, and you do not need an account. It works in any browser and
              as an iPhone or Android app.
            </p>
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Which sports does HideScore cover?</h3>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>NBA, WNBA, NFL, MLB, NHL, and college football and basketball</li>
              <li>Soccer: the Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1, MLS and Liga MX</li>
              <li>Golf, tennis, F1, UFC, cricket, chess and poker</li>
            </ul>
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Can I tell if a game is worth watching?</h3>
            <p>
              Yes. Turn on game ratings in Settings. They show how close or exciting a finished game
              was, without naming the score or the winner.
            </p>
            </section>
            <p>
              It&apos;s free, has no tracking cookies, and works in any browser or as an iPhone or Android app. Jump to{" "}
              <a href="/today" style={{ textDecoration: "underline" }}>today&apos;s games</a>,{" "}
              <a href="/tomorrow" style={{ textDecoration: "underline" }}>tomorrow&apos;s schedule</a>,{" "}
              <a href="/yesterday" style={{ textDecoration: "underline" }}>yesterday&apos;s results</a>, the{" "}
              <a href="/worldcup" style={{ textDecoration: "underline" }}>2026 World Cup hub</a>, or the{" "}
              <a href="/spoiler-free-sports" style={{ textDecoration: "underline" }}>spoiler-free sports guide</a>,{" "}
              <a href="/no-spoiler-scores" style={{ textDecoration: "underline" }}>no-spoiler scores</a>,{" "}
              <a href="/how-to-watch-sports-highlights-without-spoilers" style={{ textDecoration: "underline" }}>how to watch sports highlights without spoilers</a>,{" "}
              <a href="/watch-sports-highlights-without-spoilers" style={{ textDecoration: "underline" }}>spoiler-free highlights</a>,{" "}
              <a href="/watch" style={{ textDecoration: "underline" }}>watch any YouTube link without spoilers</a>,{" "}
              <a href="/mlb-highlights-without-spoilers" style={{ textDecoration: "underline" }}>MLB highlights</a>,{" "}
              <a href="/nfl-highlights-without-spoilers" style={{ textDecoration: "underline" }}>NFL highlights</a>,{" "}
              <a href="/nhl-highlights-without-spoilers" style={{ textDecoration: "underline" }}>NHL highlights</a>,{" "}
              <a href="/nba-highlights-without-spoilers" style={{ textDecoration: "underline" }}>NBA highlights</a>,{" "}
              <a href="/college-football-highlights-without-spoilers" style={{ textDecoration: "underline" }}>college football highlights</a>, or{" "}
              <a href="/soccer-highlights-without-spoilers" style={{ textDecoration: "underline" }}>soccer highlights</a> — including the{" "}
              <a href="/premier-league-without-spoilers" style={{ textDecoration: "underline" }}>Premier League</a>,{" "}
              <a href="/champions-league-without-spoilers" style={{ textDecoration: "underline" }}>Champions League</a>,{" "}
              <a href="/la-liga-without-spoilers" style={{ textDecoration: "underline" }}>La Liga</a>,{" "}
              <a href="/mls-highlights-without-spoilers" style={{ textDecoration: "underline" }}>MLS</a>,{" "}
              <a href="/liga-mx-scores-without-spoilers" style={{ textDecoration: "underline" }}>Liga MX</a> and{" "}
              <a href="/cricket-highlights-without-spoilers" style={{ textDecoration: "underline" }}>cricket</a> — plus spoiler-free{" "}
              <a href="/nba-scores-without-spoilers" style={{ textDecoration: "underline" }}>NBA scores</a>,{" "}
              <a href="/nhl-scores-without-spoilers" style={{ textDecoration: "underline" }}>NHL scores</a>,{" "}
              <a href="/f1-without-spoilers" style={{ textDecoration: "underline" }}>F1</a> and{" "}
              <a href="/ufc-results-without-spoilers" style={{ textDecoration: "underline" }}>UFC</a>, or the{" "}
              <a href="/redzone-for-every-sport" style={{ textDecoration: "underline" }}>RedZone-style view for every sport</a>. Compare us with the other{" "}
              <a href="/best-spoiler-free-sports-sites" style={{ textDecoration: "underline" }}>spoiler-free sports apps</a>, or see the{" "}
              <a href="/faq" style={{ textDecoration: "underline" }}>FAQ</a>. Read our{" "}
              <a href="/privacy" style={{ textDecoration: "underline" }}>privacy policy</a> to see how little we collect.
            </p>
            {BUILT_ON && (
              <p>
                Updated <time dateTime={BUILT_ON}>{formatBuiltOn(BUILT_ON)}</time>
              </p>
            )}
          </div>
          </details>
          {/* The "App Store" and "Google Play" text links used to sit here.
              Both are gone (Jacob 8/24): each said exactly what the badge below
              already says, and of the two the badge is the better surface. */}
        </div>

        {/* Compact custom Apple-logo pill — superseded by the real App Store
                badge below. Kept commented in case we want a smaller text-and-
                glyph version back.
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
        {/* Store badges, both at the standard 40px height. The row is hidden
                inside the native shell (already installed) and for any account
                whose history shows iPhone- OR Android-app use — that account has the app,
                so neither badge is an offer worth making. That is the same
                audience test the old App Store text link carried; the Play
                badge now shares it, because pushing Android at a known iPhone
                app user is the one case Jacob called out.

                The Play badge alone can be dismissed. The control renders only
                when signed in, since the flag rides the prefs blob and only a
                signed-in account pushes that blob to the server — dismissing
                while signed out would look identical but silently stay on one
                device. Signed-out visitors therefore see both badges and no
                dismiss control, which is the intended default.

                Neither badge waits on state that lands after the first paint.
                The row is hidden pre-paint by .hs-store-badges/.hs-has-app for a
                cached app user, and the Play badge by .hs-play-dismissed for a
                dismissed one — see the inline scripts in layout.tsx. */}
        {!isNativeApp && appAccountUse !== true && (
          <div className="hs-store-badges flex items-center justify-center gap-1 flex-wrap">
            <a
              href="https://apps.apple.com/app/hidescore/id6766885311"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download HideScore on the App Store"
              className="inline-block transition-opacity hover:opacity-80"
              data-umami-event="install-appstore-badge"
            >
              <img src="/app-store-badge.svg" alt="Download on the App Store" height={40} className="block h-10 w-auto" />
            </a>
            {!(prefsHydrated && prefs.playBadgeDismissed) && (
              /* relative + an absolutely placed dismiss control, the same shape
                 the World Cup banner uses. In-flow it would push the pair off
                 centre by half its width, which read as a misaligned footer.

                 Rendered before prefs hydrate, not after: gating on prefsHydrated
                 kept it out of the static HTML, so it popped in ~120ms after the
                 App Store badge and dragged the pair sideways on every load. The
                 dismissed case is covered pre-paint by .hs-play-dismissed. */
              <span className="hs-play-badge relative inline-flex items-center">
                <a
                  href="https://play.google.com/store/apps/details?id=com.jacobhl.hidescore"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Get HideScore on Google Play"
                  className="inline-block transition-opacity hover:opacity-80"
                  data-umami-event="install-googleplay-badge"
                >
                  <img src="/google-play-badge.png" alt="Get it on Google Play" width={155} height={59.5}
                       /* Google's own artwork, unmodified. Its 646x250 canvas carries 41px
                          of required clear space on every side, so the visible pill is 168 of
                          250. Rendering the whole file at 59.5px puts that pill at exactly 40,
                          matching the App Store badge beside it; dropping it in at 40 like a
                          normal badge would shrink the pill to 27 and make Play look like the
                          lesser option. */
                       className="block w-auto h-[59.5px]" />
                </a>
                {isSignedIn && (
                  <button
                    type="button"
                    onClick={() => updatePrefs({ playBadgeDismissed: true })}
                    data-umami-event="play-badge-dismiss"
                    aria-label="Hide the Google Play badge"
                    title="Hide"
                    className="absolute left-full -ml-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
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
          // < sm: lifted clear of the fixed bottom tab bar (h-14 + safe-area),
          // same offset as the scroll-to-top button. sm+: no tab bar, 1.5rem.
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] sm:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg animate-fade-in max-w-xs w-[calc(100%-2rem)]"
          style={{ background: "linear-gradient(var(--bg-card), var(--bg-card)), var(--bg)", border: "1px solid var(--border)" }}
        >
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Favorites saved to this browser
              </p>
              <button
                type="button"
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
              type="button"
              onClick={copyFavLink}
              className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {favToastCopied ? "Copied!" : "Copy favorites link"}
            </button>
          </div>
        </div>
      )}

      {showLeaguePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={skipLeaguePicker}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            ref={leaguePickerRef}
            // tabIndex=-1 makes the container programmatically focusable (see the
            // focus-management effect) without joining the tab order; outline
            // none suppresses the ring since it's focused only to seat SR focus.
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="league-picker-title"
            // Capped to the viewport (the backdrop's p-4 is the 2rem) and laid
            // out as a column so the league grid — not the dialog — absorbs the
            // overflow. Without this the modal simply grew past a short window
            // and, because the backdrop is a non-scrolling fixed layer, the
            // "Use defaults" / confirm row below was unreachable: Escape or a
            // backdrop click were the only ways out (Jacob 8/23, small Firefox
            // window). Worse on desktop than phone, since pickerMax = slotCount
            // offers five slots and a longer list on a wide viewport.
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl flex flex-col max-h-[calc(100dvh-2rem)]"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2 shrink-0">
              <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none" aria-hidden>
                <rect width="32" height="32" rx="6" className="header-logo-bg" />
                <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
              </svg>
            </div>
            <h3 id="league-picker-title" className="font-bold text-lg mb-1 text-center" style={{ color: "var(--text)" }}>Pick your leagues</h3>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
              Choose up to <strong>{pickerMax} leagues</strong> for your score columns.<br />You can change these anytime in Settings.
            </p>
            {/* Popularity-ordered, soccer grouped at the bottom (pickerOptions).
                Two rules keep this list STILL while you tap through it, which is
                the whole complaint (Jacob 8/9): nothing re-sorts on selection,
                and the order badge lives in a fixed-width slot that is present
                (blank) on every pill — the old `1. ` prefix grew the pill on
                click, which reflowed the wrap and made unrelated pills jump. */}
            {/* The only scrolling part: min-h-0 lets this flex child shrink
                below its content height (without it the grid keeps its natural
                size and the cap above does nothing), and the negative-margin /
                padding pair keeps the pills' focus rings from being clipped by
                the new overflow box. */}
            <div className="flex flex-wrap justify-center gap-2 mb-4 overflow-y-auto min-h-0 -mx-1 px-1">
              {pickerOptions.map((o) => {
                const idx = pickerSel.indexOf(o.sport);
                const on = idx >= 0;
                const full = pickerSel.length >= pickerMax && !on;
                const demoOption = demoPickerLabels?.get(o.sport);
                return (
                  <button
                    key={o.sport}
                    type="button"
                    disabled={full}
                    onClick={() => togglePick(o.sport)}
                    // Multi-select toggle: expose the picked state to assistive
                    // tech, since it's otherwise conveyed only by the accent
                    // background (and a "1. " number prefix). Matches the
                    // aria-pressed pattern every other toggle pill in the app
                    // already uses (view tabs, the news reveal/text-post pills,
                    // the World Cup groups band/day pills) — this picker was the
                    // lone group missing it.
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={on
                      ? { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" }
                      : { background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
                  >
                    {/* Fixed 1rem slot, reserved whether or not this pill is
                        picked, so selecting one never changes any pill's width. */}
                    <span aria-hidden className="inline-block w-4 shrink-0 text-center text-xs font-bold tabular-nums">
                      {on ? idx + 1 : ""}
                    </span>
                    {/* The mark always sits on a white chip. Most of these are
                        dark-on-transparent, so on the accent-blue selected fill
                        they'd disappear; knocking them to solid white instead
                        turned filled marks (MLB) into a featureless blob. The
                        chip keeps every logo legible and identical in both
                        states, so selecting a pill changes only its background. */}
                    <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full shrink-0 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={demoOption?.logo ?? LEAGUE_LOGO[o.sport]}
                        alt=""
                        width={16}
                        height={16}
                        loading="lazy"
                        decoding="async"
                        className="w-[16px] h-[16px] object-contain"
                        draggable={false}
                        // Remote ESPN/Wikimedia mark: a blocked hotlink would leave
                        // the browser's broken-image glyph. Collapse it and let the
                        // pill read as text, matching every other logo in the app.
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </span>
                    <span>{demoOption?.label ?? o.label}</span>
                    {/* Start dates dropped here on purpose (Jacob 8/9): six
                        "· starts Aug 21" tails made the grid unreadable and are
                        noise at signup. The kickoff banner still announces them
                        and the column switcher still shows them. "offseason"
                        stays — that one changes whether the column has games. */}
                    {o.offseason && <em className="font-normal text-xs" style={{ color: on ? "inherit" : "var(--text-muted)" }}>offseason</em>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={skipLeaguePicker}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Use defaults
              </button>
              <button
                type="button"
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

      {/* Undo-close pill. Deliberately says nothing about WHAT was closed — a
          highlight's title is a spoiler (that's why VideoModal masks it), so the
          label stays generic. Quiet on purpose: no accent fill, small text — it
          is an undo, not a call to action.
          < sm: centred for thumb reach, lifted clear of the bottom tab bar
          (same 4.75rem + safe-area as the scroll-to-top button), and stacked
          above the favorites toast (~6.4rem tall) when both show. Before this
          it sat at bottom-6 and covered the Ratings tab (9/14).
          sm+: bottom-right corner, right: 2rem like the scroll-to-top button,
          and stacked above it (44px + 12px gap) whenever that button is
          showing; otherwise it takes the button's slot, which already clears
          the "Keys" chip in the corner and rides above the footer via
          scrollTopLift. */}
      {reopenVideo && !videoModal && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed z-50 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-8 ${showFavToast ? "bottom-[calc(env(safe-area-inset-bottom)+11.75rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]"} sm:bottom-(--reopen-desktop-bottom) rounded-full shadow-md animate-fade-in flex items-center gap-0.5 pl-1 pr-0.5 py-0.5`}
          style={{
            background: "linear-gradient(var(--bg-card), var(--bg-card)), var(--bg)",
            border: "1px solid var(--border)",
            ["--reopen-desktop-bottom" as string]: showScrollTop
              ? `calc(max(calc(env(safe-area-inset-bottom) + 4.75rem), ${scrollTopLift}px) + 3.5rem)`
              : `max(calc(env(safe-area-inset-bottom) + 4.75rem), ${scrollTopLift}px)`,
          }}
        >
          <button
            type="button"
            onClick={reopenVideoModal}
            className="flex items-center gap-1.5 rounded-full px-3 min-h-[44px] sm:min-h-[36px] text-xs font-medium cursor-pointer"
            style={{ color: "var(--text)" }}
            aria-label="Reopen what you just closed"
          >
            {/* \uFE0E forces text presentation — bare U+21A9 renders as a boxed emoji arrow on macOS/iOS. */}
            <span aria-hidden="true" style={{ color: "var(--accent)" }}>{"\u21A9\uFE0E"}</span>
            Reopen
          </button>
          <button
            type="button"
            onClick={clearReopen}
            className="px-2 min-h-[44px] sm:min-h-[36px] min-w-[32px] text-[11px] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Dismiss"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {videoModal && (
        <VideoModal
          videoId={videoModal.videoId}
          fallbackUrl={videoModal.fallbackUrl}
          playbackUrl={videoModal.playbackUrl}
          imageUrl={videoModal.imageUrl}
          images={videoModal.images}
          embedUrl={videoModal.embedUrl}
          poster={videoModal.poster}
          sourceLabel={videoModal.sourceLabel}
          headline={videoModal.headline}
          byline={videoModal.byline}
          published={videoModal.published}
          body={videoModal.body}
          shareCard={videoModal.shareCard}
          maskVideoTitle={(prefs.maskVideoTitle ?? false) || !!videoModal.forceTitleMask}
          youtubeNativeControls={prefs.youtubeNativeControls ?? true}
          seekControl={prefs.videoSeekControl ?? "both"}
          seekFill={prefs.videoSeekFill ?? "off"}
          allowEnd={prefs.videoAllowEnd ?? false}
          warnHalfway={prefs.videoWarnHalfway ?? false}
          onPrev={videoModal.siblings && (videoModal.sibIndex ?? 0) > 0 ? () => stepVideo(-1) : undefined}
          onNext={videoModal.siblings && (videoModal.sibIndex ?? 0) < videoModal.siblings.length - 1 ? () => stepVideo(1) : undefined}
          alternates={videoModal.alternates}
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
          reminderLinkTemplate={prefs.reminderLinkTemplate}
        />
      )}

      {/* Event tiles get the same tap-for-details affordance the score cards
          have. `fight` is set when a single UFC bout card was tapped. */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent.event}
          fight={detailEvent.fight}
          leagueLabel={detailEvent.leagueLabel}
          onClose={() => setDetailEvent(null)}
          reminderLinkTemplate={prefs.reminderLinkTemplate}
        />
      )}

      {groupsOpen && (
        <WorldCupGroupsModal
          highlightGroup={groupsHighlight}
          selectedDate={selectedDate}
          onClose={() => { setGroupsOpen(false); setGroupsHighlight(null); }}
        />
      )}

      {slamBracketOpen && <SlamBracketModal onClose={() => setSlamBracketOpen(false)} />}

      {playoffPictureOpen && <PlayoffPictureModal initialTab={playoffPictureTab} onClose={() => setPlayoffPictureOpen(false)} />}

      {/* Bottom-right keyboard guide. Sits outside every modal so it can say
          what the post-modal keys are WHILE that modal is open (Jacob 9/8). */}
      <ControlsHint
        enabled={!prefs.hideControlsHint}
        onDismiss={() => updatePrefs({ hideControlsHint: true })}
        modalOpen={!!videoModal}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        updatePrefs={updatePrefs}
        resolvedTheme={resolvedTheme}
        leagueOptions={settingsLeagueOptions}
        onRequestLeague={() => { setFeedbackPrefill(FEEDBACK_LEAGUE_PREFILL); setFeedbackSignal((n) => n + 1); }}
        onOpenFeedback={() => { setFeedbackPrefill(""); setFeedbackSignal((n) => n + 1); }}
        teamLeagueOptions={teamLeagueOptions}
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
        // opacity-0 + pointer-events-none hides it from sight and the mouse, but
        // a plain <button> stays in the tab order — so when it's hidden, keyboard
        // users would still Tab onto an invisible control (WCAG 2.4.3/4.1.2).
        // Pull it out of the tab order and hide it from the a11y tree while off.
        tabIndex={showScrollTop ? 0 : -1}
        aria-hidden={!showScrollTop}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className={`monkey-toggle fixed z-40 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 shadow-lg ${showScrollTop ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{
          right: "2rem",
          // Lifted clear of the fixed bottom tab bar (h-14 + safe-area) so
          // the two don't overlap in the corner. Once the footer comes into
          // view, scrollTopLift raises it further so it rides above the footer
          // border rather than sitting on the footer text.
          bottom: `max(calc(env(safe-area-inset-bottom) + 4.75rem), ${scrollTopLift}px)`,
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
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <div className="sm:hidden">
        <BottomTabBar viewMode={viewMode} onChange={handleViewModeClick} />
      </div>
    </div>
  );
}
