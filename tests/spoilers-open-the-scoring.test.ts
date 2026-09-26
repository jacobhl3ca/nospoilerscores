import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "open the scoring" is the canonical recap phrase for the first goal / first points of a match —
// "Haaland opens the scoring", "Arsenal opened the scoring inside five minutes", "Rashford opening
// the scoring for United". It reveals the score is no longer level and which side struck first, yet
// it carries no scoreline for SCORE_RX and contains none of the existing tokens (no "goal"/"lead"/
// "winner"). The pattern is pinned to the inflected forms opens/opened/opening so it fires on the
// recap sense but not on the bare infinitive that previews and questions use.
test("an 'open the scoring' first-goal reveal never reads as a clean title", () => {
  for (const title of [
    "Haaland opens the scoring at the Etihad",
    "Arsenal opened the scoring inside five minutes",
    "Rashford opening the scoring for United",
    "Late header opens the scoring at Anfield",
    "Canada opened the scoring in the second period",
    "Bruno Fernandes opened the scoring from the spot",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern matches only the inflected opens/opened/opening, so the bare-infinitive "open the
// scoring" that every preview, prediction and question uses — reached via "will"/"to"/"can", or the
// "who opens the scoring?" question form guarded by a leading (?<!\bwho[- ]) — reveals no result and
// must still pass through untouched.
test("preview and question uses of 'open the scoring' are not over-hidden", () => {
  for (const title of [
    "Who will open the scoring tonight?",
    "Can Haaland open the scoring again?",
    "Everton hoping to open the scoring early",
    "Preview: who opens the scoring?",
    "Predictions: which side will open the scoring",
    "How the new scoring system works",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
