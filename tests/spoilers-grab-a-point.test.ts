import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "grab/earn/secure/pick up a draw|point|stalemate" is the draw-claim twin of the already-keyworded
// "settle for a draw/point" and "make do with a draw/point" idioms: a football side that "earns a
// point", "grabs a draw" or "picks up a point" has drawn the match — a definitive result. It carries
// no digit for SCORE_RX, and the acquisition verbs (grab/earn/secure/pick up) are not standalone
// win-tokens, so "Newcastle earn a point at Anfield" and "West Ham grab a draw" had leaked. Anchoring
// to the exact "<verb> <article> (draw|point|stalemate)" object closes the gap.
test("a 'grab/earn/secure a draw/point' reveal never reads as a clean title", () => {
  for (const title of [
    "Newcastle earn a point at Anfield | Highlights",
    "West Ham grab a draw at Old Trafford",
    "Wolves secure a point against the champions",
    "Brighton pick up a point on the road",
    "Villa picked up a draw after a cagey affair",
    "Palace grabbed a draw in stoppage time",
    "Fulham earning a point at the Emirates",
    "Both sides settle for the stalemate after Leeds secure a point",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The object is pinned to "a/an/the (draw|point|stalemate)" and the singular "point" (a drawn side
// takes ONE point), so plural-points wins, everyday non-result senses, and tennis single-rally
// phrasings pass through untouched.
test("ordinary 'grab/earn/secure' uses are not over-hidden", () => {
  for (const title of [
    "The manager wants his side to grab a bite before the long trip",
    "How young players earn a living in the lower leagues",
    "Pundits make a point about VAR after the weekend",
    "Rangers look to secure a striker before the window shuts",
    "Preview: can Everton earn a result at the Etihad?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
