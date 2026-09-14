import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "swat aside" is the direct sibling of the already-masked "brush aside" — the same
// beat-easily framing in its other everyday verb. In a match title "X swat aside Y"
// means nothing but X beating Y comfortably: it names the side that was dismissed, yet
// it carries no digits for SCORE_RX and slipped past both the brush/cruise/dispatch set
// and the "X past Y" group, so a recap written this way leaked the result before.
test("a 'swat aside' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Man City swat aside Palace | Premier League Highlights",
    "Bayern swatted aside the challengers at the Allianz",
    "Arsenal swatting aside Fulham",
    "Real Madrid swat aside Getafe",
    "Chiefs swat aside the Broncos",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the mandatory two-word "swat …aside" tail, so the bare "swat"
// senses that have nothing to do with a result must still pass through untouched: a fly
// swatted, the SWAT team, and "swat away" (no "aside") all stay clean.
test("bare 'swat' uses without the 'aside' tail are not over-hidden", () => {
  for (const title of [
    "How to swat a fly like a pro",
    "SWAT team storms the field: security review",
    "Keeper swats the ball away | Save of the week",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
