import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "go[- ]?ahead <scoring noun>" reveal already caught the MLB/NHL/NFL/soccer
// framing ("go-ahead run", "go-ahead goal", "go-ahead touchdown", "go-ahead
// bucket"). But the NBA recaps this app surfaces name the specific shot-type
// outright — "go-ahead dunk", "go-ahead three", "go-ahead lay-up", "go-ahead
// jumper" — and rugby recaps say "go-ahead try". Each names the moment a side
// moved in front, revealing the score DIRECTION exactly as "go-ahead goal"
// does, yet none of those shot-type nouns was in the go-ahead list, so a bare
// "LeBron with the go-ahead dunk" recap leaked.
test("a go-ahead shot-type reveal never reads as a clean title", () => {
  for (const title of [
    "LeBron with the go-ahead dunk",
    "Curry's go-ahead three",
    "Doncic hits the go-ahead layup",
    "The go-ahead lay-up with 4 seconds left",
    "Booker's go-ahead jumper",
    "Farrell's go-ahead try",
    "Late go-ahead threes from Tatum",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory "go-ahead " prefix is what keeps it safe: the bare permission
// idiom "go ahead" never precedes one of these nouns in a per-match highlight
// title, and each shot-type noun on its own (no "go-ahead") stays untouched, so
// ordinary non-result wording passes through.
test("shot nouns without the go-ahead prefix are not over-hidden", () => {
  for (const title of [
    "Go ahead and enjoy the highlights",
    "Best dunks of the season",
    "A jumper's guide to base jumping",
    "Try our new spoiler-free mode",
    "Three teams to watch this week",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
