"use client";

import { useEffect, useRef, useState } from "react";
import { Game, LeagueData, Sport } from "@/lib/types";
import { getGolfSubtitle } from "@/lib/golf";
import GameCard from "./GameCard";
import GolfLeaderboard from "./GolfLeaderboard";

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
}

// 2025-26 season playoff start dates (update each season)
const PLAYOFF_START_DATES: Record<string, { date: string; label: string; preDate?: string; preEndDate?: string; preLabel?: string }> = {
  nba: { date: "2026-04-18", label: "Playoffs", preDate: "2026-04-14", preEndDate: "2026-04-17", preLabel: "Play-in" },
  nhl: { date: "2026-04-18", label: "Playoffs" },
  mlb: { date: "2026-10-06", label: "Postseason" },
  nfl: { date: "2027-01-09", label: "Playoffs" },
  ncaam: { date: "2026-03-17", label: "March Madness" },
};

// Extract short round name from ESPN's long headline
// e.g. "NCAA Men's Basketball Championship - National Championship" → "National Championship"
// e.g. "ALWC - Game 2" → "AL Wild Card · Game 2"
function shortenPlayoffLabel(headline: string): string {
  // Take everything after the last " - " separator
  const parts = headline.split(" - ");
  const round = parts[parts.length - 1].trim();
  return round;
}

function getPlayoffSubtitle(sport: Sport, selectedDate: string, games?: Game[]): { tiers: string[] } | null {
  const config = PLAYOFF_START_DATES[sport];
  if (!config) return null;
  const y = +selectedDate.slice(0, 4);
  const m = +selectedDate.slice(4, 6) - 1;
  const d = +selectedDate.slice(6, 8);
  const viewDate = new Date(y, m, d);
  const playoffDate = new Date(config.date + "T12:00:00");
  const diff = playoffDate.getTime() - viewDate.getTime();

  // Playoffs already started — show round name from game data
  if (diff <= 0) {
    if (!games?.length) return null;
    const label = games.find(g => g.playoffLabel)?.playoffLabel;
    if (!label) return null;
    const text = shortenPlayoffLabel(label);
    return { tiers: [text] };
  }

  // Only flag the pre-playoff window (e.g. NBA play-in) DURING the window itself.
  // Outside it, fall through to the regular "playoffs start" countdown.
  if (config.preDate && config.preEndDate && config.preLabel) {
    const [py, pm, pd] = config.preDate.split("-").map(Number);
    const [ey, em, ed] = config.preEndDate.split("-").map(Number);
    const preDate = new Date(py, pm - 1, pd);
    const preEndDate = new Date(ey, em - 1, ed);
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
  const ref = useRef<HTMLSpanElement>(null);
  const result = getPlayoffSubtitle(sport, selectedDate, games);
  const tiers = result?.tiers ?? [];
  const [tierIdx, setTierIdx] = useState(0);

  useEffect(() => {
    setTierIdx(0);
  }, [tiers.join("|")]);

  // After rendering current tier, step down if it overflows
  useEffect(() => {
    if (!tiers.length) return;
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      // italic letters overhang their layout box — scrollWidth measures the layout
      // box, not the rendered ink, so a visually-clipped trailing ")" doesn't show
      // up as overflow. Re-measure the text width via a hidden probe with the same
      // font, and compare to the container's content width.
      const cs = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};font-style:${cs.fontStyle};`;
      probe.textContent = el.textContent || "";
      document.body.appendChild(probe);
      const textPx = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);
      const padX = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
      const available = el.clientWidth - padX;
      if (textPx > available - 2 && tierIdx < tiers.length - 1) {
        setTierIdx(tierIdx + 1);
      }
    });
  });

  // Re-check on resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTierIdx(0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className="text-[9px] sm:text-[10px] italic mt-0.5 whitespace-nowrap block max-w-full overflow-hidden text-center pr-0.5"
      style={{ color: tiers.length ? "var(--text-muted)" : "transparent" }}
    >
      {tiers.length ? tiers[tierIdx] : "\u00A0"}
    </span>
  );
}

// Italic round-wording subtitle for golf leagues — drops in where
// PlayoffSubtitle would for team sports. The subtitle is the single
// place round wording lives (the leaderboard card no longer repeats it),
// so it must render a value for every day of the tournament. When the
// tournament is mid-event we wrap the text in a link to ESPN's
// leaderboard — gives users a clickable "live" anchor even between
// groups when the card's green indicator is absent.
function GolfSubtitle({ league, selectedDate }: { league: LeagueData; selectedDate: string }) {
  const t = league.golfTournament;
  const text = t ? getGolfSubtitle(t, selectedDate) : null;
  const href =
    t && t.state === "in" && t.leaderboardUrl ? t.leaderboardUrl : null;
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
}: LeagueColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [useAbbreviations, setUseAbbreviations] = useState(true); // start abbreviated, expand if room

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
        g.awayTeam.shortDisplayName,
        g.homeTeam.shortDisplayName,
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

  const showHeader = section !== "finished";
  const renderUpcoming = section !== "finished";
  const renderFinished = section !== "upcoming";

  return (
    <div ref={columnRef} className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
      {showHeader && (
        <div className="flex flex-col items-center mb-2 sm:mb-3">
          <div className="flex items-center justify-center">
            <span className="text-sm invisible mr-1.5" aria-hidden="true">★</span>
            <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
              {league.label}
            </h2>
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
      {league.golfTournament && section !== "finished" ? (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

