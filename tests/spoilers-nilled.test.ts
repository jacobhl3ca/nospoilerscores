import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "to nil" is the football verb for winning without conceding — a clean-sheet result
// that names both the winning and the losing side ("City nilled United", "United got
// nilled"). It carries no digits when the score is dropped, so SCORE_RX and the
// nil-nil / \d-nil forms elsewhere both miss it, and it slipped past the blowout verb
// set, so a recap written this way leaked the result before.
test("a 'nilled'/'nilling' clean-sheet result reveal never reads as a clean title", () => {
  for (const title of [
    "Man City nilled United at the Etihad | Premier League Highlights",
    "Saints nilled again as the goals dry up",
    "United got nilled at Anfield",
    "Rovers nilling the visitors once more",
    "Celtic nilled Rangers in the derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Only the inflected verb forms are caught, never the bare noun "nil" (zero), which is
// everyday language — a goalless-preview headline, a nil-return fantasy note, and the
// "nil desperandum" motto all stay clean.
test("bare 'nil' noun uses are not over-hidden", () => {
  for (const title of [
    "Can Arsenal keep United to nil this weekend? Preview",
    "Fantasy watch: which strikers are on a nil return?",
    "Nil desperandum: the fans still believe",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
