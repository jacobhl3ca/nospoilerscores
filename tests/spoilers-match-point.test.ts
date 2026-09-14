import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "match point" is tennis's (and table-tennis/badminton/volleyball's) deciding-
// point reveal: a recap that says a match reached match point is telling you it
// went to its final, most-dramatic point, and "saves/fought-off/down match
// point(s)" usually names the escaper as the eventual winner too. It carries no
// digits for SCORE_RX (the "… 6-4"/"… 7-6" tally is what SCORE_RX catches) and
// matched none of the existing win keywords, so a bare match-point recap leaked.
// The two-word compound fixes the sense; the leading \b keeps it out of "rematch".
test("a 'match point' reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz saves match point to advance | Highlights",
    "Sinner fought off three match points in the decider",
    "Swiatek down match point before the comeback",
    "On match point, Djokovic serves it out",
    "Two match points saved in an epic tie-break",
    "Gauff faces match point at the US Open",
    "Match point drama in the fifth set",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The compound is what fixes the sense: "set point" is deliberately left alone (a
// set is not the match), "championship point" is skipped (it collides with the
// basketball "championship point guard" and the season points-system sense), and
// the leading \b keeps "rematch"/"rematch point" out. Neutral match/point wording
// that reveals no result stays visible.
test("neutral or non-deciding 'match'/'point' senses are not over-hidden", () => {
  for (const title of [
    "Match preview and predictions",
    "How to watch the match tonight",
    "Rematch set for next week",
    "The championship point guard shines again",
    "Big serve on set point in the opener",
    "Full match replay and reaction",
    "Point-by-point guide to the new scoring format",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
