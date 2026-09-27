import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "scrape a draw" / "scrape a point" is the barely-earned sibling of the existing
// "grab|earn|secure|pick up a draw|point|stalemate" family — the everyday recap
// phrasing for hanging on for a share of the points ("Spurs scrape a draw",
// "United scraped a point at Goodison"). Standing alone it carries no digit for
// SCORE_RX and, unlike "scrape past/by/through", fired no other keyword, so a
// "… scrape a draw" title leaked the result. Added by dropping "scrap(e|es|ed|ing)"
// into that draw/point alternation, so it inherits the same "(?:a|an|the) (?:draw|
// point|stalemate)" anchor and cannot fire on "scrape past" (already covered) or on
// non-result "scrape the barrel"-style text.
test("a 'scrape a draw/point' result label never reads as a clean title", () => {
  for (const title of [
    "Spurs scrape a draw",
    "United scrape a point",
    "Rovers scraped a draw at the death",
    "City scrapes a point on the road",
    "Scraping a draw in the derby",
    "Wolves scrape a stalemate",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

test("'scrape'/'draw' in non-result contexts stay clean", () => {
  for (const title of [
    "How to watch: United vs City",
    "Draw made for the third round",
    "The quarter-final draw explained",
    "A lesson in how to defend set pieces",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `false positive: ${title}`);
  }
});
