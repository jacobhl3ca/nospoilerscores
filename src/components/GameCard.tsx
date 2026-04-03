"use client";

import { useEffect, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { getYouTubeSearchUrl, getHighlightSearchQuery, fetchFirstVideoId } from "@/lib/youtube";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  nextGameDate?: string;
  isPastDate?: boolean;
  isToday?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
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

/* --- ESPN link (commented out — revisit: fit small into card without adding row) ---
function EspnLink({ href, title }: { href: string; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="opacity-40 hover:opacity-70 transition-opacity flex-shrink-0"
      title={title || "View on ESPN"}>
      <img src="https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/espn.png&w=40&h=40"
        alt="ESPN" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
    </a>
  );
}
*/

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

function formatGameProgress(game: Game): string {
  const { sport, statusDetail, clock, period } = game;
  if (sport === "mlb") {
    // statusDetail is like "Top 5th", "Bot 7th", "Mid 3rd", "End 6th"
    const m = statusDetail.match(/^(Top|Bot|Mid|End)\s+(\d+)/i);
    if (m) {
      const half = m[1].toLowerCase();
      const inn = m[2];
      if (half === "top") return `▲${inn}`;
      if (half === "bot") return `▼${inn}`;
      if (half === "mid") return `▲${inn}`; // mid inning = top half ending
      if (half === "end") return `▼${inn}`; // end inning = bot half ending
    }
    return statusDetail;
  }
  if (sport === "nba" || sport === "ncaam") {
    // e.g. "Q3 4:32" or "OT 1:20" or "Half"
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return `${q} ${clock}`;
    if (statusDetail.toLowerCase().includes("half")) return "Half";
    return q;
  }
  if (sport === "nhl") {
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : `${period - 3}OT`;
    if (clock && clock !== "0.0") return `${p} ${clock}`;
    return p;
  }
  if (sport === "nfl") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return `${q} ${clock}`;
    if (statusDetail.toLowerCase().includes("half")) return "Half";
    return q;
  }
  return statusDetail;
}

function cleanStatusDetail(detail: string, stripDate: boolean): string {
  let cleaned = detail.replace(/\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT)\s*$/i, "");
  if (stripDate) cleaned = cleaned.replace(/^\d{1,2}\/\d{1,2}\s*-\s*/, "");
  return cleaned.trim();
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings, nextGameDate, isPastDate, isToday, onPlayHighlight }: GameCardProps) {
  const prefetchedVideoId = useRef<string | null>(null);
  const prefetchStarted = useRef(false);
  const [fetchingOnClick, setFetchingOnClick] = useState(false);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";
  const isLive = game.state === "in";
  const espnUrl = game.recapUrl || null;
  const streamUrl = game.broadcasts.length > 0 ? getStreamUrl(game.broadcasts[0]) : null;
  const liveUrl = streamUrl || espnUrl;
  const localTime = isFuture ? cleanStatusDetail(game.statusDetail, true) : null;
  const awayTBD = game.awayTeam.shortDisplayName === "TBD" || !game.awayTeam.abbreviation;
  const homeTBD = game.homeTeam.shortDisplayName === "TBD" || !game.homeTeam.abbreviation;
  const gameProgress = isLive ? formatGameProgress(game) : null;
  const longBroadcast = game.broadcasts.length > 0 && game.broadcasts[0].length >= 8;

  const highlightsReady = isFinished && (() => {
    if (!isToday) return true;
    const gameStart = new Date(game.date).getTime();
    const bufferMs = 4.5 * 60 * 60 * 1000;
    return Date.now() > gameStart + bufferMs;
  })();

  const dateStr = new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const highlightUrl = highlightsReady
    ? getYouTubeSearchUrl(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote)
    : null;

  // Pre-fetch YouTube video ID in background
  useEffect(() => {
    if (!highlightUrl || prefetchStarted.current) return;
    prefetchStarted.current = true;
    const query = getHighlightSearchQuery(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote);
    fetchFirstVideoId(query).then((id) => {
      prefetchedVideoId.current = id;
    });
  }, [highlightUrl, game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr]);

  const star = (teamId: string, isFav: boolean, isTBD: boolean) =>
    !isTBD ? (
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavoriteTeam(teamId); }}
        className={`text-[10px] sm:text-xs transition-colors cursor-pointer ${isFav ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
        style={isFav ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
      >★</button>
    ) : null;

  const logo = (team: typeof game.awayTeam, isTBD: boolean) =>
    isTBD ? (
      <span className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs rounded" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>
    ) : (
      <img src={team.logo} alt={team.abbreviation} width={24} height={24} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
    );

  return (
    <div
      className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status bar */}
      <div className="flex items-center mb-1 sm:mb-2 text-xs min-h-[18px] relative" style={{ color: "var(--text-muted)" }}>
        <span>
          {isLive ? (
            liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-green-500 font-medium hover:text-green-400 transition-colors">● {gameProgress}</a>
            ) : (
              <span className="text-green-500 font-medium">● {gameProgress}</span>
            )
          ) : isPastDate && isFinished ? (
            null
          ) : isFinished ? (
            "FINAL"
          ) : nextGameDate ? (
            <span className="text-[11px]"><span className="font-bold underline underline-offset-2" style={{ color: "var(--text)" }}>{nextGameDate}</span>{localTime ? ` - ${localTime}` : ""}</span>
          ) : (
            <span className="text-[11px]">{localTime || cleanStatusDetail(game.statusDetail, false)}</span>
          )}
        </span>
        {showRating && (
          <span className="absolute left-1/2 -translate-x-1/2">
            <RatingBadge rating={game.rating!} />
          </span>
        )}
        <span className="ml-auto">
          {!(isPastDate && isFinished) && game.broadcasts.length > 0 && (
            <span
              className="text-[10px] sm:text-xs cursor-default"
              style={{ color: "var(--text-muted)" }}
              title={game.broadcasts.length > 1 ? game.broadcasts.join(", ") : undefined}
            >
              {game.broadcasts[0]}
            </span>
          )}
        </span>
      </div>

      {/* Teams */}
      <div className="grid gap-y-0.5 items-center" style={{ gridTemplateColumns: "auto 1fr auto" }}>
        {logo(game.awayTeam, awayTBD)}
        <span className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-3 min-w-0">
          <span className="hidden sm:inline text-sm truncate" style={{ color: "var(--text)" }}>{game.awayTeam.shortDisplayName}</span>
          <span className="sm:hidden text-xs" style={{ color: "var(--text)" }}>{game.awayTeam.abbreviation}</span>
          {star(game.awayTeam.id, favoriteTeams.includes(game.awayTeam.id), awayTBD)}
        </span>
        {!awayTBD && game.awayTeam.record ? (
          <span className="text-[10px] sm:text-xs tabular-nums text-right pl-1" style={{ color: "var(--text-muted)" }}>({game.awayTeam.record})</span>
        ) : <span />}
        {logo(game.homeTeam, homeTBD)}
        <span className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-3 min-w-0">
          <span className="hidden sm:inline text-sm truncate" style={{ color: "var(--text)" }}>{game.homeTeam.shortDisplayName}</span>
          <span className="sm:hidden text-xs" style={{ color: "var(--text)" }}>{game.homeTeam.abbreviation}</span>
          {star(game.homeTeam.id, favoriteTeams.includes(game.homeTeam.id), homeTBD)}
        </span>
        {!homeTBD && game.homeTeam.record ? (
          <span className="text-[10px] sm:text-xs tabular-nums text-right pl-1" style={{ color: "var(--text-muted)" }}>({game.homeTeam.record})</span>
        ) : <span />}
      </div>

      {/* Highlights — play button opens modal popup */}
      {isFinished && highlightUrl && (
        <div className="mt-1 sm:mt-2">
          <button
            onClick={async () => {
              if (!onPlayHighlight) return;
              if (prefetchedVideoId.current) {
                onPlayHighlight(prefetchedVideoId.current, highlightUrl);
                return;
              }
              setFetchingOnClick(true);
              const query = getHighlightSearchQuery(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote);
              const id = await fetchFirstVideoId(query);
              setFetchingOnClick(false);
              if (id) {
                prefetchedVideoId.current = id;
                onPlayHighlight(id, highlightUrl);
              } else {
                window.open(highlightUrl, "_blank");
              }
            }}
            disabled={fetchingOnClick}
            className="highlight-btn flex items-center justify-center py-1.5 rounded-md w-full transition-opacity hover:opacity-80 cursor-pointer"
            style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick ? 0.5 : undefined }}
          >
            {fetchingOnClick ? (
              <span className="text-[10px]">Loading...</span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
