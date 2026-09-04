import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "make it N in a row / straight / on the trot|bounce|spin" is the
// winning-streak-CONTINUATION framing NBA/NHL/soccer recaps reach for when a
// side wins again — "Warriors make it three straight", "Celtics make it 10 in a
// row", "United make it four on the bounce". It reveals the team won (the mirror
// of the streak-END sibling "… unbeaten run ends") yet the digit lives inside
// "three straight" — no hyphenated score for SCORE_RX — and without a
// "win"/"won"/"winning" token it tripped no existing keyword, so the bare title
// leaked. The pattern is pinned to the "make(s)/made it" + count + streak-marker
// frame.
test("a 'make it N straight' streak-continuation reveal never reads as a clean title", () => {
  for (const title of [
    "Warriors make it three straight | NBA Highlights",
    "Celtics make it 10 in a row",
    "United make it four on the bounce",
    "Rovers make it five on the trot",
    "City make it two on the spin",
    "Chiefs make it 6 straight",
    "Nadal makes it three in a row",
    "Liverpool made it four straight in style",
    "Can they make it seven in a row tonight?",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The frame needs "make it" + a count + a streak marker together, so the
// everyday "N years in a row" / "N in a row of …" senses (no leading "make it")
// and the "makes it look easy" / "made it to the final" senses (no count before
// the marker) all stay visible.
test("everyday 'in a row' / 'make it' phrasings are not over-hidden", () => {
  for (const title of [
    "Third year in a row hosting the finals",
    "The best plays of the week in a row of highlights",
    "Messi makes it look easy in training",
    "United made it to the final",
    "How to watch: five games in a row this weekend",
    "Make it a night to remember",
    "Ranking the top three teams straight up",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
