import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The five knockout-advancement idioms (reach / through to / into / progress /
// knock-out-of) already caught the digit round form ("into the last 16"), but the
// spelled-out British-headline form ("reach the last four", "into the last eight",
// "through to the last sixteen") is what broadcasters and fan channels actually write
// most, and it slipped past every one of them — it names the advancing side yet carries
// no scoreline for SCORE_RX. The round of 32 the expanded World Cup introduces was
// missing from the digit set too.
test("spelled-out and last-32 knockout rounds read as a result reveal", () => {
  for (const title of [
    "Chelsea reach the last four",
    "Rangers into the last eight",
    "Spain through to the last sixteen",
    "United progress to the last eight",
    "USA into the last 32",
    "City reach the last four in style",
    "Morocco through to the last four again",
    "Bayern dumped out of the last eight",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The round noun carries the reveal, so the everyday non-knockout "last four" senses —
// where a number of minutes, games, or holes follows, or the attacking "final third" —
// stay untouched. Over-hiding one of these would drop a legit clip from the worker's
// search results, not merely keep a title masked, so the trailing unit-noun guard keeps
// them out.
test("everyday 'last four/eight/sixteen <unit>' phrasings are not over-hidden", () => {
  for (const title of [
    "Into the last four minutes it was still level",
    "Down to the last four games of the season",
    "A look back at the last sixteen games",
    "The final third is where they create everything",
    "The last four holes decide the tournament",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
