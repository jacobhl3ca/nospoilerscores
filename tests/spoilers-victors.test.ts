import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "victors" (plural) is the bare-noun WINNER reveal recap titles use when they skip the
// "win"/"victory"/"victorious" verbs the same family already catches: it names the side that
// came out on top, carries no digit for SCORE_RX, and matched none of the win-family keywords,
// so a "… victors" recap leaked. Adding the plural noun closes that gap.
test("a bare 'victors' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal run out comfortable victors | Highlights",
    "United emerge as victors on the night",
    "The victors march on to the semis",
    "Both leaders met, and the victors were never in doubt",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Only the PLURAL is added: the singular "victor" is a common given name (Victor Osimhen,
// Viktor) and must stay untouched so a scorer named so is never over-hidden, and the \b anchor
// keeps "victors" clear of longer words that merely contain it.
test("the singular 'victor' name and lookalikes are not over-hidden", () => {
  for (const title of [
    "Victor Osimhen on the scoresheet ahead of kickoff",
    "Viktor Gyokeres profiled before the derby",
    "A test of nerve awaits the eventual victor",
    "Meet the evictors: a housing-crisis explainer",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
