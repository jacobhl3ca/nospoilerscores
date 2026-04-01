"use client";

import { useState } from "react";
import { Game } from "@/lib/types";
import { searchFirstVideoId, getYouTubeEmbedUrl, getYouTubeSearchUrl, buildHighlightQuery } from "@/lib/youtube";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onPlayHighlight: (url: string) => void;
  showRatings: boolean;
}

function TeamRow({
  team,
  isFavorite,
  onToggleFavorite,
}: {
  team: { id: string; abbreviation: string; shortDisplayName: string; logo: string; record: string };
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <img
        src={team.logo}
        alt={team.abbreviation}
        width={24}
        height={24}
        className="w-6 h-6 object-contain"
      />
      <span className="flex-1 text-sm flex items-center gap-1.5" style={{ color: "var(--text)" }}>
        {team.shortDisplayName}
        {team.record && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>({team.record})</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`text-xs transition-colors ${isFavorite ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
          style={isFavorite ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          ★
        </button>
      </span>
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  let color = "bg-gray-500";
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
    color = "bg-red-700";
    label = "SKIP";
  }

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase`}>
      {label}
    </span>
  );
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, onPlayHighlight, showRatings }: GameCardProps) {
  const [loadingHighlight, setLoadingHighlight] = useState(false);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";

  const handleHighlightClick = async () => {
    setLoadingHighlight(true);
    const date = new Date(game.date);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const query = buildHighlightQuery(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr);

    const videoId = await searchFirstVideoId(query);
    if (videoId) {
      onPlayHighlight(getYouTubeEmbedUrl(videoId));
    } else {
      // Fallback: open YouTube search in new tab
      window.open(getYouTubeSearchUrl(query), "_blank");
    }
    setLoadingHighlight(false);
  };

  return (
    <div
      className="rounded-lg px-4 py-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>
          {game.state === "in" ? (
            <span className="text-green-500 font-medium">● LIVE</span>
          ) : game.state === "post" ? (
            "FINAL"
          ) : (
            game.statusDetail
          )}
        </span>
        <div className="flex items-center gap-2">
          {showRating && <RatingBadge rating={game.rating!} />}
          {game.broadcasts.length > 0 && (
            <span style={{ color: "var(--text-muted)" }}>{game.broadcasts[0]}</span>
          )}
        </div>
      </div>

      {/* Teams */}
      <TeamRow
        team={game.awayTeam}
        isFavorite={favoriteTeams.includes(game.awayTeam.id)}
        onToggleFavorite={() => onToggleFavoriteTeam(game.awayTeam.id)}
      />
      <TeamRow
        team={game.homeTeam}
        isFavorite={favoriteTeams.includes(game.homeTeam.id)}
        onToggleFavorite={() => onToggleFavoriteTeam(game.homeTeam.id)}
      />

      {/* Highlights button for finished games */}
      {isFinished && (
        <button
          onClick={handleHighlightClick}
          disabled={loadingHighlight}
          className="highlight-btn mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--bg-card-hover)",
            color: "var(--accent)",
            opacity: loadingHighlight ? 0.6 : 1,
          }}
        >
          {loadingHighlight ? (
            "Loading..."
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Highlights
            </>
          )}
        </button>
      )}
    </div>
  );
}
