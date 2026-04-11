"use client";

import { useRef, useState, useEffect } from "react";
import { GolfTournament } from "@/lib/types";
import {
  isGolfLive,
  getGolfLiveThru,
  getGolfRecapRound,
  getGolfDateState,
} from "@/lib/golf";
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
  const [nameTier, setNameTier] = useState<"full" | "initial" | "last">("full");
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

  // ── Date state + live signal ──
  // Round wording lives in the league-header italic subtitle (see
  // GolfSubtitle in LeagueColumn.tsx), so the card itself only shows a
  // hole-based live indicator — the same pattern team sports use for
  // "Q3 4:32" / "▲5" / "P2 8:15". Source-of-truth helpers in `lib/golf.ts`
  // keep this consistent with the subtitle and the recap toggle.
  const dateState = selectedDate ? getGolfDateState(tournament, selectedDate) : null;

  const showScore = showRatings;
  // Hide the rating badge before the viewed round has started. Using
  // `tournament.state` alone wasn't strict enough — on Saturday morning
  // before R3 tees off, the tournament state is still "in" from R2, so
  // the rating (which reflects post-R2 leaderboard competitiveness)
  // leaked onto the R3 card. Gate it on the date state + roundStatus
  // instead: past days always fine; today only after tee-off; future
  // dates hidden entirely.
  const ratingEligibleForDate =
    dateState?.relativeDay === "past" ||
    (dateState?.relativeDay === "today" && tournament.roundStatus !== "pre");
  const showRating =
    showRatings &&
    tournament.state !== "pre" &&
    tournament.rating !== null &&
    ratingEligibleForDate;
  const hasBroadcast = tournament.broadcasts.length > 0;
  // Mirror GameCard: when the tournament is wrapped and no rating takes
  // the center slot, fill the status text with "FINAL" on R4 Sunday so
  // the card reads like any other post-state card.
  const showFinalLabel = tournament.state === "post" && !showRating;

  const live = isGolfLive(tournament);
  const showLiveIndicator = live && dateState?.relativeDay === "today";
  const liveThru = showLiveIndicator ? getGolfLiveThru(tournament) : "";
  // "Thru 14" when we know the leading group's hole, just "Live" as a
  // last-resort label when ESPN flags round-in-progress but no player has
  // a mid-round thru yet (e.g. weather delay, between tee times).
  const liveLabel = showLiveIndicator
    ? liveThru
      ? `Thru ${liveThru}`
      : "Live"
    : null;

  // Pre-round tee time — when the viewed date is today but the round
  // hasn't started yet, surface the first tee-off in the top-left slot
  // (same spot the live "Thru 14" / "FINAL" labels use). eventDate from
  // ESPN is the next scheduled tee-off, so it's accurate whenever
  // roundStatus === "pre".
  const showTeeTime =
    dateState?.relativeDay === "today" &&
    tournament.roundStatus === "pre" &&
    !!tournament.eventDate;
  let teeTimeLabel: string | null = null;
  if (showTeeTime && tournament.eventDate) {
    try {
      const d = new Date(tournament.eventDate);
      teeTimeLabel = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
    } catch {
      /* ignore */
    }
  }

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
      // On mobile, never drop below the ESPN short name ("R. McIlroy") —
      // the first-name initial is load-bearing for quick recognition, and
      // if it doesn't fit we'd rather rely on `truncate` than strip it.
      else if (isMobile) setNameTier("initial");
      else setNameTier("last");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sortedPlayers, showRatings, tournament.state]);

  // Tied groups: keep the rank only on the top name, leave the rest blank.
  // Tie detection compares *score* rather than ESPN's `order` field, which
  // is a running rank (1,2,3…) even across ties — comparing by order
  // never matches, so the 5+ players bunched at -1 used to each show a
  // different number. Comparing scores gives us one rank per tied group.
  const formatPosition = (pos: number, idx: number) => {
    if (idx > 0 && sortedPlayers[idx - 1]?.score === sortedPlayers[idx]?.score) {
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

  // ── Highlights setup ──
  // Recap for round X only appears on the day round X was played, after the
  // round is fully complete. R1 recap on Thursday view, R2 recap on Friday
  // view, etc. — never the previous day's recap on today's tab.
  const recapRound = selectedDate ? getGolfRecapRound(tournament, selectedDate) : 0;
  const highlightsAvailable = recapRound > 0 && !!leagueLabel;
  const completedRounds = recapRound; // alias for the rest of the file
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
      {/* Status bar — matches GameCard layout: status | rating | network.
          Round wording lives in the league-header subtitle (italic, like
          "Playoffs Apr 19" for team sports). Only the live indicator
          appears on the card itself, and only when viewing the day play
          is happening — parity with how Q3/▲5/P2 work on other cards. */}
      <div className="grid items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-2 sm:gap-x-3" style={{ color: "var(--text-muted)", gridTemplateColumns: "1fr auto 1fr" }}>
        <span className="truncate min-w-0">
          {liveLabel ? (
            tournament.leaderboardUrl ? (
              <a
                href={tournament.leaderboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-500 font-medium hover:text-green-400 transition-colors"
              >
                {liveLabel}
              </a>
            ) : (
              <span className="text-green-500 font-medium">{liveLabel}</span>
            )
          ) : showFinalLabel ? (
            "FINAL"
          ) : teeTimeLabel ? (
            teeTimeLabel
          ) : null}
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
