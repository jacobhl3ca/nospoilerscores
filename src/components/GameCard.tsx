"use client";

import { Game } from "@/lib/types";
import { getYouTubeSearchUrl } from "@/lib/youtube";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  nextGameDate?: string; // e.g. "Sat 4/4" — shown bold on card when it's a future date preview
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

// ESPN link with real logo
function EspnLink({ href, title }: { href: string; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="opacity-40 hover:opacity-70 transition-opacity flex-shrink-0"
      title={title || "View on ESPN"}
    >
      <img
        src="https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/espn.png&w=40&h=40"
        alt="ESPN"
        className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
      />
    </a>
  );
}

function getStreamUrl(broadcast: string): string | null {
  const b = broadcast.toLowerCase();
  if (b.includes("espn") || b === "abc") return "https://www.espn.com/watch/";
  if (b === "tnt" || b === "tbs" || b === "trutv") return "https://www.max.com/live-tv";
  if (b === "nba tv") return "https://www.nba.com/watch/";
  if (b === "mlb network" || b === "mlb.tv") return "https://www.mlb.com/tv";
  if (b === "fox" || b === "fs1" || b === "fs2") return "https://www.foxsports.com/live";
  if (b === "nbc" || b === "usa" || b === "peacock") return "https://www.peacocktv.com/";
  if (b === "nhl network") return "https://www.nhl.com/tv";
  return null;
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings, nextGameDate }: GameCardProps) {
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";
  const isLive = game.state === "in";
  const espnUrl = game.recapUrl || null;
  const streamUrl = game.broadcasts.length > 0 ? getStreamUrl(game.broadcasts[0]) : null;
  const liveUrl = streamUrl || espnUrl;

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
          {isLive ? (
            liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-green-500 font-medium hover:text-green-400 transition-colors">● LIVE</a>
            ) : (
              <span className="text-green-500 font-medium">● LIVE</span>
            )
          ) : isFinished ? (
            "FINAL"
          ) : nextGameDate ? (
            <span className="text-[11px]"><span className="font-bold" style={{ color: "var(--text)" }}>{nextGameDate}</span>{game.statusDetail ? ` ${game.statusDetail}` : ""}</span>
          ) : (
            <span className="text-[11px]">{game.statusDetail}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {showRating && <RatingBadge rating={game.rating!} />}
          {game.broadcasts.length > 0 && (
            <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
              {game.broadcasts[0]}
            </span>
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

      {/* Bottom bar: highlights (finished) or ESPN link (future/live) */}
      {(isFinished || (!isFinished && espnUrl)) && (
        <div className="flex items-center justify-between mt-1 sm:mt-2">
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
          {!isFinished && espnUrl && <EspnLink href={espnUrl} />}
        </div>
      )}
    </div>
  );
}
