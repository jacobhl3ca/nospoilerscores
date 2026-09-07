import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "take/claim/secure/… maximum points" is the British-football synonym of the already-caught
// "all three points": a side that takes maximum points from a fixture WON it (three points for a
// win). League recaps lead with exactly that phrasing, yet the bare idiom carries no hyphenated
// scoreline for SCORE_RX and matched none of the existing win verbs, so the result leaked.
test("a 'maximum points' win reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal take maximum points at Anfield",
    "City claim maximum points",
    "Liverpool secure maximum points against United",
    "Spurs collect maximum points to go top",
    "Newcastle earn maximum points on the road",
    "Chelsea grab maximum points in stoppage time",
    "Villa bag maximum points at Villa Park",
    "Brighton pocket maximum points",
    "United picked up maximum points at Old Trafford",
    "Rangers took the maximum points in the derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern pins a taking verb directly before "maximum points", so preview/advice titles that
// carry the noun without one — the fantasy tips and pre-match framing that reveal no result — stay
// visible.
test("preview/advice uses of 'maximum points' are not over-hidden", () => {
  for (const title of [
    "How to get maximum points from your fantasy captain",
    "Maximum points on offer this weekend",
    "United need maximum points to stay up",
    "Why maximum points matter in the title race",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
