"use client";

import { TOP_GAMES_SPANS, TOP_GAMES_SPAN_LABEL, type TopGamesSpan } from "@/lib/topGames";

// The Best of yesterday column's span row (Jacob 10/10): Yesterday · This week
// · This month · This year, and an "All leagues" switch under it. Rendered as
// the column's top card by HomeContent, only while ratings show — the spans
// rank by rating, so with ratings off the column stays on Yesterday.
const SHORT: Record<TopGamesSpan, string> = { yesterday: "Yest.", week: "Week", month: "Month", year: "Year" };

export default function BestSpanBar({
  span,
  allLeagues,
  onSpan,
  onAllLeagues,
}: {
  span: TopGamesSpan;
  allLeagues: boolean;
  onSpan: (span: TopGamesSpan) => void;
  onAllLeagues: (on: boolean) => void;
}) {
  return (
    <div data-best-span-bar className="mb-2 flex flex-col gap-1">
      {/* 2×2: a desktop column is ~225px, too narrow for four full labels in
          one row, and a phone column (~120px) takes the short forms. */}
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Best games from">
        {TOP_GAMES_SPANS.map((s) => (
          <button
            key={s}
            type="button"
            data-best-span={s}
            aria-pressed={span === s}
            aria-label={TOP_GAMES_SPAN_LABEL[s]}
            onClick={() => onSpan(s)}
            className="py-1 px-1 rounded-md text-[10px] sm:text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            style={span === s
              ? { background: "var(--accent)", color: "white" }
              : { background: "var(--bg-card-hover)", color: "var(--text)" }}
          >
            <span className="sm:hidden">{SHORT[s]}</span>
            <span className="hidden sm:inline">{TOP_GAMES_SPAN_LABEL[s]}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={allLeagues}
        data-best-all-leagues
        onClick={() => onAllLeagues(!allLeagues)}
        className="self-center flex items-center gap-1.5 py-0.5 text-[10px] sm:text-[11px] cursor-pointer"
        style={{ color: "var(--text-muted)" }}
      >
        <span
          aria-hidden
          className="relative inline-block h-3 w-5 rounded-full transition-colors"
          style={{ background: allLeagues ? "var(--accent)" : "var(--border)" }}
        >
          <span
            className="absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all"
            style={{ left: allLeagues ? "0.625rem" : "0.125rem" }}
          />
        </span>
        All leagues
      </button>
    </div>
  );
}
