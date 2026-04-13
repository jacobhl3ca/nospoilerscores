"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { GolfTournament } from "@/lib/types";
import {
  isGolfLive,
  getGolfLiveThru,
  getGolfRecapRound,
  getGolfDateState,
  hasViewedRoundStarted,
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
  // Four highlight slots, in Jacob's preferred order:
  //   0: official channel video (the "main recap" — labeled "ESPN"
  //      since that's the brand he trusts for the full recap)
  //   1: walked-fallback-chain result (PGA TOUR → Golf Channel → ESPN
  //      → generic search), stopping at the first video distinct from
  //      slot 0. This matches the pre-session-N 2-button behavior that
  //      Jacob explicitly said returned better videos.
  //   2–3: two more "top videos" pulled from the remaining channels in
  //      the fallback chain + a generic search, deduped against the
  //      earlier slots. Only populate if a distinct video exists.
  const [highlightSlots, setHighlightSlots] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [fetchingSlot, setFetchingSlot] = useState<number | null>(null);
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
  // Canonical "has the viewed round actually started" check — we can't
  // derive this from roundStatus alone (see helper doc in lib/golf.ts).
  const viewedRoundStarted = selectedDate
    ? hasViewedRoundStarted(tournament, selectedDate)
    : false;

  const showScore = showRatings;
  // Hide the rating badge before the viewed round has started. The
  // rating reflects current leaderboard competitiveness, which is
  // itself spoiler-adjacent when applied to a round that hasn't begun.
  // Past dates: always eligible. Today: only after tee-off. Future:
  // never.
  const ratingEligibleForDate =
    dateState?.relativeDay === "past" ||
    (dateState?.relativeDay === "today" && viewedRoundStarted);
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
  // ESPN is the next scheduled tee-off. Use hasViewedRoundStarted (not
  // `roundStatus === "pre"`) because ESPN reports roundStatus as "post"
  // between rounds, so "pre" alone misses Saturday morning.
  const showTeeTime =
    dateState?.relativeDay === "today" &&
    !viewedRoundStarted &&
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

  useEffect(() => {
    if (!highlightQuery || prefetchStarted.current) return;
    prefetchStarted.current = true;
    (async () => {
      // Drive the slot list from the curated secondary chain (ESPN
      // first — the reliable full-day recap source Jacob flagged).
      // The tournament-run "official" channel (The Masters, USGA,
      // etc.) goes LAST because during tournament week those channels
      // post Par 3 clips and player top-shot reels that were drowning
      // out the actual round recap in slot 0.
      const channelsInOrder: string[] = [...secondaryChannels];
      if (officialChannel && !channelsInOrder.includes(officialChannel)) {
        channelsInOrder.push(officialChannel);
      }

      // Fetch each channel in parallel (independent requests, no need
      // to serialize) and then walk the ordered list filling the 4
      // slots, skipping duplicate videoIds.
      const results = await Promise.all(
        channelsInOrder.map((ch) => fetchFirstVideoId(highlightQuery, ch))
      );

      const slots: (string | null)[] = [null, null, null, null];
      const seen = new Set<string>();
      let slotIdx = 0;
      for (let i = 0; i < channelsInOrder.length && slotIdx < 4; i++) {
        const id = results[i];
        if (id && !seen.has(id)) {
          slots[slotIdx++] = id;
          seen.add(id);
        }
      }
      // Backfill remaining slots from multiple generic query
      // variations, fetched in parallel. A single generic search often
      // collides with the channel results we already have, so we try
      // several phrasings and accept the first distinct hit for each
      // open slot.
      if (slotIdx < 4 && leagueLabel) {
        const backfillQueries = [
          highlightQuery,
          `${leagueLabel} ${highlightYear} Round ${completedRounds} recap`,
          `${leagueLabel} Round ${completedRounds} ${highlightYear} full round`,
          `${leagueLabel} ${highlightYear} R${completedRounds} highlights`,
        ];
        const backfillResults = await Promise.all(
          backfillQueries.map((q) => fetchFirstVideoId(q))
        );
        for (const id of backfillResults) {
          if (slotIdx >= 4) break;
          if (id && !seen.has(id)) {
            slots[slotIdx++] = id;
            seen.add(id);
          }
        }
      }

      setHighlightSlots(slots);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightQuery, officialChannel, secondaryChannelsKey]);

  // Slot 0 (the "main recap") always renders as soon as highlights
  // are available — its click handler refetches on demand and falls
  // back to a YouTube search, so it's never a dead button. Painting
  // it immediately avoids the perceived delay vs other leagues whose
  // highlight buttons appear synchronously on first render. Slots
  // 1–3 still wait on prefetch and pop in once resolved.
  const visibleHighlightSlots = useMemo(
    () =>
      highlightSlots
        .map((id, index) => ({ id, index }))
        .filter((s) => s.index === 0 || s.id !== null),
    [highlightSlots]
  );

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

      {/* Highlights — slot 0 is the main "ESPN" recap button
          (prefetched from the tournament's YouTube channel chain),
          slots 1–3 are additional top videos. Laid out as a 2-column
          grid so buttons match the Show Top / Show All callout width
          above and wrap cleanly on narrow cards: slots 0–1 on the top
          row, slots 2–3 underneath. Only slot 0 carries a text label;
          the rest are bare play icons. */}
      {highlightsAvailable && highlightQuery && highlightFallbackUrl && (
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {visibleHighlightSlots.map(({ id, index }) => {
            const isMainSlot = index === 0;
            const isFetching = fetchingSlot === index;
            return (
              <button
                key={index}
                onClick={async () => {
                  if (!onPlayHighlight) {
                    window.open(highlightFallbackUrl, "_blank");
                    return;
                  }
                  if (id) {
                    onPlayHighlight(id, highlightFallbackUrl);
                    return;
                  }
                  // Slot 0 prefetch missed — refetch from the first
                  // curated channel (ESPN for golf majors). Slots 1–3
                  // can't be individually refetched since they're
                  // position-based inside the walked chain, so if
                  // their prefetch produced nothing we fall through
                  // to opening a YouTube search.
                  const mainChannel = secondaryChannels[0] ?? officialChannel;
                  if (isMainSlot && mainChannel) {
                    setFetchingSlot(0);
                    const fetched = await fetchFirstVideoId(highlightQuery, mainChannel);
                    setFetchingSlot(null);
                    if (fetched) {
                      setHighlightSlots((prev) => {
                        const next = [...prev];
                        next[0] = fetched;
                        return next;
                      });
                      onPlayHighlight(fetched, highlightFallbackUrl);
                      return;
                    }
                  }
                  window.open(highlightFallbackUrl, "_blank");
                }}
                disabled={fetchingSlot !== null}
                className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md transition-opacity hover:opacity-80 cursor-pointer"
                style={{
                  background: "var(--bg-card-hover)",
                  color: "var(--accent)",
                  opacity: isFetching ? 0.5 : undefined,
                }}
                title={
                  isMainSlot
                    ? `ESPN — Round ${completedRounds} highlights`
                    : `Round ${completedRounds} highlights — more on YouTube`
                }
              >
                {isFetching ? (
                  <span className="text-[10px]">Loading...</span>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                    {isMainSlot && (
                      <span className="text-[10px] font-medium">ESPN</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
