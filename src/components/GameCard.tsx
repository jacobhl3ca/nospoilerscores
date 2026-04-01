"use client";

import { Game } from "@/lib/types";
import { getYouTubeSearchUrl } from "@/lib/youtube";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
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
    <div className="flex items-center gap-2 sm:gap-3 py-1 sm:py-1.5">
      <img
        src={team.logo}
        alt={team.abbreviation}
        width={24}
        height={24}
        className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
      />
      {/* Desktop: full name + record + star */}
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
      {/* Mobile: abbreviation + star */}
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

// Grey ESPN "E" logo
function EspnLogo({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="opacity-30 hover:opacity-60 transition-opacity flex-shrink-0"
      title="Preview on ESPN"
    >
      <svg width="20" height="14" viewBox="0 0 40 28" fill="currentColor" style={{ color: "var(--text-muted)" }}>
        <rect width="40" height="28" rx="3" fill="currentColor" opacity="0.15" />
        <text x="20" y="20" textAnchor="middle" fontSize="18" fontWeight="900" fontFamily="system-ui" fill="currentColor">
          E
        </text>
      </svg>
    </a>
  );
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings }: GameCardProps) {
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";
  const espnUrl = game.recapUrl || null;

  const highlightUrl = isFinished
    ? getYouTubeSearchUrl(
        game.awayTeam.shortDisplayName,
        game.homeTeam.shortDisplayName,
        new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      )
    : null;

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
          {isFuture && espnUrl && <EspnLogo href={espnUrl} />}
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

      {/* Bottom bar: highlights + broadcast */}
      <div className="flex items-center justify-between mt-1 sm:mt-2">
        {/* Highlights button */}
        {isFinished && highlightUrl ? (
          <a
            href={highlightUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="highlight-btn flex items-center gap-1.5 py-1 sm:py-1.5 px-2 sm:px-3 rounded-md text-xs font-medium"
            style={{
              background: "var(--bg-card-hover)",
              color: "var(--accent)",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            <span className="hidden sm:inline">Highlights</span>
            <span className="sm:hidden">▶</span>
          </a>
        ) : (
          <span />
        )}

        {/* Broadcast channel — bottom right */}
        {game.broadcasts.length > 0 && (
          <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
            {game.broadcasts[0]}
          </span>
        )}
      </div>
    </div>
  );
}
