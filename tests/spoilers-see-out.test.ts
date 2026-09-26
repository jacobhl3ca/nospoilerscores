import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "see out the win/result" is the British recap idiom for holding on to a
// result to the final whistle — a direct sibling of the already-covered
// "hold on"/"held on"/"hang on"/"hung on" family. It names the side that
// came away with the win (or protected a lead) yet carries no hyphenated
// scoreline for SCORE_RX and matched none of those bare hold-on stems, so a
// completed-match title framed this way leaked. The pattern is anchored to a
// mandatory result-noun tail (win/victory/result/points/lead), with one
// optional describing word allowed before it ("a nervy win").
test("a 'see out the win/result' hold-on reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal see out the win at Stamford Bridge",
    "United saw out a nervy win over Everton",
    "Liverpool see out the victory | Premier League Highlights",
    "Spurs saw out the result to move top",
    "Rangers seeing out the points at Ibrox",
    "Chelsea have seen out the lead late on",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory result-noun tail keeps the everyday non-result senses of
// "see out" visible — seeing out a season/contract/year reveals no result,
// and a preview asking whether a side can "see out the game" carries no
// result noun from the set, so it is not over-hidden.
test("ordinary uses of 'see out' are not over-hidden", () => {
  for (const title of [
    "Veteran keeper set to see out the season at the club",
    "Ramos will see out his contract, says manager",
    "How the captain plans to see out his final year",
    "Can Arsenal see out the game a man down? Match preview",
    "Sunset over the harbour: fans see out the summer",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
