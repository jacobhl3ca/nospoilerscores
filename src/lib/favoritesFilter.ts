// "Only my teams" (Settings, Jacob 10/7): a league column keeps only the
// games a starred team plays in. Favorites used to only re-order a column
// (getFavPriority in LeagueColumn); this is the filter the Android widget
// already applies, kept to one column at a time so the board's layout holds.
//
// A league where the user has starred nobody is not emptied: it shows all its
// games under a cell that asks them to star a team ("banner"). The ✕ on that
// cell puts the league in `favoritesOnlyStrict`, after which the column shows
// nothing but a "none starred" cell until a team is starred ("strict-empty").

import type { Game, LeagueData, Sport } from "./types";
import { TEAM_PICKER_SKIP } from "./teamLogos.ts";

export type FavMode = "off" | "filter" | "banner" | "strict-empty";

// Columns with no teams to star: the event tiles and leaderboards, plus the
// two columns that mix leagues (ESPN front page, Best of yesterday), where a
// per-league star count means nothing.
const NO_TEAM_SPORTS: ReadonlySet<Sport> = new Set<Sport>([
  ...TEAM_PICKER_SKIP,
  "top", "best",
]);

// Same check as getFavPriority in LeagueColumn. An empty id (a TBD side)
// never matches, even if a stray "" ever reaches the favorites list.
export const involvesFavorite = (g: Game, favs: readonly string[]): boolean =>
  (!!g.homeTeam.id && favs.includes(g.homeTeam.id)) || (!!g.awayTeam.id && favs.includes(g.awayTeam.id));

// Favorite ids are `${sport}-${espnId}` (see lib/espn.ts), so the prefix
// says which league a star belongs to.
export const favCountForSport = (sport: Sport, favs: readonly string[]): number =>
  favs.filter((id) => id.startsWith(`${sport}-`)).length;

export function favoritesMode(
  league: Pick<LeagueData, "sport" | "golfTournament" | "eventCard">,
  favs: readonly string[],
  on: boolean,
  strict: readonly Sport[],
  teamView: boolean,
): FavMode {
  if (!on || teamView) return "off";
  if (league.golfTournament || league.eventCard || NO_TEAM_SPORTS.has(league.sport)) return "off";
  if (favCountForSport(league.sport, favs) > 0) return "filter";
  return strict.includes(league.sport) ? "strict-empty" : "banner";
}

export interface FilteredLeague {
  mode: FavMode;
  games: Game[];
  nextGames: Game[];
  prevGames: Game[];
}

export function filterLeague(
  league: LeagueData,
  favs: readonly string[],
  on: boolean,
  strict: readonly Sport[],
  teamView = false,
): FilteredLeague {
  const mode = favoritesMode(league, favs, on, strict, teamView);
  const games = league.games;
  const nextGames = league.nextGameDay?.games ?? [];
  const prevGames = league.previousGameDay?.games ?? [];
  if (mode === "off" || mode === "banner") return { mode, games, nextGames, prevGames };
  if (mode === "strict-empty") return { mode, games: [], nextGames: [], prevGames: [] };
  const keep = (g: Game) => involvesFavorite(g, favs);
  return { mode, games: games.filter(keep), nextGames: nextGames.filter(keep), prevGames: prevGames.filter(keep) };
}

// The league as the column should draw it: in "filter" / "strict-empty" mode
// the three game lists are cut down, and an emptied lookahead or lookback day
// is dropped so the column's empty-state chain reads it as absent. Returns the
// same object when nothing changes, so "off" renders exactly as before.
export function applyFavoritesFilter(league: LeagueData, f: FilteredLeague): LeagueData {
  if (f.mode === "off" || f.mode === "banner") return league;
  return {
    ...league,
    games: f.games,
    nextGameDay: league.nextGameDay && f.nextGames.length ? { ...league.nextGameDay, games: f.nextGames } : league.nextGameDay ? null : league.nextGameDay,
    previousGameDay: league.previousGameDay && f.prevGames.length ? { ...league.previousGameDay, games: f.prevGames } : league.previousGameDay ? null : league.previousGameDay,
  };
}

// True when "Only my teams" leaves the column with its empty cell ("No games
// for your teams" or "No … team starred yet"): the same test as those two
// branches in LeagueColumn. The recap pill reads it so a league-wide cut
// never sits over a column with no games (Jacob 10/9).
export function favoritesEmptied(league: LeagueData, f: FilteredLeague, isPastDate: boolean): boolean {
  if (f.mode === "strict-empty") return true;
  if (f.mode !== "filter" || f.games.length > 0 || f.prevGames.length > 0) return false;
  if (!isPastDate) return f.nextGames.length === 0;
  // A past tab of a league that has not started yet shows its first games
  // instead (LeagueColumn notStartedDate, read off the raw lookback).
  return !(!league.previousGameDay?.games?.length && f.nextGames.length > 0);
}
