import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "restore parity" is the plainest way a soccer/hockey recap says a side scored to
// level the game — "Spurs restore parity", "Canada restored parity in the second".
// It reveals the same score-state leak the equaliser cluster beside it already hides
// (a goal went in and the game is level), yet it carries no scoreline for SCORE_RX and
// contains none of the existing tokens ("equalise"/"leveller"/"draws level"). The
// pattern is pinned to the scoring verb "restore" so it can't fire on the far more
// common preview/analysis uses of bare "parity".
test("a 'restore parity' equaliser reveal never reads as a clean title", () => {
  for (const title of [
    "Spurs restore parity at the Bridge",
    "Canada restored parity in the second period",
    "United restoring parity before the break",
    "Late header restores parity for Arsenal",
    "Barca restore parity in the Clasico",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on "parity" sitting directly behind the scoring verb
// "restore/restores/restored/restoring", so the everyday preview and analysis uses of
// bare "parity" — league competitiveness, pay/wage equality — which reveal no result
// must still pass through untouched.
test("ordinary uses of 'parity' are not over-hidden", () => {
  for (const title of [
    "NFL parity on display this season",
    "The case for salary parity in women's sport",
    "Competitive parity across the sport explained",
    "Pay parity remains the biggest talking point",
    "Why parity makes the playoff race unpredictable",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
