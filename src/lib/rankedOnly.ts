// "Ranked only" (Settings → Leagues): college football keeps only the games a
// ranked team plays in. Opt-in, undefined = off, so a stored blob from before
// the switch reads as off.
//
// The rank is Team.rank, the same value the "#N" chip on the card shows: the
// AP / CFP poll rank ESPN freezes onto the event at kickoff (lib/pollRank.ts).
// It is the poll from before the game, so it never moves with the result, and
// keeping or dropping a game on it says nothing about who won.
//
// Only NCAAF games are cut. The NCAAF column loses its unranked games, and the
// mixed columns (ESPN front page, Best of yesterday) and the Schedule tab lose
// their unranked NCAAF games. Every other league stays as it was.
//
// Pure, with type-only imports, so the node unit runner can load it.

import type { Game, LeagueData, Sport } from "./types";

export const RANKED_ONLY_SPORT: Sport = "ncaaf";

type RankedTeam = { rank?: number | null };
export type RankedOnlyGame = Pick<Game, "sport"> & { homeTeam: RankedTeam; awayTeam: RankedTeam };

// The poll stops at 25 (lib/pollRank.ts); anything else, null or a missing
// rank is "not ranked".
const isPollRank = (r: number | null | undefined): boolean =>
  typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 25;

export const hasRankedTeam = (g: RankedOnlyGame): boolean =>
  isPollRank(g.homeTeam?.rank) || isPollRank(g.awayTeam?.rank);

export const rankedOnlyOn = (p: { ncaafRankedOnly?: boolean }): boolean => p.ncaafRankedOnly === true;

// True for every game the board still draws with the switch in this state.
export const keepRankedOnly = (g: RankedOnlyGame, on: boolean): boolean =>
  !on || g.sport !== RANKED_ONLY_SPORT || hasRankedTeam(g);

export function filterRankedOnly<G extends RankedOnlyGame>(games: readonly G[], on: boolean): G[] {
  return games.filter((g) => keepRankedOnly(g, on));
}

// The league as the board should draw it. The same object comes back when
// nothing changes, so an off switch (or a league with no NCAAF games) keeps
// every memo keyed on it stable.
//
// On the NCAAF column, `rankedOnlyEmpty` marks a day that had games but none
// with a ranked team, so LeagueColumn shows "No ranked games today" instead of
// its usual empty chain. An emptied lookahead or lookback day is dropped.
export function applyRankedOnly(league: LeagueData, on: boolean): LeagueData {
  if (!on) return league;
  const games = filterRankedOnly(league.games, on);
  const next = league.nextGameDay ? filterRankedOnly(league.nextGameDay.games, on) : null;
  const prev = league.previousGameDay ? filterRankedOnly(league.previousGameDay.games, on) : null;
  const gamesCut = games.length !== league.games.length;
  const nextCut = !!league.nextGameDay && next!.length !== league.nextGameDay.games.length;
  const prevCut = !!league.previousGameDay && prev!.length !== league.previousGameDay.games.length;
  if (!gamesCut && !nextCut && !prevCut) return league;
  const out: LeagueData = { ...league, games };
  if (nextCut) out.nextGameDay = next!.length ? { ...league.nextGameDay!, games: next! } : null;
  if (prevCut) out.previousGameDay = prev!.length ? { ...league.previousGameDay!, games: prev! } : null;
  // Empty when the day itself had games and none was ranked (say so, rather
  // than fall back to another day's slate), or when the cut left no day at all.
  const nothingLeft = !out.nextGameDay?.games.length && !out.previousGameDay?.games.length;
  if (league.sport === RANKED_ONLY_SPORT && games.length === 0 && (gamesCut || nothingLeft)) {
    out.rankedOnlyEmpty = true;
  }
  return out;
}
