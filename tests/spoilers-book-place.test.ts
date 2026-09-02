import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "book (a/their) place/spot/berth/passage" is the canonical knockout-qualification
// idiom — it names the side that went through, a pure advancement reveal that carries
// no scoreline for SCORE_RX. The article-carrying forms ("book their place", "book a
// spot") were already caught; headlines just as routinely drop the article ("Canada
// book spot in the final", "Argentina book place at the World Cup"), and those bare
// forms leaked. The article is now optional for place/spot/berth/passage so both
// phrasings mask.
test("an article-less 'book place/spot' advancement reveal never reads as a clean title", () => {
  for (const title of [
    "Canada book spot in the final",
    "Argentina book place at the World Cup",
    "Mexico books berth in the semis",
    "Portugal book passage to the quarters",
    // the article-carrying forms must keep masking too
    "England book their place in the final",
    "USA book a spot in the semis",
    "Brazil booked their passage",
    "Croatia book their ticket to the final",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The advancement match is gated on a place/spot/berth/passage tail behind "book",
// so the ordinary senses stay visible. "ticket" is deliberately NOT article-optional:
// "book tickets for the final" is ticket sales, not a result, and must pass through —
// only the article-required "book their ticket" reads as advancement.
test("ordinary uses of 'book' are not over-hidden", () => {
  for (const title of [
    "Fans can book tickets for the final",
    "How to book ticket for the World Cup final",
    "Smith was booked in the first half",
    "Book your hotel for the tournament",
    "The best book about the World Cup",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
