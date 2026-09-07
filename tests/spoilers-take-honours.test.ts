import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "take/claim the honours" is the winning-side counterpart of the draw idiom "share the
// honours" and the direct sibling of "take the spoils" already keyworded: a side that
// TAKES or CLAIMS the honours won the match. Derby, cup and motorsport recaps lead with
// exactly this — "Rangers take the honours in the Old Firm derby", "Hamilton takes the
// honours at Silverstone" — a plain winner reveal that carries no digits for SCORE_RX and
// matched none of the existing win verbs. The claim/take/took verb immediately before the
// "the honours" object is what makes it a spoiler.
test("a 'take/claim the honours' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Rangers take the honours in the Old Firm derby",
    "Celtic took the honours at Ibrox",
    "United claim the honours in the Manchester derby",
    "Hamilton takes the honours at Silverstone | Race Highlights",
    "Djokovic claims the honours in five sets",
    "Reds taking the honours late on",
    "Boro claimed the honours at the Riverside",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to a claim/take/took verb directly before the "the honours"
// object, so the everyday non-result senses of "honour(s)" — which appear in ordinary
// titles — must still pass through untouched.
test("ordinary uses of 'honour(s)' are not over-hidden", () => {
  for (const title of [
    "Who will do the honours at the coin toss? | Preview",
    "Graduating with honours: the scholar-athlete",
    "New Year honours list recognises grassroots coaches",
    "Guard of honour planned for the retiring captain",
    "The honour of captaining his country for the first time",
    "A match played with great honour and respect | Feature",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
