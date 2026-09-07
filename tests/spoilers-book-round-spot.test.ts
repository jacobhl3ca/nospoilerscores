import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The round-qualified sibling of "book (a/their) place/spot/berth/passage": the same
// knockout-advancement reveal, but with the ROUND named between the verb and the noun
// ("books quarter-final spot", "book final spot", "book last-16 place") instead of the
// round trailing in an "in the …" phrase. The base clause only accepts the place-noun
// directly after "book(s/ed)" (optionally an article/possessive), so a round adjective
// wedged in front of it slipped through — a pure "who went through" leak in exactly the
// win-or-go-home titles this app most needs to hide.
test("a round-qualified 'book <round> spot/place' advancement reveal never reads as a clean title", () => {
  for (const title of [
    "Djokovic books quarter-final spot",
    "Alcaraz books semi-final berth",
    "England book final spot",
    "Spain book last-16 place",
    "Nadal books last-four spot",
    "Italy book play-off spot",
    "Chelsea book quarter-final place",
    // article/possessive still allowed in front of the round
    "United book their quarter-final spot",
    "Gauff books her semi-final spot",
    "Canada book a final berth",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The round name must sit IMMEDIATELY before place/spot/berth/passage, so the ordinary
// senses stay visible: "book tickets for the final" has no round-then-place structure,
// and "books final roster spot" breaks the adjacency with "roster" in between. "ticket"
// is deliberately left out of this branch.
test("round-adjacent 'book' non-results are not over-hidden", () => {
  for (const title of [
    "Book tickets for the final now",
    "Team books final roster spot for veteran",
    "The quarter-final spot is up for grabs",
    "Grand final preview: how to watch",
    "Book your seats for the semis",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
