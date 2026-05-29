"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect warns in SSR; on the client we want the sync measurement.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Game, LeagueData, Sport, Team } from "@/lib/types";
import { displayShortName, loadBigInningSchedule, BigInningSchedule } from "@/lib/espn";
import { getGolfSubtitle } from "@/lib/golf";
import { isDemoModeActive } from "@/lib/demoMode";
import GameCard from "./GameCard";
import GolfLeaderboard from "./GolfLeaderboard";
import TeamView from "./TeamView";

interface LeagueColumnProps {
  league: LeagueData;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  isPastDate: boolean;
  isToday?: boolean;
  sortByMatchups?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string) => void;
  selectedDate: string; // YYYYMMDD
  section?: "upcoming" | "finished"; // split rendering for cross-column Final separator
  showFinalSeparator?: boolean; // inline "Final" divider between live/pre and post games
  // 3rd league slot swapping
  swappableOptions?: { sport: Sport; label: string }[];
  selectedThirdLeague?: Sport | "empty";
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // Sports shown in the other columns — dropdown greys these (still selectable).
  shownElsewhere?: Sport[];
  // Manual retry for the "Schedule unavailable" empty state. Pull-to-refresh
  // covers mobile; this is the desktop-equivalent path.
  onRetry?: () => void;
  // Slot is explicitly empty — render just the header + dropdown so the user
  // can switch back; skip everything below.
  isEmpty?: boolean;
  // 0/1/2. Used by the drag handle to identify the source slot on drag start;
  // the parent owns reorder logic and writes the new slot order back to prefs.
  slotIdx?: number;
  onReorderSlots?: (fromIdx: number, toIdx: number) => void;
}

// DEV preview: force the Big Inning subtitle to render in the LIVE state
// regardless of the current ET clock, so the styling shows before tonight's
// scheduled start time. Set to false before shipping.
const FORCE_BIG_INNING_LIVE_PREVIEW = false;

// 2025-26 season playoff start dates (update each season)
const PLAYOFF_START_DATES: Record<string, { date: string; label: string; preDate?: string; preEndDate?: string; preLabel?: string }> = {
  nba: { date: "2026-04-18", label: "Playoffs", preDate: "2026-04-14", preEndDate: "2026-04-17", preLabel: "Play-in" },
  wnba: { date: "2026-09-14", label: "Playoffs" },
  nhl: { date: "2026-04-18", label: "Playoffs" },
  mlb: { date: "2026-10-06", label: "Postseason" },
  nfl: { date: "2027-01-09", label: "Playoffs" },
  ncaam: { date: "2026-03-17", label: "March Madness" },
};

// Strip generic "Stanley Cup Playoffs" / "NBA Playoffs" / "NCAA … Championship"
// prefix segments so a label like "Stanley Cup Playoffs - First Round" reads
// "First Round". Real round info (e.g. "East 1st Round" for NBA/NHL playoffs)
// gets preserved and joined with the game number when both are present.
const GENERIC_LABEL_SEGMENT = /^(?:stanley cup playoffs?|nba playoffs?|wnba playoffs?|nhl playoffs?|playoffs?|postseason|ncaa (?:men'?s|women'?s)?\s*basketball championship|ncaa basketball championship)$/i;

// Extract round + game info from ESPN's playoff headline.
// e.g. "East 1st Round - Game 7" → "East 1st Round · Game 7"
// e.g. "Stanley Cup Playoffs - First Round" → "First Round"
// e.g. "NCAA Men's Basketball Championship - National Championship" → "National Championship"
// ESPN sometimes tacks on "Nth Seed Game" as the last segment — strip that.
function shortenPlayoffLabel(headline: string): string {
  const parts = headline
    .split(" - ")
    .map(p => p.trim())
    .filter(p => p && !/^\d+(?:st|nd|rd|th)?\s+seed\s+game$/i.test(p))
    .filter(p => !GENERIC_LABEL_SEGMENT.test(p));
  if (!parts.length) return headline.trim();
  return parts.join(" · ");
}

interface SubtitleResult {
  tiers: string[];
  href?: string;
}

// Parse "9:00 PM" / "11:30 AM" into 24-hour {h, m}. Returns null on bad input.
function parseEtTime(s: string): { h: number; m: number } | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return { h, m: parseInt(m[2], 10) };
}

// Current ET wall-clock as {y,mo,d,h,m} via toLocaleString — works in any TZ.
function nowInEt(): { y: number; mo: number; d: number; h: number; m: number } {
  const s = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // s like "05/04/2026, 09:30" (or "05/04/2026, 24:30" on midnight in some locales)
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})/);
  if (!m) return { y: 0, mo: 0, d: 0, h: 0, m: 0 };
  return {
    y: +m[3],
    mo: +m[1],
    d: +m[2],
    h: +m[4] % 24,
    m: +m[5],
  };
}

function getPlayoffSubtitle(
  sport: Sport,
  selectedDate: string,
  games: Game[] | undefined,
  bigInningSchedule: BigInningSchedule | null,
): SubtitleResult | null {
  const config = PLAYOFF_START_DATES[sport];
  if (!config) return null;
  const y = +selectedDate.slice(0, 4);
  const m = +selectedDate.slice(4, 6) - 1;
  const d = +selectedDate.slice(6, 8);
  const viewDate = new Date(y, m, d, 12, 0, 0); // noon to match playoffDate
  const playoffDate = new Date(config.date + "T12:00:00");
  const diff = playoffDate.getTime() - viewDate.getTime();

  // Playoffs already started — show round + game number from game data
  if (diff <= 0) {
    if (!games?.length) return null;
    const label = games.find(g => g.playoffLabel)?.playoffLabel;
    if (!label) return null;
    const text = shortenPlayoffLabel(label);
    // Compact fallback: "Game 7" → "G7" so a long round + game tag still fits
    // narrow columns when the full version overflows.
    const short = text.replace(/Game (\d+)/g, "G$1");
    const tiers = short !== text ? [text, short] : [text];
    return { tiers };
  }

  // MLB regular season: nod to MLB Network's nightly Big Inning whip-around
  // show in place of the (still-far-off) postseason countdown. Per-night
  // start times come from the schedule scraped daily by scripts/scrape-
  // big-inning.mjs. Only show the subtitle on dates the schedule lists
  // (Big Inning skips some days). LIVE treatment requires both: scheduled
  // start has passed within the last 3h AND ≥2 MLB games are currently in
  // progress — a proxy for "the whip-around actually has games to whip to".
  // 3h matches typical Big Inning runtime; a 2pm Saturday show ends ~5pm.
  // The real MLB Network HLS feed is auth-walled, so this combined
  // window+game-count heuristic is the most accurate signal we can read
  // anonymously.
  if (sport === "mlb" && bigInningSchedule) {
    // selectedDate is YYYYMMDD — schedule is keyed YYYY-MM-DD.
    const isoDate = `${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}`;
    const entry = bigInningSchedule[isoDate];
    if (!entry) return null;

    const parsed = parseEtTime(entry.timeET);
    const now = nowInEt();
    const todayYmd = now.y * 10000 + now.mo * 100 + now.d;
    const selectedYmd = +selectedDate;
    // Past day: the show is over, the scheduled time is meaningless. Hide.
    if (selectedYmd < todayYmd) return null;
    const isToday = selectedYmd === todayYmd;
    const minsSinceStart =
      parsed && isToday ? (now.h - parsed.h) * 60 + (now.m - parsed.m) : -1;
    const withinAirWindow = minsSinceStart >= 0 && minsSinceStart <= 180;
    const liveGameCount = (games ?? []).filter((g) => g.state === "in").length;
    const isLive = FORCE_BIG_INNING_LIVE_PREVIEW || (withinAirWindow && liveGameCount >= 2);

    if (isLive) {
      return {
        tiers: ["● Big Inning · LIVE", "● Big Inning live", "● Big Inning"],
        href: entry.selectionUrl ?? "https://www.mlb.com/network/live",
      };
    }
    // Past the 3h air window today: show ended, hide the subtitle entirely.
    // (A stale "Big Inning · 2:00 PM ET" at 6pm reads like an upcoming show.)
    if (isToday && minsSinceStart > 180) return null;
    // Show the scheduled time as plain italic (no link until we go live).
    return {
      tiers: [`Big Inning · ${entry.timeET} ET`, `Big Inning · ${entry.timeET}`, "Big Inning"],
    };
  }

  // Only flag the pre-playoff window (e.g. NBA play-in) DURING the window itself.
  // Outside it, fall through to the regular "playoffs start" countdown.
  if (config.preDate && config.preEndDate && config.preLabel) {
    const [py, pm, pd] = config.preDate.split("-").map(Number);
    const [ey, em, ed] = config.preEndDate.split("-").map(Number);
    const preDate = new Date(py, pm - 1, pd, 12, 0, 0);
    const preEndDate = new Date(ey, em - 1, ed, 12, 0, 0);
    if (viewDate.getTime() >= preDate.getTime() && viewDate.getTime() <= preEndDate.getTime()) {
      return { tiers: [`${config.preLabel} tournament`, config.preLabel] };
    }
  }

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days > 30) return null; // only show within 1 month
  const dd = playoffDate.getDate();
  const monthName = playoffDate.toLocaleDateString("en-US", { month: "short" });
  if (days === 1) {
    return { tiers: [`${config.label} start tomorrow`] };
  }
  const base = `${config.label} start ${monthName} ${dd}`;
  const baseShort = `${config.label} ${monthName} ${dd}`;
  return { tiers: [`${base} (${days} days)`, `${baseShort} (${days}d)`, baseShort] };
}

// Module-level cache so every column shares one fetch.
let cachedBigInningSchedule: BigInningSchedule | null = null;

function PlayoffSubtitle({ sport, selectedDate, games }: { sport: Sport; selectedDate: string; games?: Game[] }) {
  if (isDemoModeActive()) return null;
  return <PlayoffSubtitleInner sport={sport} selectedDate={selectedDate} games={games} />;
}

function PlayoffSubtitleInner({ sport, selectedDate, games }: { sport: Sport; selectedDate: string; games?: Game[] }) {
  const ref = useRef<HTMLElement>(null);
  const [bigInningSchedule, setBigInningSchedule] = useState<BigInningSchedule | null>(cachedBigInningSchedule);

  // Lazy-load Big Inning schedule once per session. Only MLB columns need it,
  // but cheap enough to fetch unconditionally — the request is cached.
  useEffect(() => {
    if (sport !== "mlb" || cachedBigInningSchedule) return;
    let cancelled = false;
    loadBigInningSchedule().then((s) => {
      cachedBigInningSchedule = s;
      if (!cancelled) setBigInningSchedule(s);
    });
    return () => { cancelled = true; };
  }, [sport]);

  // The Big Inning subtitle decides "scheduled-time vs LIVE" based on the local
  // ET clock at render. Without a tick, a session sitting on the page through
  // the start time would never flip. Run a 60s tick ONLY while we're waiting
  // for that flip — MLB column, schedule loaded, today's entry exists, start
  // time not yet reached. Once the start time passes, this effect's dep flips
  // to false and the interval is cleared.
  const needsBigInningTick = (() => {
    if (FORCE_BIG_INNING_LIVE_PREVIEW) return false;
    if (sport !== "mlb" || !bigInningSchedule) return false;
    const isoDate = `${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}`;
    const entry = bigInningSchedule[isoDate];
    if (!entry) return false;
    const parsed = parseEtTime(entry.timeET);
    if (!parsed) return false;
    const now = nowInEt();
    const isToday =
      now.y === +selectedDate.slice(0, 4) &&
      now.mo === +selectedDate.slice(4, 6) &&
      now.d === +selectedDate.slice(6, 8);
    if (!isToday) return false;
    return now.h < parsed.h || (now.h === parsed.h && now.m < parsed.m);
  })();
  const [, bumpTick] = useState(0);
  useEffect(() => {
    if (!needsBigInningTick) return;
    const id = setInterval(() => bumpTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [needsBigInningTick]);

  const result = getPlayoffSubtitle(sport, selectedDate, games, bigInningSchedule);
  const tiers = result?.tiers ?? [];
  const href = result?.href;
  const tiersKey = tiers.join("|");
  const [tierIdx, setTierIdx] = useState(tiers.length ? tiers.length - 1 : 0);
  const [ready, setReady] = useState(false);

  // Pick the widest tier that still fits available width. One synchronous pass
  // via a hidden probe — avoids the render-measure-rerender stutter that made
  // "Play-in tournament" briefly flash before collapsing to "Play-in".
  const pickTier = () => {
    if (!tiers.length) return 0;
    const el = ref.current;
    if (!el) return tiers.length - 1;
    // The span lives in a flex-col items-center parent, so its own width shrinks
    // to its text content. Measure the parent (header wrapper) for the true
    // available width the subtitle can occupy.
    const host = el.parentElement ?? el;
    const cs = getComputedStyle(el);
    const hostCs = getComputedStyle(host);
    const padX = parseFloat(hostCs.paddingLeft || "0") + parseFloat(hostCs.paddingRight || "0");
    const available = host.clientWidth - padX;
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-style:${cs.fontStyle};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing};`;
    document.body.appendChild(probe);
    let chosen = tiers.length - 1;
    for (let i = 0; i < tiers.length; i++) {
      probe.textContent = tiers[i];
      const w = probe.getBoundingClientRect().width;
      if (w <= available - 2) { chosen = i; break; }
    }
    document.body.removeChild(probe);
    return chosen;
  };

  useIsoLayoutEffect(() => {
    setTierIdx(pickTier());
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiersKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTierIdx(pickTier()));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiersKey]);

  // Within PlayoffSubtitle, `href` is only set when Big Inning is live \u2014
  // safe trigger for the "green & clickable" live treatment that mirrors
  // the GameCard live-progress indicator.
  const isLive = !!href && tiers.length > 0;
  const baseCls = "text-[9px] sm:text-[10px] mt-0.5 whitespace-nowrap block max-w-full overflow-hidden text-center pr-0.5";
  const liveCls = `${baseCls} text-green-500 font-medium hover:text-green-400 transition-colors hover:underline`;
  const linkCls = `${baseCls} italic hover:underline transition-colors`;
  const spanCls = `${baseCls} italic`;
  const baseStyle = {
    visibility: ready || !tiers.length ? ("visible" as const) : ("hidden" as const),
    color: isLive ? undefined : (tiers.length ? "var(--text-muted)" : "transparent"),
  };
  const text = tiers.length ? tiers[tierIdx] : "\u00A0";
  // When live, peel the leading "\u25CF" off so we can animate just the dot.
  // The probe still measures the full string (including "\u25CF"), so layout
  // math stays accurate.
  const renderText = (t: string) => {
    if (isLive && t.startsWith("\u25CF")) {
      // Put the trailing space INSIDE the dot span. Since `.live-pulse-dot`
      // is `display: inline-block`, the parent's hover:underline won't
      // draw a line under the dot or the gap \u2014 only under the text that
      // follows.
      return <><span className="live-pulse-dot" aria-hidden="true">{"\u25CF\u00A0"}</span>{t.slice(2)}</>;
    }
    return t;
  };
  if (href && tiers.length) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={isLive ? liveCls : linkCls}
        style={baseStyle}
      >
        {renderText(text)}
      </a>
    );
  }
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={spanCls} style={baseStyle}>
      {renderText(text)}
    </span>
  );
}

// Italic round-wording subtitle for golf leagues — drops in where
// PlayoffSubtitle would for team sports. The subtitle is the single
// place round wording lives (the leaderboard card no longer repeats it),
// so it must render a value for every day of the tournament. When the
// tournament is mid-event we wrap the text in a link to the active
// streamer (PGA Tour Live / Peacock / etc.) — gives users a clickable
// "live" anchor even between groups when the card's green indicator
// is absent. Never link to ESPN leaderboard — that would spoil scores.
function GolfSubtitle({ league, selectedDate }: { league: LeagueData; selectedDate: string }) {
  const t = league.golfTournament;
  const text = t ? getGolfSubtitle(t, selectedDate) : null;
  const href =
    t && t.state === "in" && t.streamUrl ? t.streamUrl : null;
  const baseClass =
    "text-[9px] sm:text-[10px] italic mt-0.5 block max-w-full text-center leading-tight";
  if (!text) {
    return (
      <span
        className={`${baseClass} whitespace-nowrap overflow-hidden`}
        style={{ color: "transparent" }}
      >
        {"\u00A0"}
      </span>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} hover:underline transition-colors`}
        style={{ color: "var(--text-muted)" }}
      >
        {text}
      </a>
    );
  }
  return (
    <span className={baseClass} style={{ color: "var(--text-muted)" }}>
      {text}
    </span>
  );
}

function formatDateCompact(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  // Check if this date is tomorrow
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate()) {
    return "Tomorrow";
  }
  const dow = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dow} ${parseInt(m)}/${parseInt(d)}`;
}

export default function LeagueColumn({
  league,
  favoriteTeams,
  onToggleFavoriteTeam,
  showRatings,
  isPastDate,
  isToday,
  sortByMatchups,
  onPlayHighlight,
  onPlayEmbed,
  selectedDate,
  section,
  showFinalSeparator,
  swappableOptions,
  selectedThirdLeague,
  onSwapLeague,
  shownElsewhere,
  onRetry,
  isEmpty,
  slotIdx,
  onReorderSlots,
}: LeagueColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef<HTMLDivElement>(null);
  const [useAbbreviations, setUseAbbreviations] = useState(true); // start abbreviated, expand if room
  const [swapOpen, setSwapOpen] = useState(false);
  const [teamViewTeam, setTeamViewTeam] = useState<Team | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;
  const canDrag = onReorderSlots !== undefined && slotIdx !== undefined;

  // Reset team view when the column's league changes (e.g., swapped via dropdown).
  useEffect(() => { setTeamViewTeam(null); }, [league.sport, league.label]);

  // Close swap dropdown on outside click
  useEffect(() => {
    if (!swapOpen) return;
    const handler = (e: MouseEvent) => {
      if (swapRef.current && !swapRef.current.contains(e.target as Node)) {
        setSwapOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [swapOpen]);

  // Measure whether full names would fit in the available column width
  const checkIfFullNamesFit = () => {
    const el = columnRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      // Find a team-name cell to measure available width
      // The name sits in a flex container: [name] [star], inside a grid cell (1fr)
      const nameContainers = el.querySelectorAll(".team-name-container");
      if (!nameContainers.length) return;

      // Get the longest team name from the rendered games
      const allNames = league.games.flatMap(g => [
        displayShortName(g.awayTeam),
        displayShortName(g.homeTeam),
      ]);
      if (!allNames.length) return;

      // The name container's own row holds: logo + name + star + spacer + record.
      // Available width for the name = row width - everything-else. Read everything-else
      // from siblings of the first name container so the math stays in sync with the layout.
      const container = nameContainers[0] as HTMLElement;
      const row = container.parentElement;
      if (!row) return;
      const rowWidth = row.clientWidth;
      let occupied = 0;
      for (const child of Array.from(row.children)) {
        if (child === container) continue;
        // Skip the empty flex spacer — its width *is* the slack the name could grow into
        const el = child as HTMLElement;
        if (!el.textContent?.trim() && !el.querySelector("img,svg,button")) continue;
        occupied += el.getBoundingClientRect().width;
      }
      const gapPx = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap || "0") || 0;
      const totalGaps = gapPx * (row.children.length - 1);
      const availableWidth = rowWidth - occupied - totalGaps - 4; // 4px safety

      // Measure longest name using a hidden span
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:0.875rem;"; // text-sm = 14px
      document.body.appendChild(probe);
      let longestWidth = 0;
      for (const name of allNames) {
        probe.textContent = name;
        if (probe.offsetWidth > longestWidth) longestWidth = probe.offsetWidth;
      }
      document.body.removeChild(probe);

      setUseAbbreviations(longestWidth > availableWidth);
    });
  };

  // Re-check when games change
  useEffect(() => {
    checkIfFullNamesFit();
  }, [league.games]);

  // Re-check on resize
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => checkIfFullNamesFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [league.games]);

  const topMatchups = sortByMatchups ?? false;

  const getFavPriority = (game: Game) => {
    const ids = [game.homeTeam.id, game.awayTeam.id];
    let best = Infinity;
    for (const id of ids) {
      const idx = favoriteTeams.indexOf(id);
      if (idx !== -1 && idx < best) best = idx;
    }
    return best;
  };

  // Parse wins and losses from record string like "41-34"
  const getWins = (record: string): number => {
    const match = record.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };
  const getLosses = (record: string): number => {
    const match = record.match(/-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };
  const isWinningRecord = (record: string): boolean => getWins(record) > getLosses(record);

  // Matchup quality: both winning > one winning > neither; tiebreak by combined wins
  const getMatchupTier = (game: Game): number => {
    const homeWinning = isWinningRecord(game.homeTeam.record);
    const awayWinning = isWinningRecord(game.awayTeam.record);
    if (homeWinning && awayWinning) return 0; // best
    if (homeWinning || awayWinning) return 1;
    return 2; // worst
  };
  const getCombinedWins = (game: Game): number =>
    getWins(game.homeTeam.record) + getWins(game.awayTeam.record);

  const sorted = [...league.games].sort((a, b) => {
    const aPri = getFavPriority(a);
    const bPri = getFavPriority(b);
    const aHasFav = aPri !== Infinity;
    const bHasFav = bPri !== Infinity;

    if (aHasFav && !bHasFav) return -1;
    if (bHasFav && !aHasFav) return 1;
    if (aHasFav && bHasFav) return aPri - bPri;

    // Delayed live games (rain/heat/etc.) sort to the bottom of the live
    // cluster regardless of mode — still "live", just paused.
    const isDelayed = (g: Game) => g.state === "in" && /delay/i.test(g.statusDetail);

    // Monkey OFF (topMatchups === false): fully chronological
    if (!topMatchups) {
      // Still group live games first (they're actively happening)
      if (a.state === "in" && b.state !== "in") return -1;
      if (b.state === "in" && a.state !== "in") return 1;
      if (a.state === "in" && b.state === "in") {
        const aDel = isDelayed(a), bDel = isDelayed(b);
        if (aDel !== bDel) return aDel ? 1 : -1;
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }

    // Monkey ON: competitive sort
    // Live games first, sorted by rating (delayed → bottom of live cluster,
    // below SKIP-tier).
    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;
    if (a.state === "in" && b.state === "in") {
      const aDel = isDelayed(a), bDel = isDelayed(b);
      if (aDel !== bDel) return aDel ? 1 : -1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    if (a.state === "post" && b.state === "post") {
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    // Today/future: upcoming above finished; past dates: finished above upcoming
    if (isPastDate) {
      if (a.state === "post" && b.state === "pre") return -1;
      if (b.state === "post" && a.state === "pre") return 1;
    } else {
      if (a.state === "pre" && b.state === "post") return -1;
      if (b.state === "pre" && a.state === "post") return 1;
    }

    // Pre-game: sort by matchup quality
    if (a.state === "pre" && b.state === "pre") {
      const tierDiff = getMatchupTier(a) - getMatchupTier(b);
      if (tierDiff !== 0) return tierDiff;
      return getCombinedWins(b) - getCombinedWins(a);
    }

    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // Split into sections
  const liveGames = sorted.filter((g) => g.state === "in");
  const preGames = sorted.filter((g) => g.state === "pre");
  const postGames = sorted.filter((g) => g.state === "post");

  const showHeader = section !== "finished" && !teamViewTeam;
  const renderUpcoming = section !== "finished";
  const renderFinished = section !== "upcoming";

  return (
    <div
      ref={columnRef}
      className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] min-h-[60vh] transition-colors"
      style={isDragOver ? { background: "var(--bg-card-hover)" } : undefined}
      onDragEnter={canDrag ? (e) => {
        // Unconditional preventDefault — both dragenter + dragover need to call
        // it for the target to accept a drop (HTML5 spec). Previously we filtered
        // by types here, but Safari sometimes returns an empty types[] during
        // dragenter when crossing rapidly across child boundaries (game cards),
        // causing the drop to silently fail. The drop handler validates the
        // payload via getData(), so non-column drags (files, text) still no-op.
        e.preventDefault();
      } : undefined}
      onDragOver={canDrag ? (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isDragOver) setIsDragOver(true);
      } : undefined}
      onDragLeave={canDrag ? (e) => {
        // dragLeave fires every time the cursor crosses a child boundary inside
        // the column (game cards, swap button, etc.), even while still inside
        // the wrapper. Only clear the highlight when relatedTarget is actually
        // outside this column — otherwise the dropEffect/isDragOver state flickers
        // and dragover doesn't get a chance to reapply preventDefault before
        // the user releases.
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        setIsDragOver(false);
      } : undefined}
      onDrop={canDrag ? (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const fromStr = e.dataTransfer.getData("application/x-hidescore-slot");
        if (!fromStr) return;
        const fromIdx = parseInt(fromStr, 10);
        if (Number.isFinite(fromIdx) && fromIdx !== slotIdx && slotIdx !== undefined) {
          onReorderSlots!(fromIdx, slotIdx);
        }
      } : undefined}
    >
      {showHeader && (
        <div className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30" style={{ background: "var(--bg)", paddingTop: "1.75rem" }}>
          <div
            className="flex items-center justify-center"
            draggable={canDrag}
            style={canDrag ? { cursor: "grab" } : undefined}
            onDragStart={canDrag ? (e) => {
              e.dataTransfer.setData("application/x-hidescore-slot", String(slotIdx));
              e.dataTransfer.effectAllowed = "move";
              // Use the column wrapper as the drag image so the user sees the
              // whole column move, not just the header strip.
              if (columnRef.current) {
                e.dataTransfer.setDragImage(columnRef.current, 20, 20);
              }
            } : undefined}
          >
            <span
              className="inline-flex flex-col justify-between items-center mr-1.5 select-none"
              style={{
                color: "var(--text-muted)",
                opacity: 0.35,
                width: "5px",
                height: "12px",
              }}
              aria-hidden="true"
              title={canDrag ? "Drag the header to reorder" : undefined}
            >
              <span style={{ width: "3px", height: "3px", borderRadius: "9999px", background: "currentColor" }} />
              <span style={{ width: "3px", height: "3px", borderRadius: "9999px", background: "currentColor" }} />
              <span style={{ width: "3px", height: "3px", borderRadius: "9999px", background: "currentColor" }} />
            </span>
            {isSwappable ? (
              <div ref={swapRef} className="relative">
                <button
                  onClick={() => setSwapOpen(!swapOpen)}
                  className="flex items-center gap-0.5 cursor-pointer transition-colors hover:opacity-80"
                  style={{ color: "var(--text)" }}
                  title="Switch league"
                >
                  <h2 className="text-base sm:text-lg font-bold tracking-wide" style={isEmpty ? { color: "var(--text-muted)" } : undefined}>
                    {isEmpty ? "Empty" : league.label}
                  </h2>
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-150 ${swapOpen ? "rotate-180" : ""}`}
                    style={{ color: "var(--text-muted)" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {swapOpen && (
                  <div
                    className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 py-1 min-w-[100px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    {/* Auto option — always present so the dropdown is consistent per column */}
                    <button
                      onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Auto
                    </button>
                    {swappableOptions!.map((opt) => {
                      const isCurrent = !isEmpty && opt.sport === league.sport;
                      const isElsewhere = !isCurrent && !!shownElsewhere?.includes(opt.sport);
                      return (
                        <button
                          key={opt.sport}
                          onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                          className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                          style={{
                            color: isCurrent ? "var(--accent)" : isElsewhere ? "var(--text-muted)" : "var(--text)",
                            fontWeight: isCurrent ? 600 : 400,
                          }}
                          title={isElsewhere ? "Already shown in another column — pick to add a second" : undefined}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    {/* Empty — hides the column entirely until switched back. */}
                    <button
                      onClick={() => { onSwapLeague!("empty"); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{
                        color: isEmpty ? "var(--accent)" : "var(--text-muted)",
                        fontWeight: isEmpty ? 600 : 400,
                        borderTop: "1px solid var(--border)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Empty
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: isEmpty ? "var(--text-muted)" : "var(--text)" }}>
                {isEmpty ? "Empty" : league.label}
              </h2>
            )}
            <span
              className="invisible ml-1.5"
              aria-hidden="true"
              style={{ width: "5px", height: "12px", display: "inline-block" }}
            />
          </div>
          {isEmpty ? null : league.golfTournament ? (
            <GolfSubtitle league={league} selectedDate={selectedDate} />
          ) : (
            <PlayoffSubtitle sport={league.sport} selectedDate={selectedDate} games={league.games} />
          )}
        </div>
      )}
      {isEmpty ? null : (<>
      {/* non-empty body */}
      {teamViewTeam && !league.golfTournament ? (
        section === "finished" ? null : (
          <TeamView
            sport={league.sport}
            team={teamViewTeam}
            leagueLabel={league.label}
            favoriteTeams={favoriteTeams}
            onToggleFavoriteTeam={onToggleFavoriteTeam}
            showRatings={showRatings}
            onPlayHighlight={onPlayHighlight}
            onBack={() => setTeamViewTeam(null)}
            onSelectTeam={setTeamViewTeam}
            useAbbreviations={useAbbreviations}
          />
        )
      ) : league.golfTournament && section !== "finished" ? (
        <GolfLeaderboard
          tournament={league.golfTournament}
          showRatings={showRatings}
          leagueLabel={league.label}
          selectedDate={selectedDate}
          onPlayHighlight={onPlayHighlight}
        />
      ) : sorted.length === 0 ? (
        renderUpcoming ? (
          league.fetchFailed ? (
            // The games fetch errored AND we had no cached fallback (the
            // stale-while-revalidate cache in fetchGames means most flakes
            // never reach this branch). Offer a manual retry — pull-to-
            // refresh covers mobile, this button covers desktop and is the
            // safer choice over a full page reload, which can blow away
            // the service worker cache and trigger hydration mismatches.
            <div className="flex flex-col items-center gap-2 py-6 sm:py-8">
              <p className="text-center text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>Schedule unavailable</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs sm:text-sm px-3 py-1 rounded border hover:opacity-80 transition-opacity"
                  style={{ color: "var(--text)", borderColor: "var(--border)" }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : isPastDate ? (
            <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>No games</p>
          ) : league.nextGameDay ? (
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {league.nextGameDay.games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  favoriteTeams={favoriteTeams}
                  onToggleFavoriteTeam={onToggleFavoriteTeam}
                  showRatings={showRatings}
                  leagueLabel={league.label}
                  onPlayHighlight={onPlayHighlight}
                  onPlayEmbed={onPlayEmbed}
                  nextGameDate={formatDateCompact(league.nextGameDay!.date)}
                  useAbbreviations={useAbbreviations}
                  onSelectTeam={setTeamViewTeam}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>Upcoming Schedule TBD</p>
          )
        ) : null
      ) : isPastDate ? (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {sorted.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              onPlayEmbed={onPlayEmbed}
              isPastDate={isPastDate}
              isToday={isToday}
              useAbbreviations={useAbbreviations}
              onSelectTeam={setTeamViewTeam}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {renderUpcoming && liveGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              onPlayEmbed={onPlayEmbed}
              isToday={isToday}
              useAbbreviations={useAbbreviations}
              onSelectTeam={setTeamViewTeam}
            />
          ))}
          {renderUpcoming && preGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              onPlayEmbed={onPlayEmbed}
              isToday={isToday}
              useAbbreviations={useAbbreviations}
              onSelectTeam={setTeamViewTeam}
            />
          ))}
          {showFinalSeparator && postGames.length > 0 && (liveGames.length > 0 || preGames.length > 0) && (
            <div className="flex items-center gap-1.5 my-0.5" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-[9px] uppercase tracking-wide">Final</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
          )}
          {renderFinished && postGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              onPlayEmbed={onPlayEmbed}
              isPastDate={false}
              isToday={isToday}
              useAbbreviations={useAbbreviations}
              onSelectTeam={setTeamViewTeam}
            />
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}

