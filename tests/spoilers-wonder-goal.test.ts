import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "worldie" / "golazo" / "wonder goal" / "screamer" are the spectacular-goal
// nouns recaps and highlight reels lean on across the soccer-heavy leagues this
// app surfaces. Each reveals a goal was scored — and usually who scored it — the
// same partial-result leak as the sibling goal-event nouns ("own goal",
// "go-ahead goal", "brace"), yet on their own they carried no digit for
// SCORE_RX and matched no existing keyword, so a bare "Saka's screamer" recap
// leaked.
test("a bare spectacular-goal reveal never reads as a clean title", () => {
  for (const title of [
    "Saka scores a screamer against Chelsea",
    "Messi's worldie lights up El Clasico",
    "Golazo from Vinicius",
    "A wonder goal in the Manchester derby",
    "Rodri's wondergoal caps the afternoon",
    "Watch the screamer from the halfway line",
    "Best worldies of the season so far",
    "That wonder-goal you have to see",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "wonder[- ]?goal" is pinned to the "wonder" + "goal" adjacency, so "wonder"
// on its own passes through, and "screaming"/"screams" never reads as the
// "screamer" noun — ordinary non-result wording stays untouched.
test("ordinary 'wonder'/'screaming' wording is not over-hidden", () => {
  for (const title of [
    "No wonder the atmosphere is electric tonight",
    "Screaming fans fill the stands early",
    "A behind-the-scenes look at matchday",
    "Wonder if he starts up front this week",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
