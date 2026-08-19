"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getTimeZone, getEtServiceDate, toYmd, etSlateYmd } from "@/lib/etDay";
import {
  fetchBracket,
  type Bracket,
  type BracketSide,
  type Feeder,
  type RoundKey,
} from "@/lib/wcBracket";

// Knockout bracket view for the World Cup overlay. Renders the full R32 → Final
// tree (plus the third-place match). Real teams are shown for any matchup ESPN
// has scheduled (teams only, never a score); slots not yet decided read "Winner
// of …" their feeder match. Built live from ESPN (see lib/wcBracket).

const ROUND_SHORT: Record<RoundKey, string> = { r32: "R32", r16: "R16", qf: "QF", sf: "SF", final: "F", third: "3rd" };

// A feeder side ("Winner of match X") rendered as the feeder match's own teams
// when those are known (e.g. during the R32, the R16 slots can name the two
// teams whose winner advances), else a compact "Winner R32-1" tag.
function feederLabel(bracket: Bracket, f: Feeder): string {
  const m = bracket.rounds.find((r) => r.key === f.round)?.matches.find((x) => x.pos === f.pos);
  const tag = (s: BracketSide): string | null => s.team?.abbr ?? s.team?.name ?? null;
  const a = m ? tag(m.home) : null;
  const b = m ? tag(m.away) : null;
  const verb = f.res === "L" ? "Loser" : "Winner";
  if (a && b) return `${verb}: ${a} v ${b}`;
  return `${verb} ${ROUND_SHORT[f.round]}-${f.pos}`;
}

function Side({ side, bracket }: { side: BracketSide; bracket: Bracket }) {
  if (side.team) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {side.team.flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.team.flag} alt="" loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        {/* title surfaces the full name when the 150px bracket column truncates
            it ("Bosnia and Herzegovina", "Saudi Arabia") — matches GameCard and
            EventCard, which already title their own truncated team/fighter names. */}
        <span className="text-xs truncate" style={{ color: "var(--text)" }} title={side.team.name}>{side.team.name}</span>
      </div>
    );
  }
  const label = side.feeder ? feederLabel(bracket, side.feeder) : "—";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-4 h-4 shrink-0" />
      <span className="text-[11px] italic truncate" style={{ color: "var(--text-muted)", opacity: 0.8 }} title={label}>
        {label}
      </span>
    </div>
  );
}

function MatchCard({ match, bracket }: { match: Bracket["rounds"][number]["matches"][number]; bracket: Bracket }) {
  // Guard the parse before formatting: toLocaleDateString on an Invalid Date
  // doesn't throw, it returns the literal string "Invalid Date" — so a present-
  // but-unparseable match.date from ESPN would render "Invalid Date" in the card
  // corner. isNaN-check it (the same guard etSlateYmd/shareCard already apply to
  // their date parses, and matching this file's own guarded ymd() helper) so
  // a bad date simply drops the corner label instead. Valid dates are unchanged.
  const parsed = match.date ? new Date(match.date) : null;
  const dateLabel = parsed && !isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: getTimeZone() })
    : null;
  return (
    <div className={`relative rounded-lg p-1.5 w-full ${dateLabel ? "pr-8" : ""}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {dateLabel ? (
        <div className="absolute top-1 right-1.5 text-[9px] tabular-nums" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{dateLabel}</div>
      ) : null}
      <Side side={match.home} bracket={bracket} />
      <div className="my-0.5 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
      <Side side={match.away} bracket={bracket} />
    </div>
  );
}

// The slate day a match belongs to — bucketed to the effective TZ WITH the same
// 1 AM rollover getEtServiceDate (and therefore `target` below) use. This used
// to bucket to the raw effective-TZ calendar day with no rollover, so it
// DISAGREED with `target` for a match kicking off between midnight and 1 AM
// local: `target` (the service day) places such a match on the PREVIOUS day,
// while the raw bucket returned the calendar day — so `ymd(m.date) === target`
// never matched and the bracket silently failed to auto-scroll to that round
// (e.g. a 7 PM ET knockout tie is just-past-midnight for a UTC+1/+2 viewer).
// etSlateYmd is the app's SSOT for exactly this rollover-aware bucketing
// (TeamView and the espn.ts soccer path already route through it), and it
// returns "" for an unparseable date, preserving this helper's old guard.
function ymd(iso: string | null): string {
  return iso ? etSlateYmd(iso) : "";
}

export default function WorldCupBracket({ selectedDate }: { selectedDate?: string }) {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const b = await fetchBracket(ctrl.signal);
        if (!ctrl.signal.aborted) setBracket(b);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  // Main tree columns (R32 → Final); third-place is a small standalone card.
  const treeRounds = useMemo(() => bracket?.rounds.filter((r) => r.key !== "third") ?? [], [bracket]);
  const third = useMemo(() => bracket?.rounds.find((r) => r.key === "third") ?? null, [bracket]);
  const focusRoundKey = useMemo(() => {
    // Fall back to the canonical service day (etDay.ts) — NOT a raw new Date() —
    // so this matches the selectedDate the parent normally passes in, which is
    // itself getDateString(0) = the service day with the 1 AM rollover. A bare
    // new Date() skips that rollover, so between local midnight and 1 AM it would
    // resolve to the next calendar day and auto-scroll the bracket to the wrong
    // round while the date nav still shows the previous service day.
    const target = selectedDate || toYmd(getEtServiceDate());
    return treeRounds.find((round) => round.matches.some((m) => ymd(m.date) === target))?.key ?? null;
  }, [selectedDate, treeRounds]);

  useEffect(() => {
    if (!focusRoundKey || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-round-key="${focusRoundKey}"]`);
    if (!el) return;
    // Capture + cancel the frame in cleanup (matching the AbortController and
    // FittedLine effects elsewhere in this tree). selectedDate can change while
    // the overlay is open, so focusRoundKey re-runs this effect — without the
    // cancel, a still-pending frame from the previous round would fire and
    // scroll to the STALE round before the new one lands (and it would fire on a
    // detached node after unmount). Cancelling keeps the scroll to the current
    // focus round only.
    const raf = requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", inline: "center" }));
    return () => cancelAnimationFrame(raf);
  }, [focusRoundKey]);

  if (failed) {
    return <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Couldn&rsquo;t load the bracket right now.</p>;
  }
  if (!bracket) {
    return <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Loading bracket&hellip;</p>;
  }
  if (!bracket.knockoutStarted) {
    return <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>The knockout bracket begins after the group stage.</p>;
  }

  return (
    <div>
      {/* The tree is wider than a phone column, so it scrolls horizontally.
          A scrollable region must be keyboard-operable (WCAG 2.1.1): tabIndex
          makes it focusable so arrow keys can scroll it, and role+label give
          assistive tech a named container to announce. */}
      <div ref={scrollRef} className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label="World Cup knockout bracket">
        <div className="flex gap-2 sm:gap-3" style={{ minWidth: "min-content" }}>
          {treeRounds.map((round) => (
            <div key={round.key} data-round-key={round.key} className="flex flex-col shrink-0" style={{ width: 150 }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 text-center" style={{ color: "var(--text-muted)" }}>
                {round.name}
              </div>
              {/* space-around vertically centers each match between its feeders,
                  so the halving rounds read as a tree without explicit connectors. */}
              <div className="flex flex-col justify-around gap-2 flex-1">
                {round.matches.map((m) => (
                  <MatchCard key={`${round.key}-${m.pos}`} match={m} bracket={bracket} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {third ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--text-muted)" }}>Third place</span>
          <div style={{ width: 150 }}>
            <MatchCard match={third.matches[0]} bracket={bracket} />
          </div>
        </div>
      ) : null}

      <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
        Matchups only, no scores. Each round fills in as the previous one finishes.
      </p>
    </div>
  );
}
