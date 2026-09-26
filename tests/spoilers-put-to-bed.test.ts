import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put the game/tie to bed" is the decisive-result idiom commentary and recaps reach
// for when a late score kills the contest: "Haaland puts the game to bed", "second
// goal put the tie to bed", "United putting the match to bed". In a per-match title it
// reveals the game was won and put beyond reach, yet it carries no digits for SCORE_RX
// and matched no existing keyword — the sibling "gets over the line"/"clinch"/"seals"
// idioms cover the same sealed-it sense for other phrasings. The <result-noun> + "to
// bed" object is what makes it a spoiler.
test("a 'put … to bed' decisive-result reveal never reads as a clean title", () => {
  for (const title of [
    "Haaland puts the game to bed | Premier League Highlights",
    "Second goal puts the tie to bed at Ibrox",
    "United putting the match to bed late on",
    "Salah put the game to bed in the 88th minute",
    "A composed third puts the tie to bed",
    "Dodgers put the series to bed in four",
    "Late strike puts the derby to bed",
    "Penalty puts the final to bed",
    "Curry putting the contest to bed in the fourth",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to a sports-result noun between "put" and "to bed", so the
// everyday "put to bed" senses — which appear constantly in ordinary titles — must
// still pass through untouched.
test("ordinary uses of 'put … to bed' are not over-hidden", () => {
  for (const title of [
    "Manager puts the transfer story to bed | Deadline day",
    "Club moves to put the debate to bed",
    "Coach puts the issue to bed in press conference",
    "Star puts contract rumours to bed",
    "How players put the kids to bed before a night game",
    "Season preview and predictions",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
