"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect warns in SSR; on the client we want the sync measurement.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Game, LeagueData, Sport, Team } from "@/lib/types";
import { displayShortName } from "@/lib/espn";
import { getGolfSubtitle } from "@/lib/golf";
import GameCard from "./GameCard";
import GolfLeaderboard from "./GolfLeaderboard";
import TeamView from "./TeamView";

interface LeagueColumnProps {
  league: LeagueData;
  isFavoriteLeague: boolean;
  onToggleFavoriteLeague: (sport: Sport) => void;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  isPastDate: boolean;
  isToday?: boolean;
  sortByMatchups?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
  selectedDate: string; // YYYYMMDD
  section?: "upcoming" | "finished"; // split rendering for cross-column Final separator
  showFinalSeparator?: boolean; // inline "Final" divider between live/pre and post games
  // 3rd league slot swapping
  swappableOptions?: { sport: Sport; label: string }[];
  selectedThirdLeague?: Sport;
  onSwapLeague?: (sport: Sport | undefined) => void;
}

// 2025-26 season playoff start dates (update each season)
const PLAYOFF_START_DATES: Record<string, { date: string; label: string; preDate?: string; preEndDate?: string; preLabel?: string }> = {
  nba: { date: "2026-04-18", label: "Playoffs", preDate: "2026-04-14", preEndDate: "2026-04-17", preLabel: "Play-in" },
  nhl: { date: "2026-04-18", label: "Playoffs" },
  mlb: { date: "2026-10-06", label: "Postseason" },
  nfl: { date: "2027-01-09", label: "Playoffs" },
  ncaam: { date: "2026-03-17", label: "March Madness" },
};

// Strip generic "Stanley Cup Playoffs" / "NBA Playoffs" / "NCAA … Championship"
// prefix segments so a label like "Stanley Cup Playoffs - First Round" reads
// "First Round". Real round info (e.g. "East 1st Round" for NBA/NHL playoffs)
// gets preserved and joined with the game number when both are present.
const GENERIC_LABEL_SEGMENT = /^(?:stanley cup playoffs?|nba playoffs?|nhl playoffs?|playoffs?|postseason|ncaa (?:men'?s|women'?s)?\s*basketball championship|ncaa basketball championship)$/i;

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

// Big Inning live window in ET. Hardcoded for now — Big Inning typically
// airs nightly during the regular season starting ~7pm ET and running for
// ~3 hours. Replace with per-night data once we accumulate observations of
// real start/end times from mlb.com/network/shows/big-inning and the MLB
// Network linear schedule.
const BIG_INNING_LIVE_START_HOUR_ET = 19;
const BIG_INNING_LIVE_END_HOUR_ET = 22;
function isInBigInningLiveWindow(): boolean {
  // toLocaleString in America/New_York gives us ET regardless of viewer TZ
  const etStr = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
  });
  const m = etStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return false;
  const hours = parseInt(m[1], 10);
  return hours >= BIG_INNING_LIVE_START_HOUR_ET && hours < BIG_INNING_LIVE_END_HOUR_ET;
}

function getPlayoffSubtitle(sport: Sport, selectedDate: string, games?: Game[]): SubtitleResult | null {
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

  // MLB regular season: link to MLB Network's nightly Big Inning whip-around
  // show in place of the (still-far-off) postseason countdown. During the
  // live window we point at mlb.com/network/live (the linear stream); the
  // rest of the day we point at the show landing page. The bare /big-inning
  // path 404s — /network/shows/big-inning is the canonical reference page.
  if (sport === "mlb" && games?.length) {
    if (isInBigInningLiveWindow()) {
      return {
        tiers: ["Big Inning · LIVE", "Big Inning"],
        href: "https://www.mlb.com/network/live",
      };
    }
    return {
      tiers: ["Big Inning · 7pm ET", "Big Inning · 7pm"],
      href: "https://www.mlb.com/network/shows/big-inning",
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

function PlayoffSubtitle({ sport, selectedDate, games }: { sport: Sport; selectedDate: string; games?: Game[] }) {
  const ref = useRef<HTMLElement>(null);
  const result = getPlayoffSubtitle(sport, selectedDate, games);
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

  const baseCls = "text-[9px] sm:text-[10px] italic mt-0.5 whitespace-nowrap block max-w-full overflow-hidden text-center pr-0.5";
  const baseStyle = {
    color: tiers.length ? "var(--text-muted)" : "transparent",
    visibility: ready || !tiers.length ? ("visible" as const) : ("hidden" as const),
  };
  const text = tiers.length ? tiers[tierIdx] : "\u00A0";
  if (href && tiers.length) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseCls} hover:underline transition-colors`}
        style={baseStyle}
      >
        {text}
      </a>
    );
  }
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={baseCls} style={baseStyle}>
      {text}
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
  isFavoriteLeague,
  onToggleFavoriteLeague,
  favoriteTeams,
  onToggleFavoriteTeam,
  showRatings,
  isPastDate,
  isToday,
  sortByMatchups,
  onPlayHighlight,
  selectedDate,
  section,
  showFinalSeparator,
  swappableOptions,
  selectedThirdLeague,
  onSwapLeague,
}: LeagueColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef<HTMLDivElement>(null);
  const [useAbbreviations, setUseAbbreviations] = useState(true); // start abbreviated, expand if room
  const [swapOpen, setSwapOpen] = useState(false);
  const [teamViewTeam, setTeamViewTeam] = useState<Team | null>(null);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;

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

    // Monkey OFF (topMatchups === false): fully chronological
    if (!topMatchups) {
      // Still group live games first (they're actively happening)
      if (a.state === "in" && b.state !== "in") return -1;
      if (b.state === "in" && a.state !== "in") return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }

    // Monkey ON: competitive sort
    // Live games first, sorted by rating
    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;
    if (a.state === "in" && b.state === "in") {
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
    <div ref={columnRef} className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] min-h-[60vh]">
      {showHeader && (
        <div className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30" style={{ background: "var(--bg)", paddingTop: "1.75rem" }}>
          <div className="flex items-center justify-center">
            <span className="text-sm invisible mr-1.5" aria-hidden="true">★</span>
            {isSwappable ? (
              <div ref={swapRef} className="relative">
                <button
                  onClick={() => setSwapOpen(!swapOpen)}
                  className="flex items-center gap-0.5 cursor-pointer transition-colors hover:opacity-80"
                  style={{ color: "var(--text)" }}
                  title="Switch league"
                >
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    {league.label}
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
                    {/* Auto option — reset to default */}
                    {selectedThirdLeague && (
                      <button
                        onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                        className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        Auto
                      </button>
                    )}
                    {swappableOptions!.map((opt) => (
                      <button
                        key={opt.sport}
                        onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                        className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                        style={{
                          color: opt.sport === league.sport ? "var(--accent)" : "var(--text)",
                          fontWeight: opt.sport === league.sport ? 600 : 400,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
                {league.label}
              </h2>
            )}
            <button
              onClick={() => onToggleFavoriteLeague(league.sport)}
              className={`text-sm transition-colors ml-1.5 ${isFavoriteLeague ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
              style={isFavoriteLeague ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
              title={isFavoriteLeague ? "Remove favorite league" : "Set as favorite league"}
            >
              ★
            </button>
          </div>
          {league.golfTournament ? (
            <GolfSubtitle league={league} selectedDate={selectedDate} />
          ) : (
            <PlayoffSubtitle sport={league.sport} selectedDate={selectedDate} games={league.games} />
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
          isPastDate ? (
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
                  nextGameDate={formatDateCompact(league.nextGameDay!.date)}
                  useAbbreviations={useAbbreviations}
                  onSelectTeam={setTeamViewTeam}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>No upcoming games</p>
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
              isPastDate={false}
              isToday={isToday}
              useAbbreviations={useAbbreviations}
              onSelectTeam={setTeamViewTeam}
            />
          ))}
        </div>
      )}
    </div>
  );
}

