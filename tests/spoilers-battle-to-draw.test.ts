import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The fight-for-the-point framing of a stalemate. "battle/fight/grind/play TO a draw" names
// a drawn result just as plainly as the "held to a draw"/"play out a draw"/"settle for a draw"
// idioms beside it, yet the bare form carries no hyphenated scoreline for SCORE_RX and matched
// none of those existing draw idioms (each needs its own exact verb — "battle/fight/grind/play
// TO a draw" is not one of them), so a score-less recap leaked the result.
test("a 'battle/fight/grind/play to a draw' stalemate reveal never reads as a clean title", () => {
  for (const title of [
    "Everton battle to a draw at Goodison",
    "Spurs and Arsenal play to a draw",
    "the sides fought to a goalless draw",
    "City grind to a draw at the Etihad",
    "Chelsea battled to a hard-fought draw",
    "Villa and Wolves play to a scoreless draw",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern anchors the battle-verb directly before "to a(n) … draw", so everyday non-result
// uses of the same verbs — and the bracket/lottery sense of "draw" — never fire.
test("ordinary uses of the battle-verbs and of 'draw' are not over-hidden", () => {
  for (const title of [
    "Fans battle to get final tickets",
    "United fight to the finish for a top-four spot",
    "Draw your own conclusions from the display",
    "The draw for the next round is set",
    "Artists draw to raise funds for charity",
    "A grind to the line in the marathon",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
