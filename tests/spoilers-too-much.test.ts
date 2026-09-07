import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "have too much for" is the direct sibling of "prove too strong/good/much for":
// "X have too much for Y" names X the winner and Y the beaten side every time, as
// do the noun variants "too much class/quality/firepower/pace/power/strength for".
// It carries no hyphenated scoreline for SCORE_RX and matched no existing keyword
// before the pattern was added; the leading have/has/had/having verb and the
// mandatory trailing "for" (with a fixed result-margin noun set) are what make it
// a spoiler.
test("a 'have too much for' superiority reveal never reads as a clean title", () => {
  for (const title of [
    "City have too much for United | Premier League Highlights",
    "Spain had too much for Georgia in Tbilisi",
    "Real Madrid have too much for Barcelona in the Clasico",
    "Djokovic has too much for Alcaraz in the final",
    "Chiefs having too much for the Broncos in Denver",
    "Liverpool have too much class for Everton",
    "Brazil had too much quality for Chile",
    "Warriors have too much firepower for the Suns",
    "Mbappe has too much pace for the defence",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern requires a have-family verb before "too much" and a mandatory
// trailing "for", and the optional noun slot is a fixed result-margin set. So the
// everyday non-result "too much for" senses — a benign noun after a have-verb, or
// no have-verb at all (pay/ask/charge, or a bare "too much for") — must still pass
// through untouched.
test("ordinary uses of 'too much for' are not over-hidden", () => {
  for (const title of [
    "Pep says his side have too much respect for United",
    "Do they have too much time for the ball at the back?",
    "They have too much money for their own good",
    "Fans pay too much for tickets these days",
    "Asking too much for a defender to cover all that ground",
    "Is this too much pressure for the young keeper?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
