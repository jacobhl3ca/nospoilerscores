"use client";

import { useEffect, useState } from "react";
import { getWorldCupStakes, WcStakes, WcTier } from "@/lib/wcStakes";

// "What matters today" — a spoiler-safe, tap-to-reveal summary of which World
// Cup matches on the viewed date actually decide qualification before the next
// round. Collapsed by default (reveals nothing); expanding is opt-in because
// the stakes copy necessarily says who's already through or out.

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

  useEffect(() => {
    if (!date) return;
    let alive = true;
    // Collapse whenever the viewed date changes — never auto-reveal stakes.
    setExpanded(false);
    setStakes(null);
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

  const count = stakes.matches.length;

  return (
    <section
      className="mt-3 mb-4 rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2.5 px-4 py-3 sm:px-5 text-left"
        style={{ background: "transparent", color: "var(--text)" }}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⚽
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm sm:text-base font-bold tracking-tight">
            What matters today
          </span>
          <span className="block text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {count} World Cup {count === 1 ? "match" : "matches"} ·{" "}
            {expanded ? "tap to hide" : "tap to see what's at stake (reveals standings)"}
          </span>
        </span>
        <svg
          width="18"
          height="18"
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
        <div className="px-4 pb-3.5 sm:px-5" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs mt-2.5 mb-2.5" style={{ color: "var(--text-muted)" }}>
            Heads up — this draws on results from earlier rounds (who&apos;s
            through or out, who topped their group), so it reveals some
            standings.
          </p>
          <ul className="flex flex-col gap-2.5">
            {stakes.matches.map((m, i) => {
              const meta = TIER_META[m.tier];
              return (
                <li key={i} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{ width: 8, height: 8, background: meta.dot }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {m.away} v {m.home}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: meta.chip, color: meta.dot }}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {m.group}
                      </span>
                    </div>
                    <p
                      className="text-[13px] leading-snug mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {m.copy}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
