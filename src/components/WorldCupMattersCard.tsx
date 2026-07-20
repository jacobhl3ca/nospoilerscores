"use client";

import { useEffect, useState } from "react";
import { getWorldCupStakes, WcStakes, WcTier } from "@/lib/wcStakes";

// "What matters today" — a spoiler-safe, tap-to-reveal summary of which World
// Cup matches on the viewed date actually matter (qualification stakes in the
// group stage; marquee/balance in the knockouts). Renders as a compact pill at
// the bottom of the World Cup column, directly under the day's match(es), so
// the games stay on top. Collapsed by default — expanding is opt-in because the
// copy reveals standings.

const TIER_META: Record<WcTier, { dot: string; chip: string; label: string }> = {
  // Group-stage tiers (qualification stakes)
  mustwin: { dot: "#e5484d", chip: "rgba(229,72,77,0.14)", label: "Win or out" },
  decider: { dot: "#f5a623", chip: "rgba(245,166,35,0.14)", label: "Decider" },
  seeding: { dot: "#5b8def", chip: "rgba(91,141,239,0.14)", label: "Seeding" },
  // Knockout tiers (marquee value + balance)
  marquee: { dot: "#e5484d", chip: "rgba(229,72,77,0.14)", label: "Marquee" },
  competitive: { dot: "#f5a623", chip: "rgba(245,166,35,0.14)", label: "Toss-up" },
  lopsided: { dot: "#5b8def", chip: "rgba(91,141,239,0.14)", label: "Mismatch" },
};

export default function WorldCupMattersCard({ date }: { date: string }) {
  const [stakes, setStakes] = useState<WcStakes | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [prevDate, setPrevDate] = useState(date);

  // Collapse and clear whenever the viewed date changes — never auto-reveal
  // stakes, and never flash the previous day's matches. Doing this during render
  // (React's recommended pattern for resetting state on a prop change) avoids the
  // cascading re-render that the same setState calls cause inside an effect.
  if (date !== prevDate) {
    setPrevDate(date);
    setExpanded(false);
    setStakes(null);
  }

  useEffect(() => {
    if (!date) return;
    let alive = true;
    getWorldCupStakes(date)
      .then((s) => {
        if (alive) setStakes(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);

  if (!stakes || stakes.matches.length === 0) return null;

  // Once the tournament reaches the knockouts there are no standings to weigh —
  // every match is win-or-go-home. The group-stage "what matters" breakdown
  // doesn't apply, so show a plain, spoiler-safe one-liner instead of the
  // expandable standings card.
  //
  // Detect the knockouts by the round LABEL, not the tier: the active
  // knockoutStakes() tags every knockout tie "mustwin" — a GROUP-stage tier
  // (the marquee/competitive/lopsided knockout tiers come only from the
  // commented-out classifyKnockout()). So the old `tier ∈ knockout-tiers` test
  // was false in every reachable state, this pill never rendered, and knockout
  // days wrongly fell through to the group-standings card (subtitle "Reveals
  // some standings…" — nonsensical once the groups are done). wcStakes sets
  // each match's `group` to the round ("Round of 32" … "Final") in the
  // knockouts and to "Group X" in the group stage, so the absence of the word
  // "group" is the reliable knockout signal.
  const isKnockout = stakes.matches.every((m) => !/\bgroup\b/i.test(m.group));
  if (isKnockout) {
    return (
      <div
        className="mt-2 mb-1 rounded-xl flex items-center gap-2 px-3 py-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <span aria-hidden="true" className="text-sm leading-none">⚽</span>
        <span className="text-[12.5px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Single elimination
        </span>
      </div>
    );
  }

  return (
    <div
      className="mt-2 mb-1 rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Collapsed pill — one line, ~1 card height. Spoiler-safe (no stakes). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="wc-matters-details"
        className="w-full flex items-start gap-2 px-3 py-2 text-left"
        style={{ background: "transparent", color: "var(--text)" }}
      >
        <span aria-hidden="true" className="text-sm leading-none mt-0.5">
          ⚽
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold tracking-tight leading-tight">
            What matters today
          </span>
          <span className="block text-[10px] leading-snug mt-0.5" style={{ color: "var(--text-muted)" }}>
            Reveals some standings (who&apos;s through, out, or topped their group)
          </span>
        </span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 mt-0.5"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "none",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div id="wc-matters-details" className="px-3 pt-2.5 pb-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <ul className="flex flex-col gap-2">
            {stakes.matches.map((m) => {
              const meta = TIER_META[m.tier];
              return (
                // Key by the matchup's stable identity (round/group + the two
                // sides), not the array index: stakes.matches is sorted by tier
                // and each entry's state flips pre→in→post on a live refresh, so
                // the list can reorder while this card stays mounted+expanded.
                // An index key would then reconcile the wrong rows in place —
                // the same fix already applied to GameCard/GolfLeaderboard chips.
                // Two teams meet once per day, so group+away+home is unique here.
                <li key={`${m.group}|${m.away}|${m.home}`} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 rounded-full"
                    style={{ width: 7, height: 7, background: meta.dot }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12.5px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
                        {m.away} v {m.home}
                      </span>
                      <span
                        className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                        style={{ background: meta.chip, color: meta.dot }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[11.5px] leading-snug mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {m.copy}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
