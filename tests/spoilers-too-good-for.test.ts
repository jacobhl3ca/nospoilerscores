import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The verb-less superiority frame. "prove too strong/good/much for" and "have too
// much for" both require a leading verb, but recap titles routinely drop it and
// name the winner in a bare "X too good/strong for Y" — X is the winner and Y the
// beaten side every time. It carries no hyphenated scoreline for SCORE_RX and
// matched no existing keyword before the pattern was added.
test("a verb-less 'too good/strong for' superiority reveal never reads as a clean title", () => {
  for (const title of [
    "Bayern too strong for Dortmund in the derby",
    "Liverpool simply too good for Leeds",
    "City far too good for United | Premier League Highlights",
    "Real Madrid too strong for Girona at the Bernabeu",
    "Alcaraz simply too good for the field",
    "Chelsea too good for Everton at the Bridge",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Only "good" and "strong" get the verb-less treatment — deliberately not "much",
// which stays gated behind a have-verb because bare "too much for" collides with
// everyday non-result uses. The mandatory trailing "for" and the "words"/"comfort"
// lookahead keep the pair clear of the common benign collisions, and "too good to
// miss"/"too good to be true" read "to", not "for", so they never fire.
test("ordinary uses of 'too good/strong for' are not over-hidden", () => {
  for (const title of [
    "A performance too good for words from De Bruyne",
    "That save was simply too good for words",
    "A game too good to miss tonight",
    "This form is too good to be true",
    "Fans pay too much for tickets these days",
    "Too close for comfort at the death",
    "In too good form to ignore right now",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
