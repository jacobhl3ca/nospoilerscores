import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "a share of the spoils" is the same canonical DRAW-result idiom as the already-keyworded
// "share the spoils" — English soccer/World Cup recap titles reach for it when a match ends
// level: "both sides take a share of the spoils", "a share of the spoils at the Emirates".
// It carries no digit for SCORE_RX, and the existing "share(?:s|d)? the spoils" alternative
// required "share"/"shares"/"shared" to sit directly on "the spoils", so the "share OF the
// spoils" phrasing slipped through both. Broadening that alternative to an optional " of"
// closes the gap without disturbing the verb-first "share the spoils" it already caught.
test("a 'share of the spoils' draw reveal never reads as a clean title", () => {
  for (const title of [
    "Both sides take a share of the spoils at the Emirates | Highlights",
    "A share of the spoils in the Merseyside derby",
    "Arsenal and Chelsea settle for a share of the spoils",
    "The two sides had to be content with a share of the spoils",
    // the verb-first forms the alternative already covered must still fire
    "Spain and Georgia share the spoils",
    "The two sides shared the spoils after a tense affair",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The "of" is optional and still anchored to the literal "the spoils" object, so a lone
// "share"/"of" and everyday non-result "share" senses pass through untouched.
test("ordinary 'share' uses are not over-hidden", () => {
  for (const title of [
    "Manager shares his thoughts ahead of kickoff",
    "Fans share their favourite moments of the season",
    "How to get your share of the ticket allocation",
    "Preview shared before Saturday's fixtures",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
