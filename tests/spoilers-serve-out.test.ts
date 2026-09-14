import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// In tennis (and the other racket sports) a player who "serves out the set" or
// "serves out the match" is winning the final game to close it out — the phrase
// names who took the set or the match just as plainly as "match point" does. It
// carries no digits for SCORE_RX (the "… 6-4"/"… 7-6" tally is what SCORE_RX
// catches) and matched none of the existing win keywords, so a bare serve-out
// recap leaked. The object "set"/"match" is what fixes the sense.
test("a tennis 'serve out the set/match' reveal never reads as a clean title", () => {
  for (const title of [
    "Sinner serves out the match | Highlights",
    "Alcaraz served out the opening set at Wimbledon",
    "Djokovic serving out the match under pressure",
    "Swiatek serves out a nervy set",
    "Gauff serves out the deciding set on Ashe",
    "He served out the match to love",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The object anchor is what fixes the sense: the everyday "serve out a
// suspension/ban/contract/sentence/season" senses reach no "set"/"match" object
// and stay visible, a trailing negative lookahead drops the lone "serve out a
// one-match ban" collision, and the leading \b keeps it out of "reserves out".
// "Break of serve" (its own clause) and neutral serve/match wording are untouched.
test("non-result 'serve out' and neutral serve/match senses are not over-hidden", () => {
  for (const title of [
    "Suarez must serve out a two-match ban",
    "The striker will serve out his suspension first",
    "He agreed to serve out his contract before the move",
    "How to watch the match tonight",
    "Full match replay and reaction",
    "Reserves out for the rest of the season",
    "Serve-and-volley masterclass: how the tactic works",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
