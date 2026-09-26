import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "reach the next round" / "through to the next round" / "progress to the next
// round" are among the most common knockout headline idioms, and each one reveals
// a result: a side that reaches the next round has won (or drawn its way through).
// The phrase carries no digits and need name no beat/win word, so — unlike the
// already-covered named rounds ("reach the semis", "through to the final") — a bare
// "Chelsea through to the next round" slipped straight through.
test("a 'next round' advancement reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal reach the next round of the FA Cup",
    "Chelsea through to the next round",
    "Spurs progress to the next round",
    "Man City reached the next round",
    "United progress into the next round",
    "Reds reach next round after Anfield thriller",
    "Bayern progress through to the next round",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is kept to the "reach/through to/progress" advancement verbs. The
// bare "into the next round" is deliberately left out: "heading into the next
// round", "going into the next round" are PREVIEW framings that reveal no result.
// Likewise the everyday "the next round of fixtures/matches/games" is a schedule
// reference, and "reach the next round of talks/funding/interviews" is non-sport
// process news. A false positive here would drop a legit item from the worker's
// search results, not merely mask a title, so these all stay visible.
test("previews, schedule references and non-sport rounds are not over-hidden", () => {
  for (const title of [
    "Heading into the next round of fixtures at the weekend",
    "Going into the next round, all eyes on the derby",
    "Look ahead to the next round of Premier League action",
    "Ahead of the next round of matches",
    "What to watch in the next round",
    "Preview: the next round of games",
    "Coach set to reach the next round of interviews",
    "Startup to reach the next round of funding",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
