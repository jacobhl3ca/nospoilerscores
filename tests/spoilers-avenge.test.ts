import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "aveng(e|es|ed|ing)" is the verb the revenge-noun group could not reach: a rematch
// result headline that puts the win in the verb itself ("Fury avenges Wilder", "Canada
// avenge USA") carries no digits for SCORE_RX and, unless a beat/loss keyword happens to
// sit alongside it, matched no other SPOILER_RX branch — so it leaked the winner outright.
test("an 'avenge' rematch-win reveal never reads as a clean title", () => {
  for (const title of [
    "Fury avenges Wilder in Vegas",
    "Alcaraz avenges Sinner",
    "Canada avenge USA in the rematch",
    "Rovers avenged the derby",
    "United avenging their earlier meeting",
    "Verstappen avenges Monza",
    "Real Madrid avenge their earlier trip to Girona",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The (?<!\bto ) lookbehind drops the infinitive preview framing — "out/looking/hoping/
// seeking to avenge" reveals no result — exactly as it does for the revenge group. A false
// positive here would drop a legit item from the worker's search results, not merely keep a
// title masked, so these previews must stay visible.
test("infinitive 'to avenge' PREVIEWS (no result) are not over-hidden", () => {
  for (const title of [
    "United looking to avenge last season",
    "Chiefs out to avenge the derby",
    "Rangers hoping to avenge their earlier meeting",
    "Spurs get a chance to avenge the derby",
    "Arsenal seeking to avenge the reverse fixture",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
