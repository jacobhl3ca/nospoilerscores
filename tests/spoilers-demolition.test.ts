import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The blowout family already caught the VERB "demolish" (demolish/demolishes/
// demolished/demolishing) but not its NOUN "demolition" — the wording recap
// titles reach for when they skip the verb ("City complete demolition of
// Everton", "a demolition job"). The noun names a lopsided win, carries no digit
// for SCORE_RX, and matched none of the win-family keywords, so it leaked.
test("a bare 'demolition' blowout reveal never reads as a clean title", () => {
  for (const title of [
    "Manchester City complete demolition of Everton | Highlights",
    "A first-half demolition job at the Etihad",
    "Chiefs' demolition of the Broncos in full",
    "Total demolition as the leaders pull clear",
    "Rovers complete demolition, Derby left reeling",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb inflections the family already carried must keep matching, and no
// deliberate carve-out was made for "demolition derby": it is out of scope for
// this sports feed and over-hiding it is the safe side, so an in-scope
// "demolition [of] Derby" (the club) stays caught rather than being excused.
test("the demolish verb forms still match and only in-feed benign wording is untouched", () => {
  for (const title of [
    "Madrid demolish Barca at the Bernabeu",
    "City demolished United after the break",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
  // A clean pre-match line with none of the family's wording stays revealed.
  assert.equal(
    isScoreSpoiler("Everton preview: line-ups and how to watch"),
    false,
    "over-hidden a spoiler-free preview title",
  );
});
