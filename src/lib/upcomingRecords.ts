import type { Sport } from "./types";

// Italic W-L records on upcoming game cards, picked per league (Jacob 9/25).
// It grew out of the NFL-only switch from 9/24 (`hideUpcomingRecords`).
//
// GameCard only ever shows a record on a game that has not started, and never
// on a past date. What still differs by league is how fresh the newest result
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

// "All" turns everything on, or everything off when everything is already on.
export function toggleAllRecordLeagues(current: ReadonlySet<RecordLeague>): RecordLeague[] {
  return ALL_RECORD_LEAGUES.every((k) => current.has(k)) ? [] : [...ALL_RECORD_LEAGUES];
}

// Tooltip wording on the card. Soccer and NHL records have a third number,
// and "2-3-0" reads wrong without saying which one it is.
export function recordTitle(key: RecordLeague): string {
  if (key === "soccer") return "Record going into this game (W-D-L)";
  if (key === "nhl") return "Record going into this game (W-L-OT)";
  return "Record going into this game";
}
