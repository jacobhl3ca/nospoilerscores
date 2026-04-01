"use client";

import { useState, useEffect } from "react";
import { Game, LeagueData, Sport } from "@/lib/types";
import { fetchNextGameDay } from "@/lib/espn";
import GameCard from "./GameCard";

interface LeagueColumnProps {
  league: LeagueData;
  isFavoriteLeague: boolean;
  onToggleFavoriteLeague: (sport: Sport) => void;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onNavigateToDate: (date: string) => void;
  onPlayHighlight: (url: string) => void;
  showRatings: boolean;
}

function formatDateLabel(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function LeagueColumn({
  league,
  isFavoriteLeague,
  onToggleFavoriteLeague,
  favoriteTeams,
  onToggleFavoriteTeam,
  onNavigateToDate,
  onPlayHighlight,
  showRatings,
}: LeagueColumnProps) {
  const getFavPriority = (game: Game) => {
    const ids = [game.homeTeam.id, game.awayTeam.id];
    let best = Infinity;
    for (const id of ids) {
      const idx = favoriteTeams.indexOf(id);
      if (idx !== -1 && idx < best) best = idx;
    }
    return best;
  };

  const sorted = [...league.games].sort((a, b) => {
    const aPri = getFavPriority(a);
    const bPri = getFavPriority(b);
    const aHasFav = aPri !== Infinity;
    const bHasFav = bPri !== Infinity;

    if (aHasFav && !bHasFav) return -1;
    if (bHasFav && !aHasFav) return 1;
    if (aHasFav && bHasFav) return aPri - bPri;

    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;

    if (a.state === "post" && b.state === "post") {
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    if (a.state === "post" && b.state === "pre") return -1;
    if (b.state === "post" && a.state === "pre") return 1;

    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-center gap-2 mb-3">
        <h2 className="text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
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
        <NextGamePreview
          sport={league.sport}
          favoriteTeams={favoriteTeams}
          onToggleFavoriteTeam={onToggleFavoriteTeam}
          onNavigateToDate={onNavigateToDate}
          onPlayHighlight={onPlayHighlight}
          showRatings={showRatings}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
              onPlayHighlight={onPlayHighlight}
              showRatings={showRatings}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NextGamePreview({
  sport,
  favoriteTeams,
  onToggleFavoriteTeam,
  onNavigateToDate,
  onPlayHighlight,
  showRatings,
}: {
  sport: Sport;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onNavigateToDate: (date: string) => void;
  onPlayHighlight: (url: string) => void;
  showRatings: boolean;
}) {
  const [nextDay, setNextDay] = useState<{ date: string; games: Game[] } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function findNext() {
      const result = await fetchNextGameDay(sport);
      if (!cancelled) {
        setNextDay(result);
        setChecking(false);
      }
    }
    findNext();
    return () => { cancelled = true; };
  }, [sport]);

  if (checking) {
    return <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>No games today</p>;
  }

  if (!nextDay) {
    return <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>No upcoming games this week</p>;
  }

  const formatted = formatDateLabel(nextDay.date);

  return (
    <div>
      {/* Next game day header — same style as league header */}
      <h3 className="text-base font-bold tracking-wide text-center mb-3" style={{ color: "var(--text)" }}>
        {formatted}
      </h3>

      {/* Preview games */}
      <div className="flex flex-col gap-2 mb-3">
        {nextDay.games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            favoriteTeams={favoriteTeams}
            onToggleFavoriteTeam={onToggleFavoriteTeam}
            onPlayHighlight={onPlayHighlight}
            showRatings={showRatings}
          />
        ))}
      </div>

      {/* Jump link */}
      <button
        onClick={() => onNavigateToDate(nextDay.date)}
        className="w-full text-center text-sm underline underline-offset-2 transition-colors py-2"
        style={{ color: "var(--accent)" }}
      >
        Jump to {formatted} →
      </button>
    </div>
  );
}
