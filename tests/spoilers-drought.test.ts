import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "drought ended" is the barren-run sibling of "unbeaten run ended": a goal,
// trophy, title or away "drought" is a famine recaps name only to report it
// broken — "Arsenal end 10-year trophy drought", "Spurs' title drought is
// over". It reveals an outright result (the side won the trophy, scored, or won
// on that ground) yet names neither a hyphenated score for SCORE_RX nor any
// existing keyword. Two ordered alternatives cover both the verb-first form
// ("end … drought") and the noun-first form ("drought … over"), each with a
// lazily-bounded word gap so a possessive, a "10-year" or a "their" can sit
// between them.
test("a 'drought ended' reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal end 10-year trophy drought | Premier League Highlights",
    "Liverpool snap their long title drought",
    "Man Utd end their goal drought in style",
    "Spurs' trophy drought is OVER after cup win",
    "City end drought at Anfield",
    "Real Madrid's Champions League drought ends",
    "Chelsea break their away drought",
    "United halt scoring drought with late winner",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the ENDING, not the bare word, so titles that only
// name a drought — with no word saying it was broken — stay visible.
test("a still-standing drought (no result revealed) is not over-hidden", () => {
  for (const title of [
    "Inside Arsenal's long trophy drought",
    "Why the goal drought is worrying fans",
    "The history of United's title drought",
    "Extended highlights: matchweek 5",
    "Top 10 goals of the season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
