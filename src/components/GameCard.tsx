"use client";

import { Game } from "@/lib/types";

interface GameCardProps {
  game: Game;
  spoilerFree: boolean;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
}

function TeamRow({
  team,
  isWinner,
  spoilerFree,
  gameState,
  isFavorite,
  onToggleFavorite,
}: {
  team: { id: string; abbreviation: string; shortDisplayName: string; logo: string; color: string; score: string; record: string; winner: boolean };
  isWinner: boolean;
  spoilerFree: boolean;
  gameState: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 py-1.5 ${isWinner && !spoilerFree ? "font-bold" : ""}`}>
      <img
        src={team.logo}
        alt={team.abbreviation}
        width={24}
        height={24}
        className="w-6 h-6 object-contain"
      />
      <span className="flex-1 text-sm flex items-center gap-1.5">
        {team.shortDisplayName}
        {team.record && (
          <span className="text-xs text-gray-500">({team.record})</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`text-xs transition-colors ${isFavorite ? "text-yellow-400" : "text-gray-700 hover:text-gray-400"}`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          ★
        </button>
      </span>
      {gameState !== "pre" && (
        <span className="text-sm tabular-nums w-8 text-right">
          {spoilerFree ? "–" : team.score}
        </span>
      )}
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  let color = "bg-gray-600";
  let label = "OK";
  if (rating >= 85) {
    color = "bg-green-600";
    label = "GREAT";
  } else if (rating >= 70) {
    color = "bg-yellow-600";
    label = "GOOD";
  } else if (rating >= 50) {
    color = "bg-orange-600";
    label = "MEH";
  } else {
    color = "bg-red-800";
    label = "SKIP";
  }

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase`}>
      {label}
    </span>
  );
}

export default function GameCard({ game, spoilerFree, favoriteTeams, onToggleFavoriteTeam }: GameCardProps) {
  const showRating = game.state === "post" && game.rating !== null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 hover:border-white/20 transition-colors">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
        <span>
          {game.state === "in" ? (
            <span className="text-green-400 font-medium">
              ● {spoilerFree ? "LIVE" : game.statusDetail}
            </span>
          ) : game.state === "post" ? (
            spoilerFree ? "FINAL" : game.statusDetail
          ) : (
            game.statusDetail
          )}
        </span>
        <div className="flex items-center gap-2">
          {showRating && !spoilerFree && (
            <RatingBadge rating={game.rating!} />
          )}
          {game.broadcasts.length > 0 && (
            <span className="text-gray-500">{game.broadcasts[0]}</span>
          )}
        </div>
      </div>

      {/* Teams */}
      <TeamRow
        team={game.awayTeam}
        isWinner={game.awayTeam.winner}
        spoilerFree={spoilerFree}
        gameState={game.state}
        isFavorite={favoriteTeams.includes(game.awayTeam.id)}
        onToggleFavorite={() => onToggleFavoriteTeam(game.awayTeam.id)}
      />
      <TeamRow
        team={game.homeTeam}
        isWinner={game.homeTeam.winner}
        spoilerFree={spoilerFree}
        gameState={game.state}
        isFavorite={favoriteTeams.includes(game.homeTeam.id)}
        onToggleFavorite={() => onToggleFavoriteTeam(game.homeTeam.id)}
      />
    </div>
  );
}
