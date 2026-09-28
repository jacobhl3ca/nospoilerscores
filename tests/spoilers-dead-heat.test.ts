import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "dead heat" is the racing/athletics sibling of the tie idioms it sits beside
// (deadlock / stalemate / all square): a dead heat is a declared tied finish, so the
// phrase names the outcome — two competitors level — every time. It carries no digits,
// so SCORE_RX misses it, and no existing keyword caught it. The contiguous "dead heat"
// collocation covers the noun (with plural), the verb ("dead-heated"/"dead-heating"),
// and the hyphenated and spaced spellings.
test("a 'dead heat' tie reveal never reads as a clean title", () => {
  for (const title of [
    "Smith and Jones finish in a dead heat",
    "Dead heat at the line as the sprinters share the spoils",
    "The pair dead-heated for the win at Ascot",
    "Two horses dead heat for first",
    "Photo confirms a dead-heat in the 100m final",
    "It's a dead heat as they cross the line together",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pin to the contiguous "dead heat" collocation keeps the everyday senses of "heat"
// out: a preliminary round, a heatwave, or a rivalry all use "heat" without "dead" in
// front of it, so none of these fire.
test("an ordinary 'heat' is not over-hidden", () => {
  for (const title of [
    "The opening heat gets underway on Friday",
    "Athletes drawn together in the first heat",
    "A brutal heatwave forces a delay to the marathon",
    "Runners line up for their qualifying heat",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
