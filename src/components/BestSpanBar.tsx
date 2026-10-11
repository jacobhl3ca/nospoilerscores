"use client";

import { useEffect, useState } from "react";
import { ROW_PILL, STACKED_FIT_BTN, STACKED_PILL } from "@/components/LeagueRecapCard";
import { RECAP_COMPACT_MAX_PX, RECAP_STACK_MAX_PX } from "@/lib/recaps";
import { TOP_GAMES_SPANS, TOP_GAMES_SPAN_LABEL, type TopGamesSpan } from "@/lib/topGames";

// The Best column's span pill (Jacob 10/10): Yesterday · This week · This
// month · This year, and an "All leagues" switch. HomeContent renders it as
// the column's top card, only while ratings show — the spans rank by rating,
// so with ratings off the column stays on Yesterday.
//
// It sits IN the recap / Playoff pill row, not under it (Jacob 10/10: "those
// yesterday this week etc should be in highlights position … on top"), so it
// is built from LeagueRecapCard's own pill and button classes and flips
// between the same two layouts at the same measured widths. Its height then
// equals a sibling column's pill, and the first cards stay level:
//   • stacked (under 250px): "Best games from" + the switch on the heading
//     line, the four chips in a row under it.
//   • row (xl, 280px columns): the four chips and the switch on one line. No
//     heading: the line cannot hold one, and the column title says it.
const SHORT: Record<TopGamesSpan, string> = { yesterday: "Yest.", week: "Week", month: "Month", year: "Year" };
// A phone column: the four words measure 90px at 9px and the row is 83px wide
// at a 340px screen, 100px at 390 (measured 2026-10-10), so they clipped.
const TINY: Record<TopGamesSpan, string> = { yesterday: "Yest.", week: "Wk", month: "Mo", year: "Yr" };
const TINY_MAX_PX = 140;
// Longest first; the heading line takes the first that fits beside the switch.
const HEADINGS = ["Best games from", "Best from", "Best"];

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
  // Stacked until measured, as LeagueRecapCard starts, so both flip together.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(true);
  const [compact, setCompact] = useState(true);
  const [tiny, setTiny] = useState(true);
  const [headingPick, setHeadingPick] = useState(0);
  const [headingHidden, setHeadingHidden] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      setStacked(el.clientWidth < RECAP_STACK_MAX_PX);
      setCompact(el.clientWidth < RECAP_COMPACT_MAX_PX);
      setTiny(el.clientWidth < TINY_MAX_PX);
      const heading = el.querySelector<HTMLElement>("[data-best-span-heading]");
      const copies = [...el.querySelectorAll<HTMLElement>("[data-best-span-heading-candidate]")];
      if (!heading || !copies.length) return;
      const fit = copies.findIndex((c) => c.getBoundingClientRect().width <= heading.clientWidth);
      setHeadingPick(fit < 0 ? copies.length - 1 : fit);
      setHeadingHidden(fit < 0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // `stacked` too: only the stacked layout mounts the heading.
  }, [el, stacked]);
  const chipText = compact ? "text-[9px]" : "text-[10px]";

  const chips = (
    <div className={`flex ${stacked ? "gap-0.5" : "shrink-0 gap-1"}`} role="group" aria-label="Best games from">
      {TOP_GAMES_SPANS.map((s) => (
        <button
          key={s}
          type="button"
          data-best-span={s}
          aria-pressed={span === s}
          aria-label={TOP_GAMES_SPAN_LABEL[s]}
          title={TOP_GAMES_SPAN_LABEL[s]}
          onClick={() => onSpan(s)}
          className={`highlight-btn flex items-center justify-center rounded-md py-1 cursor-pointer ${stacked ? STACKED_FIT_BTN : "px-1.5"}`}
          style={span === s
            ? { background: "var(--accent)", color: "white" }
            : { background: "var(--bg-card-hover)", color: "var(--text)" }}
        >
          <span className={`${chipText} font-medium whitespace-nowrap`}>{(tiny ? TINY : SHORT)[s]}</span>
        </button>
      ))}
    </div>
  );
  // No taller than the heading's own line, so the pill keeps a recap pill's
  // height.
  const allLeaguesSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={allLeagues}
      data-best-all-leagues
      onClick={() => onAllLeagues(!allLeagues)}
      className={`flex shrink-0 items-center gap-1 ${chipText} leading-none whitespace-nowrap cursor-pointer`}
      style={{ color: "var(--text-muted)" }}
    >
      <span
        aria-hidden
        className="relative inline-block h-3 w-5 shrink-0 rounded-full transition-colors"
        style={{ background: allLeagues ? "var(--accent)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all"
          style={{ left: allLeagues ? "0.625rem" : "0.125rem" }}
        />
      </span>
      All leagues
    </button>
  );

  return (
    <div
      ref={setEl}
      data-best-span-bar
      data-recap-layout={stacked ? "stacked" : "row"}
      className={`relative mb-2 rounded-lg flex ${stacked ? STACKED_PILL : `${ROW_PILL} justify-between`}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {stacked && (
        <div className="flex items-center gap-1 min-w-0">
          <span
            data-best-span-heading
            // `invisible`, not unmounted: the line keeps its height.
            className={`flex-1 min-w-0 text-[11.5px] font-semibold tracking-tight truncate ${headingHidden ? "invisible" : ""}`}
            aria-hidden="true"
            style={{ color: "var(--text)" }}
          >
            {HEADINGS[Math.min(headingPick, HEADINGS.length - 1)]}
          </span>
          {allLeaguesSwitch}
        </div>
      )}
      {stacked && HEADINGS.map((text) => (
        <span
          key={text}
          data-best-span-heading-candidate
          aria-hidden="true"
          className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-[11.5px] font-semibold tracking-tight"
        >
          {text}
        </span>
      ))}
      {chips}
      {!stacked && allLeaguesSwitch}
    </div>
  );
}
