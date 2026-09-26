import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The referee raising the winner's hand is the single most iconic post-fight
// image, and the phrase for it — "gets his hand raised", "had her hand raised",
// "arm raised" — names the winner outright. Combat-sports method-of-victory
// wording (TKO / KO / submission / decision / "goes the distance" / "put to
// sleep") was already covered, but this result-declaring phrase carried no
// digits for SCORE_RX and matched no existing keyword, so a plain "… gets his
// hand raised" recap leaked the winner.
test("a 'hand raised' fight-result reveal never reads as a clean title", () => {
  for (const title of [
    "Makhachev gets his hand raised in the main event",
    "Taylor has her hand raised after 12 rounds",
    "The champ gets the hand-raised moment he wanted",
    "Arm raised by the referee at UFC 320",
    "Hand raised in victory | Full Fight Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Pinned to the "hand"/"arm" + "raised" adjacency in that order, so the bare
// words never fire on their own: "raised his hand" (question/protest word
// order), "backhand"/"forearm", "short-handed", and celebratory "arms raised"
// (plural) all pass through untouched.
test("ordinary 'hand'/'arm'/'raised' wording is not over-hidden", () => {
  for (const title of [
    "He raised his hand to signal for the ball",
    "The best backhand shots of the week",
    "A crunching forearm shiver on the sideline",
    "Short-handed situations to watch for",
    "Fans raised their arms as the anthem played",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
