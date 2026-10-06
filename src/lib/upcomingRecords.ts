import type { Sport } from "./types";

// Italic W-L records on upcoming game cards, picked per league (Jacob 9/25).
// It grew out of the NFL-only switch from 9/24 (`hideUpcomingRecords`).
//
// GameCard shows a record on a game that has not started or is still live, and
// never on a finished game or a past date. Live is safe because ESPN holds the
// going-in record until the game goes final: at 7:55 PM 9/26, MIN (76-84) and
// TEX (79-81) were in the 6th with 160 games each on the books, while every
// finished game already carried 161 (Jacob 9/26: "y no records 4 in progress").
// Record and state come in the same payload, so the record that includes this
// game's result only ever arrives on a card that is already "post". What still differs by league is how fresh the newest result
// inside the record is. A weekly league's record last changed days ago. A
// league that plays most days changed it last night, so the number can give
// away a result the viewer has not watched yet. So only the weekly leagues
// start on, and Settings labels the rest with that warning.
//
// Own leaf module (same reason as pollRank.ts): lib/espn.ts is not importable
// under the unit tests' strip-types runner, so soccer membership comes in as
// an argument rather than from sportGroup().

// Every soccer competition shares one key: they all carry the same W-D-L
// record, and one "Soccer" choice beats twenty.
export type RecordLeague = Sport | "soccer";

export const WEEKLY_RECORD_LEAGUES: readonly RecordLeague[] = ["nfl", "ncaaf", "cfl", "ufl"];

export const FREQUENT_RECORD_LEAGUES: readonly RecordLeague[] = [
  "mlb", "nba", "wnba", "nhl", "ncaam", "ncaaw", "ncaah", "ncaawh",
  "ncaavb", "ncaabase", "ncaasoft", "soccer",
];

export const ALL_RECORD_LEAGUES: readonly RecordLeague[] = [...WEEKLY_RECORD_LEAGUES, ...FREQUENT_RECORD_LEAGUES];

const DEFAULT_RECORD_LEAGUES = WEEKLY_RECORD_LEAGUES;

// The game states whose card may carry a record: before the start and while
// live. A finished game's record already counts its own result.
export function recordShowsForState(state: "pre" | "in" | "post"): boolean {
  return state === "pre" || state === "in";
}

export interface RecordPrefs {
  upcomingRecordLeagues?: RecordLeague[];
  hideUpcomingRecords?: boolean;
}

// The leagues that show records. A saved list always wins. Without one, the
// old NFL switch still counts: someone who turned it off chose "no records",
// so they get none rather than the new weekly-league default.
export function upcomingRecordLeagues(prefs: RecordPrefs): Set<RecordLeague> {
  const saved = prefs.upcomingRecordLeagues;
  if (Array.isArray(saved)) return new Set(saved.filter((k) => ALL_RECORD_LEAGUES.includes(k)));
  if (prefs.hideUpcomingRecords) return new Set();
  return new Set(DEFAULT_RECORD_LEAGUES);
}

// The record key a game's sport falls under, or null for a sport that has no
// team record to show (golf, racing, combat, ...).
export function recordLeagueFor(sport: Sport, isSoccer: boolean): RecordLeague | null {
  const key: RecordLeague = isSoccer ? "soccer" : sport;
  return ALL_RECORD_LEAGUES.includes(key) ? key : null;
}

// The saved list after one tap, in display order so the stored blob doesn't
// depend on tap order.
export function toggleRecordLeague(current: ReadonlySet<RecordLeague>, key: RecordLeague): RecordLeague[] {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return ALL_RECORD_LEAGUES.filter((k) => next.has(k));
}

// The Records chips Settings shows for the leagues in My leagues (Jacob 10/4:
// only my leagues, tap on/off). Keeps their order, drops a league with no team
// record, and folds every soccer competition into one "soccer" key at the
// first soccer league's place.
export function recordKeysForLeagues(leagues: readonly { sport: Sport; isSoccer: boolean }[]): RecordLeague[] {
  const keys: RecordLeague[] = [];
  for (const { sport, isSoccer } of leagues) {
    const key = recordLeagueFor(sport, isSoccer);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

// Tooltip wording on the card. Soccer and NHL records have a third number,
// and "2-3-0" reads wrong without saying which one it is.
export function recordTitle(key: RecordLeague): string {
  if (key === "soccer") return "Record going into this game (W-D-L)";
  if (key === "nhl") return "Record going into this game (W-L-OT)";
  return "Record going into this game";
}
