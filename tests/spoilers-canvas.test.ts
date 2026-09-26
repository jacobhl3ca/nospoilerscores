import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A knockdown is a boxing/MMA highlight's signature reveal — the fighter who
// went down, and often the round — yet "sends X to the canvas" / "puts X on
// the canvas" / "hits the canvas" carries no digits (SCORE_RX misses it) and
// matched no combat token beside the TKO/decision cluster, so these leaked.
// Two branches: a knockdown-verb form (sends/puts/drops/floors/crashes/sinks/
// slumps/slips/tumbles + "flat"/"down") + up to three words + "(to|on|onto)
// the canvas", and the intransitive "(hits|kisses|meets) the canvas".
test("a knockdown 'canvas' reveal never reads as a clean title", () => {
  for (const title of [
    "Usyk sends Fury to the canvas",
    "Wilder puts Helenius on the canvas",
    "Paul hits the canvas in round one",
    "Joshua drops Ngannou to the canvas twice",
    "Ngannou crashes to the canvas in the second",
    "Fury flat on the canvas after a right hand",
    "Tyson sinks to the canvas",
    "Down to the canvas goes the champion",
    "Bivol put on the canvas for the first time",
    "Canelo kisses the canvas for the first time in his career",
    "Wilder meets the canvas early",
    "Ruiz tumbles to the canvas late in the fight",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "the canvas" only reads as a knockdown when a going-down verb drives the
// boxer onto it; a bare mention of the ring floor (or a non-boxing "canvas"
// noun phrase) must stay visible so schedule/preview titles are not hidden.
test("benign 'canvas' headlines are not over-hidden", () => {
  for (const title of [
    "The canvas was replaced before the bout",
    "How the canvas tent was set up for fans",
    "Boxing preview: Fury vs Usyk this weekend",
    "Full card and start time for Saturday's fights",
    "Fury walks to the ring in Riyadh",
    "A mural painted on the canvas of the arena",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
