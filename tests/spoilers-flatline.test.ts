import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// To "flatline" an opponent is combat-sports slang for knocking them out cold —
// the most emphatic finish there is. The phrase names both the winner and a
// knockout finish outright, yet it carries no digits for SCORE_RX and matched
// none of the already-covered method-of-victory verbs (TKO / KO / stops /
// starch / submission / decision), so a plain "… flatlines …" recap leaked it.
test("a 'flatline' knockout reveal never reads as a clean title", () => {
  for (const title of [
    "Makhachev flatlines his opponent in round 2",
    "Brutal flatline finish at UFC 300",
    "He got FLATLINED with one punch | Full Fight",
    "Ngannou flat-lines Gane",
    "The flatlining left hook that ended the night",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Pinned to the "flat" + "lin…" stem so ordinary "flat…" wording never fires:
// "flat back four", "a flat first half", "flatly", "flatten" all pass through,
// and unrelated "…line" words ("baseline", "sideline", "online") are untouched.
test("ordinary 'flat'/'line' wording is not over-hidden", () => {
  for (const title of [
    "A flat back four to watch this weekend — match preview",
    "A flat first half from both sides ahead of kickoff",
    "He turned the corner and flatly refused to comment",
    "Baseline-to-baseline rallies to watch for",
    "Watch the game online tonight",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
