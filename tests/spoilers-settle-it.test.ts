import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "settles it" / "settles the tie" is the decisive-winner idiom a recap reaches for
// when one late score decides the contest: "Kane settles it late for Spurs", "Salah
// settles the tie at Anfield". In a per-match title it always reveals the game was
// won (and usually by whom), yet it carries no digits for SCORE_RX and matched no
// existing keyword — the sibling "settle for a draw/point/stalemate" clause is the
// opposite (a level result), and bare "settle" is far too common to be a keyword.
// The "it" / "the <result-noun>" object is what makes it a spoiler.
test("a 'settle it'/'settle the tie' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Kane settles it late for Spurs | Premier League Highlights",
    "Salah settles the tie at Anfield",
    "Ovechkin settles it in overtime",
    "Verstappen settled it on the final lap",
    "A stunning strike settles the match",
    "Late goal settles the derby",
    "Curry settling the game in the fourth quarter",
    "Djokovic settles the contest in New York",
    "Penalty settles the final",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the "it" (word-bounded) / "the <result-noun>" object, so
// the everyday senses of "settle" — which appear constantly in ordinary titles — must
// still pass through untouched, including the revenge-preview "settle an old score".
test("ordinary uses of 'settle' are not over-hidden", () => {
  for (const title of [
    "Rivals settle an old score this weekend | Match preview",
    "New signing settles in quickly at United",
    "Manager wants his side to settle the nerves early",
    "Club moves to settle contract dispute",
    "Player settles into life in the Premier League",
    "Fans settle in for a long night at the Emirates",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
