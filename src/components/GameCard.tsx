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


function formatGameProgress(game: Game): { full: string; short: string } {
  const { sport, statusDetail, clock, period } = game;
  if (sport === "mlb") {
    const m = statusDetail.match(/^(Top|Bot|Mid|End)\s+(\d+)/i);
    if (m) {
      const half = m[1].toLowerCase();
      const inn = m[2];
      const arrow = (half === "top" || half === "mid") ? "▲" : "▼";
      const full = `${arrow}${inn}`;
      return { full, short: full }; // already compact
    }
    return { full: statusDetail, short: statusDetail.slice(0, 3) };
  }
  if (sport === "ncaam") {
    // NCAAM uses halves, not quarters
    const h = period <= 2 ? `H${period}` : period === 3 ? "OT" : `${period - 2}OT`;
    if (clock && clock !== "0.0") return { full: `${h} ${clock}`, short: h };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: h, short: h };
  }
  if (sport === "nba") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} ${clock}`, short: q };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: q, short: q };
  }
  if (sport === "nhl") {
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : `${period - 3}OT`;
    if (clock && clock !== "0.0") return { full: `${p} ${clock}`, short: p };
    return { full: p, short: p };
  }
  if (sport === "nfl") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} ${clock}`, short: q };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: q, short: q };
  }
  return { full: statusDetail, short: statusDetail.slice(0, 3) };
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
  const [broadcastExpanded, setBroadcastExpanded] = useState(false);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";
  const isLive = game.state === "in";
  const espnUrl = game.recapUrl || null;
  const liveUrl = game.streamUrl || espnUrl;
  const localTime = isFuture ? cleanStatusDetail(game.statusDetail, true) : null;
  const awayTBD = game.awayTeam.shortDisplayName === "TBD" || !game.awayTeam.abbreviation;
  const homeTBD = game.homeTeam.shortDisplayName === "TBD" || !game.homeTeam.abbreviation;
  const gameProgress = isLive ? formatGameProgress(game) : null;

  // Per-league buffer: avg game length + time for highlights to appear on YouTube
  const highlightBufferHours: Record<string, number> = {
    nba: 3,    // ~2.5hr game + 30min upload
    ncaam: 3,  // ~2hr game + 45min upload
    nhl: 3.5,  // ~2.5hr game + 45min upload
    mlb: 4,    // ~3hr game + 45min upload
    nfl: 4.5,  // ~3.5hr game + 45min upload
  };
  const highlightsReady = isFinished && (() => {
    if (!isToday) return true;
    const gameStart = new Date(game.date).getTime();
    const bufferMs = (highlightBufferHours[game.sport] ?? 4) * 60 * 60 * 1000;
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
      {/* Status bar — relative container with badge absolutely centered */}
      <div className="flex items-center mb-1 sm:mb-2 text-xs min-h-[18px] relative" style={{ color: "var(--text-muted)" }}>
        <span>
          {isLive && gameProgress ? (
            liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-green-500 font-medium hover:text-green-400 transition-colors"><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></a>
            ) : (
              <span className="text-green-500 font-medium"><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></span>
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
        <span className={`ml-auto truncate text-right ${showRating ? "max-w-[3.5rem]" : ""}`}>
          {!(isPastDate && isFinished) && game.broadcasts.length > 0 && (
            game.broadcasts.length > 1 ? (
              <span
                className="text-[10px] sm:text-xs cursor-pointer hover:underline transition-colors"
                style={{ color: "var(--text-muted)" }}
                title={!broadcastExpanded ? game.broadcasts.join(", ") : undefined}
                onClick={(e) => { e.stopPropagation(); setBroadcastExpanded(!broadcastExpanded); }}
              >
                {broadcastExpanded ? game.broadcasts.join(" · ") : game.broadcasts[0]}
              </span>
            ) : (
              <span
                className="text-[10px] sm:text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {game.broadcasts[0]}
              </span>
            )
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
        {!awayTBD && game.awayTeam.record && !isPastDate ? (
          <span className="text-[10px] sm:text-xs tabular-nums text-right pl-1" style={{ color: "var(--text-muted)" }}>({game.awayTeam.record})</span>
        ) : <span />}
        {logo(game.homeTeam, homeTBD)}
        <span className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-3 min-w-0">
          <span className="hidden sm:inline text-sm truncate" style={{ color: "var(--text)" }}>{game.homeTeam.shortDisplayName}</span>
          <span className="sm:hidden text-xs" style={{ color: "var(--text)" }}>{game.homeTeam.abbreviation}</span>
          {star(game.homeTeam.id, favoriteTeams.includes(game.homeTeam.id), homeTBD)}
        </span>
        {!homeTBD && game.homeTeam.record && !isPastDate ? (
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
