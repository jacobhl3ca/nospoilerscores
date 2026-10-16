import assert from "node:assert/strict";
import test from "node:test";
import { compareRankedMatchups, type RankedMatchupGame } from "../src/lib/rankedMatchupSort.ts";

// College football top-matchups order (lib/rankedMatchupSort.ts): both-ranked
// games by rank sum, then one-ranked by that rank, then unranked by record.

type G = RankedMatchupGame & { id: string; tier: number; wins: number };
let n = 0;
const game = (away: number | null, home: number | null, hour = 16, tier = 2, wins = 0): G => ({
  id: `g${++n}`,
  date: `2026-10-03T${String(hour).padStart(2, "0")}:00Z`,
  awayTeam: { rank: away },
  homeTeam: { rank: home },
  tier,
  wins,
});
// Today's record order: tier first, then combined wins.
const byRecord = (a: G, b: G) => a.tier - b.tier || b.wins - a.wins;
const order = (games: G[]) => [...games].sort((a, b) => compareRankedMatchups(a, b, byRecord)).map((g) => g.id);

test("#8 vs #10 (sum 18) sits above #1 vs #20 (sum 21)", () => {
  const a = game(1, 20);
  const b = game(8, 10);
  assert.deepEqual(order([a, b]), [b.id, a.id]);
});

test("#3 vs #7 sits above #1 vs unranked", () => {
  const a = game(1, null);
  const b = game(3, 7);
  assert.deepEqual(order([a, b]), [b.id, a.id]);
});

test("#5 vs unranked sits above #12 vs unranked", () => {
  const a = game(null, 12);
  const b = game(5, null);
  assert.deepEqual(order([a, b]), [b.id, a.id]);
});

test("a ranked game sits above an unranked game with a better record tier", () => {
  const a = game(null, null, 16, 0, 10);
  const b = game(null, 24, 16, 2, 0);
  assert.deepEqual(order([a, b]), [b.id, a.id]);
});

test("two unranked games keep the record tier order", () => {
  const worse = game(null, null, 12, 2, 9);
  const better = game(null, null, 20, 0, 4);
  const sameTierMoreWins = game(null, null, 20, 0, 6);
  assert.deepEqual(order([worse, better, sameTierMoreWins]), [sameTierMoreWins.id, better.id, worse.id]);
});

test("equal sums fall back to the better single rank, then kickoff", () => {
  const a = game(5, 9, 12); // sum 14, best 5
  const b = game(2, 12, 20); // sum 14, best 2
  assert.deepEqual(order([a, b]), [b.id, a.id]);
  const late = game(4, 10, 23);
  const early = game(10, 4, 15);
  assert.deepEqual(order([late, early]), [early.id, late.id]);
});

test("one-ranked ties fall back to kickoff", () => {
  const late = game(7, null, 23);
  const early = game(null, 7, 15);
  assert.deepEqual(order([late, early]), [early.id, late.id]);
});
