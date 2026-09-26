import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "sew up" is one of the commonest US-sports clinch idioms — the direct synonym
// of the already-caught "wrap up the title" and "lock up the division / playoff
// spot" siblings. In a recap/highlight title it always names the side that has
// clinched a title, division, pennant, seed, playoff spot or series, yet it
// carries no digits for SCORE_RX and matched no existing keyword, so a title
// written this way slipped past the mask. It is object-anchored (like "wrap up"
// and "lock up") so a bare, no-result "sew up" stays visible.
test("a 'sew up' clinch reveal never reads as a clean title", () => {
  for (const title of [
    "Dodgers sew up the NL West",
    "Bills sew up the AFC East",
    "Astros sewing up the division",
    "Yankees sews up the pennant",
    "Man City sew up the title at the Etihad",
    "Panthers sew up the series in six",
    "Braves sew up their division crown",
    "Chiefs sew up the AFC West with a win",
    "Liverpool sewed up the championship",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clinch-object anchor keeps the everyday, no-result senses visible: a bare
// "sew up" with no title/division/series object reveals no outcome, and the
// non-sport senses of the word are not over-hidden by this entry.
test("ordinary uses of 'sew up' are not over-hidden by this entry", () => {
  for (const title of [
    "A tailor shows how to sew up a torn jersey",
    "Sewing lessons for beginners",
    "How teams sew up home advantage explained",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
