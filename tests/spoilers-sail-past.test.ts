import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "sail past" is the effortless-win member of the same "X past Y" comfortable-win family already
// keyworded through breeze/coast/cruise/stroll/glide/waltz/roll past: a side that SAILS past its
// opponent won comfortably. Tennis, soccer and American-sports recaps lead with exactly this
// ("Nadal sails past Kyrgios", "City sail past Burnley", "Chiefs sailed past the Broncos") — a
// beaten opponent named with no digits for SCORE_RX and matched by none of the existing verbs. The
// mandatory trailing "past" is what makes the otherwise-common verb a spoiler.
test("a 'sail past' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Manchester City sail past Burnley",
    "Real Madrid sailed past Getafe",
    "Nadal sails past Kyrgios",
    "Chiefs sail past the Broncos | Highlights",
    "Arsenal sail past Spurs in the North London derby",
    "Alcaraz sailed past his opponent in straight sets",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the trailing "past" and lists only the sail/sails/sailed forms (the
// -ing form is deliberately left alone, like breeze's), so the bare non-result senses of "sail" —
// and the sailing sport itself — must still pass through untouched.
test("ordinary uses of 'sail' / the sailing sport are not over-hidden", () => {
  for (const title of [
    "America's Cup sailing highlights",
    "A relaxing day sailing on the bay",
    "Plain sailing ahead for the top seeds | Preview",
    "Sailing past the final buoy | Regatta recap",
    "How to trim your sails | Tutorial",
    "Match preview: can United sail through to the weekend fit?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
