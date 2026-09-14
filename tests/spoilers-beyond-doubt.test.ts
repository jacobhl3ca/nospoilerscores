import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put … beyond (all) doubt/reach" and "put … out of sight/reach" is the game-is-settled
// idiom commentary and recaps reach for when a late score kills the contest: "Haaland
// puts the game beyond doubt", "second goal puts it beyond reach", "United put the tie
// out of sight". In a per-match title it reveals the game was won and decided, yet it
// carries no digits for SCORE_RX and matched no existing keyword — the sibling "… to
// bed"/"gets over the line"/"clinch"/"seals" idioms cover the same sealed-it sense for
// other phrasings. The leading "put" verb plus the beyond-doubt/out-of-sight object is
// what makes it a spoiler.
test("a 'put … beyond doubt' decisive-result reveal never reads as a clean title", () => {
  for (const title of [
    "Haaland puts the game beyond doubt | Premier League Highlights",
    "Second goal puts it beyond doubt at Ibrox",
    "United putting the tie beyond reach late on",
    "Salah's penalty put the result beyond all doubt",
    "Arsenal put the game out of sight in the second half",
    "Rashford puts the tie out of reach",
    "A composed third puts the contest beyond doubt",
    "Late strike puts the derby beyond doubt",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to a leading "put" verb, so the everyday "proved/established
// beyond (reasonable) doubt" and legal "guilty beyond reasonable doubt" senses — which
// carry no "put" frame — must still pass through untouched.
test("ordinary uses of 'beyond doubt' / 'out of sight' are not over-hidden", () => {
  for (const title of [
    "Proved beyond doubt that he is the best in the league",
    "Guilty beyond reasonable doubt, court rules in athlete's case",
    "His talent is established beyond doubt",
    "Rising star out of sight of the national selectors",
    "Season preview and predictions",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
