"use client";

import { Game } from "@/lib/types";
import { getYouTubeSearchEmbedUrl, buildHighlightQuery } from "@/lib/youtube";

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
    <div className="flex items-center gap-3 py-1.5 sm:flex">
      <img
        src={team.logo}
        alt={team.abbreviation}
        width={24}
        height={24}
        className="w-6 h-6 object-contain"
      />
      <span className="hidden sm:flex flex-1 text-sm items-center gap-1.5" style={{ color: "var(--text)" }}>
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
      {/* Mobile: show abbreviation only */}
      <span className="sm:hidden text-xs flex items-center gap-1" style={{ color: "var(--text)" }}>
        {team.abbreviation}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`text-[10px] transition-colors ${isFavorite ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
          style={isFavorite ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
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

function EspnIcon({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="opacity-40 hover:opacity-70 transition-opacity"
      title="View on ESPN"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 8h6M7 12h10M7 16h4" />
      </svg>
    </a>
  );
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, onPlayHighlight, showRatings }: GameCardProps) {
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";

  const handleHighlightClick = () => {
    const date = new Date(game.date);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const query = buildHighlightQuery(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr);
    onPlayHighlight(getYouTubeSearchEmbedUrl(query));
  };

  // ESPN game page URL
  const espnUrl = game.recapUrl || null;

  return (
    <div
      className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between mb-1 sm:mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>
          {game.state === "in" ? (
            <span className="text-green-500 font-medium">● LIVE</span>
          ) : game.state === "post" ? (
            "FINAL"
          ) : (
            <span className="text-[11px]">{game.statusDetail}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {showRating && <RatingBadge rating={game.rating!} />}
          {isFuture && espnUrl && <EspnIcon href={espnUrl} />}
          {game.broadcasts.length > 0 && (
            <span className="hidden sm:inline" style={{ color: "var(--text-muted)" }}>{game.broadcasts[0]}</span>
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
          className="highlight-btn mt-1 sm:mt-2 w-full flex items-center justify-center gap-1.5 py-1 sm:py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--bg-card-hover)",
            color: "var(--accent)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
          <span className="hidden sm:inline">Highlights</span>
          <span className="sm:hidden">▶</span>
        </button>
      )}
    </div>
  );
}
