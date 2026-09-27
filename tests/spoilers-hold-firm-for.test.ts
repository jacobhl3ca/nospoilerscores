import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "hold/held firm for <result>" is the direct sibling of the existing
// "hold/held out for <result>" branch — the other everyday way a recap says a
// side dug in and kept the finish intact. The win/victory forms already hid on
// the bare "win"/"victory" tokens; the draw/point(s)/result forms carried no
// digit for SCORE_RX and matched no other keyword, so "Ten-man Rovers hold firm
// for a point" leaked. Added with the same result-object anchor as "hold out
// for": an optional article, one optional adjective, then
// win/victory/draw/point(s)/result/lead.
test("a 'hold firm for <result>' label never reads as a clean title", () => {
  for (const title of [
    "Ten-man Rovers hold firm for a point",
    "United held firm for a draw at the Bridge",
    "Wolves holding firm for a result",
    "Arsenal hold firm for the win",
    "Spurs held firm for a hard-fought draw",
    "Nine-man Leeds hold firm for a famous win",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

test("'hold firm' in non-result contexts stays clean", () => {
  for (const title of [
    "Board holds firm on the manager's future",
    "Prices hold firm despite pressure",
    "Club to hold firm for a new contract",
    "Striker holds firm for more money",
    "Defenders told to hold firm at the back",
    "How to hold firm under pressure",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `false positive: ${title}`);
  }
});
