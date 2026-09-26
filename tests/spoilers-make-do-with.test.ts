import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "make do with a draw/point/stalemate" is the direct synonym of the already-keyworded
// "settle for a draw/point/stalemate" — the everyday recap framing for a favourite grudgingly
// accepting a dropped-points result: "Chelsea have to make do with a point", "United made do
// with a draw". It carries no digit for SCORE_RX and matched no existing keyword ("make"/"do"
// are far too common alone), so the drawn outcome leaked. Anchoring to the exact
// "make do with <article> (draw|point|stalemate)" object closes the gap.
test("a 'make do with a draw/point' reveal never reads as a clean title", () => {
  for (const title of [
    "Chelsea have to make do with a point at Stamford Bridge | Highlights",
    "United made do with a draw at Old Trafford",
    "Spurs making do with a stalemate in north London",
    "Both sides make do with the draw after a cagey affair",
    "Arsenal makes do with a point against stubborn Everton",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The object is pinned to "a/an/the (draw|point|stalemate)", so everyday "make do" senses that
// reveal no result pass through untouched.
test("ordinary 'make do' uses are not over-hidden", () => {
  for (const title of [
    "United make do with a smaller squad this window",
    "How the club learned to make do without their star striker",
    "We'll make do with what we have, says the manager",
    "Rangers make do with a depleted midfield ahead of kickoff",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
