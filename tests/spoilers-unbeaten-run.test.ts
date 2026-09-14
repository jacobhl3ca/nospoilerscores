import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "unbeaten run ended" is the streak-broken result framing recaps lean on
// constantly — "Arsenal end City's unbeaten run", "Liverpool's unbeaten run is
// over". It reveals a loss (the unbeaten side just lost) yet names neither a
// hyphenated score for SCORE_RX nor any existing keyword, since "unbeaten"/
// "winless"/"perfect" are status words, not results. Two ordered alternatives
// cover both the verb-first form ("end … unbeaten run") and the noun-first form
// ("unbeaten run … ends"), each with a lazily-bounded word gap so a possessive,
// a "10-game" or a "their" can sit between them.
test("an 'unbeaten run ended' streak-broken reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal end City's unbeaten run | Premier League Highlights",
    "Liverpool's unbeaten run is OVER after defeat at Anfield",
    "Napoli snap Inter's winless run",
    "Real Madrid halt Barcelona's perfect record",
    "Chelsea end United's 15-game unbeaten start",
    "Leicester's unbeaten run ended in dramatic fashion",
    "PSG break Marseille's unbeaten streak",
    "Bayern's flawless start snapped by Dortmund",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is deliberately anchored to the ENDING, not the bare status, so
// pure pre-match and standings titles that merely name an unbeaten run — with
// no word saying it ended — stay visible. The record-BREAKING sense of "record"
// ("record run") is excluded too; only the "perfect/unbeaten record" noun is a
// result.
test("a still-standing unbeaten run (no result revealed) is not over-hidden", () => {
  for (const title of [
    "Can Arsenal stay unbeaten this season?",
    "City remain unbeaten after another gritty display",
    "Arsenal's unbeaten run continues",
    "The unbeaten run rolls on for the champions",
    "Perfect start to the season for the new manager",
    "Bolt sets a record run in the 100m preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
