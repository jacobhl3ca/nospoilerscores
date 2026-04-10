"use client";

import { useRef, useState, useEffect } from "react";
import { GolfTournament } from "@/lib/types";
import {
  getGolfHighlightQuery,
  getGolfHighlightUrl,
  getOfficialChannelName,
  getSecondaryChannels,
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

  // ── Date-aware round label ──
  // ESPN returns a single tournament state regardless of which date the user
  // navigates to, so the raw status says "After Round 2" on Round 2 morning
  // etc. Override using the selected date vs. today and the tournament's
  // start date so: yesterday=after R1, today=R2 in progress (green),
  // tomorrow=R3 upcoming with tee-off time (grey).
  const dateAware = (() => {
    if (!selectedDate || !/^\d{8}$/.test(selectedDate) || !tournament.startDate) return null;
    const selYear = parseInt(selectedDate.slice(0, 4), 10);
    const selMonth = parseInt(selectedDate.slice(4, 6), 10);
    const selDay = parseInt(selectedDate.slice(6, 8), 10);
    const [startMo, startDay] = tournament.startDate.split("-").map((s) => parseInt(s, 10));
    const selDate = new Date(selYear, selMonth - 1, selDay);
    const startDateObj = new Date(selYear, startMo - 1, startDay);
    const dayIndex = Math.round((selDate.getTime() - startDateObj.getTime()) / (24 * 3600 * 1000));
    if (dayIndex < 0 || dayIndex > 3) return null; // not a round day
    const roundNum = dayIndex + 1;

    // Today-in-ET comparison
    const now = new Date();
    const todayET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const todayMidnight = new Date(todayET.getFullYear(), todayET.getMonth(), todayET.getDate());
    const selMidnight = new Date(selYear, selMonth - 1, selDay);
    const todayIndex = Math.round((todayMidnight.getTime() - startDateObj.getTime()) / (24 * 3600 * 1000));

    if (selMidnight.getTime() < todayMidnight.getTime()) {
      return { statusDetail: `After Round ${roundNum}`, completedRounds: roundNum, inProgress: false };
    }
    if (selMidnight.getTime() > todayMidnight.getTime()) {
      let timeLabel = "";
      if (tournament.eventDate && dayIndex === todayIndex + 1) {
        try {
          const d = new Date(tournament.eventDate);
          timeLabel = ` · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
        } catch { /* ignore */ }
      }
      return { statusDetail: `Round ${roundNum}${timeLabel}`, completedRounds: roundNum - 1, inProgress: false };
    }
    return { statusDetail: `Round ${roundNum}`, completedRounds: roundNum - 1, inProgress: true };
  })();

  const effectiveStatusDetail = dateAware?.statusDetail ?? tournament.statusDetail;

  // A round is *actively* playing only when (a) the user is viewing today,
  // (b) ESPN reports the tournament as in-progress, and (c) the raw status
  // is "Round N" (not "After Round N", which means the day's groups all
  // wrapped). Without the third check, the leaderboard stayed green +
  // suppressed highlights for the entire 18 hours between R1 finishing
  // Thursday night and R2 teeing off Friday morning.
  // Declared up here (rather than next to displayStatus below) so the
  // statusOverflow useEffect's dep array can see it without a TDZ error.
  const roundActivelyPlaying =
    (dateAware?.inProgress ?? false) &&
    tournament.state === "in" &&
    /^Round \d+$/.test(tournament.statusDetail);

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
      const rankW = !isMobile && showRatings ? 18 : 0;
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
      // Match the rendered style — non-live status renders italic, which is
      // slightly wider than regular at the same font size, so the probe must
      // include italic too or "Round 3 · 2:30 PM ET" sneaks past the cutoff
      // and gets clipped instead of abbreviated.
      const fontStyle = roundActivelyPlaying ? "normal" : "italic";
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing};font-style:${fontStyle};`;
      probe.textContent = effectiveStatusDetail;
      document.body.appendChild(probe);
      const fullW = probe.offsetWidth;
      document.body.removeChild(probe);
      // 6px safety buffer — leaves room for italic glyph overhang
      setStatusOverflow(fullW > cellW - 6);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cell);
    return () => ro.disconnect();
  }, [effectiveStatusDetail, showRating, hasBroadcast, roundActivelyPlaying]);

  // Tied groups: keep the rank only on the top name, leave the rest blank.
  // Drop the "T" prefix — the blank rows below imply the tie, and a clean
  // number reads better when 5+ players sit at the same score with no
  // differentiator (Jacob's request).
  const formatPosition = (pos: number, idx: number) => {
    if (idx > 0 && sortedPlayers[idx - 1]?.position === pos) {
      return "";
    }
    return String(pos);
  };

  const scoreColor = (score: string) => {
    if (score === "E") return "var(--text-muted)";
    if (score.startsWith("-")) return "#22c55e";
    if (score.startsWith("+")) return "#ef4444";
    return "var(--text)";
  };

  // Live progress indicator parity with other sports cards (Q3 4:32, ▲5,
  // P2 8:15). Use the lowest non-F numeric thru in the top 10 — that's the
  // latest group still on the course, which reflects how far the live
  // action has progressed. Fall back to round-only if nobody is mid-hole.
  const liveThru = (() => {
    if (!roundActivelyPlaying) return "";
    const top10 = tournament.players.slice(0, 10);
    let lowest: number | null = null;
    for (const p of top10) {
      if (!p.thru || p.thru === "F") continue;
      const n = parseInt(p.thru, 10);
      if (!Number.isFinite(n)) continue;
      if (lowest === null || n < lowest) lowest = n;
    }
    return lowest === null ? "" : String(lowest);
  })();

  // Build the display string. Live = compact "R{N} · Thru {X}" (green,
  // non-italic, links to the leaderboard). Non-live = italic "Round X" or
  // "Round X · TIME", abbreviated to "R{X}" if it would overflow the cell.
  const displayStatus = (() => {
    if (roundActivelyPlaying) {
      const m = (dateAware?.statusDetail ?? tournament.statusDetail).match(/^Round (\d+)/);
      const r = m ? `R${m[1]}` : "Live";
      return liveThru ? `${r} · Thru ${liveThru}` : r;
    }
    const detail = effectiveStatusDetail;
    if (statusOverflow) {
      // Strip "Round " → "R" anywhere in the label so the upcoming round
      // (e.g. "Round 3 · 2:30 PM ET") still fits the narrow column.
      const afterMatch = detail.match(/^After Round (\d+)$/);
      if (afterMatch) return `After R${afterMatch[1]}`;
      return detail.replace(/^Round (\d+)/, "R$1");
    }
    return detail;
  })();

  // ── Highlights setup ──
  // Show round-recap highlights once a round is complete — but suppress them
  // while a round is still being played on the user's view date, so today's
  // live coverage isn't preempted by yesterday's recap (parity with team
  // sports, where highlights only appear after the game is final).
  const completedRounds = dateAware?.completedRounds ?? tournament.currentRound;
  const highlightsAvailable = completedRounds > 0 && !!leagueLabel && !roundActivelyPlaying;
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
  const secondaryChannels = highlightsAvailable ? getSecondaryChannels("golf", leagueLabel) : [];
  const secondaryChannelsKey = secondaryChannels.join("|");

  // Walk the curated channel fallback chain, then a generic search, stopping
  // at the first video that's (a) non-null and (b) different from the
  // official-channel video so we never duplicate button 1.
  const resolveSearchVideo = async (): Promise<string | null> => {
    if (!highlightQuery) return null;
    const officialId = prefetchedOfficialId.current;
    for (const channel of secondaryChannels) {
      const id = await fetchFirstVideoId(highlightQuery, channel);
      if (id && id !== officialId) return id;
    }
    const generic = await fetchFirstVideoId(highlightQuery);
    if (generic && generic !== officialId) return generic;
    return null;
  };

  useEffect(() => {
    if (!highlightQuery || prefetchStarted.current) return;
    prefetchStarted.current = true;
    // Prefetch official first, then walk the curated fallback chain.
    const prefetchAll = async () => {
      if (officialChannel) {
        const oid = await fetchFirstVideoId(highlightQuery, officialChannel);
        prefetchedOfficialId.current = oid;
      }
      prefetchedSearchId.current = await resolveSearchVideo();
    };
    prefetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightQuery, officialChannel, secondaryChannelsKey]);

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
        >
          {roundActivelyPlaying ? (
            tournament.leaderboardUrl ? (
              <a
                href={tournament.leaderboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-500 font-medium hover:text-green-400 transition-colors"
              >
                {displayStatus}
              </a>
            ) : (
              <span className="text-green-500 font-medium">{displayStatus}</span>
            )
          ) : (
            <span className="italic" style={{ color: "var(--text-muted)" }}>{displayStatus}</span>
          )}
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
              {/* Position — fixed width text-left so digits sit flush at the
                  card padding edge AND every row's name aligns at the same
                  offset (otherwise 1-char vs 2-char ranks shift names). */}
              {showScore && (
                <span
                  className="hidden sm:inline-block text-[10px] sm:text-xs tabular-nums text-left flex-shrink-0"
                  style={{ color: "var(--text-muted)", width: "18px" }}
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
              // Use the prefetched search ID if it's ready and different from
              // the official button; otherwise walk the curated fallback
              // chain (PGA TOUR → Golf Channel → ESPN → generic search) at
              // click time until we find a playable, distinct video.
              if (prefetchedSearchId.current) {
                onPlayHighlight(prefetchedSearchId.current, highlightFallbackUrl);
                return;
              }
              setFetchingHighlight("search");
              const id = await resolveSearchVideo();
              setFetchingHighlight(null);
              if (id) {
                prefetchedSearchId.current = id;
                onPlayHighlight(id, highlightFallbackUrl);
              } else {
                // Every channel + generic search failed or duplicated button 1.
                window.open(highlightFallbackUrl, "_blank");
              }
            }}
            disabled={fetchingHighlight !== null}
            className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
            style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingHighlight === "search" ? 0.5 : undefined }}
            title={`Round ${completedRounds} highlights — more on YouTube`}
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
