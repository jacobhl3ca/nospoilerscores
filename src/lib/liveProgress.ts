// Live-card status labels for GameCard: "Q2 - 8:32", "Halftime", "▲5".
// Kept out of the component so the unit tests can load it without React.
import type { Game } from "./types";

// "5" → "5th", "1" → "1st", etc. — for spelling out the inning to screen readers.
function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th");
  return `${n}${suffix}`;
}

// Sports that read "Top 5th" / "Bot 7th" and render the ▲/▼ inning glyph.
// College baseball and softball (added 2026-09-14) share MLB's status shape.
const BASEBALL_SPORTS = new Set<Game["sport"]>(["mlb", "ncaabase", "ncaasoft"]);

// `label`, when present, is a spoken form for screen readers (applied as an
// aria-label on the live-status element). Only the baseball sports set it: the
// ▲/▼ inning glyphs read as a meaningless "up-pointing triangle 5" otherwise.
export function formatGameProgress(game: Game): { full: string; short: string; delayed?: boolean; label?: string } {
  const { sport, statusDetail, clock, period } = game;
  if (BASEBALL_SPORTS.has(sport)) {
    // Delayed games arrive as "Rain Delay, Top 1st" / "Heat Delay, ..." —
    // render the inning the same compact way as live cards and append the
    // reason word (Rain/Heat/...) in proper case; the renderer recolors yellow.
    const delayMatch = statusDetail.match(/(\w+)\s+delay/i);
    const delayed = !!delayMatch || /delay/i.test(statusDetail);
    const reason = delayMatch
      ? delayMatch[1][0].toUpperCase() + delayMatch[1].slice(1).toLowerCase()
      : delayed ? "Delay" : "";
    const m = statusDetail.match(/(Top|Bot|Bottom|Mid|End)\s+(\d+)/i);
    if (m) {
      const half = m[1].toLowerCase();
      const inn = m[2];
      const arrow = (half === "top" || half === "mid") ? "▲" : "▼";
      const base = `${arrow}${inn}`;
      // Spoken inning for screen readers — "▲5" alone is meaningless read aloud.
      const halfWord = half === "top" ? "Top" : half === "mid" ? "Middle" : half === "end" ? "End" : "Bottom";
      const label = `${halfWord} of the ${ordinal(parseInt(inn, 10))} inning`;
      if (delayed) return { full: `${base} ${reason}`, short: `${base} ${reason}`, delayed: true, label: `${label}, ${reason}` };
      return { full: base, short: base, label };
    }
    if (delayed) return { full: reason, short: reason, delayed: true };
    return { full: statusDetail, short: statusDetail.slice(0, 3) };
  }
  // Timed sports between periods (Jacob 9/12): ESPN leaves displayClock at
  // "0:00" through the break, so a live card read "Q2 - 0:00" all halftime.
  // ESPN's own "Halftime" / "End of 1st" shortDetail now renders the break by
  // name; a stopped clock without it drops the "- 0:00" tail. "End of 4th"
  // with a winner never reaches here — espn.ts settles it as Final.
  if (sport === "ncaam") {
    // NCAAM uses halves, not quarters
    const h = period <= 2 ? `H${period}` : period === 3 ? "OT" : `${period - 2}OT`;
    const brk = periodBreak(statusDetail, period, 1, h);
    if (brk) return brk;
    if (hasRunningClock(clock)) return { full: `${h} - ${clock}`, short: h };
    return { full: h, short: h };
  }
  if (sport === "nba" || sport === "wnba" || sport === "ncaaw") {
    // NCAAW plays four 10-min quarters (then OT), same structure as WNBA/NBA —
    // the rest of the app already classifies it that way (SPORT_RATING_CONFIG
    // regulationPeriods: 4, PERIOD_SECONDS 600). Without this branch a live
    // NCAAW card fell through to the generic status, so ESPN's "8:32 - 2nd"
    // rendered raw on desktop and truncated to "8:3" on mobile instead of "Q2".
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    const brk = periodBreak(statusDetail, period, 2, q);
    if (brk) return brk;
    if (hasRunningClock(clock)) return { full: `${q} - ${clock}`, short: q };
    return { full: q, short: q };
  }
  if (sport === "nhl" || sport === "ncaah") {
    // College hockey shares this shape: P1–P3, then a 5-min OT (period 4) and a
    // shootout in most conferences during the regular season, while the NCAA
    // tournament plays 20-min sudden-death OTs (isPlayoff → "2OT").
    // Regulation is P1–P3, then a single overtime (period 4). In the REGULAR
    // season a still-tied game goes to a SHOOTOUT (period 5) — not a 2nd OT.
    // Multiple overtimes only exist in the playoffs (periods 5, 6, … = 2OT,
    // 3OT, …), which in turn never have a shootout. So period 5 is ambiguous by
    // number alone; disambiguate with isPlayoff. Without this a regular-season
    // shootout rendered "2OT", a period that can't occur outside the playoffs.
    const shootout = period >= 5 && !game.isPlayoff;
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : shootout ? "SO" : `${period - 3}OT`;
    // A shootout has no running clock, so skip the "- 0:00" tail and just show "SO".
    if (shootout) return { full: p, short: p };
    // Hockey has no halftime — every break is an intermission ("End of P1").
    const brk = periodBreak(statusDetail, period, 0, p);
    if (brk) return brk;
    if (hasRunningClock(clock)) return { full: `${p} - ${clock}`, short: p };
    return { full: p, short: p };
  }
  if (sport === "nfl" || sport === "ncaaf" || sport === "ufl") {
    // UFL shares the shape: four 15-min quarters, then OT. Its OT is an
    // alternating series of 2-point tries, but ESPN still reports it as
    // period 5, so "OT" is the right label.
    // NCAAF plays four 15-min quarters (then OT), the same period structure as
    // the NFL — the rest of the app already classifies it that way (espn.ts:
    // regulationPeriods 4, PERIOD_SECONDS 900). Without this branch a live NCAAF
    // card fell through to the generic status, so ESPN's "8:32 - 2nd" rendered
    // raw on desktop and truncated to "8:3" on mobile instead of "Q2 - 8:32".
    // College-football OT is untimed (no game clock), so the clock guard below
    // falls through to the bare "OT"/"2OT" label there, same as the NFL path.
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    const brk = periodBreak(statusDetail, period, 2, q);
    if (brk) return brk;
    if (hasRunningClock(clock)) return { full: `${q} - ${clock}`, short: q };
    return { full: q, short: q };
  }
  return { full: statusDetail, short: statusDetail.slice(0, 3) };
}

// A clock that is still counting. ESPN parks displayClock at "0:00" (or
// "0.0" in the last minute's tenths format) once a period ends.
function hasRunningClock(clock: string): boolean {
  return !!clock && !/^[0:.]+$/.test(clock);
}

// The between-periods label, or null while play is on. `halftimeAfter` is the
// period that ends in halftime (0 = no halftime, hockey). Only ESPN's own
// "Halftime" / "End of …" detail counts, never a stopped clock: a football play
// (and the PAT after it) runs at 0:00, basketball free throws after the buzzer
// shoot at 0.0, and college-football OT has no clock at all.
function periodBreak(
  statusDetail: string,
  period: number,
  halftimeAfter: number,
  label: string,
): { full: string; short: string } | null {
  const detail = statusDetail.toLowerCase();
  if (halftimeAfter && /\bhalftime\b/.test(detail)) return { full: "Halftime", short: "HT" };
  if (!/^end\b/.test(detail)) return null;
  if (period === halftimeAfter) return { full: "Halftime", short: "HT" };
  return { full: `End of ${label}`, short: `End ${label}` };
}
