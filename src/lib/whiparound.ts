// Whip-around shows (NFL RedZone and its league-by-league equivalents).
//
// The MLB column already nods to MLB Network's Big Inning in its header
// subtitle: the scheduled start time as plain italic text, then a green pulsing
// "● Big Inning · LIVE" link once the show is on air. That logic lives inline in
// LeagueColumn because Big Inning has a scraped per-night schedule to read.
//
// Every other whip-around show airs on a FIXED weekly slot instead (RedZone
// Sundays at 1:00 PM ET, CrunchTime Mondays at 8:30 PM ET, …), so no scraper is
// needed — a static config plus the day's own slate is enough. This module holds
// that config and the pure decision function, with no React and no network, so
// `node --test` can import it directly.
//
// The rules deliberately mirror the Big Inning branch in LeagueColumn one for
// one, so the two can never disagree about what "live" means:
//   • a past day hides the subtitle (the scheduled time is meaningless once the
//     show is over),
//   • LIVE needs BOTH the clock inside the air window AND enough games actually
//     in progress — a proxy for "the whip-around has something to whip to",
//   • past the air window today the subtitle disappears entirely, because a
//     stale "RedZone · 1:00 PM ET" at 10pm reads like an upcoming show.
//
// The one addition is the SLATE GATE. Goal Rush airs on select Saturdays only
// and the Golazo Show only on Champions League matchdays, and neither publishes
// a machine-readable calendar. Counting how many of the day's games actually
// kick off inside the show's window reproduces that for free: no 10 AM Saturday
// Premier League slate means no Goal Rush, so no subtitle.

import type { Game, Sport } from "@/lib/types";

export interface WhiparoundShow {
  sport: Sport;
  /** Display name, e.g. "RedZone". */
  name: string;
  /** Narrower tier used when the column can't fit `name`. Defaults to `name`. */
  shortName?: string;
  /** Air days, 0 = Sunday … 6 = Saturday. Omitted when `dates` is set. */
  days?: number[];
  /** YYYY-MM-DD one-offs (NHL Frozen Frenzy is a single night). */
  dates?: string[];
  /** Scheduled start, ET, in the same "1:00 PM" format parseEtTime reads. */
  startET: string;
  /** Air-window length in minutes. Doubles as the "show is over" cutoff. */
  durationMin: number;
  /** Inclusive YYYY-MM-DD season bounds. Keeps RedZone out of the postseason. */
  seasonStart: string;
  seasonEnd: string;
  /** Games that must be in progress before the LIVE treatment shows. */
  minLiveGames: number;
  /** Games that must START inside the window, or the show isn't airing today. */
  minSlateGames?: number;
  /**
   * Earliest kickoff the slate gate counts, when that is not the show's own
   * start. CrunchTime is the case: it opens at 8:30 PM to cover the closing
   * minutes of games that tipped off at 7:00, so counting only games that START
   * after 8:30 would undercount a normal Monday slate. Defaults to `startET`.
   */
  slateStartET?: string;
  href: string;
}

export interface WhiparoundResult {
  tiers: string[];
  href?: string;
  live?: boolean;
}

/** ET wall-clock, as LeagueColumn's nowInEt() returns it. */
export interface EtClock {
  y: number;
  mo: number;
  d: number;
  h: number;
  m: number;
}

// Season bounds below are cross-checked against ALL_LEAGUES in src/lib/espn.ts
// (the `verifiedFor: 2026` configs) wherever that file carries the same date, so
// the subtitle can't outlive the column that hosts it.
export const WHIPAROUND_SHOWS: WhiparoundShow[] = [
  {
    // ESPN bought the RedZone name in January 2026; the show itself is
    // unchanged and still regular-season only (Weeks 1-18). seasonEnd is the
    // Week 18 Sunday — Jan 10 2027, counting 18 weeks from the Sep 13 opener,
    // which lines up with Super Bowl LXI on Feb 14 2027 (espn.ts
    // championshipDate "02-14").
    //
    // ⚠️ KNOWN EDGE: LeagueColumn also hides every whip-around show once
    // PLAYOFF_START_DATES says the postseason has begun, and that table has the
    // NFL at 2027-01-09 — a week before the wild-card weekend a Feb 14 Super
    // Bowl implies. Until that entry is re-checked, the Week 18 Sunday
    // (2027-01-10) will render no RedZone subtitle. Harmless for now, worth
    // fixing when the 2026-27 playoff dates are confirmed.
    sport: "nfl",
    name: "RedZone",
    days: [0],
    startET: "1:00 PM",
    durationMin: 420,
    seasonStart: "2026-09-10",
    seasonEnd: "2027-01-10",
    minLiveGames: 2,
    minSlateGames: 2,
    href: "https://www.nfl.com/redzone",
  },
  {
    // Peacock's Goal Rush runs on SELECT Saturdays only, around the 10 AM ET
    // (3 PM UK) kickoff block. The slate gate is what makes "select" correct
    // without a scraper: a Saturday with fewer than three 10 AM matches isn't
    // a Goal Rush Saturday. Season bounds come from espn.ts (kickoff 08-21,
    // championshipDate 05-30), not from the plan's estimate.
    sport: "epl",
    name: "Goal Rush",
    days: [6],
    startET: "10:00 AM",
    durationMin: 120,
    seasonStart: "2026-08-21",
    seasonEnd: "2027-05-30",
    minLiveGames: 2,
    minSlateGames: 3,
    href: "https://www.peacocktv.com/sports/premier-league",
  },
  {
    // Paramount+'s Golazo Show covers the 3:00 PM ET (9 PM CET) Champions
    // League kickoff window on matchdays (Tue/Wed). Per-matchday air times are
    // not published in one place, so the slate gate stands in for a calendar.
    // seasonEnd is the league-phase finale; extend it once the knockout draw is
    // out.
    sport: "ucl",
    name: "Golazo Show",
    shortName: "Golazo",
    days: [2, 3],
    startET: "3:00 PM",
    durationMin: 150,
    seasonStart: "2026-09-08",
    seasonEnd: "2027-01-27",
    minLiveGames: 2,
    minSlateGames: 3,
    href: "https://www.paramountplus.com/shows/uefa-champions-league/",
  },
  {
    // MLS 360 on Apple TV, English-only from 2026, covering the Saturday night
    // block where most matches kick off together. seasonEnd is the regular
    // season — the playoff rounds don't run simultaneous matches, so there is
    // nothing to whip between.
    sport: "mls",
    name: "MLS 360",
    days: [6],
    startET: "7:30 PM",
    durationMin: 180,
    seasonStart: "2026-02-21",
    seasonEnd: "2026-10-31",
    minLiveGames: 2,
    minSlateGames: 3,
    href: "https://tv.apple.com/us/channel/mls/tvs.sbd.7000",
  },
  {
    // NBA CrunchTime, Mondays on the NBA App (free with an NBA ID). Regular
    // season only: 2026-27 runs Oct 20 2026 to Apr 11 2027, and the last
    // CrunchTime Monday is Apr 5.
    sport: "nba",
    name: "CrunchTime",
    days: [1],
    startET: "8:30 PM",
    durationMin: 150,
    seasonStart: "2026-10-20",
    seasonEnd: "2027-04-11",
    minLiveGames: 2,
    minSlateGames: 3,
    // CrunchTime cuts to games already in their closing minutes, so count from
    // the 7:00 PM tip-offs, not from the show's own start.
    slateStartET: "7:00 PM",
    href: "https://www.nba.com/watch",
  },
  {
    // Frozen Frenzy is ONE night a season — all 32 teams play, ESPN2 carries a
    // whip-around. A single-date entry rather than a weekday.
    sport: "nhl",
    name: "Frozen Frenzy",
    shortName: "Frenzy",
    dates: ["2026-10-13"],
    startET: "6:00 PM",
    durationMin: 330,
    seasonStart: "2026-10-13",
    seasonEnd: "2026-10-13",
    minLiveGames: 2,
    minSlateGames: 1,
    href: "https://www.espn.com/watch/",
  },
];

export function getWhiparoundShow(sport: Sport): WhiparoundShow | null {
  return WHIPAROUND_SHOWS.find((s) => s.sport === sport) ?? null;
}

/** Parse "9:00 PM" / "11:30 AM" into 24-hour {h, m}. Returns null on bad input. */
export function parseEtTime(s: string): { h: number; m: number } | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return { h, m: parseInt(m[2], 10) };
}

// YYYYMMDD → YYYY-MM-DD. String compare against the season bounds is safe
// because both sides are zero-padded ISO dates.
function toIso(selectedDate: string): string {
  return `${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}`;
}

/**
 * Is the show scheduled to air on this date at all — right weekday (or listed
 * one-off date) and inside its season? Says nothing about the clock or the
 * slate.
 */
export function isAirDay(show: WhiparoundShow, selectedDate: string): boolean {
  if (!/^\d{8}$/.test(selectedDate)) return false;
  const iso = toIso(selectedDate);
  if (iso < show.seasonStart || iso > show.seasonEnd) return false;
  if (show.dates) return show.dates.includes(iso);
  if (!show.days?.length) return false;
  // Local noon, so neither a DST shift nor a ±12h window can move the weekday.
  const dow = new Date(
    +selectedDate.slice(0, 4),
    +selectedDate.slice(4, 6) - 1,
    +selectedDate.slice(6, 8),
    12,
  ).getDay();
  return show.days.includes(dow);
}

// A game's ISO kickoff → {ymd, minutes-past-midnight} in the display zone. The
// column's clock (nowInEt) reads the same zone, so the slate gate and the
// scheduled-vs-live decision can't land on different days.
//
// The day is the app's SLATE day, not the raw calendar day: etSlateYmd in
// @/lib/etDay rolls anything before 1 AM back onto the previous day, so a game
// that runs past midnight stays on the night it belongs to. Bucketing this
// differently would let the slate gate count a late kickoff on a day the board
// itself files under yesterday. Rolled-back times keep counting up past 1440 so
// they stay after every same-night window rather than wrapping to the morning.
function zonedParts(iso: string, timeZone: string): { ymd: number; min: number } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(t);
  } catch {
    return null;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = +get("year");
  const mo = +get("month");
  const d = +get("day");
  if (!y || !mo || !d) return null;
  // Some ICU builds emit "24" for midnight; % 24 folds it back to 0.
  const hour = +get("hour") % 24;
  let min = hour * 60 + +get("minute");
  const day = new Date(y, mo - 1, d, 12, 0, 0);
  if (hour < 1) {
    day.setDate(day.getDate() - 1);
    min += 24 * 60;
  }
  return {
    ymd: day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate(),
    min,
  };
}

/**
 * The header subtitle for a whip-around show, or null when the show has nothing
 * to say about this date.
 *
 * ⚠️ `nowEt` and `timeZone` are the user's EFFECTIVE zone, not hardcoded
 * Eastern — LeagueColumn passes nowInEt()/getTimeZone(), which honour the
 * Settings time-zone picker. The `startET` values are Eastern and the rendered
 * text says "ET", so a reader on a non-Eastern zone sees the show flip to LIVE
 * on their own wall clock rather than on New York's. That is exactly what the
 * Big Inning branch already does, and this module copies it on purpose so the
 * two can never disagree. Fixing it means fixing both together.
 *
 * `forceLive` is the dev preview escape hatch (FORCE_WHIPAROUND_LIVE_PREVIEW in
 * LeagueColumn): it bypasses the clock and live-game checks only, exactly like
 * FORCE_BIG_INNING_LIVE_PREVIEW does, so the day/season/slate gates still have
 * to pass for the preview to render.
 */
export function whiparoundSubtitle(
  show: WhiparoundShow,
  selectedDate: string,
  games: Game[] | undefined,
  nowEt: EtClock,
  timeZone = "America/New_York",
  forceLive = false,
): WhiparoundResult | null {
  const parsed = parseEtTime(show.startET);
  if (!parsed) return null;
  if (!/^\d{8}$/.test(selectedDate)) return null;

  const selectedYmd = +selectedDate;
  const todayYmd = nowEt.y * 10000 + nowEt.mo * 100 + nowEt.d;
  // Past day: the show is over, the scheduled time is meaningless. Hide.
  if (selectedYmd < todayYmd) return null;
  if (!isAirDay(show, selectedDate)) return null;

  const startMin = parsed.h * 60 + parsed.m;
  const endMin = startMin + show.durationMin;

  // Slate gate — see the header comment. Counts only games that both fall on
  // the selected day and start inside the counting window, so a lone late
  // kickoff can't conjure a whip-around out of nothing.
  const list = games ?? [];
  if (show.minSlateGames) {
    const slateStart = show.slateStartET ? parseEtTime(show.slateStartET) : null;
    const countFrom = slateStart ? slateStart.h * 60 + slateStart.m : startMin;
    const inWindow = list.filter((g) => {
      const p = zonedParts(g.date, timeZone);
      return !!p && p.ymd === selectedYmd && p.min >= countFrom && p.min < endMin;
    }).length;
    if (inWindow < show.minSlateGames) return null;
  }

  const isToday = selectedYmd === todayYmd;
  const minsSinceStart = isToday ? nowEt.h * 60 + nowEt.m - startMin : -1;
  const withinAirWindow = minsSinceStart >= 0 && minsSinceStart <= show.durationMin;
  const liveGameCount = list.filter((g) => g.state === "in").length;
  const short = show.shortName ?? show.name;

  if (forceLive || (withinAirWindow && liveGameCount >= show.minLiveGames)) {
    return {
      tiers: [`● ${show.name} · LIVE`, `● ${short} live`, `● ${short}`],
      href: show.href,
      live: true,
    };
  }
  // Past the air window today: the show ended, hide the subtitle entirely.
  if (isToday && minsSinceStart > show.durationMin) return null;
  // Scheduled: plain italic text, no link until we go live.
  return {
    tiers: [
      `${show.name} · ${show.startET} ET`,
      `${short} · ${show.startET}`,
      short,
    ],
  };
}

/**
 * Is the show's start still ahead of us on the selected day? Drives the 60s
 * header tick, so a session parked on the page flips to LIVE without a reload.
 */
export function whiparoundStartsLater(
  show: WhiparoundShow,
  selectedDate: string,
  nowEt: EtClock,
): boolean {
  const parsed = parseEtTime(show.startET);
  if (!parsed) return false;
  if (!isAirDay(show, selectedDate)) return false;
  if (+selectedDate !== nowEt.y * 10000 + nowEt.mo * 100 + nowEt.d) return false;
  return nowEt.h * 60 + nowEt.m < parsed.h * 60 + parsed.m;
}
