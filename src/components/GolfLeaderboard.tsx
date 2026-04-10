"use client";

import { useRef, useState, useEffect } from "react";
import { GolfTournament } from "@/lib/types";
import {
  getGolfHighlightQuery,
  getGolfHighlightUrl,
  getOfficialChannelName,
  getSecondaryChannelName,
  getSecondaryChannelLabel,
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
  const statusCellRef = useRef<HTMLSpanElement>(null);
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

  const showScore = showRatings;
  const showRating = showRatings && tournament.state !== "pre" && tournament.rating !== null;
  const hasBroadcast = tournament.broadcasts.length > 0;

  // Decide which name format fits the available column width — measure widths
  // with a hidden probe so we use the longest tier that actually fits per row.
  // Tier 1: full ("Rory McIlroy") · Tier 2: ESPN short ("R. McIlroy") · Tier 3: last ("McIlroy")
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const containerW = el.clientWidth;
      if (!containerW) return;
      const isMobile = window.innerWidth < 640; // sm breakpoint
      const cardPadding = isMobile ? 16 : 32; // px-2 vs sm:px-4
      // Score column visible only when ratings revealed
      const scoreW = showRatings ? 32 : 0;
      const thruW = showRatings && tournament.state === "in" ? 22 : 0;
      // Position column hidden on mobile, visible only when ratings shown on desktop
      const rankW = !isMobile && showRatings ? 22 : 0;
      const flagW = isMobile ? 18 : 22;
      const gaps = 6 * 4; // ~6px between each adjacent element
      const available = containerW - cardPadding - rankW - flagW - thruW - scoreW - gaps;

      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${isMobile ? 12 : 14}px;font-family:inherit;`;
      document.body.appendChild(probe);
      const measureMax = (names: string[]) => {
        let max = 0;
        for (const n of names) {
          probe.textContent = n;
          if (probe.offsetWidth > max) max = probe.offsetWidth;
        }
        return max;
      };
      const sample = sortedPlayers.slice(0, 25);
      const fullMax = measureMax(sample.map((p) => p.name));
      const initialMax = measureMax(sample.map((p) => p.shortName));
      document.body.removeChild(probe);

      if (fullMax <= available) setNameTier("full");
      else if (initialMax <= available) setNameTier("initial");
      else setNameTier("last");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sortedPlayers, showRatings, tournament.state]);

  // Detect whether full status ("After Round X") fits — measure the *actual*
  // grid cell width (after the rating badge + broadcast cells lay out) and
  // compare against a probe rendered with the same font. Estimating the
  // available width was unreliable on narrow columns and produced "after roun.."
  // truncation; measuring the real cell removes the guesswork.
  useEffect(() => {
    const cell = statusCellRef.current;
    if (!cell) return;
    const measure = () => {
      const cellW = cell.clientWidth;
      if (!cellW) return;
      const cs = getComputedStyle(cell);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing};`;
      probe.textContent = tournament.statusDetail;
      document.body.appendChild(probe);
      const fullW = probe.offsetWidth;
      document.body.removeChild(probe);
      // 4px safety buffer — if the full text is within 4px of the cell, abbreviate
      setStatusOverflow(fullW > cellW - 4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cell);
    return () => ro.disconnect();
  }, [tournament.statusDetail, showRating, hasBroadcast]);

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
  // Show round-recap highlights whenever a round is complete — independent of ratings,
  // so the catch-up button is always available the morning after Round 1, etc.
  const completedRounds = tournament.currentRound;
  const highlightsAvailable = completedRounds > 0 && !!leagueLabel;
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
  const secondaryChannel = highlightsAvailable ? getSecondaryChannelName("golf", leagueLabel) : null;
  const secondaryLabel = secondaryChannel ? getSecondaryChannelLabel(secondaryChannel) : null;

  useEffect(() => {
    if (!highlightQuery || prefetchStarted.current) return;
    prefetchStarted.current = true;
    // Prefetch the secondary channel if curated, else fall back to generic search
    if (secondaryChannel) {
      fetchFirstVideoId(highlightQuery, secondaryChannel).then((id) => { prefetchedSearchId.current = id; });
    } else {
      fetchFirstVideoId(highlightQuery).then((id) => { prefetchedSearchId.current = id; });
    }
    if (officialChannel) {
      fetchFirstVideoId(highlightQuery, officialChannel).then((id) => { prefetchedOfficialId.current = id; });
    }
  }, [highlightQuery, officialChannel, secondaryChannel]);

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
          ref={statusCellRef}
          className="truncate min-w-0"
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
                {broadcastExpanded ? tournament.broadcasts.join(" · ") : tournament.broadcasts[0]}
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
              {/* Position — right-aligned so single/double digits hug the
                  flag+name on the right, eliminating the gap that pushed
                  names visually away from their rank.
                  Hidden on mobile; only meaningful when scores are revealed. */}
              {showScore && (
                <span
                  className="hidden sm:inline-block text-[10px] sm:text-xs tabular-nums text-right flex-shrink-0"
                  style={{ color: "var(--text-muted)", width: "22px" }}
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

              {/* Name — flush left next to flag/rank, fills remaining width. */}
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
              const id = secondaryChannel
                ? await fetchFirstVideoId(highlightQuery, secondaryChannel)
                : await fetchFirstVideoId(highlightQuery);
              setFetchingHighlight(null);
              if (id) {
                prefetchedSearchId.current = id;
                onPlayHighlight(id, highlightFallbackUrl);
              } else {
                window.open(highlightFallbackUrl, "_blank");
              }
            }}
            disabled={fetchingHighlight !== null}
            className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
            style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingHighlight === "search" ? 0.5 : undefined }}
            title={secondaryChannel ? `${secondaryChannel} — Round ${completedRounds} highlights` : `Round ${completedRounds} highlights`}
          >
            {fetchingHighlight === "search" ? (
              <span className="text-[10px]">Loading...</span>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                {secondaryLabel && (
                  <span className="text-[10px] font-medium">{secondaryLabel} R{completedRounds}</span>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
