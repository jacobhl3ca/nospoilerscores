"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { GolfTournament } from "@/lib/types";
import { networkStreamUrl, sportStreamFallback } from "@/lib/espn";
import { handleExternalClick } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
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
  // The badge only renders for a real numeric rating, and this chain is
  // exhaustive, so the four tiers below are the only outcomes — GREAT/GOOD/MEH/
  // SKIP, matching GameCard's badge, the legend, and the detail modal's ratingTier.
  let color: string;
  let label: string;
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
    // Screen readers otherwise announce a bare "MEH"/"SKIP" mid-card with no hint
    // it's the round's worth-watching rating. role="img" + a spoken aria-label give
    // the badge a self-describing name; the visible all-caps text is unchanged.
    // Title case in the label ("Great"/"Meh"/"Skip") stops some engines spelling
    // the short all-caps words out letter-by-letter.
    <span
      role="img"
      aria-label={`Worth-watching rating: ${label.charAt(0) + label.slice(1).toLowerCase()}`}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase`}
    >
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
  // Any click outside the expanded network list (or Escape) collapses it —
  // mirrors GameCard's "+N" broadcast overlay, which added the same dismiss
  // paths (Jacob 6/11). Without this the golf "+N" chip was a one-way toggle:
  // once tapped, the expanded row stayed open for the card's whole lifetime
  // with no collapse control, Escape, or outside-click to close it. Capture
  // phase so another card's stopPropagation can't keep a stale row open.
  const broadcastRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!broadcastExpanded) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (broadcastRef.current?.contains(e.target as Node)) return;
      setBroadcastExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBroadcastExpanded(false);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [broadcastExpanded]);
  // Four highlight slots. Slot 0 is the main round recap, resolved from the
  // FIRST curated channel in the tournament's chain (secondaryChannels[0] —
  // Golf Channel across all four majors; see SECONDARY_CHANNELS in youtube.ts)
  // and labeled after that channel, not a hardcoded "ESPN" (see mainChannelName
  // below). The tournament-run "official" channel (The Masters, USGA, …) is
  // appended LAST, since during tournament week it posts Par 3 / player clips
  // that drown out the round recap. Slots 1-3 fill progressively from the
  // remaining curated channels plus curated backfill queries (never an
  // unscoped/generic search), deduped against the earlier slots. Only populate
  // if a distinct video exists.
  const [highlightSlots, setHighlightSlots] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  // The highlight query the slots were last resolved for. Keyed on the query
  // STRING (not a bare "started" boolean) because this component stays mounted
  // across date navigation — stepping to another round-day recomputes
  // highlightQuery (a different round → different recap), and the prefetch must
  // re-run for the new round. A boolean latched true on the first prefetch and
  // never reset, so the effect bailed on every later date and the slots kept the
  // PREVIOUS round's video IDs — tapping a "Round 2 highlights" button played
  // the Round 1 recap.
  const prefetchedQuery = useRef<string | null>(null);

  const allPlayers = tournament.players;
  // When scores hidden, alphabetize to prevent position-order spoilers.
  // Memoized so the hidden-scores branch doesn't mint a fresh array identity on
  // every render: `sortedPlayers` is a dep of the name-fit measurement effect
  // below (which tears down a ResizeObserver and reflows a probe span across up
  // to 25 names). Without this, any unrelated re-render — each of the highlight
  // slots resolving, a parent LeagueColumn state change — re-ran that layout
  // thrash for no benefit. The revealed branch already returned the stable
  // `allPlayers`, so this only bit the scores-hidden default state.
  const sortedPlayers = useMemo(
    () =>
      showRatings
        ? allPlayers
        : [...allPlayers].sort((a, b) => a.name.localeCompare(b.name)),
    [showRatings, allPlayers]
  );

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
  // Mirror GameCard's `!isFinished` broadcast rule — hide the network
  // on past dates. Yesterday's Masters shouldn't still show ESPN in
  // the status row; the round is done and the channel is only useful
  // for live/upcoming viewing.
  const hasBroadcast =
    dateState?.relativeDay !== "past" && tournament.broadcasts.length > 0;
  // Mirror GameCard's `!isPastDate` FINAL rule (GameCard.tsx: `isFinished
  // && !isPastDate`): when the tournament is wrapped and no rating takes
  // the center slot, show "FINAL" only on the day it finished — NOT when
  // navigating back to an earlier round-day. `tournament.state === "post"`
  // is a property of the whole tournament, so without the past-date guard
  // it stayed true on the R1/R2/R3 views too, printing "FINAL" while the
  // league-header subtitle read e.g. "Round 1 of 4" — a self-contradiction.
  // Matches the `relativeDay !== "past"` guard already on the rating +
  // broadcast slots above.
  const showFinalLabel =
    tournament.state === "post" && !showRating && dateState?.relativeDay !== "past";

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
      // Guard the parse before formatting: toLocaleTimeString on an Invalid Date
      // returns the literal string "Invalid Date" (it does NOT throw), so the
      // surrounding try/catch can't catch it — a malformed ESPN eventDate would
      // render "Invalid Date" as this card's tee-time label. Bail to null on a
      // bad date so the label simply drops, the same Number.isNaN(getTime())
      // guard golf.ts's getGolfSubtitle / shareCard / the card date paths carry.
      // Byte-identical for every valid eventDate.
      if (!Number.isNaN(d.getTime())) {
        teeTimeLabel = d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: getTimeZone(),
        });
      }
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
      probe.remove();

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
  const officialChannel = highlightsAvailable ? getOfficialChannelName("golf", leagueLabel) : null;
  const secondaryChannels = highlightsAvailable ? getSecondaryChannels("golf", leagueLabel) : [];
  const secondaryChannelsKey = secondaryChannels.join("|");
  // Every slot below resolves under a strict channel gate, so the modal's
  // embed-failure retry must stay inside the same curated chain — an unscoped
  // re-search there would hand a major's recap slot to a reuploader, the exact
  // failure the strict gate exists to prevent (see VideoModal's
  // strictFallbackChannels). Same channel order the resolver uses.
  const highlightFallbackUrl = highlightsAvailable
    ? `${getGolfHighlightUrl(leagueLabel!, completedRounds, highlightYear)}&nss_strict=1&nss_channels=${encodeURIComponent(
        [...secondaryChannels, ...(officialChannel && !secondaryChannels.includes(officialChannel) ? [officialChannel] : [])].join("|")
      )}`
    : null;

  useEffect(() => {
    if (!highlightQuery || prefetchedQuery.current === highlightQuery) return;
    prefetchedQuery.current = highlightQuery;
    // Clear the previous round's resolved IDs before re-resolving for the new
    // round. The slot setters below only ever WRITE into a null slot (slot 0
    // bails when prev[0] is set; tryFill fills the first open slot), so without
    // this reset a date change couldn't overwrite the stale IDs at all.
    setHighlightSlots([null, null, null, null]);
    // Guard against a prior round's in-flight fetches writing into the new
    // round's slots. This effect re-runs whenever highlightQuery changes (the
    // component stays mounted across date/round navigation), and each
    // fetchFirstVideoId is a ~1-2s live YouTube lookup. Without this flag a
    // stale R1 promise resolving after the R2 reset would drop the WRONG
    // round's recap into a freshly-nulled slot — including the labeled slot 0.
    // Same cancelled-flag pattern as GameHighlights.tsx / TeamView.tsx.
    let cancelled = false;
    (async () => {
      // Drive the slot list from the curated secondary chain (Golf
      // Channel first — the reliable per-round recap source across the
      // majors). The tournament-run "official" channel (The Masters,
      // USGA, etc.) goes LAST because during tournament week those
      // channels post Par 3 clips and player top-shot reels that were
      // drowning out the actual round recap in slot 0.
      const channelsInOrder: string[] = [...secondaryChannels];
      if (officialChannel && !channelsInOrder.includes(officialChannel)) {
        channelsInOrder.push(officialChannel);
      }

      // Kick off every channel + backfill query in parallel and fill
      // slots progressively as each promise resolves, instead of
      // waiting for the slowest one. Slots 1-3 are positional only by
      // arrival order — first distinct videoId from the channel chain
      // takes the next open slot, deduped by videoId.
      const seen = new Set<string>();
      const tryFill = (id: string | null) => {
        if (cancelled || !id) return;
        // Keep this updater PURE — no `seen.add(id)` inside it. React can invoke
        // a state updater more than once for a single update (StrictMode's dev
        // double-invoke, or a concurrent render that gets discarded and rebased),
        // and mutating `seen` here made the second pass hit the `seen.has(id)`
        // branch and silently drop the slot, so a secondary highlight button
        // could intermittently fail to appear. The dedup is already pure:
        // `prev.includes(id)` blocks a repeat within these slots (queued
        // updaters run sequentially against the updated `prev`), and `seen.has`
        // still defers to slot 0's claim — the slot-0 resolver populates `seen`
        // before its own updater (see below), which is the only writer needed.
        setHighlightSlots((prev) => {
          if (prev.includes(id) || seen.has(id)) return prev;
          const nextOpen = prev.findIndex((s, i) => i > 0 && s === null);
          if (nextOpen === -1) return prev;
          const next = [...prev];
          next[nextOpen] = id;
          return next;
        });
      };

      // Slot 0 keeps using the first curated channel (Golf Channel for
      // the majors) so the main-recap button — labeled after that same
      // channel (see mainChannelName below) — gets the right videoId
      // once it resolves.
      const mainChannel = channelsInOrder[0];
      if (mainChannel) {
        // strict=1: oembed-verify the uploader is this curated channel, so a
        // reuploader's "Round N highlights" title can't win a golf slot.
        fetchFirstVideoId(highlightQuery, mainChannel, undefined, undefined, true).then((id) => {
          if (cancelled || !id) return;
          seen.add(id);
          setHighlightSlots((prev) => {
            // Skip if slot 0 is taken OR this id already landed in a later slot:
            // the backfill queries race in parallel and a generic search often
            // returns the same upload as the ESPN channel, so without the
            // prev.includes(id) guard the identical recap could fill slot 0 while
            // already sitting in slot 1-3 and render as two identical play
            // buttons (mirrors tryFill's dedup above).
            if (prev[0] || prev.includes(id)) return prev;
            const next = [...prev];
            next[0] = id;
            return next;
          });
        });
      }

      // Remaining channels feed slots 1-3 progressively.
      for (let i = 1; i < channelsInOrder.length; i++) {
        fetchFirstVideoId(highlightQuery, channelsInOrder[i], undefined, undefined, true).then(tryFill);
      }

      // Backfill queries also race in parallel for any open slot, but still
      // stay inside the curated channel chain. Unscoped YouTube results can
      // pick up random reuploaders during majors.
      if (leagueLabel) {
        const backfillQueries = [
          highlightQuery,
          `${leagueLabel} ${highlightYear} Round ${completedRounds} recap`,
          `${leagueLabel} Round ${completedRounds} ${highlightYear} full round`,
          `${leagueLabel} ${highlightYear} R${completedRounds} highlights`,
        ];
        for (const q of backfillQueries) {
          for (const channel of channelsInOrder) {
            // Slot 0 already owns the (highlightQuery, channelsInOrder[0])
            // lookup via its dedicated resolver above, whose whole job is to
            // land that clip in the channel-LABELED slot 0. Re-issuing the
            // identical request here is a redundant fetch that RACES that
            // resolver: fetchFirstVideoId makes a fresh network call each time
            // (no in-flight dedup), so when this copy wins, tryFill drops the
            // recap into a secondary slot (index > 0) and the slot-0 resolver
            // then bails on its own prev.includes(id) guard — leaving slot 0
            // empty, so the main "Golf Channel — Round N highlights" button is
            // demoted to an unlabeled numbered "…more on YouTube (1)" button
            // (its only accessible name). Skip that one combination so slot 0
            // keeps its clip; every other q×channel pair still backfills 1–3.
            if (q === highlightQuery && channel === channelsInOrder[0]) continue;
            fetchFirstVideoId(q, channel, undefined, undefined, true).then(tryFill);
          }
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightQuery, officialChannel, secondaryChannelsKey]);

  // Only render slots whose videoId has resolved. Slots that never resolve
  // (no curated channel + no backfill query found a recap) stay hidden
  // instead of dropping the user onto a YouTube search page — same
  // never-fall-back contract as the team-sport highlight buttons.
  const visibleHighlightSlots = useMemo(
    () =>
      highlightSlots
        .map((id, index) => ({ id, index }))
        .filter((s): s is { id: string; index: number } => s.id !== null),
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
            tournament.streamUrl ? (
              <a
                href={tournament.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-500 font-medium hover:text-green-400 transition-colors"
                onClick={handleExternalClick(tournament.streamUrl)}
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
          {hasBroadcast && (() => {
            const networkLink = (name: string, key: string | number) => {
              const href = networkStreamUrl(name, "") ?? sportStreamFallback("golf");
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  title={`Watch on ${name}`}
                  onClick={handleExternalClick(href)}
                >
                  {name}
                </a>
              );
            };
            if (tournament.broadcasts.length > 1) {
              return (
                <span ref={broadcastRef} className="text-[10px] sm:text-xs">
                  {broadcastExpanded ? (
                    <>
                      {tournament.broadcasts.map((b, i) => (
                        <span key={b}>
                          {i > 0 && <span style={{ color: "var(--text-muted)" }}> · </span>}
                          {networkLink(b, b)}
                        </span>
                      ))}
                      {/* Collapse control — mirrors GameCard's expanded-networks
                          ✕ so the revealed list carries a discoverable,
                          keyboard-operable way back to the "+N" state. The
                          disclosure toggle unmounts once open (this branch drops
                          it), so without an in-DOM control the list could be
                          dismissed only via Escape or an outside click (the
                          effect above) — no visible affordance for a keyboard/SR
                          user, who also lost focus to <body> on expand. Same
                          aria-label="Hide networks" ✕ GameCard's overlay uses. */}
                      <button
                        type="button"
                        className="ml-1.5 cursor-pointer hover:underline"
                        style={{ color: "var(--text-muted)" }}
                        title="Hide networks"
                        aria-label="Hide networks"
                        onClick={(e) => { e.stopPropagation(); setBroadcastExpanded(false); }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      {networkLink(tournament.broadcasts[0], 0)}
                      <button
                        type="button"
                        className="ml-1 cursor-pointer hover:underline"
                        style={{ color: "var(--text-muted)" }}
                        title={tournament.broadcasts.slice(1).join(", ")}
                        aria-label={`Show ${tournament.broadcasts.length - 1} more network${tournament.broadcasts.length - 1 === 1 ? "" : "s"}`}
                        // Disclosure control: reveals the hidden network names
                        // inline. Only ever renders in the collapsed state (the
                        // expanded branch drops it), so a literal false is
                        // correct — mirrors the Show Top/All buttons' collapsed
                        // aria-expanded below so screen readers announce it as
                        // an expandable toggle, not a bare button.
                        aria-expanded={false}
                        onClick={(e) => { e.stopPropagation(); setBroadcastExpanded(true); }}
                      >
                        +{tournament.broadcasts.length - 1}
                      </button>
                    </>
                  )}
                </span>
              );
            }
            return (
              <span className="text-[10px] sm:text-xs">
                {networkLink(tournament.broadcasts[0], 0)}
              </span>
            );
          })()}
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
            // Key by the player's stable identity (name), NOT the array index:
            // this list reorders while mounted — it flips alpha↔position order on
            // the hidden↔revealed toggle, and in the revealed state each player's
            // `position` shifts on every live poll — so an index key made a player
            // who moved rows unmount+remount (needless DOM churn, and a 404'd
            // flag's hidden state re-attempts) instead of React moving the row in
            // place. The same stable-identity keying the golf highlight chips and
            // WorldCupMattersCard already use; the row list was the last holdout.
            // Fall back to the index only for a blank-name row (espn.ts can yield
            // name "" when displayName is missing) so the uniqueness the `-${idx}`
            // suffix guarded is preserved for that degenerate case.
            <div
              key={player.name || `pos-${idx}`}
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.flag}
                  alt={player.flagCountry || ""}
                  title={player.flagCountry || undefined}
                  loading="lazy"
                  // Decode off the main thread: a full leaderboard renders
                  // 100+ country flags at once, so async decode keeps the row
                  // paint from blocking (matches the remote-image decoding
                  // treatment in GameCard/NewsColumn/WorldCupGroupsModal).
                  decoding="async"
                  width={20}
                  height={20}
                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain flex-shrink-0"
                  // Hide a 404'd/blocked flag so it degrades to the player row
                  // without the broken-image glyph (matches the remote-image
                  // onError guards in GameCard/NewsColumn/WorldCupGroupsModal).
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}

              {/* Name — flush left next to flag/rank, fills remaining width.
                  title carries the FULL name so a truncated row (or an
                  abbreviated name tier — initials/last-name-only) still reveals
                  who it is on hover, matching the truncated-name title
                  convention in GameCard/EventCard/WorldCupBracket. */}
              <span
                className="text-xs sm:text-sm truncate flex-1 min-w-0"
                style={{ color: "var(--text)" }}
                title={player.name}
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

      {/* Expand controls — two callouts (Top 25 / All N) when collapsed; toggle out otherwise.
          Each button is a disclosure control for the leaderboard row list, so it carries
          aria-expanded reflecting whether the list is currently showing beyond the collapsed
          set (false in the collapsed branch, true once Top 25 / All is showing). Without it a
          screen reader can't tell the rows are expandable — matches the aria-expanded already
          on LeagueColumn's "Show N more" toggle. (The value is a literal per branch because
          expandLevel is already narrowed inside each `=== ...` guard.) */}
      {allPlayers.length > INITIAL_SHOW && (
        <div className="flex gap-1 mt-1.5">
          {expandLevel === "collapsed" && (
            <>
              {allPlayers.length > INITIAL_SHOW && (
                <button
                  type="button"
                  onClick={() => setExpandLevel("top25")}
                  aria-expanded={false}
                  className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                  style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                >
                  Show Top {Math.min(TOP25_SHOW, allPlayers.length)}
                </button>
              )}
              {allPlayers.length > TOP25_SHOW && (
                <button
                  type="button"
                  onClick={() => setExpandLevel("all")}
                  aria-expanded={false}
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
                type="button"
                onClick={() => setExpandLevel("collapsed")}
                aria-expanded={true}
                className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
                style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
              >
                Show less
              </button>
              {allPlayers.length > TOP25_SHOW && (
                <button
                  type="button"
                  onClick={() => setExpandLevel("all")}
                  aria-expanded={true}
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
              type="button"
              onClick={() => setExpandLevel("collapsed")}
              aria-expanded={true}
              className="flex-1 text-center text-[10px] sm:text-xs py-1 rounded transition-colors cursor-pointer hover:opacity-80"
              style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
            >
              Show less
            </button>
          )}
        </div>
      )}

      {/* Highlights — slot 0 is the main round-recap button, named after
          the channel its clip is prefetched from (the first curated channel
          in the tournament's chain — Golf Channel across the majors); slots
          1–3 are additional top videos. Laid out as a 2-column
          grid so buttons match the Show Top / Show All callout width
          above and wrap cleanly on narrow cards: slots 0–1 on the top
          row, slots 2–3 underneath. Only slot 0 carries a text label;
          the rest are bare play icons. */}
      {highlightsAvailable && highlightQuery && highlightFallbackUrl && (
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {visibleHighlightSlots.map(({ id, index }) => {
            const isMainSlot = index === 0;
            // Slots 1–3 are all "more on YouTube" play buttons; without the slot
            // number folded in, every secondary slot resolved the SAME accessible
            // name, so a screen-reader/voice-control user heard 2–3 identical
            // "…more on YouTube" buttons with no way to tell them apart or target
            // one by voice. Number the secondaries (1/2/3) so each has a unique
            // name — the same disambiguation the repo already applies to
            // GameCard's favorite stars and LeagueColumn's per-league Retry
            // buttons. One label const keeps aria-label and title in sync.
            // Name slot 0 after the channel its clip is ACTUALLY pulled from —
            // channelsInOrder[0] === secondaryChannels[0] (Golf Channel across
            // the majors; see SECONDARY_CHANNELS in youtube.ts) — not a
            // hardcoded "ESPN". The chain was reordered to lead with Golf
            // Channel, and ESPN isn't in the US Open / The Open chains at all,
            // so the old literal misnamed the strictly-verified source. This
            // button is icon-only, so aria-label/title is its ONLY accessible
            // name (screen reader, voice control, hover). Fall back to a plain
            // "Round N highlights" if no channel is known (unreachable for a
            // visible slot 0, which only resolves once mainChannel is truthy).
            const mainChannelName = secondaryChannels[0] ?? officialChannel;
            const highlightLabel = isMainSlot
              ? `${mainChannelName ? `${mainChannelName} — ` : ""}Round ${completedRounds} highlights`
              : `Round ${completedRounds} highlights — more on YouTube (${index})`;
            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  // visibleHighlightSlots filters to slots whose id has resolved,
                  // so id is always set here. If onPlayHighlight isn't wired up
                  // the click is a no-op rather than opening a YouTube search.
                  if (onPlayHighlight) onPlayHighlight(id, highlightFallbackUrl);
                }}
                className="highlight-btn flex items-center justify-center py-1.5 rounded-md transition-opacity hover:opacity-80 cursor-pointer"
                style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
                aria-label={highlightLabel}
                title={highlightLabel}
              >
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
