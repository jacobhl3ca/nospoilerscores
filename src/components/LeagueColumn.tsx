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
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-center gap-1.5 mb-2 sm:mb-3">
        <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
          {league.label}
        </h2>
        <button
          onClick={() => onToggleFavoriteLeague(league.sport)}
          className={`text-sm transition-colors ${isFavoriteLeague ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
          style={isFavoriteLeague ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
          title={isFavoriteLeague ? "Remove favorite league" : "Set as favorite league"}
        >
          ★
        </button>
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
            <div className="flex items-center justify-center gap-1.5 my-1" style={{ color: "var(--text-muted)", opacity: 0.3 }}>
              <span>·</span><span>·</span><span>·</span>
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

