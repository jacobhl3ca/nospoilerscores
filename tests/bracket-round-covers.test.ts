import assert from "node:assert/strict";
import test from "node:test";

import {
  BRACKET_ROUND_SHOW_LABELS,
  nextCoveredRound,
  visibleResults,
  type BracketResult,
} from "../src/lib/playoffPicture.ts";

// The MLB bracket covers each round's series winners until the reader taps
// for that round. The stored index is the highest round shown; -1 is none.

const WC: BracketResult[] = [
  { round: 0, winner: "116", loser: "114" },
  { round: 0, winner: "147", loser: "111" },
];
const DS: BracketResult[] = [{ round: 1, winner: "136", loser: "116" }];

test("no results: no cover", () => {
  assert.equal(nextCoveredRound([], -1), null);
  assert.deepEqual(visibleResults([], -1), []);
});

test("Wild Card results only, nothing revealed: the Wild Card cover, no results shown", () => {
  const covered = nextCoveredRound(WC, -1);
  assert.equal(covered, 0);
  assert.equal(BRACKET_ROUND_SHOW_LABELS[covered!], "Show Wild Card results");
  assert.deepEqual(visibleResults(WC, -1), []);
});

test("Wild Card revealed, Division Series results in: WC shown, DS covered", () => {
  const all = [...WC, ...DS];
  assert.deepEqual(visibleResults(all, 0), WC);
  const covered = nextCoveredRound(all, 0);
  assert.equal(covered, 1);
  assert.equal(BRACKET_ROUND_SHOW_LABELS[covered!], "Show Division Series results");
});

test("a tap on the Wild Card never reveals the Division Series", () => {
  const all = [...WC, ...DS];
  assert.equal(nextCoveredRound(all, -1), 0);
  assert.equal(visibleResults(all, 0).some((r) => r.round === 1), false);
});

test("every round revealed: no cover", () => {
  assert.equal(nextCoveredRound([...WC, ...DS], 1), null);
});

test("always flag: every result shown, no cover", () => {
  const all = [...WC, ...DS];
  assert.deepEqual(visibleResults(all, -1, true), all);
  assert.equal(nextCoveredRound(all, -1, true), null);
});

test("labels: LCS and the World Series", () => {
  assert.equal(BRACKET_ROUND_SHOW_LABELS[2], "Show LCS results");
  assert.equal(BRACKET_ROUND_SHOW_LABELS[3], "Show World Series result");
});
