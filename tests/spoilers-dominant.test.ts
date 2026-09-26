import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The domination family caught the stem+\w* forms (dominate/dominated/
// dominating/domination) but not the adjective "dominant" — its seventh letter
// is n, not t, so "dominat\w*" never reached it. Yet "dominant" is the form
// recap titles lean on most ("Dominant City", "a dominant display"), and in a
// per-game highlight title it names a lopsided winning performance, no digit for
// SCORE_RX and none of the win-family keywords, so it leaked.
test("a bare 'dominant' performance reveal never reads as a clean title", () => {
  for (const title of [
    "Dominant City brush aside Everton | Highlights",
    "A dominant display from Arsenal at the Emirates",
    "Chiefs dominant on the road | Full game highlights",
    "Djokovic dominant as the match wears on",
    "Rovers dominant from the first whistle",
    "The champions were dominantly good tonight",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb/noun inflections the family already carried must keep matching, and
// the widening must not reach inside "predominant(ly)" — the leading \b( on the
// whole pattern anchors every alternative to a word boundary, so a mid-word
// "dominant" cannot match.
test("the dominat verb forms still match and 'predominant(ly)' stays untouched", () => {
  for (const title of [
    "Madrid dominate Barca at the Bernabeu",
    "City dominated United after the break",
    "Total domination as the leaders pull clear",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
  // Non-result wording built on the "predominant" prefix stays revealed.
  assert.equal(
    isScoreSpoiler("A predominantly young squad: the season preview"),
    false,
    "over-hidden a spoiler-free preview title",
  );
});
