import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get the better of" is the match-recap idiom for "X beat Y" without a scoreline:
// "Arsenal get the better of Spurs in the derby", "City got the better of United".
// It names the winning side every time yet carries no digits for SCORE_RX and
// matched no existing keyword, so a highlight title written this way slipped past
// the mask. The mandatory "the better of" tail is what makes it a spoiler and keeps
// the bare word "better" safe.
test("a 'get the better of' win reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal get the better of Spurs in the North London derby",
    "City got the better of United at the Etihad | Premier League Highlights",
    "Djokovic gets the better of Alcaraz in five sets",
    "How the Chiefs got the better of the Bills",
    "Chelsea getting the better of Liverpool at Stamford Bridge",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the "the better of" tail, so the everyday comparative
// and improvement senses of "better" — which appear constantly in ordinary titles
// — must still pass through untouched.
test("ordinary uses of 'better' are not over-hidden", () => {
  for (const title of [
    "The better goals from the weekend",
    "Which team looked better in preseason?",
    "This striker just keeps getting better",
    "5 ways to get better at free kicks",
    "A better look at the new stadium",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
