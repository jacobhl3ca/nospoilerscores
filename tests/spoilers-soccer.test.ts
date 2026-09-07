import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put N past" is the goals-scored idiom soccer recap titles lean on — the count
// itself reveals the tally and, with it, the comfortable winner. Each of these
// leaked through before the pattern was added: none carries a hyphenated
// scoreline for SCORE_RX, and the bare verbs were deliberately left out of the
// "X past Y" set. The number between "put" and "past" is what makes it a spoiler.
test("a 'put N past' scoreline reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal put five past Chelsea | Premier League Highlights",
    "Man City put four past United",
    "Haaland puts three past Spurs",
    "Liverpool put 6 past Bournemouth",
    "Bayern putting five past Dortmund",
    "Real Madrid put one past Barcelona",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on a mandatory number in the exact "put __ past" slot, so
// the everyday senses of "put" and "past" — which appear constantly in ordinary
// titles — must still pass through untouched.
test("ordinary uses of 'put' and 'past' are not over-hidden", () => {
  for (const title of [
    "Put your past behind you: a fresh start",
    "Putting the past to bed after a tough season",
    "How to put the past 10 years in perspective",
    "Klopp puts faith in youngsters",
    "Ronaldo puts pen to paper on new deal",
    "A look back at the past five games",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
