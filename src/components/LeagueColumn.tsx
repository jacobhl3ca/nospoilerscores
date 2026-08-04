"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

// useLayoutEffect warns in SSR; on the client we want the sync measurement.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Game, LeagueData, Sport, Team } from "@/lib/types";
import type { ShareCardMeta } from "@/lib/shareCard";
import { displayShortName, loadBigInningSchedule, BigInningSchedule } from "@/lib/espn";
import { handleExternalClick } from "@/lib/openExternal";
import { prefetchGameWeather } from "@/lib/weather";
import { getGolfSubtitle } from "@/lib/golf";
import { isDemoModeActive } from "@/lib/demoMode";
import { getEtServiceDate, getTimeZone, etSlateYmd } from "@/lib/etDay";
import GameCard, { CompactUpcomingCard } from "./GameCard";
import GolfLeaderboard from "./GolfLeaderboard";
import EventCard from "./EventCard";
import TeamView from "./TeamView";

interface LeagueColumnProps {
  league: LeagueData;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  isPastDate: boolean;
  isToday?: boolean;
  sortByMatchups?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null, alternates?: { label: string; videoId: string }[]) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  // Clicking a game card body opens a spoiler-safe details popup (owned by HomeContent).
  onShowDetails?: (game: Game) => void;
  // Opens the World Cup all-groups overlay (used only by the fifa column's
  // tappable "Group Stage" subtitle).
  onShowGroups?: () => void;
  selectedDate: string; // YYYYMMDD
  section?: "upcoming" | "finished"; // split rendering for cross-column Final separator
  showFinalSeparator?: boolean; // inline "Final" divider between live/pre and post games
  // 3rd league slot swapping
  swappableOptions?: { sport: Sport; label: string }[];
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // ▾ discoverability arrow on the swappable header (Settings can hide it;
  // tapping the header still opens the league switcher either way).
  showSwapChevron?: boolean;
  // Header switcher style: dropdown (default), arrows (‹ › flank the title
  // and cycle through the unused leagues by relevance), or off (plain
  // non-tappable header).
  switcherMode?: "dropdown" | "arrows" | "off";
  // Arrows-mode step callback (owned by HomeContent, which holds the
  // relevance-ordered browse ring + cursor). dir 1 = ›, -1 = ‹.
  onCycleLeague?: (dir: 1 | -1) => void;
  // Favorite-stars next to team names on the cards (Settings can hide them).
  // Suppressed automatically when the column is a single Finals matchup.
  showTeamStars?: boolean;
  showTeamRecords?: boolean;
  // Sports shown in the other columns — dropdown greys these (still selectable).
  shownElsewhere?: Sport[];
  // Manual retry for the "Schedule unavailable" empty state. Pull-to-refresh
  // covers mobile; this is the desktop-equivalent path.
  onRetry?: () => void;
  // 0-4. Identifies this column's slot for the pointer drag-to-reorder;
  // the parent owns reorder logic and writes the new slot order back to prefs.
  slotIdx?: number;
  onReorderSlots?: (fromIdx: number, toIdx: number) => void;
  // Outer-column width/spacing classes. Defaults to the narrow multi-column
  // width; the single-column board passes a wider one so cards have room.
  widthClassName?: string;
  // Condensed mode (single-column board): show only TODAY's games for this
  // league, and when there are 6+, collapse to the top 3 with a "Show N more"
  // toggle. Leagues with ≤5 today show them all. Keeps the stacked single
  // column scannable instead of one league flooding the feed.
  condense?: boolean;
  // Optional content rendered at the very bottom of the column, under the
  // games (e.g. the World Cup "What matters today" stakes pill).
  footer?: ReactNode;
  // Reports this column's live useAbbreviations state up to HomeContent (null =
  // this column has no team names to measure). HomeContent folds the reports
  // into `namesCompact`, which comes back down so event columns (UFC) can size
  // fighter names in lock-step with the game columns' actual abbreviate/full
  // flip — that flip depends on the day's longest team name, so no fixed width
  // threshold over here can reproduce it.
  onAbbrevReport?: (key: string, abbrev: boolean | null) => void;
  namesCompact?: boolean;
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
  // Green pulsing-dot treatment. Kept explicit rather than inferred from
  // `href`, so a subtitle can link somewhere without claiming to be live.
  live?: boolean;
}

const TRADE_BOARD_URL = "https://trades.hidescore.com";

// The header subtitle is a single line that already reserves its height even
// when empty (a transparent nbsp), so column headers stay aligned. Big Inning
// and the playoff countdown own that line whenever they have something to say;
// the trade board only fills it the rest of the time. Nothing moves, and no
// second row is added.
function tradeBoardSubtitle(sport: Sport): SubtitleResult | null {
  if (sport !== "mlb") return null;
  return { tiers: ["Trade Board", "Trades"], href: TRADE_BOARD_URL };
}

// Tennis round wording for the italic header subtitle (parallels golf's
// "Round N of 4"). The round is a per-MATCH property, and one column can carry
// both the men's and women's draw, which occasionally sit a round apart on the
// same day — so headline the DEEPEST round present (Final > Semifinal > … >
// Round 1 > qualifying). Returns [full, short] tiers so a long label like
// "Qualifying 1st Round" can collapse on a narrow column.
const TENNIS_ROUND_ORDER = [
  "Qualifying 1st Round",
  "Qualifying 2nd Round",
  "Qualifying Final",
  "Round 1",
  "Round 2",
  "Round 3",
  "Round 4",
  "Quarterfinal",
  "Semifinal",
  "Final",
];
function deepestTennisRound(labels: string[]): string | null {
  let best: string | null = null;
  let bestRank = -Infinity;
  for (const l of labels) {
    const rank = TENNIS_ROUND_ORDER.indexOf(l);
    // Unknown labels (rank -1) still beat "nothing chosen yet" so we never drop
    // a real round just because ESPN introduced wording we don't enumerate.
    if (best === null || rank > bestRank) {
      best = l;
      bestRank = rank;
    }
  }
  return best;
}
function tennisRoundTiers(label: string): string[] {
  const short = label
    .replace(/Quarterfinal/i, "QF")
    .replace(/Semifinal/i, "SF")
    .replace(/Qualifying/i, "Qual")
    .replace(/(\d+)(?:st|nd|rd|th)?\s+Round/i, "R$1")
    .replace(/Round (\d+)/i, "R$1");
  return short !== label ? [label, short] : [label];
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
    timeZone: getTimeZone(),
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
  // Tennis: no playoff countdown — the subtitle is the tournament round, read
  // off the day's matches (golf-style). Handled before the PLAYOFF_START_DATES
  // gate since tennis has no entry there.
  if (sport === "tennis") {
    const labels = (games ?? []).map((g) => g.playoffLabel).filter(Boolean) as string[];
    const round = deepestTennisRound(labels);
    return round ? { tiers: tennisRoundTiers(round) } : null;
  }

  // World Cup: the italic subtitle is the tournament phase, read off the day's
  // games (game.stage). During the group stage every game is "Group X", so the
  // column shows "Group Stage" (a single column spans several groups). Once the
  // bracket starts, the knockout round takes over ("Round of 16" → "Final") —
  // show the deepest round if a day mixes them. No PLAYOFF_START_DATES entry,
  // so handle it here like tennis.
  if (sport === "fifa") {
    const stages = (games ?? []).map((g) => g.stage).filter(Boolean) as string[];
    if (!stages.length) return null;
    const rounds = stages.filter((s) => !/^group/i.test(s));
    if (rounds.length) {
      const order = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Third Place", "Final"];
      const deepest = rounds.reduce((best, r) => (order.indexOf(r) > order.indexOf(best) ? r : best), rounds[0]);
      return { tiers: [deepest] };
    }
    return { tiers: ["Group Stage", "Groups"] };
  }

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
        // Link to the MLB.TV hub (or tonight's selection page when the rail
        // gives us one). The MLB app does NOT claim /tv or /tv/shows/* as
        // universal links — only /tv/g* (per-game) and /news/* — so in the
        // native wrapper openExternal remaps these MLB.TV URLs to the app's
        // `mlbatbat://watch` scheme to open the Watch screen (where Big Inning
        // lives) instead of the browser, falling back to the web URL if the
        // MLB app isn't installed. On the web this stays the plain https link.
        href: entry.selectionUrl ?? "https://www.mlb.com/tv",
        live: true,
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

function PlayoffSubtitle({ sport, selectedDate, games, onClick }: { sport: Sport; selectedDate: string; games?: Game[]; onClick?: () => void }) {
  // Read the ?demo=1 staging flag once on mount instead of on every render.
  // This gate runs for EVERY league-column header on EVERY 10s score-poll
  // re-render (before PlayoffSubtitleInner is even reached), so a fresh
  // `URLSearchParams(window.location.search)` was being built ~once per column
  // per poll, all the time — not just inside a playoff window. Demo mode is a
  // page-load URL toggle that never changes without a navigation that remounts
  // this component, so useMemo([]) reads it once (mirroring GameHighlights'
  // isDemoModeActive memo). A module-level cache would be wrong — it would leak
  // a stale value across a client-side nav from ?demo=1 to a non-demo route.
  const demoActive = useMemo(() => isDemoModeActive(), []);
  if (demoActive) return null;
  return <PlayoffSubtitleInner sport={sport} selectedDate={selectedDate} games={games} onClick={onClick} />;
}

function PlayoffSubtitleInner({ sport, selectedDate, games, onClick }: { sport: Sport; selectedDate: string; games?: Game[]; onClick?: () => void }) {
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

  const result =
    getPlayoffSubtitle(sport, selectedDate, games, bigInningSchedule) ??
    tradeBoardSubtitle(sport);
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
    // exhaustive-deps does not analyze the custom useIsoLayoutEffect hook, so
    // no directive is needed here; re-measure only when the tier set changes.
  }, [tiersKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTierIdx(pickTier()));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiersKey]);

  // The "green & clickable" treatment that mirrors the GameCard live-progress
  // indicator. Only Big Inning sets `live`; the trade board links from the same
  // slot without borrowing the live styling.
  const isLive = !!result?.live && tiers.length > 0;
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
        onClick={handleExternalClick(href)}
        className={isLive ? liveCls : linkCls}
        style={baseStyle}
      >
        {renderText(text)}
      </a>
    );
  }
  // Tappable subtitle (e.g. the World Cup "Group Stage" line opens the all-
  // groups overlay). A trailing ▸ hints it's interactive; styled like the link
  // variant (italic + hover underline).
  if (onClick && tiers.length) {
    return (
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        className={`${linkCls} cursor-pointer`}
        style={baseStyle}
      >
        {renderText(text)}{" ▸"}
      </button>
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
        // Route the tap through openExternal so the Capacitor native wrapper
        // deep-links into the installed streaming app (PGA Tour / Golf Channel /
        // Peacock are all in APP_LINK_HOSTS) instead of opening the in-app
        // browser — matching the sibling PlayoffSubtitle link and every other
        // external anchor in the app. No behavior change on the plain web.
        onClick={handleExternalClick(href)}
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

// An upcoming-game slate can now span multiple days (NBA/NHL "all upcoming",
// World Cup "next 10"), so each card derives its own date from game.date rather
// than sharing the slate's lead date. Bucket by slate day (etSlateYmd's 1 AM
// rollover) so a midnight kickoff's card label matches the day it's filed under;
// fall back to the slate's lead date.
function etDayString(iso: string): string {
  return etSlateYmd(iso);
}

function formatDateCompact(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  // "Tomorrow" relative to the app's service day (ET, 1 AM-shifted, via
  // etDay.ts) — NOT the raw device clock, which mislabels for non-ET users
  // year-round and for everyone in the midnight-1 AM ET window.
  const today = getEtServiceDate();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startDate.getTime() - startToday.getTime()) / 86400000);
  if (diffDays === 1) return "Tomorrow";
  const md = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  // A weekday name only reads unambiguously within a week ("Thursday" 9 days out
  // could be either Thursday). 7+ days out, show just the date — the card bolds
  // the first token, so a far game reads "7/16 - 7:30 PM" instead of a vague
  // "Thursday"; within the week keep the weekday for at-a-glance day. (Jacob 6/28)
  if (diffDays >= 7) return md;
  const dow = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dow} ${md}`;
}

// Short header forms for league labels too long to sit on one line in a narrow
// column. Keyed on the exact LEAGUES label; anything absent renders in full.
const SHORT_LEAGUE_LABELS: Record<string, string> = {
  "NFL Preseason": "NFL Pre",
};

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
  onShowDetails,
  onShowGroups,
  selectedDate,
  section,
  showFinalSeparator,
  swappableOptions,
  onSwapLeague,
  showSwapChevron,
  switcherMode,
  onCycleLeague,
  showTeamStars,
  showTeamRecords,
  shownElsewhere,
  onRetry,
  slotIdx,
  onReorderSlots,
  widthClassName = "flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] min-h-[60vh]",
  condense,
  footer,
  onAbbrevReport,
  namesCompact,
}: LeagueColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef<HTMLDivElement>(null);
  const [condenseExpanded, setCondenseExpanded] = useState(false); // "Show more" in condensed single-column mode
  const [useAbbreviations, setUseAbbreviations] = useState(true); // start abbreviated, expand if room
  // A long league name ("NFL Preseason") wraps to two lines in a narrow mobile
  // column and collides with its own ▾ chevron and the + add-column button
  // (Jacob 8/4). Reuse the column's existing narrow-width signal so the short
  // form only appears when space is actually tight — the full name comes back
  // as soon as the column is wide enough for unabbreviated team names.
  const headerLabel = (useAbbreviations && SHORT_LEAGUE_LABELS[league.label]) || league.label;
  const [swapOpen, setSwapOpen] = useState(false);
  const [teamViewTeam, setTeamViewTeam] = useState<Team | null>(null);
  // Capture "now" once at mount so the day-granular "Last played" label below
  // (renderPreviousSlate) stays a pure render — reading Date.now() during render
  // is flagged by react-hooks/purity, and a single read is indistinguishable
  // for a label that only changes across a midnight boundary.
  const [nowMs] = useState(() => Date.now());
  const mode = switcherMode ?? "dropdown";
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague && mode !== "off";

  // ── Column drag-to-reorder (pointer events) ──────────────────────────────
  // Rebuilt 6/11 with pointer events after the HTML5 DnD version proved flaky
  // (Safari/Firefox dropped custom dataTransfer types mid-drag; removed 5/30).
  // Press the header title and drag onto another column to swap slots. A small
  // movement threshold keeps plain clicks routing to the switcher; touch is
  // excluded so the header doesn't fight page scrolling on phones.
  const canDrag = slotIdx !== undefined && !!onReorderSlots;
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number; startY: number; active: boolean; pointerId: number;
    hoverEl: HTMLElement | null; ghost: HTMLDivElement | null;
  } | null>(null);
  const suppressClickRef = useRef(false);
  // Teardown for the in-flight drag's window listeners, so an unmount mid-drag
  // (when onUp/onCancel never fire) can still remove them — see the effect below.
  const dragListenersRef = useRef<(() => void) | null>(null);

  const clearDragHover = () => {
    const d = dragRef.current;
    if (d?.hoverEl) {
      d.hoverEl.style.background = "";
      d.hoverEl = null;
    }
  };

  const endDrag = (commitClientX?: number, commitClientY?: number) => {
    const d = dragRef.current;
    dragRef.current = null;
    document.body.style.cursor = "";
    if (d?.ghost) d.ghost.remove();
    if (d?.hoverEl) d.hoverEl.style.background = "";
    setIsDragging(false);
    // The post-drag synthetic click only fires when the pointer ends over this
    // same header — clear the suppress flag right after the event cycle so a
    // drop elsewhere doesn't swallow the NEXT genuine click.
    setTimeout(() => { suppressClickRef.current = false; }, 0);
    if (!d?.active || commitClientX === undefined || commitClientY === undefined) return;
    const target = document
      .elementFromPoint(commitClientX, commitClientY)
      ?.closest("[data-slot-idx]") as HTMLElement | null;
    const toIdx = target ? parseInt(target.dataset.slotIdx ?? "", 10) : NaN;
    if (Number.isFinite(toIdx) && toIdx !== slotIdx) onReorderSlots!(slotIdx!, toIdx);
  };

  const onHeaderPointerDown = (e: ReactPointerEvent) => {
    if (!canDrag || e.pointerType === "touch" || e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX, startY: e.clientY, active: false,
      pointerId: e.pointerId, hoverEl: null, ghost: null,
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (!d.active) {
        // 8px threshold before it counts as a drag (clicks stay clicks).
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 8) return;
        d.active = true;
        suppressClickRef.current = true;
        setIsDragging(true);
        setSwapOpen(false);
        document.body.style.cursor = "grabbing";
        // Floating label so the user sees what they're moving (a full-column
        // drag image needs HTML5 DnD; a light ghost reads better anyway).
        const ghost = document.createElement("div");
        ghost.textContent = league.label;
        ghost.style.cssText =
          "position:fixed;z-index:100;pointer-events:none;padding:2px 10px;" +
          "border-radius:8px;font-weight:700;font-size:14px;" +
          "background:var(--bg-card);border:1px solid var(--border-hover);color:var(--text);" +
          "transform:translate(-50%,-130%);";
        document.body.appendChild(ghost);
        d.ghost = ghost;
      }
      if (d.ghost) {
        d.ghost.style.left = `${ev.clientX}px`;
        d.ghost.style.top = `${ev.clientY}px`;
      }
      // Highlight the column under the pointer (direct style keeps this
      // self-contained — no cross-column React state needed).
      const over = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("[data-slot-idx]") as HTMLElement | null;
      if (over !== d.hoverEl) {
        if (d.hoverEl) d.hoverEl.style.background = "";
        d.hoverEl = over && over !== columnRef.current ? over : null;
        if (d.hoverEl) d.hoverEl.style.background = "var(--bg-card-hover)";
      }
    };
    const removeListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragListenersRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== dragRef.current?.pointerId) return;
      removeListeners();
      endDrag(ev.clientX, ev.clientY);
    };
    const onCancel = () => {
      removeListeners();
      clearDragHover();
      endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // If this column unmounts mid-drag (a live-poll re-render or a slot/league
    // swap can replace the column while a mouse-drag is active), onUp/onCancel
    // never fire — so hand the teardown to the unmount effect below, which
    // removes these window listeners without leaking stale closures (or firing
    // endDrag's reorder/setState on an unmounted instance).
    dragListenersRef.current = removeListeners;
  };

  // Remove any in-flight drag's window listeners if the column unmounts
  // mid-drag (see onHeaderPointerDown). Intentionally does NOT call endDrag —
  // an unmount must not fire a reorder or setState. But it must still revert the
  // GLOBAL DOM side-effects an active drag left on the document: the "grabbing"
  // body cursor, the ghost label appended to <body>, and the hover-highlight
  // background on whatever column the pointer was over. Without this, unmounting
  // mid-drag (the live-poll re-render / slot swap the code above anticipates)
  // strands the grabbing cursor app-wide and leaks an orphaned ghost <div>,
  // since onUp/onCancel — the only other path that clears them — never fire.
  // Mirrors endDrag's visual teardown (cursor/ghost/hoverEl) minus its state.
  useEffect(() => () => {
    dragListenersRef.current?.();
    const d = dragRef.current;
    if (d) {
      document.body.style.cursor = "";
      d.ghost?.remove();
      if (d.hoverEl) d.hoverEl.style.background = "";
    }
  }, []);

  // Reset team view when the column's league changes (e.g., swapped via dropdown).
  // Done in the effect cleanup (fires before the next run on a league change and
  // on unmount) rather than synchronously in the effect body, which React flags
  // as a cascading-render setState-in-effect. Same reset semantics.
  useEffect(() => () => setTeamViewTeam(null), [league.sport, league.label]);

  // Eagerly warm the weather cache for this column's games so the detail modal
  // shows weather instantly instead of popping in a beat after it opens.
  // prefetchGameWeather no-ops for finished/indoor/locationless games and is
  // cached, so re-runs are cheap.
  useEffect(() => {
    for (const g of league.games) prefetchGameWeather(g);
  }, [league.games]);

  // Close swap dropdown on outside click or Escape
  useEffect(() => {
    if (!swapOpen) return;
    const handler = (e: MouseEvent) => {
      if (swapRef.current && !swapRef.current.contains(e.target as Node)) {
        setSwapOpen(false);
      }
    };
    // Keyboard parity with the app's other dropdowns/modals: Escape dismisses
    // the popup the swap button promises via aria-haspopup.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwapOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [swapOpen]);

  // Measure whether full names would fit in the available column width.
  // Memoized so the two effects below can depend on it directly (fixing the
  // exhaustive-deps warning) instead of a hand-maintained `[league.games]` dep.
  // That old dep list also missed a case: the measurement reads the lookahead
  // (nextGameDay) and lookback (previousGameDay) slates too, so if only one of
  // those changed — e.g. a past tab that's empty today gains a lookback game —
  // abbreviations wouldn't recompute. Keying on all four fields the body reads
  // closes that gap.
  const checkIfFullNamesFit = useCallback(() => {
    const el = columnRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      // Find a team-name cell to measure available width
      // The name sits in a flex container: [name] [star], inside a grid cell (1fr)
      const nameContainers = el.querySelectorAll(".team-name-container");
      if (!nameContainers.length) return;

      // Get the longest team name from the games actually rendered. Today's
      // slate, the upcoming lookahead (NBA/NHL playoffs, World Cup), AND the
      // empty-past-tab lookback can each be the only thing showing — so measure
      // the union of all three. Otherwise this bails early and useAbbreviations
      // stays stuck at its initial `true`, abbreviating names ("NY"/"SA") even
      // when the full names ("Knicks"/"Spurs") would easily fit.
      const measuredGames = [...league.games, ...(league.nextGameDay?.games ?? []), ...(league.previousGameDay?.games ?? [])];
      const allNames = measuredGames.flatMap(g => [
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
      // The "#N" ranking chip is tucked INSIDE the name container, so it's not
      // in `occupied` above — reserve room for it (≤3 chars + gap) or long names
      // ("Bosnia-Herzegovina", "Trail Blazers") could spill past the cell. Shown
      // for the World Cup (static FIFA rank) and any league whose teams carry a
      // live standings rank.
      const showsRankChip =
        league.sport === "fifa" ||
        measuredGames.some((g) => g.homeTeam.rank != null || g.awayTeam.rank != null);
      const rankAllowance = showsRankChip ? 30 : 0;
      const availableWidth = rowWidth - occupied - totalGaps - 4 - rankAllowance; // 4px safety

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
  }, [league.games, league.nextGameDay, league.previousGameDay, league.sport]);

  // Re-check when the rendered games change
  useEffect(() => {
    checkIfFullNamesFit();
  }, [checkIfFullNamesFit]);

  // Re-check on resize
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => checkIfFullNamesFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkIfFullNamesFit]);

  // Report the abbreviation state up (see onAbbrevReport in the props). Keyed
  // by slot (the same league can appear in two columns via the swap menu), and
  // only while this column actually renders team names — a golf/event/empty
  // column reports null so its untouched initial `true` can't force every
  // fighter name compact on a board with no game columns at all.
  const hasTeamNames =
    !league.golfTournament && !league.eventCard &&
    (league.games.length > 0 || (league.nextGameDay?.games?.length ?? 0) > 0 || (league.previousGameDay?.games?.length ?? 0) > 0);
  useEffect(() => {
    if (!onAbbrevReport) return;
    const key = `${slotIdx ?? league.sport}`;
    onAbbrevReport(key, hasTeamNames ? useAbbreviations : null);
    return () => onAbbrevReport(key, null);
  }, [onAbbrevReport, slotIdx, league.sport, hasTeamNames, useAbbreviations]);

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
  // ESPN formats soccer records as W-D-L (wins-draws-losses), e.g. "12-5-8", so
  // the losses are the THIRD segment. Every other sport is W-L, or W-L-T like
  // the NFL where the second segment is still losses — there the first "-N" is
  // right. Grabbing the second segment for soccer would read DRAWS as losses
  // and mis-flag a winning side (e.g. 8W-9D-4L → 8 vs 9 → "not winning"),
  // demoting a genuinely strong upcoming matchup in the top-matchups sort.
  const SOCCER_SPORTS = new Set<Sport>([
    "fifa", "epl", "mls", "ucl", "uel", "laliga", "seriea", "bundesliga", "ligue1",
    "ligamx", "nwsl", "efl", "libertadores", "euro", "afcon", "saudi",
  ]);
  const getLosses = (record: string): number => {
    const parts = record.split("-");
    if (SOCCER_SPORTS.has(league.sport) && parts.length === 3) {
      const n = parseInt(parts[2], 10);
      return Number.isFinite(n) ? n : 0;
    }
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

  // NaN-safe chronological key: a raw new Date(bad).getTime() is NaN, and every
  // comparison against NaN is false, so one undated game scatters the whole
  // column. Sink an unparseable date to a far-future sentinel (like chronoMs in
  // lib/espn.ts) so it sorts last instead of jumbling the slate.
  const chronoMs = (iso: string): number => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 8.64e15 : t;
  };

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
      return chronoMs(a.date) - chronoMs(b.date);
    }

    // Monkey ON: competitive sort
    // Live games first, sorted by rating (delayed → bottom of live cluster,
    // below SKIP-tier).
    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;
    if (a.state === "in" && b.state === "in") {
      const aDel = isDelayed(a), bDel = isDelayed(b);
      if (aDel !== bDel) return aDel ? 1 : -1;
      // "Too early to rate" live games (rating still null in their 1st period)
      // sit below rated live games — a just-started 0-0 game shouldn't outrank
      // games that have built up real closeness signal. Order within the live
      // cluster: rated (by rating desc) → too-early → delayed.
      const aEarly = a.rating == null, bEarly = b.rating == null;
      if (aEarly !== bEarly) return aEarly ? 1 : -1;
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

    return chronoMs(a.date) - chronoMs(b.date);
  });

  // Split into sections
  const liveGames = sorted.filter((g) => g.state === "in");
  const preGames = sorted.filter((g) => g.state === "pre");
  const postGames = sorted.filter((g) => g.state === "post");

  // Stars exist to float a favorite team's games to the top of the column. In
  // a Finals view the whole column is ONE matchup (NBA Finals / Stanley Cup
  // Final series), so starring can't reorder anything — hide the stars there
  // (Jacob 6/11). Counts the lookahead/lookback slates too, so the upcoming
  // series rows can't sneak a second matchup past the check.
  const matchupKey = (g: Game) =>
    [g.homeTeam.id || g.homeTeam.abbreviation, g.awayTeam.id || g.awayTeam.abbreviation].sort().join("|");
  const distinctMatchups = new Set(
    [...league.games, ...(league.nextGameDay?.games ?? []), ...(league.previousGameDay?.games ?? [])].map(matchupKey),
  ).size;
  const cardStars = !!showTeamStars && distinctMatchups > 1;

  const showHeader = section !== "finished" && !teamViewTeam;
  const renderUpcoming = section !== "finished";
  const renderFinished = section !== "upcoming";

  // Condensed single-column render: TODAY's games only (no future-day
  // lookahead, no Final separator), best-first via `sorted`. 6+ games collapse
  // to the top 3 with a "Show N more" toggle; ≤5 show in full. `pastDate` flows
  // to the cards so a past tab still hides records + shows highlights.
  const CONDENSE_LIMIT = 3;
  const renderCondensed = (games: Game[], pastDate: boolean) => {
    const collapsible = games.length > 5;
    const visible = !collapsible || condenseExpanded ? games : games.slice(0, CONDENSE_LIMIT);
    // Group finished games below a "Final" divider — parity with the multi-
    // column board, which single column was missing — instead of interleaving
    // them, whenever both finished and non-finished games are present.
    const nonFinished = visible.filter((g) => g.state !== "post");
    const finished = visible.filter((g) => g.state === "post");
    const splitFinal = !!showFinalSeparator && nonFinished.length > 0 && finished.length > 0;
    const card = (game: Game) => (
      <GameCard
        key={game.id}
        game={game}
        favoriteTeams={favoriteTeams}
        onToggleFavoriteTeam={onToggleFavoriteTeam}
        showRatings={showRatings}
        leagueLabel={league.label}
        onPlayHighlight={onPlayHighlight}
        onPlayEmbed={onPlayEmbed}
        isPastDate={pastDate}
        isToday={isToday}
        useAbbreviations={useAbbreviations}
        onSelectTeam={setTeamViewTeam}
        onShowDetails={onShowDetails}
        showStars={cardStars}
              showRecords={showTeamRecords}
      />
    );
    return (
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {(splitFinal ? nonFinished : visible).map(card)}
        {splitFinal && (
          <div className="flex items-center gap-1.5 my-0.5" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-[9px] uppercase tracking-wide">Final</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
        )}
        {splitFinal && finished.map(card)}
        {collapsible && (
          <button
            type="button"
            onClick={() => setCondenseExpanded((v) => !v)}
            // Disclosure control: it expands/collapses the extra game cards, so
            // expose that state to assistive tech. Without aria-expanded a
            // screen reader can't tell the row is collapsible — matches the
            // aria-expanded already on this file's league-switcher toggle.
            aria-expanded={condenseExpanded}
            className="mt-0.5 mx-auto text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {condenseExpanded ? "Show less" : `Show ${games.length - CONDENSE_LIMIT} more`}
          </button>
        )}
      </div>
    );
  };

  // Render the upcoming/lookahead slate. NBA/NHL are down to a single playoff
  // series with a few games left, so the lead game is a full card and the rest
  // collapse to compact "@ home" rows (series state shows once, on a full card).
  // `firstFull` makes the first game a full card — used when there's no game
  // today (the empty-day lookahead); when today already has a full card above,
  // the whole upcoming list is compact. Every other league stays all-full.
  const isCompactLeague = league.sport === "nba" || league.sport === "nhl";
  const renderUpcomingSlate = (games: Game[], firstFull: boolean) =>
    games.map((game, i) => {
      const nextGameDate = formatDateCompact(etDayString(game.date) || league.nextGameDay!.date);
      if (isCompactLeague && !(firstFull && i === 0)) {
        return (
          <CompactUpcomingCard
            key={game.id}
            game={game}
            nextGameDate={nextGameDate}
            onShowDetails={onShowDetails}
          />
        );
      }
      return (
        <GameCard
          key={game.id}
          game={game}
          favoriteTeams={favoriteTeams}
          onToggleFavoriteTeam={onToggleFavoriteTeam}
          showRatings={showRatings}
          leagueLabel={league.label}
          onPlayHighlight={onPlayHighlight}
          onPlayEmbed={onPlayEmbed}
          nextGameDate={nextGameDate}
          useAbbreviations={useAbbreviations}
          onSelectTeam={setTeamViewTeam}
          onShowDetails={onShowDetails}
          showStars={cardStars}
              showRecords={showTeamRecords}
        />
      );
    });

  // Lookback slate: on an empty PAST tab, render the last game day's finished
  // games (with highlights) in place of "No games". The "Last played" label
  // rides centered on the first card's top row (only the first, since they
  // share the day). Uses the SHORT weekday ("Mon") — the full name ("Wednesday")
  // overflowed the narrow homepage columns (Jacob 6/12); the numeric date is
  // appended only when the game is a week+ old, to disambiguate which Mon.
  const renderPreviousSlate = (games: Game[], date: string) => {
    const y = +date.slice(0, 4), mo = +date.slice(4, 6) - 1, d = +date.slice(6, 8);
    const dateObj = new Date(y, mo, d, 12, 0, 0);
    const daysAgo = Math.round((nowMs - dateObj.getTime()) / 86400000);
    const dow = dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const label = daysAgo < 7 ? `Last played · ${dow}` : `Last played · ${dow} ${mo + 1}/${d}`;
    return (
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {games.map((game, i) => (
          <GameCard
            key={game.id}
            game={game}
            favoriteTeams={favoriteTeams}
            onToggleFavoriteTeam={onToggleFavoriteTeam}
            showRatings={showRatings}
            leagueLabel={league.label}
            onPlayHighlight={onPlayHighlight}
            onPlayEmbed={onPlayEmbed}
            pastDateLabel={i === 0 ? label : undefined}
            isPastDate
            useAbbreviations={useAbbreviations}
            onSelectTeam={setTeamViewTeam}
            onShowDetails={onShowDetails}
            showStars={cardStars}
              showRecords={showTeamRecords}
          />
        ))}
      </div>
    );
  };

  // Not-started league on a past tab (empty slate, no recent games, but an
  // upcoming one exists — e.g. the World Cup before kickoff). The header gets a
  // compact "Starts Tomorrow" cue while the body can still show upcoming cards.
  const notStartedDate = isPastDate && league.games.length === 0
    && !(league.previousGameDay?.games?.length) && league.nextGameDay?.games?.length
    ? formatDateCompact(league.nextGameDay.date)
    : null;

  return (
    <div
      ref={columnRef}
      data-slot-idx={canDrag ? slotIdx : undefined}
      className={`${widthClassName} transition-colors`}
      style={isDragging ? { opacity: 0.55 } : undefined}
    >
      {showHeader && (
        // The 1.75rem top padding lines the header up with the "+" add-column
        // button in row layout (pt-7 there matches it). Single-column mode's
        // add button uses its own tighter mt-1 instead, so that alignment
        // doesn't apply here — condense (singleColumn) keeps just enough
        // padding to clear the sticky background bleed (Jacob screenshot:
        // dead gap above the league title on the phone single-column board).
        // pb-3: at pb-2 the first card's top border sat flush against the
        // subtitle line ("Big Inning · 7:30 PM ET"), so the card read as
        // clipped by the title block (Jacob 8/4).
        <div className="league-sticky-top flex flex-col items-center pb-3 sm:pb-4 sticky z-30" style={{ background: "var(--bg)", paddingTop: condense ? "0.5rem" : "1.75rem" }}>
          <div
            className="flex items-center justify-center"
            style={canDrag ? { cursor: isDragging ? "grabbing" : "grab", touchAction: "pan-y" } : undefined}
            onPointerDown={onHeaderPointerDown}
            onClickCapture={(e) => {
              // A drag just ended on this header — swallow the synthetic click
              // so the switcher dropdown doesn't pop open post-drop.
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {/* Drag-to-reorder works on the whole title row (cursor: grab);
                a plain click still opens the switcher. */}
            {isSwappable && mode === "arrows" && onCycleLeague ? (
              // ‹ › cycle mode (Jacob 6/11): arrows flank the title and browse
              // the leagues no other column is showing, most→least relevant —
              // › starts at the most relevant unused league, ‹ walks the same
              // ring backwards. The ring/cursor live in HomeContent (this
              // component remounts on every league change).
              (() => {
                const cycle = (dir: 1 | -1) => onCycleLeague(dir);
                const arrowBtn = (dir: 1 | -1) => (
                  <button
                    type="button"
                    onClick={() => cycle(dir)}
                    aria-label={dir === 1 ? "Next league" : "Previous league"}
                    title={dir === 1 ? "Next league" : "Previous league"}
                    className="w-6 h-6 flex items-center justify-center rounded-full cursor-pointer transition-colors shrink-0"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {dir === 1 ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
                    </svg>
                  </button>
                );
                return (
                  <div className="flex items-center gap-0.5">
                    {arrowBtn(-1)}
                    <h2 className="text-base sm:text-lg font-bold tracking-wide px-0.5" style={{ color: "var(--text)" }}>
                      {headerLabel}
                    </h2>
                    {arrowBtn(1)}
                  </div>
                );
              })()
            ) : isSwappable ? (
              <div ref={swapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSwapOpen(!swapOpen)}
                  className="cursor-pointer transition-colors hover:opacity-80"
                  style={{ color: "var(--text)" }}
                  title="Switch league"
                  aria-haspopup="dialog"
                  aria-expanded={swapOpen}
                >
                  <h2 className="text-base sm:text-lg font-bold tracking-wide flex items-center gap-1">
                    {headerLabel}
                    {/* ▾ switcher affordance (Jacob 6/11). Settings → League
                        columns can hide it; tap-to-switch works either way. */}
                    {showSwapChevron !== false && (
                      <svg
                        aria-hidden="true"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-muted)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`mt-0.5 shrink-0 transition-transform ${swapOpen ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </h2>
                </button>
                {swapOpen && (
                  <div
                    // The league-switch button declares aria-haspopup + aria-expanded,
                    // so give the panel it opens a matching role + accessible name —
                    // otherwise it surfaces to assistive tech as an anonymous,
                    // role-less region. Same role="dialog" + aria-label pattern the
                    // DateNav calendar and HomeContent news-filter popovers use.
                    role="dialog"
                    aria-label="Switch league"
                    className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 overflow-hidden min-w-[100px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    {/* Auto option — always present so the dropdown is consistent per column */}
                    <button
                      type="button"
                      onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--menu-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Auto
                    </button>
                    {/* Sort leagues already shown in another column (greyed) to
                        the bottom, just above Empty — they're the least useful to
                        pick again (Jacob 6/9). Stable sort keeps the rest in order. */}
                    {[...swappableOptions!].sort((a, b) => {
                      const ae = a.sport !== league.sport && !!shownElsewhere?.includes(a.sport);
                      const be = b.sport !== league.sport && !!shownElsewhere?.includes(b.sport);
                      return (ae ? 1 : 0) - (be ? 1 : 0);
                    }).map((opt) => {
                      const isCurrent = opt.sport === league.sport;
                      const isElsewhere = !isCurrent && !!shownElsewhere?.includes(opt.sport);
                      return (
                        <button
                          key={opt.sport}
                          type="button"
                          onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                          // The active league is otherwise signalled only by color +
                          // weight; aria-current voices it to screen readers (matches
                          // the NewsColumn swap dropdown + DateNav day-pill pattern).
                          aria-current={isCurrent ? "true" : undefined}
                          className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                          style={{
                            color: isCurrent ? "var(--accent)" : isElsewhere ? "var(--text-muted)" : "var(--text)",
                            fontWeight: isCurrent ? 600 : 400,
                          }}
                          title={isElsewhere ? "Already shown in another column — pick to add a second" : undefined}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--menu-hover)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    {/* Remove col — hides the column entirely until switched back. */}
                    <button
                      type="button"
                      onClick={() => { onSwapLeague!("empty"); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        fontWeight: 400,
                        borderTop: "1px solid var(--border)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--menu-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Remove col
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
                {headerLabel}
              </h2>
            )}
          </div>
          {league.golfTournament ? (
            <GolfSubtitle league={league} selectedDate={selectedDate} />
          ) : league.eventCard ? (
            // Reserve the one-line subtitle slot the game columns use (e.g. MLB's
            // Big Inning line) so the F1/UFC card tops line up with neighbours
            // instead of riding ~16px higher.
            <span aria-hidden className="text-[9px] sm:text-[10px] mt-0.5 block whitespace-nowrap">{" "}</span>
          ) : notStartedDate ? (
            <span className="text-[9px] sm:text-[10px] mt-0.5 whitespace-nowrap block max-w-full overflow-hidden text-center pr-0.5 italic" style={{ color: "var(--text-muted)" }}>Starts {notStartedDate}</span>
          ) : (
            <PlayoffSubtitle sport={league.sport} selectedDate={selectedDate} games={league.games.length ? league.games : (league.previousGameDay?.games ?? [])} onClick={league.sport === "fifa" ? onShowGroups : undefined} />
          )}
        </div>
      )}
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
            onPlayEmbed={onPlayEmbed}
            onShowDetails={onShowDetails}
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
      ) : league.eventCard && section !== "finished" ? (
        <EventCard event={league.eventCard} leagueLabel={league.label} onPlayHighlight={onPlayHighlight} namesCompact={namesCompact} selectedDate={selectedDate} />
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
                  // Context-specific name so multiple simultaneously-failed
                  // columns (e.g. a network drop on first paint) don't all
                  // read as a bare "Retry" — a screen-reader/voice-control user
                  // can tell which league each button reloads. Keeps "Retry" in
                  // the name so it still matches the visible label (WCAG 2.5.3).
                  aria-label={`Retry loading ${league.label}`}
                  className="text-xs sm:text-sm px-3 py-1 rounded border hover:opacity-80 transition-opacity"
                  style={{ color: "var(--text)", borderColor: "var(--border)" }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : isPastDate ? (
            league.previousGameDay && league.previousGameDay.games.length > 0 ? (
              renderPreviousSlate(league.previousGameDay.games, league.previousGameDay.date)
            ) : notStartedDate && league.nextGameDay ? (
              // Not-started league: keep the subtitle cue, but still show the
              // known upcoming cards so the date/time lives on the schedule rows.
              <div className="flex flex-col gap-1.5 sm:gap-2">
                {renderUpcomingSlate(league.nextGameDay.games, true)}
              </div>
            ) : (
              <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>No games</p>
            )
          ) : league.nextGameDay ? (
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {/* No game today → the lead upcoming game is a full card, the
                  rest compact (NBA/NHL); other leagues stay all-full. */}
              {renderUpcomingSlate(league.nextGameDay.games, true)}
            </div>
          ) : league.previousGameDay && league.previousGameDay.games.length > 0 ? (
            // Offseason / season over: nothing today and nothing ahead. Show the
            // last game played (score-hidden, with highlights) — the same lookback
            // the past tab uses — so the column stays useful instead of announcing
            // the season ended with a bare "Upcoming Schedule TBD".
            renderPreviousSlate(league.previousGameDay.games, league.previousGameDay.date)
          ) : (
            <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>Upcoming Schedule TBD</p>
          )
        ) : null
      ) : condense ? (
        renderCondensed(sorted, isPastDate)
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
              onShowDetails={onShowDetails}
              showStars={cardStars}
              showRecords={showTeamRecords}
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
              onShowDetails={onShowDetails}
              showStars={cardStars}
              showRecords={showTeamRecords}
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
              onShowDetails={onShowDetails}
              showStars={cardStars}
              showRecords={showTeamRecords}
            />
          ))}
          {/* Upcoming future-day games shown alongside today's slate (NBA/NHL
              playoffs, World Cup), above the Final separator so upcoming sits
              above finished. Today's full card is the lead, so the list is
              compact for NBA/NHL (firstFull=false). No "Upcoming" divider —
              the per-row dates already mark them (Jacob 6/4). */}
          {renderUpcoming && league.nextGameDay && league.nextGameDay.games.length > 0 &&
            renderUpcomingSlate(league.nextGameDay.games, false)}
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
              onShowDetails={onShowDetails}
              showStars={cardStars}
              showRecords={showTeamRecords}
            />
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}
