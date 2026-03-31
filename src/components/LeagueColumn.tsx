"use client";

import { useState, useEffect } from "react";
import { LeagueData, Sport } from "@/lib/types";
import GameCard from "./GameCard";

interface LeagueColumnProps {
  league: LeagueData;
  spoilerFree: boolean;
  isFavoriteLeague: boolean;
  onToggleFavoriteLeague: (sport: Sport) => void;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onNavigateToDate: (date: string) => void;
}

export default function LeagueColumn({
  league,
  spoilerFree,
  isFavoriteLeague,
  onToggleFavoriteLeague,
  favoriteTeams,
  onToggleFavoriteTeam,
  onNavigateToDate,
}: LeagueColumnProps) {
  // Sort: favorite teams first (by priority), then live, then by rating, then upcoming
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

    // Favorite teams first, ordered by priority (lower index = higher priority)
    if (aHasFav && !bHasFav) return -1;
    if (bHasFav && !aHasFav) return 1;
    if (aHasFav && bHasFav) return aPri - bPri;

    // Live games first
    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;

    // Finished games sorted by rating (best game first)
    if (a.state === "post" && b.state === "post") {
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    // Finished before upcoming
    if (a.state === "post" && b.state === "pre") return -1;
    if (b.state === "post" && a.state === "pre") return 1;

    // Upcoming sorted by start time
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-center gap-2 mb-3">
        <h2 className="text-lg font-bold tracking-wide">
          {league.label}
        </h2>
        <button
          onClick={() => onToggleFavoriteLeague(league.sport)}
          className={`text-sm transition-colors ${isFavoriteLeague ? "text-yellow-400" : "text-gray-700 hover:text-gray-400"}`}
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
              spoilerFree={spoilerFree}
              favoriteTeams={favoriteTeams}
              onToggleFavoriteTeam={onToggleFavoriteTeam}
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
  // Check next 7 days for games
  const [nextGameDate, setNextGameDate] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function findNext() {
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        try {
          const res = await fetch(`/api/scores?date=${dateStr}`);
          const data = await res.json();
          const league = data.find((l: any) => l.sport === sport);
          if (league && league.games.length > 0) {
            if (!cancelled) {
              setNextGameDate(dateStr);
              setChecking(false);
            }
            return;
          }
        } catch {}
      }
      if (!cancelled) setChecking(false);
    }
    findNext();
    return () => { cancelled = true; };
  }, [sport]);

  if (checking) {
    return <p className="text-center text-gray-500 text-sm py-8">No games today</p>;
  }

  if (!nextGameDate) {
    return <p className="text-center text-gray-500 text-sm py-8">No upcoming games this week</p>;
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
      <p className="text-gray-500 mb-2">No games today</p>
      <button
        onClick={() => onNavigateToDate(nextGameDate)}
        className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
      >
        Next game {formatted} →
      </button>
    </div>
  );
}
