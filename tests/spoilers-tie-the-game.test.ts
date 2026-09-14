import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "tie/knot/square the game|score" is the single-game EQUALISER idiom NBA/NHL/MLB
// (and soccer) recaps lead with when the trailing side scores to draw a live game
// back level: "LeBron ties the game", "Judge tied the score with a homer", "Curry
// knots the game at 100", "Oilers square the game in the third". Drawing a game
// level means that side just scored — a partial-result reveal — yet on its own it
// carries no digits for SCORE_RX (the "… at 100" scoreline is what SCORE_RX catches)
// and matched no existing keyword, so a bare "… ties the game" leaked. It is the
// single-game twin of the "… the series" equaliser reveal, borrowing only its
// no-benign-sense verbs (tie/knot/square) — never "even"/"level", which carry the
// everyday fairness and adverb senses guarded by spoilers-level-up.test.ts.
test("a 'tie/knot/square the game/score' equaliser reveal never reads as a clean title", () => {
  for (const title of [
    "LeBron ties the game with a three | NBA Highlights",
    "Kane ties the game in the 90th minute",
    "Judge tied the score with a two-run homer",
    "Curry knots the game at 100",
    "Oilers square the game in the third",
    "Messi tied the game in stoppage time",
    "Rangers knot the score late in the third",
    "Ohtani ties the score with a leadoff blast",
    "Suns square the game before the break",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Pinned to the fixed "<verb> (up) the (game|score)" frame with only tie/knot/square,
// so the everyday senses of these verbs ("tie the knot", "square the circle") and the
// fairness/adverb senses of the deliberately-excluded "even"/"level" ("level the game
// for smaller clubs", "even the game was delayed") pass through untouched, as do plain
// non-result mentions of a game.
test("ordinary uses of tie/knot/square (and excluded even/level) are not over-hidden", () => {
  for (const title of [
    "How to watch tonight's game",
    "Full game replay available now",
    "Match preview and predictions",
    "Rules changes aim to level the game for smaller clubs",
    "Even the game's biggest star sat out with an injury",
    "Star couple tie the knot in the offseason",
    "Best goals of the season so far",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
