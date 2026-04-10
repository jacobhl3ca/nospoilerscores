"use client";

import { useRef, useState, useEffect } from "react";
import { GolfTournament } from "@/lib/types";
import {
  getGolfHighlightQuery,
  getGolfHighlightUrl,
  getOfficialChannelName,
  fetchFirstVideoId,
} from "@/lib/youtube";

interface GolfLeaderboardProps {
  tournament: GolfTournament;
  showRatings: boolean;
  leagueLabel?: string;
  selectedDate?: string; // YYYYMMDD
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
}

const INITIAL_SHOW = 10;
const TOP25_SHOW = 25;

type ExpandLevel = "collapsed" | "top25" | "all";

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

// Drop the first-name initial from "R. McIlroy" → "McIlroy"
function lastNameOnly(shortName: string): string {
  return shortName.split(". ").pop() ?? shortName;
}

export default function GolfLeaderboard({
  tournament,
  showRatings,
  leagueLabel,
  selectedDate,
  onPlayHighlight,
}: GolfLeaderboardProps) {
  const [expandLevel, setExpandLevel] = useState<ExpandLevel>("collapsed");
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const [nameTier, setNameTier] = useState<"full" | "initial" | "last">("full");
  const [statusOverflow, setStatusOverflow] = useState(false);
  const [broadcastExpanded, setBroadcastExpanded] = useState(false);
  const [fetchingHighlight, setFetchingHighlight] = useState<"official" | "search" | null>(null);
  const prefetchedOfficialId = useRef<string | null>(null);
  const prefetchedSearchId = useRef<string | null>(null);
  const prefetchStarted = useRef(false);

  const allPlayers = tournament.players;
  // When scores hidden, alphabetize to prevent position-order spoilers
  const sortedPlayers = showRatings
    ? allPlayers
    : [...allPlayers].sort((a, b) => a.name.localeCompare(b.name));

  const visibleCount =
    expandLevel === "all" ? sortedPlayers.length : expandLevel === "top25" ? TOP25_SHOW : INITIAL_SHOW;
  const visible = sortedPlayers.slice(0, visibleCount);

  // Decide which name format fits the available column width.
  // Tier 1: full name ("Rory McIlroy"), Tier 2: ESPN short ("R. McIlroy"), Tier 3: last only ("McIlroy")
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      // Card padding (px-2 → 16, sm:px-4 → 32). Use rough rank+flag offset.
      const w = el.clientWidth;
      // Approx: card content width minus rank (24 if shown), flag (~20), score (~32), thru (~20), gaps (~20)
      // Rather than measuring per row, derive a tier from container width.
      if (w >= 260) setNameTier("full");
      else if (w >= 200) setNameTier("initial");
      else setNameTier("last");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Detect status text overflow → abbreviate "After Round X" → "RX"
  useEffect(() => {
    setStatusOverflow(false); // try full first when content changes
  }, [tournament.statusDetail, tournament.rating, tournament.broadcasts.length]);

  useEffect(() => {
    if (statusOverflow) return;
    const el = statusRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (el.scrollWidth > el.clientWidth + 1) setStatusOverflow(true);
    });
  });

  const formatPosition = (pos: number, idx: number) => {
    if (idx > 0 && sortedPlayers[idx - 1]?.position === pos) {
      return "";
    }
    const isTied = idx < sortedPlayers.length - 1 && sortedPlayers[idx + 1]?.position === pos;
    if (isTied) return `T${pos}`;
    return String(pos);
  };

  const scoreColor = (score: string) => {
    if (score === "E") return "var(--text-muted)";
    if (score.startsWith("-")) return "#22c55e";
    if (score.startsWith("+")) return "#ef4444";
    return "var(--text)";
  };

  const showScore = showRatings;
  const showRating = showRatings && tournament.state !== "pre" && tournament.rating !== null;
  const hasBroadcast = tournament.broadcasts.length > 0;

  // Show full "After Round X" by default; abbreviate to "RX" only when overflowing
  const displayStatus = (() => {
    const detail = tournament.statusDetail;
    if (statusOverflow) {
      const m = detail.match(/^After Round (\d+)$/);
      if (m) return `R${m[1]}`;
    }
    return detail;
  })();

  // Only green during active round play, not between rounds
  const isActivePlaying = tournament.state === "in" && /^Round \d+$/.test(tournament.statusDetail);

  // ── Highlights setup ──
  // Show round-recap highlights when at least one round is complete and ratings are revealed.
  const completedRounds = tournament.currentRound;
  const highlightsAvailable = showRatings && completedRounds > 0 && !!leagueLabel;
  const highlightYear = (() => {
    if (selectedDate && /^\d{8}$/.test(selectedDate)) return parseInt(selectedDate.slice(0, 4), 10);
    return new Date().getFullYear();
  })();
  const highlightQuery = highlightsAvailable
    ? getGolfHighlightQuery(leagueLabel!, completedRounds, highlightYear)
    : null;
  const highlightFallbackUrl = highlightsAvailable
    ? getGolfHighlightUrl(leagueLabel!, completedRounds, highlightYear)
    : null;
  const officialChannel = highlightsAvailable ? getOfficialChannelName("golf", leagueLabel) : null;

  useEffect(() => {
    if (!highlightQuery || prefetchStarted.current) return;
    prefetchStarted.current = true;
    fetchFirstVideoId(highlightQuery).then((id) => { prefetchedSearchId.current = id; });
    if (officialChannel) {
      fetchFirstVideoId(highlightQuery, officialChannel).then((id) => { prefetchedOfficialId.current = id; });
    }
  }, [highlightQuery, officialChannel]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status bar — matches GameCard layout: status | rating | network */}
      <div className="grid items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-2 sm:gap-x-3" style={{ color: "var(--text-muted)", gridTemplateColumns: "1fr auto 1fr" }}>
        <span
          ref={statusRef}
          className="truncate"
          style={{ color: isActivePlaying ? "#22c55e" : "var(--text-muted)" }}
        >
          {displayStatus}
        </span>
        <span>
          {showRating && <RatingBadge rating={tournament.rating!} />}
        </span>
        <span className="truncate text-right">
          {hasBroadcast && (
            tournament.broadcasts.length > 1 ? (
              <span
                className="text-[10px] sm:text-xs cursor-pointer hover:underline transition-colors"
                style={{ color: "var(--text-muted)" }}
                title={!broadcastExpanded ? tournament.broadcasts.join(", ") : undefined}
                onClick={(e) => { e.stopPropagation(); setBroadcastExpanded(!broadcastExpanded); }}
              >
                {broadcastExpanded ? tournament.broadcasts.join(" · ") : `${tournament.broadcasts[0]} +${tournament.broadcasts.length - 1}`}
              </span>
            ) : (
              <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
                {tournament.broadcasts[0]}
              </span>
            )
          )}
        </span>
      </div>

      {/* Leaderboard rows */}
      <div className="flex flex-col">
        {visible.map((player, idx) => {
          const posStr = formatPosition(player.position, idx);
          const displayName =
            nameTier === "full"
              ? player.name
              : nameTier === "initial"
                ? player.shortName
                : lastNameOnly(player.shortName);
          return (
            <div
              key={`${player.name}-${idx}`}
              className="flex items-center gap-1.5 py-[3px]"
              style={{
                borderBottom: idx < visible.length - 1 ? "1px solid var(--border)" : undefined,
              }}
            >
              {/* Position — only show when scores revealed AND on sm+ screens */}
              {showScore && (
                <span
                  className="hidden sm:inline-block text-[10px] sm:text-xs tabular-nums text-right flex-shrink-0"
                  style={{ color: "var(--text-muted)", width: "24px" }}
                >
                  {posStr}
                </span>
              )}

              {/* Flag */}
              {player.flag && (
                <img
                  src={player.flag}
                  alt={player.flagCountry || ""}
                  title={player.flagCountry || undefined}
                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain flex-shrink-0"
                />
              )}

              {/* Name */}
              <span
                className="text-xs sm:text-sm truncate flex-1 min-w-0"
                style={{ color: "var(--text)" }}
              >
                {displayName}
              </span>

              {/* Thru (only during active rounds and when scores shown) */}
              {showScore && tournament.state === "in" && player.thru && player.thru !== "F" && (
                <span className="text-[10px] sm:text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  {player.thru}
                </span>
              )}

              {/* Score — hidden by default, shown with monkey toggle */}
              {showScore && (
                <span
                  className="text-xs sm:text-sm font-medium tabular-nums text-right flex-shrink-0"
                  style={{ color: scoreColor(player.score), minWidth: "28px" }}
                >
                  {player.score}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Expand controls — two callouts (Top 25 / All N) when collapsed; toggle out otherwise */}
      {allPlayers.length > INITIAL_SHOW && (
        <div className="flex gap-1 mt-1.5">
          {expandLevel === "collapsed" && (
            <>
              {allPlayers.length > INITIAL_SHOW && (
                <button
                  onClick={() => setExpandLevel("top25")}
                  className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                  style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                >
                  Show Top {Math.min(TOP25_SHOW, allPlayers.length)}
                </button>
              )}
              {allPlayers.length > TOP25_SHOW && (
                <button
                  onClick={() => setExpandLevel("all")}
                  className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                  style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                >
                  Show All {allPlayers.length}
                </button>
              )}
            </>
          )}
          {expandLevel === "top25" && (
            <>
              <button
                onClick={() => setExpandLevel("collapsed")}
                className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
              >
                Show less
              </button>
              {allPlayers.length > TOP25_SHOW && (
                <button
                  onClick={() => setExpandLevel("all")}
                  className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                  style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                >
                  Show All {allPlayers.length}
                </button>
              )}
            </>
          )}
          {expandLevel === "all" && (
            <button
              onClick={() => setExpandLevel("collapsed")}
              className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
              style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
            >
              Show less
            </button>
          )}
        </div>
      )}

      {/* Highlights row — yesterday's round recap, only when ratings revealed */}
      {highlightsAvailable && highlightQuery && highlightFallbackUrl && (
        <div className="mt-1.5 flex gap-1">
          {officialChannel && (
            <button
              onClick={async () => {
                if (!onPlayHighlight) {
                  window.open(highlightFallbackUrl, "_blank");
                  return;
                }
                if (prefetchedOfficialId.current) {
                  onPlayHighlight(prefetchedOfficialId.current, highlightFallbackUrl);
                  return;
                }
                setFetchingHighlight("official");
                const id = await fetchFirstVideoId(highlightQuery, officialChannel);
                setFetchingHighlight(null);
                if (id) {
                  prefetchedOfficialId.current = id;
                  onPlayHighlight(id, highlightFallbackUrl);
                } else {
                  window.open(highlightFallbackUrl, "_blank");
                }
              }}
              disabled={fetchingHighlight !== null}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingHighlight === "official" ? 0.5 : undefined }}
              title={`${officialChannel} — Round ${completedRounds} highlights`}
            >
              {fetchingHighlight === "official" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">R{completedRounds}</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={async () => {
              if (!onPlayHighlight) {
                window.open(highlightFallbackUrl, "_blank");
                return;
              }
              if (prefetchedSearchId.current) {
                onPlayHighlight(prefetchedSearchId.current, highlightFallbackUrl);
                return;
              }
              setFetchingHighlight("search");
              const id = await fetchFirstVideoId(highlightQuery);
              setFetchingHighlight(null);
              if (id) {
                prefetchedSearchId.current = id;
                onPlayHighlight(id, highlightFallbackUrl);
              } else {
                window.open(highlightFallbackUrl, "_blank");
              }
            }}
            disabled={fetchingHighlight !== null}
            className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
            style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingHighlight === "search" ? 0.5 : undefined }}
            title={`Round ${completedRounds} highlights`}
          >
            {fetchingHighlight === "search" ? (
              <span className="text-[10px]">Loading...</span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
