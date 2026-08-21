import assert from "node:assert/strict";
import test from "node:test";

import { matchupKey, compactableMatchups } from "../src/lib/upcomingSlate.ts";
import type { Game } from "../src/lib/types.ts";

// Minimal Game stand-in: compactableMatchups only reads the two team ids.
const g = (id: string, away: string, home: string) =>
  ({ id, awayTeam: { id: away, abbreviation: away }, homeTeam: { id: home, abbreviation: home } }) as unknown as Game;

const compacts = (games: Game[], firstFull: boolean, alsoShown: Game[] = []) => {
  const named = compactableMatchups(games, firstFull, alsoShown);
  return games.map((x, i) => named.has(matchupKey(x)) && !(firstFull && i === 0));
};

test("a matchup key ignores which side is home", () => {
  assert.equal(matchupKey(g("1", "BOS", "DET")), matchupKey(g("2", "DET", "BOS")));
});

// ── The bug: opening night is three DIFFERENT games ─────────────────────────
// Compacting them printed "@ NY" and "@ SA" — the 76ers and Thunder vanished.

test("an opening-night slate of different matchups never compacts", () => {
  const slate = [g("1", "BOS", "DET"), g("2", "PHI", "NY"), g("3", "OKC", "SA")];
  assert.deepEqual(compacts(slate, true), [false, false, false]);
});

test("an off-day lookahead of different matchups never compacts", () => {
  const slate = [g("1", "LAL", "GS"), g("2", "MIA", "NY"), g("3", "DEN", "PHX")];
  assert.deepEqual(compacts(slate, true), [false, false, false]);
});

// ── Preserved: every playoff shape still compacts ───────────────────────────

test("a playoff series still compacts every row after the lead card", () => {
  const series = [g("1", "BOS", "DAL"), g("2", "DAL", "BOS"), g("3", "DAL", "BOS")];
  assert.deepEqual(compacts(series, true), [false, true, true]);
});

test("the lookahead under today's slate compacts against today's matchup", () => {
  const today = [g("t1", "BOS", "DAL")];
  const upcoming = [g("u1", "DAL", "BOS"), g("u2", "BOS", "DAL")];
  assert.deepEqual(compacts(upcoming, false, today), [true, true]);
});

test("the conference round still compacts with two series on the column", () => {
  const today = [g("t1", "BOS", "IND"), g("t2", "DAL", "MIN")];
  const upcoming = [g("u1", "IND", "BOS"), g("u2", "BOS", "IND")];
  assert.deepEqual(compacts(upcoming, false, today), [true, true]);
});

test("an upcoming game no card above it names stays full", () => {
  const today = [g("t1", "BOS", "IND")];
  const upcoming = [g("u1", "DAL", "MIN")];
  assert.deepEqual(compacts(upcoming, false, today), [false]);
});

test("a blank team id falls back to the abbreviation, not a shared empty key", () => {
  const a = { id: "1", awayTeam: { id: "", abbreviation: "BOS" }, homeTeam: { id: "", abbreviation: "DET" } } as unknown as Game;
  const b = { id: "2", awayTeam: { id: "", abbreviation: "PHI" }, homeTeam: { id: "", abbreviation: "NY" } } as unknown as Game;
  assert.notEqual(matchupKey(a), matchupKey(b));
  assert.deepEqual(compacts([a, b], true), [false, false]);
});
