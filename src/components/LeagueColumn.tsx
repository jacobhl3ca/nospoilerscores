"use client";

import { useState, useEffect } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { fetchNextGameDate } from "@/lib/espn";
import GameCard from "./GameCard";

interface LeagueColumnProps {
  league: LeagueData;
  isFavoriteLeague: boolean;
  onToggleFavoriteLeague: (sport: Sport) => void;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onNavigateToDate: (date: string) => void;
  onPlayHighlight: (url: string) => void;
}

export default function LeagueColumn({
  league,
  isFavoriteLeague,
  onToggleFavoriteLeague,
  favoriteTeams,
  onToggleFavoriteTeam,
  onNavigateToDate,
  onPlayHighlight,
}: LeagueColumnProps) {
  const getFavPriority = (game: typeof league.games[0]) => {
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
        <NoGames
          sport={league.sport}
          label={league.label}
          onNavigateToDate={onNavigateToDate}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoGames({
  sport,
  label,
  onNavigateToDate,
}: {
  sport: Sport;
  label: string;
  onNavigateToDate: (date: string) => void;
}) {
  const [nextGameDate, setNextGameDate] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function findNext() {
      const date = await fetchNextGameDate(sport);
      if (!cancelled) {
        if (date) setNextGameDate(date);
        setChecking(false);
      }
    }
    findNext();
    return () => { cancelled = true; };
  }, [sport]);

  if (checking) {
    return <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>No games today</p>;
  }

  if (!nextGameDate) {
    return <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>No upcoming games this week</p>;
  }

  const y = nextGameDate.slice(0, 4);
  const m = nextGameDate.slice(4, 6);
  const d = nextGameDate.slice(6, 8);
  const formatted = new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="text-center text-sm py-8">
      <p className="mb-2" style={{ color: "var(--text-muted)" }}>No games today</p>
      <button
        onClick={() => onNavigateToDate(nextGameDate)}
        className="underline underline-offset-2 transition-colors"
        style={{ color: "var(--accent)" }}
      >
        Next game {formatted} →
      </button>
    </div>
  );
}
