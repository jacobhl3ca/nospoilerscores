// The pre-game clock a card prints, in the reader's time zone (getTimeZone()).
//
// ESPN's status text carries its own clock ("10/6 - 8:00 PM EDT") and that
// clock is ALWAYS US Eastern. The cards used to print it with the "EDT" cut
// off, so NFL / NCAAF / WNBA / MLB / tennis showed Eastern time with no label
// in every zone — picking a zone in Settings changed nothing (Jacob 10/4,
// Southern Miss–Troy read "8:00PM" in every zone). Soccer sends "Scheduled"
// and fell through to game.date, which is why it was already right.
//
// One path for every card: read the text's clock as an Eastern wall time,
// prefer game.date when they agree, and format the instant in `tz`. An Eastern
// reader sees exactly the clock ESPN printed.
//
// Pure, no React, `.ts` imports: `node --test` loads it directly.

import { getTimeZone } from "./etDay.ts";
import { etWallToUtc, formatInZone } from "./whiparound.ts";

type TimedGame = { date: string; statusDetail?: string | null };

const ET_ZONE = "America/New_York";
const CLOCK = /(\d{1,2}):(\d{2})\s*([AP]M)?/i;
const OTHER_SUFFIX = /\s*\b(CDT|CST|CT|MDT|MST|MT|PDT|PST|PT|AKDT|AKST|HST|GMT|UTC|BST|CEST|CET)\s*$/i;
const LEADING_MD = /^(\d{1,2})\/(\d{1,2})\s*-\s*/;
// ESPN's clock and game.date are the same instant to the minute when both are
// right; past this gap the text wins (an Eastern reader keeps ESPN's clock).
const AGREE_MS = 60_000;

/** ESPN status text minus its zone suffix and, with stripDate, its "M/D - " prefix. */
export function cleanStatusDetail(detail: string, stripDate: boolean): string {
  let cleaned = (detail || "").replace(/\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT)\s*$/i, "");
  if (stripDate) cleaned = cleaned.replace(LEADING_MD, "");
  return cleaned.trim();
}

// The Eastern calendar day of an instant, as YYYYMMDD.
function etYmd(atMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

// The Eastern day the text's clock belongs to: its own "M/D - " when it has
// one (year taken from game.date, wrapped across New Year), else the Eastern
// day of game.date.
function textEtYmd(raw: string, atMs: number): string {
  const base = etYmd(atMs);
  const md = raw.match(LEADING_MD);
  if (!md) return base;
  const month = +md[1];
  const day = +md[2];
  let year = +base.slice(0, 4);
  const baseMonth = +base.slice(4, 6);
  if (baseMonth === 12 && month === 1) year += 1;
  if (baseMonth === 1 && month === 12) year -= 1;
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/**
 * The start-time label for an upcoming game, in `tz` ("8:00 PM", "TBD",
 * "Not before 2:00 PM", "Followed by"). Rules, in order:
 *  1. "TBD" anywhere → "TBD" (playoff "If Necessary" slots carry a
 *     midnight-ET date that would print "12:00 AM").
 *  2. A clock with an Eastern or no suffix → read as Eastern on its day; use
 *     game.date when within a minute of it, else the parsed instant.
 *  3. A clock with another zone's suffix → game.date.
 *  4. Tennis "Not before 3:00 PM" keeps its words; "Followed by" stays as is.
 *  5. No clock ("Scheduled", "Starts 5/3", "Postponed", "") → game.date.
 * An invalid date falls back to the cleaned status text.
 */
export function startTimeLabel(game: TimedGame, tz: string = getTimeZone()): string {
  const raw = (game.statusDetail || "").trim();
  const cleaned = cleanStatusDetail(raw, true);
  if (/\bTBD\b/i.test(raw)) return "TBD";
  if (/^followed by\b/i.test(raw)) return cleaned;

  const atMs = new Date(game.date).getTime();
  const valid = !isNaN(atMs);
  const clock = raw.match(CLOCK);
  // "Starts 5/5 7:00 PM" is a multi-day event's opening day, not this card's
  // clock — game.date is the real start.
  if (!clock || /^starts\s/i.test(raw) || OTHER_SUFFIX.test(raw)) {
    return valid ? formatInZone(atMs, tz) : cleaned;
  }
  if (!valid) return cleaned;

  // What is left has an Eastern suffix or none: ESPN's own clock.
  let h = +clock[1];
  if (clock[3]) h = (h % 12) + (/pm/i.test(clock[3]) ? 12 : 0);
  const parsed = etWallToUtc(textEtYmd(raw, atMs), h, +clock[2]);
  const at = Math.abs(parsed - atMs) > AGREE_MS ? parsed : atMs;
  const time = formatInZone(at, tz);
  return /^not before\b/i.test(raw) ? `Not before ${time}` : time;
}
