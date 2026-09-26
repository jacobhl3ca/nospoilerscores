import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get over the line" is the British win idiom — the direct sibling of "get the job
// done" — for a side that saw the job through to the result: "Spurs got over the line
// at Chelsea", "England get over the line". In a match title it always means the named
// side came away with the win, yet it carries no digits for SCORE_RX and matched no
// existing keyword, so a highlight title written this way slipped past the mask. The
// fixed "over the line" tail is what makes it a spoiler and keeps bare "get"/"got" safe.
test("a 'get over the line' win reveal never reads as a clean title", () => {
  for (const title of [
    "Spurs got over the line against Chelsea | Premier League Highlights",
    "England get over the line in style",
    "Ireland getting over the line late on",
    "Arsenal gets over the line at Anfield",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the fixed "over the line" tail, so the everyday senses of
// "get"/"got" — and the goal-line replay framing "get the ball over the line", where
// "the ball" sits between "get" and "over" — must still pass through untouched.
test("ordinary uses of 'get'/'over the line' are not over-hidden", () => {
  for (const title of [
    "How to get the ball over the line from close range",
    "Referee checks whether it crossed over the line",
    "Get over here: the best celebrations of the season",
    "How players get fit over the international break",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
