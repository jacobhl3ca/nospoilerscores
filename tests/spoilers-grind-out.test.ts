import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "grind out a win/result" is the gritty-win idiom recap titles reach for when a
// side got the job done without flair — it always names the winner (or, for a
// draw, the outcome) yet carries no hyphenated scoreline for SCORE_RX and matched
// no existing keyword before the pattern was added. The mandatory result-noun tail
// is what makes it a spoiler.
test("a 'grind out <result>' win reveal never reads as a clean title", () => {
  for (const title of [
    "Chelsea grind out a win at Anfield | Premier League Highlights",
    "Spurs ground out a draw against Arsenal",
    "Man City grind out the points at the Etihad",
    "Cowboys grinding out a result on the road",
    "United grind out a victory in stoppage time",
    "Liverpool grinds out the win",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on a mandatory result noun in the "grind out __" slot, so
// the everyday non-result senses of "grind" — which appear constantly in ordinary
// titles — must still pass through untouched. "grounds out" (the baseball out) is
// also safe: the "s" breaks the "ground out" stem the alternate requires.
test("ordinary uses of 'grind' and 'ground' are not over-hidden", () => {
  for (const title of [
    "The daily grind of a long training block",
    "How this striker grinds out reps in the gym",
    "Grinding out a living in the lower leagues",
    "A day in the grind: inside preseason camp",
    "Judge grounds out to short to load the bases",
    "Ground rules for the new season format",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
