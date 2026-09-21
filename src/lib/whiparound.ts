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

/** YYYYMMDD, one day earlier. Via a Date so month and year ends carry. */
function prevYmd(selectedDate: string): string {
  const d = new Date(
    +selectedDate.slice(0, 4),
    +selectedDate.slice(4, 6) - 1,
    +selectedDate.slice(6, 8),
    12,
  );
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Which Eastern air date, if any, shows up on the reader's `selectedDate`
 * column — plus the instants that date's airing runs between.
 *
 * These are two different calendars. A show's air day is a NEW YORK weekday,
 * but a column is a day in the READER's zone, and east of about UTC+9 those
 * disagree: RedZone's Sunday 1:00 PM ET is 2:00 AM MONDAY in Tokyo, so it
 * belongs on a Tokyo reader's Monday column, and asking "is the Monday column a
 * Sunday?" would hide the show from them for the whole season. So instead of
 * testing the reader's date for an air day, each candidate Eastern air date is
 * mapped forward to the column it actually lands on, and the one that lands
 * here wins. Two candidates cover every real zone (UTC-12 to UTC+14): the
 * reader's own date, and the Eastern day before it. At most one can match,
 * since an airing maps to exactly one column.
 */
function resolveAiring(
  show: WhiparoundShow,
  selectedDate: string,
  timeZone: string,
): { airDate: string; startMs: number; endMs: number } | null {
  const parsed = parseEtTime(show.startET);
  if (!parsed) return null;
  const selectedYmd = +selectedDate;
  for (const airDate of [selectedDate, prevYmd(selectedDate)]) {
    if (!isAirDay(show, airDate)) continue;
    const startMs = etWallToUtc(airDate, parsed.h, parsed.m);
    if (slateYmd(startMs, timeZone) !== selectedYmd) continue;
    return { airDate, startMs, endMs: startMs + show.durationMin * 60_000 };
  }
  return null;
}

/**
 * Is the show scheduled to air on this date at all — right weekday (or listed
 * one-off date) and inside its season? Says nothing about the clock or the
 * slate. Note this asks about an EASTERN date; see resolveAiring for how a
 * reader's column maps onto one.
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

/** The zone every `startET` is written in. Not the reader's zone — see below. */
const ET_ZONE = "America/New_York";

// How far `tz` is from UTC at a given instant, in ms. Positive east of UTC.
// Derived by formatting the instant in `tz` and reading the wall clock back,
// which is the only way to get a zone's offset (including its DST state on that
// date) out of Intl.
function zoneOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(atMs));
  const get = (type: string) => +(parts.find((p) => p.type === type)?.value ?? 0);
  // Some ICU builds emit "24" for midnight; % 24 folds it back to 0.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - atMs;
}

/**
 * An Eastern wall-clock time on a given day → the real instant it happens.
 *
 * This is the hinge of the whole module. A show's `startET` is a time in NEW
 * YORK, but the reader can be anywhere, so "1:00 PM" is meaningless until it is
 * pinned to an instant. Everything downstream — is it on air, has it ended, what
 * time do we print — compares instants, never wall clocks, so the answer is the
 * same in every zone.
 *
 * Two passes: the naive guess picks an offset, then the offset is re-read at
 * that corrected instant. The second pass is what makes the DST changeover
 * weekends right, where the offset at the naive guess differs from the offset
 * actually in force.
 */
export function etWallToUtc(selectedDate: string, h: number, m: number): number {
  const y = +selectedDate.slice(0, 4);
  const mo = +selectedDate.slice(4, 6);
  const d = +selectedDate.slice(6, 8);
  const naive = Date.UTC(y, mo - 1, d, h, m);
  let ts = naive - zoneOffsetMs(ET_ZONE, naive);
  ts = naive - zoneOffsetMs(ET_ZONE, ts);
  return ts;
}

// The instant, rendered as a bare clock time in the reader's zone — "1:00 PM"
// for a reader in New York, "10:00 AM" for one in Los Angeles. No zone suffix,
// because every other time on the board (GameCard's kickoff times) is already
// printed this way, unlabelled, in getTimeZone(). Printing "1:00 PM ET" here
// instead would be the only Eastern-labelled time in the app.
export function formatInZone(atMs: number, timeZone: string): string {
  try {
    return new Date(atMs).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    // Bad zone — getTimeZone() already guards this, but never throw from a
    // subtitle. Fall back to the runtime's own zone.
    return new Date(atMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

// The app's SLATE day for an instant: etSlateYmd in @/lib/etDay rolls anything
// before 1 AM back onto the previous day, so a game that runs past midnight
// stays on the night it belongs to. The board files columns this way, so "is
// the selected column today" has to ask the same question.
function slateYmd(atMs: number, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(atMs));
  } catch {
    return null;
  }
  const get = (type: string) => +(parts.find((p) => p.type === type)?.value ?? 0);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  if (!y || !mo || !d) return null;
  const day = new Date(y, mo - 1, d, 12, 0, 0);
  if (get("hour") % 24 < 1) day.setDate(day.getDate() - 1);
  return day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
}

/**
 * The header subtitle for a whip-around show, or null when the show has nothing
 * to say about this date.
 *
 * ⚠️ `nowMs` is a real INSTANT (Date.now()), not a wall clock, and `timeZone` is
 * the reader's effective zone from getTimeZone(). Every `startET` is pinned to
 * an instant via etWallToUtc before anything is compared, so a reader in Los
 * Angeles sees RedZone go LIVE at 10:00 AM their time — the same moment a reader
 * in New York sees it at 1:00 PM — and both see the start time printed in their
 * own zone. An earlier draft compared the Eastern wall clock against the
 * reader's wall clock, which put the LIVE window three hours late on the west
 * coast; the Big Inning branch in LeagueColumn had the same defect and is fixed
 * alongside this.
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
  nowMs: number,
  timeZone = ET_ZONE,
  forceLive = false,
): WhiparoundResult | null {
  const parsed = parseEtTime(show.startET);
  if (!parsed) return null;
  if (!/^\d{8}$/.test(selectedDate)) return null;

  const selectedYmd = +selectedDate;
  const todayYmd = slateYmd(nowMs, timeZone);
  if (todayYmd === null) return null;
  // Past day: the show is over, the scheduled time is meaningless. Hide.
  if (selectedYmd < todayYmd) return null;

  const airing = resolveAiring(show, selectedDate, timeZone);
  if (!airing) return null;
  const { airDate, startMs, endMs } = airing;

  // Slate gate — see the header comment. Counts only games that kick off inside
  // the show's own window, so a lone late kickoff can't conjure a whip-around
  // out of nothing. Instants on both sides, so the count is identical in every
  // reader's zone and needs no separate same-day check: the window bounds it.
  const list = games ?? [];
  if (show.minSlateGames !== undefined && show.minSlateGames > 0) {
    const slateStart = show.slateStartET ? parseEtTime(show.slateStartET) : null;
    const countFromMs = slateStart
      ? etWallToUtc(airDate, slateStart.h, slateStart.m)
      : startMs;
    const inWindow = list.filter((g) => {
      const t = Date.parse(g.date);
      return !Number.isNaN(t) && t >= countFromMs && t < endMs;
    }).length;
    if (inWindow < show.minSlateGames) return null;
  }

  const withinAirWindow = nowMs >= startMs && nowMs <= endMs;
  const liveGameCount = list.filter((g) => g.state === "in").length;
  const short = show.shortName ?? show.name;

  if (forceLive || (withinAirWindow && liveGameCount >= show.minLiveGames)) {
    return {
      tiers: [`● ${show.name} · LIVE`, `● ${short} live`, `● ${short}`],
      href: show.href,
      live: true,
    };
  }
  // Past the air window: the show ended, hide the subtitle entirely.
  if (nowMs > endMs) return null;
  // Scheduled: plain italic text, no link until we go live.
  const local = formatInZone(startMs, timeZone);
  return {
    tiers: [`${show.name} · ${local}`, `${short} · ${local}`, short],
  };
}

/**
 * Is the show's start still ahead of us on the selected day? Drives the 60s
 * header tick, so a session parked on the page flips to LIVE without a reload.
 */
export function whiparoundStartsLater(
  show: WhiparoundShow,
  selectedDate: string,
  nowMs: number,
  timeZone = ET_ZONE,
): boolean {
  if (+selectedDate !== slateYmd(nowMs, timeZone)) return false;
  const airing = resolveAiring(show, selectedDate, timeZone);
  return !!airing && nowMs < airing.startMs;
}
