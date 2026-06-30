"use client";

import { useEffect, useState } from "react";
import {
  fetchBracket,
  type Bracket,
  type BracketSide,
  type Feeder,
  type RoundKey,
} from "@/lib/wcBracket";

// Spoiler-safe knockout bracket view for the World Cup overlay. Renders the full
// R32 → Final tree (plus the third-place match). Real teams are shown for any
// matchup ESPN has scheduled (teams only — never a score or who advanced); slots
// not yet decided read "Winner of …" their feeder match, so nothing about a
// result is revealed. Built live from ESPN (see lib/wcBracket).

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
          <img src={side.team.flag} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} />
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span className="text-xs truncate" style={{ color: "var(--text)" }}>{side.team.name}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-4 h-4 shrink-0" />
      <span className="text-[11px] italic truncate" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
        {side.feeder ? feederLabel(bracket, side.feeder) : "—"}
      </span>
    </div>
  );
}

function MatchCard({ match, bracket }: { match: Bracket["rounds"][number]["matches"][number]; bracket: Bracket }) {
  const dateLabel = match.date
    ? new Date(match.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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

export default function WorldCupBracket() {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (failed) {
    return <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Couldn&rsquo;t load the bracket right now.</p>;
  }
  if (!bracket) {
    return <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Loading bracket&hellip;</p>;
  }
  if (!bracket.knockoutStarted) {
    return <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>The knockout bracket begins after the group stage.</p>;
  }

  // Main tree columns (R32 → Final); third-place is a small standalone card.
  const treeRounds = bracket.rounds.filter((r) => r.key !== "third");
  const third = bracket.rounds.find((r) => r.key === "third");

  return (
    <div>
      {/* The tree is wider than a phone column, so it scrolls horizontally.
          A scrollable region must be keyboard-operable (WCAG 2.1.1): tabIndex
          makes it focusable so arrow keys can scroll it, and role+label give
          assistive tech a named container to announce. */}
      <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label="World Cup knockout bracket">
        <div className="flex gap-2 sm:gap-3" style={{ minWidth: "min-content" }}>
          {treeRounds.map((round) => (
            <div key={round.key} className="flex flex-col shrink-0" style={{ width: 150 }}>
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
        Spoiler-safe: matchups only, no scores. Each round fills in as the previous one finishes.
      </p>
    </div>
  );
}
