import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "draws level" / "levels it" / "levels the scores/tie/..." is the equaliser verb frame
// recaps reach for when a side pegs the game back to a tie: "Kane levels it late for
// England", "Sub draws level for United", "Rashford levels the scores at Anfield". On its
// own it reveals the game was tied up, yet it carries no digits for SCORE_RX and matched
// no existing keyword — the noun siblings "leveller(s)" and "equalise/equalize" cover only
// those spellings. The trailing result object (it / things up / the <result-noun>, or the
// fixed "draw level" idiom) is what makes it a spoiler.
test("a 'draw level'/'levels it' equaliser reveal never reads as a clean title", () => {
  for (const title of [
    "Kane levels it late for England | Highlights",
    "Substitute levels the scores at Anfield",
    "Spurs level the tie in stoppage time",
    "Rashford draws level for United",
    "Late strike levels the match",
    "Palmer levels things up for Chelsea",
    "Sub draws level in the derby",
    "Header levels the aggregate on the night",
    "Penalty levels the score with minutes to go",
    "Nunez drew level for Liverpool",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the result object, so the everyday senses of "level" and
// "draw" — which appear constantly in ordinary titles — must still pass through untouched,
// including the "level the game/playing field" fairness idiom and the fixture "draw".
test("ordinary uses of 'level' and 'draw' are not over-hidden", () => {
  for (const title of [
    "A next-level performance from the youngster",
    "City reach a new level under Guardiola",
    "Level playing field for both sides",
    "How to level up your fantasy team",
    "Entry-level tickets now on sale",
    "Rules changes aim to level the game for smaller clubs",
    "New TV deal to level the playing field",
    "Prize draw for season ticket holders",
    "The draw for the Champions League group stage",
    "Level crossing closed near the stadium",
    "Referee draws criticism after the game",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
