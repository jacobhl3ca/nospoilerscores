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

  return (
    <div
      className="mt-2 mb-1 rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Collapsed pill — one line, ~1 card height. Spoiler-safe (no stakes). */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: "transparent", color: "var(--text)" }}
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ⚽
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-semibold tracking-tight">
          What matters today
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          // transition lives in the class (not inline) so the motion-reduce
          // variant can switch it off — an inline `transition` would outrank a
          // class override and keep animating for users who ask for less motion.
          // The page's other reduced-motion overrides are class-scoped and never
          // reached this inline rotation.
          className="transition-transform duration-[180ms] ease motion-reduce:transition-none"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "none",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[10px] mt-2 mb-2 leading-snug" style={{ color: "var(--text-muted)" }}>
            Reveals some standings (who&apos;s through, out, or topped their group).
          </p>
          <ul className="flex flex-col gap-2">
            {stakes.matches.map((m, i) => {
              const meta = TIER_META[m.tier];
              return (
                <li key={i} className="flex gap-2">
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
