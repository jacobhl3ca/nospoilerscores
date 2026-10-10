// Order of two PRE-GAME college football games in the top-matchups sort.
// The owner wants the best matchups at the top on game day: "top combined
// seeds toward top". The record tier alone put an unranked 4-0 vs 4-0 game
// above #3 vs #7, so the poll rank (Team.rank, see lib/pollRank.ts) leads:
//
//   1. Both teams ranked: lower rank sum first; tie -> the better single rank,
//      then the earlier kickoff.
//   2. One team ranked: that rank; tie -> the earlier kickoff.
//   3. No team ranked: the caller's own order (the record tier + combined wins
//      in LeagueColumn), so that part of the column does not move.
//
// Pure, with a type-only import, so the node unit runner can load it
// (lib/espn.ts cannot be loaded there).
import type { Game } from "./types";

export type RankedMatchupGame = Pick<Game, "date"> & {
  homeTeam: { rank?: number | null };
  awayTeam: { rank?: number | null };
};

const rankOf = (r: number | null | undefined): number | null =>
  typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;

// An unparseable date sinks to the end, as chronoMs does in LeagueColumn.
const kickoffMs = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 8.64e15 : t;
};

export function compareRankedMatchups<G extends RankedMatchupGame>(
  a: G,
  b: G,
  unranked: (a: G, b: G) => number,
): number {
  const ranks = (g: G) => [rankOf(g.homeTeam.rank), rankOf(g.awayTeam.rank)].filter((r): r is number => r != null);
  const ra = ranks(a);
  const rb = ranks(b);
  if (ra.length !== rb.length) return rb.length - ra.length;
  if (ra.length === 0) return unranked(a, b);
  if (ra.length === 2) {
    const bySum = (ra[0] + ra[1]) - (rb[0] + rb[1]);
    if (bySum !== 0) return bySum;
  }
  const byBest = Math.min(...ra) - Math.min(...rb);
  if (byBest !== 0) return byBest;
  return kickoffMs(a.date) - kickoffMs(b.date);
}
