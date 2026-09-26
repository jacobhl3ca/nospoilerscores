import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "eke out a win/draw" is the narrow-margin cousin of "grind out a win" — the
// idiom recap titles reach for when a side only just came away with it. It names
// the winner (or, for a draw, the outcome) yet carries no hyphenated scoreline for
// SCORE_RX and matched no existing keyword before the pattern was added. The
// mandatory result-noun tail is what makes it a spoiler.
test("an 'eke out <result>' reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal eke out a win at Turf Moor | Premier League Highlights",
    "USMNT eked out a draw in Costa Rica",
    "Man City eke out the points against Palace",
    "Rangers eking out a result at Ibrox",
    "Dodgers eke out a victory in extras",
    "Liverpool eke out the win late on",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on a mandatory result noun in the "eke out __" slot, so the
// everyday non-result sense of "eke out" — subsistence, scarcity — must still pass
// through untouched.
test("ordinary uses of 'eke out' are not over-hidden", () => {
  for (const title of [
    "How families eke out a living on minimum wage",
    "Farmers eking out an existence in the drought",
    "Eke out every last drop of range from your EV",
    "How to eke out more battery life on a long day",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
