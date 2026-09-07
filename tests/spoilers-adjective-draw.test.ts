import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A recap headline that just labels the result as an adjective+"draw" noun phrase — "Battling draw at
// Anfield", "A hard-fought draw for United", "Gritty draw in the derby" — reveals the match ended level,
// the same leak as the already-keyworded "held to a … draw"/"settle for a draw" verb idioms. But the bare
// noun phrase carries no digit for SCORE_RX and no "held to a …" verb frame, and "draw" is not a keyword
// on its own, so these had slipped through. The pattern is pinned to manner-of-play adjectives that only
// ever describe a drawn RESULT.
test("an adjective+'draw' result headline never reads as a clean title", () => {
  for (const title of [
    "Battling draw at Anfield | Highlights",
    "A hard-fought draw for United",
    "A hard fought draw at the Emirates",
    "Hard-earned draw for the Toffees",
    "Gritty draw in the Manchester derby",
    "Spirited draw for the visitors",
    "A creditable draw away from home",
    "Dour draw at Goodison Park",
    "A drab goalless afternoon ends in a drab draw",
    "Gutsy draw for the ten men",
    "A point-saving draw deep in stoppage time",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The adjective list deliberately excludes the words a knockout/bracket draw takes ("tough", "kind",
// "favourable", "open", the group-stage/cup "draw"), so a fixture-draw headline and everyday non-result
// senses pass through untouched. Bare "hard"/"tough" never match — only the fixed manner-of-play adjectives do.
test("a fixture/bracket 'draw' and ordinary uses are not over-hidden", () => {
  for (const title of [
    "Champions League group-stage draw in full",
    "The FA Cup fourth-round draw has been made",
    "Arsenal handed a tough draw in the last 16",
    "A kind draw for the holders",
    "United land a favourable draw in Europe",
    "How to draw a football pitch for kids",
    "The luck of the draw explained",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
