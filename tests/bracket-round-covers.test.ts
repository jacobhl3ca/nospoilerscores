import assert from "node:assert/strict";
import test from "node:test";

import {
  BRACKET_ROUND_SHOW_LABELS,
  nextCoveredRound,
  parseSeenSeries,
  revealRound,
  seriesKey,
  visibleResults,
  type BracketResult,
} from "../src/lib/playoffPicture.ts";

// The MLB bracket covers each series winner until the reader taps for its
// round. The device stores the series the reader saw (seriesKey), not a round.

const WC: BracketResult[] = [
  { round: 0, winner: "116", loser: "114" },
  { round: 0, winner: "147", loser: "111" },
];
const WC_LATE: BracketResult[] = [
  { round: 0, winner: "112", loser: "135" },
  { round: 0, winner: "119", loser: "113" },
];
const DS: BracketResult[] = [{ round: 1, winner: "136", loser: "116" }];
const NONE: ReadonlySet<string> = new Set();

test("no results: no cover", () => {
  assert.equal(nextCoveredRound([], NONE), null);
  assert.deepEqual(visibleResults([], NONE), []);
});

test("Wild Card results only, nothing revealed: the Wild Card cover, no results shown", () => {
  const covered = nextCoveredRound(WC, NONE);
  assert.equal(covered, 0);
  assert.equal(BRACKET_ROUND_SHOW_LABELS[covered!], "Show Wild Card results");
  assert.deepEqual(visibleResults(WC, NONE), []);
});

test("Wild Card revealed, Division Series results in: WC shown, DS covered", () => {
  const all = [...WC, ...DS];
  const seen = revealRound(WC, NONE, 0);
  assert.deepEqual(visibleResults(all, seen), WC);
  const covered = nextCoveredRound(all, seen);
  assert.equal(covered, 1);
  assert.equal(BRACKET_ROUND_SHOW_LABELS[covered!], "Show Division Series results");
});

test("a tap on the Wild Card never reveals the Division Series", () => {
  const all = [...WC, ...DS];
  assert.equal(nextCoveredRound(all, NONE), 0);
  const seen = revealRound(all, NONE, 0);
  assert.equal(visibleResults(all, seen).some((r) => r.round === 1), false);
});

test("a tap during the Wild Card: series that end later stay covered", () => {
  // Tap with 2 of 4 WC series final, come back with 4 of 4 final.
  const seen = revealRound(WC, NONE, 0);
  const later = [...WC, ...WC_LATE];
  assert.deepEqual(visibleResults(later, seen), WC);
  assert.equal(nextCoveredRound(later, seen), 0);
  const again = revealRound(later, seen, 0);
  assert.deepEqual(visibleResults(later, again), later);
  assert.equal(nextCoveredRound(later, again), null);
});

test("every series revealed: no cover", () => {
  const all = [...WC, ...DS];
  const seen = revealRound(all, revealRound(all, NONE, 0), 1);
  assert.equal(nextCoveredRound(all, seen), null);
});

test("always flag: every result shown, no cover", () => {
  const all = [...WC, ...DS];
  assert.deepEqual(visibleResults(all, NONE, true), all);
  assert.equal(nextCoveredRound(all, NONE, true), null);
});

test("seriesKey: round and both clubs, the same whichever club won", () => {
  assert.equal(seriesKey({ round: 0, winner: "116", loser: "114" }), "0:114-116");
  assert.equal(seriesKey({ round: 0, winner: "114", loser: "116" }), "0:114-116");
  assert.notEqual(seriesKey({ round: 1, winner: "116", loser: "114" }), "0:114-116");
});

test("parseSeenSeries: round trip of a stored set", () => {
  const seen = revealRound(WC, NONE, 0);
  assert.deepEqual(parseSeenSeries(JSON.stringify([...seen])), seen);
});

test("parseSeenSeries: old format and bad values fail closed (cover shows)", () => {
  for (const raw of [null, "", "0", "1", "3", "true", "{}", '{"0":1}', "[0,1]", "not json"]) {
    const seen = parseSeenSeries(raw);
    assert.equal(seen.size, 0, `raw ${raw}`);
    assert.equal(nextCoveredRound(WC, seen), 0, `raw ${raw}`);
    assert.deepEqual(visibleResults(WC, seen), [], `raw ${raw}`);
  }
});

test("labels: LCS and the World Series", () => {
  assert.equal(BRACKET_ROUND_SHOW_LABELS[2], "Show LCS results");
  assert.equal(BRACKET_ROUND_SHOW_LABELS[3], "Show World Series result");
});
