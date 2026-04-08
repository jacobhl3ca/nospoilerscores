"use client";

import { Game, LeagueData, Sport } from "@/lib/types";
import GameCard from "./GameCard";

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
}

// 2025-26 season playoff start dates (update each season)
const PLAYOFF_START_DATES: Record<string, { date: string; label: string }> = {
  nba: { date: "2026-04-19", label: "Playoffs" },
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

function getPlayoffSubtitle(sport: Sport, selectedDate: string, games?: Game[]): string | null {
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
    return shortenPlayoffLabel(label);
  }

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days > 30) return null; // only show within 1 month
  const weeks = Math.floor(days / 7);
  const playoffDateLabel = playoffDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeLabel = weeks >= 2 ? `${weeks} wks` : days === 1 ? "tomorrow" : `${days}d`;
  return `${config.label} start ${playoffDateLabel} (${timeLabel})`;
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
}: LeagueColumnProps) {
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

  // Split into sections for rendering separators
  const liveGames = sorted.filter((g) => g.state === "in");
  const preGames = sorted.filter((g) => g.state === "pre");
  const postGames = sorted.filter((g) => g.state === "post");
  const hasSections = !isPastDate && (
    (liveGames.length > 0 || preGames.length > 0) && postGames.length > 0
  );

  return (
    <div className="flex-1 min-w-0 max-w-[225px]">
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
        {(() => {
          const subtitle = getPlayoffSubtitle(league.sport, selectedDate, league.games);
          return (
            <span className="text-[9px] sm:text-[10px] italic mt-0.5" style={{ color: subtitle ? "var(--text-muted)" : "transparent" }}>
              {subtitle || "\u00A0"}
            </span>
          );
        })()}
      </div>
      {sorted.length === 0 ? (
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
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-xs sm:text-sm py-6 sm:py-8" style={{ color: "var(--text-muted)" }}>No upcoming games</p>
        )
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
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Live games */}
          {liveGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              isToday={isToday}
            />
          ))}
          {/* Upcoming games */}
          {preGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              isToday={isToday}
            />
          ))}
          {/* Separator between upcoming/live and finished */}
          {hasSections && (
            <div className="flex items-center gap-2 my-1" style={{ color: "var(--text-muted)", opacity: 0.4 }}>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-[10px] uppercase tracking-wide">Final</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
          )}
          {/* Finished games */}
          {postGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              showRatings={showRatings}
              onPlayHighlight={onPlayHighlight}
              isPastDate={false}
              isToday={isToday}
            />
          ))}
        </div>
      )}
    </div>
  );
}

