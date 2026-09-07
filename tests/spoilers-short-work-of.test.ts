import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "make short work of" is the direct sibling of "make light/hard work of":
// a side that "makes short work of" an opponent won it comfortably — the phrase
// only ever precedes the beaten side, so it names the winner every time. It carries
// no scoreline for SCORE_RX and, with only "light" and "hard" in the family before,
// a bare "Newcastle make short work of Leeds" recap leaked. The mandatory "work of"
// tail (with a leading make(s)/made/making verb) is what keeps it pinned.
test("a 'make short work of' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Newcastle make short work of Leeds | Premier League Highlights",
    "City made short work of the visitors",
    "Barcelona making short work of Getafe",
    "USA make short work of Panama in the Gold Cup",
    "Real Madrid made short work of it in the Clasico",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory "work of" tail is what keeps it safe: the everyday non-result uses
// of the bare words never read "short work of", so a spoiler-free title survives.
test("ordinary uses of 'short' are not over-hidden", () => {
  for (const title of [
    "How to watch Arsenal vs City tonight",
    "Injury update: Saka a short-term doubt",
    "A short history of the World Cup",
    "The squad is short of fit defenders ahead of kickoff",
    "Preview: can Newcastle cope on short rest?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
