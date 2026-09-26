import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "reign supreme" is the crown framing's other winner idiom, a sibling of the already
// caught "triumph"/"conquer"/"dethrone" and the "crowned champions"/"lift the trophy"
// keywords: a title saying a side "reign supreme" names the dominant victor/champion,
// yet it carries no digits (SCORE_RX misses it) and no beat/win word need appear, so a
// plain "City reign supreme" slipped straight through.
test("a 'reign supreme' champion/dominance reveal never reads as a clean title", () => {
  for (const title of [
    "Man City reign supreme in the Premier League",
    "Real Madrid reigned supreme in Europe",
    "Verstappen reigns supreme at Silverstone",
    "The Chiefs reign supreme once again",
    "Alcaraz reigning supreme on the clay",
    "Rovers reign supreme in the derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to the two-word "reign … supreme" collocation on purpose, so the
// everyday "reigning champions" preview framing — a side that currently HOLDS a title,
// with no result revealed — still passes through untouched. A false positive here would
// drop a legit item from the worker's search results, not merely keep a title masked.
test("bare 'reign'/'reigning champions' (no result) is not over-hidden", () => {
  for (const title of [
    "Reigning champions Chelsea prepare for the new season",
    "The reign of the current title holders continues",
    "A preview of the reigning MVP's season ahead",
    "How long can their reign last?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
