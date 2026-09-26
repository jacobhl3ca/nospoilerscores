import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "close out (the) series" is the playoff series-clinch idiom NBA/NHL/MLB recaps
// lead with: to close out a series is to WIN it and eliminate the other side. It
// carries no scoreline for SCORE_RX and slipped past the sibling sweep/whitewash
// entries because a series win need not be a sweep. Covers close/closes/closed/
// closing and the article/possessive forms, plus the bare "close out series".
test("a 'close out the series' clinch reveal never reads as a clean title", () => {
  for (const title of [
    "Celtics close out the series in Game 5",
    "Panthers closing out the series | NHL Recap",
    "Dodgers closed out series | MLB Highlights",
    "Warriors close out their series with the Kings",
    "Nuggets close out series",
    "Oilers closed out the series in six",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The idiom is anchored to the object "series" — the one sense in which "close
// out" can only mean winning — so the everyday sports-channel senses of "close
// out" that have nothing to do with a result are never over-hidden.
test("ordinary 'close out' vocabulary is not over-hidden", () => {
  for (const title of [
    "How to close out on a shooter | Defense drill",
    "Season close out: top 10 goals of the year",
    "Close out the year with our best saves",
    "Closing out training camp with the rookies",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
