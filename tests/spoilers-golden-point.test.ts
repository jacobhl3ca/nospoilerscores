import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "golden point" is the rugby league / NRL analogue of the already-hidden
// "golden goal": in golden-point extra time the first score wins on the spot,
// so the phrase alone reveals both that the game was level after regulation AND
// that it's over with a winner. It carries no digits (SCORE_RX misses it) and,
// before this branch, slipped past "sudden[- ]?death" and "golden[- ]?goals?"
// (which only covered the "goal" wording), so these leaked.
test("a 'golden point' reveal never reads as a clean title", () => {
  for (const title of [
    "Panthers win it in golden point",
    "Dramatic golden point finish",
    "Storm edge Roosters in golden point extra time",
    "Golden point drama at Suncorp",
    "Origin decided by a golden point field goal",
    "Golden-point thriller in the grand final",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The existing "golden goal" sibling stays caught, and the mandatory trailing
// "goal"/"point" keeps the branch clear of the in-scope "Golden State" team
// name and other benign "golden …" phrases that never precede goal/point.
test("golden goal stays hidden and benign 'golden' titles are not over-hidden", () => {
  assert.equal(isScoreSpoiler("Golden goal settles the final"), true);
  for (const title of [
    "Golden State preview and analysis",
    "Golden boot race heats up this season",
    "A golden generation of talent",
    "Extended highlights: matchweek 5",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
