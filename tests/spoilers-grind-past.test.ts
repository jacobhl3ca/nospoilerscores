import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "grind past <opponent>" is the "X past Y" cousin of "grind out a win" — the
// framing recap titles reach for when a side edged a hard-fought, narrow win.
// It always names the beaten opponent yet carries no hyphenated scoreline for
// SCORE_RX, and it slipped past every other member of the "ease/power/breeze/
// coast/stroll/waltz/roll/blow/battle past" family before "grind"/"ground" was
// added to it.
test("a 'grind past <opponent>' win reveal never reads as a clean title", () => {
  for (const title of [
    "Rangers grind past the Devils | NHL Highlights",
    "Man City grind past stubborn Palace",
    "Chelsea grinds past Fulham at the Bridge",
    "Nadal grinding past Medvedev in five sets",
    "United ground past a stubborn Everton side",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the mandatory trailing "past", so the everyday
// non-result senses of "grind" pass through untouched. "grounds past" (the
// baseball ground-ball hit) is also safe: the "s" falls outside the "ground"
// form the alternate lists.
test("ordinary uses of 'grind' and 'ground' are not over-hidden", () => {
  for (const title of [
    "The daily grind of a long road trip",
    "Talks grind to a halt over the new TV rights",
    "Contract negotiations grind on with no resolution",
    "Judge grounds past the diving third baseman for a single",
    "Years past, this rivalry meant everything",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
