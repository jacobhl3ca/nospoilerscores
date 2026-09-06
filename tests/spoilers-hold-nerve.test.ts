import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "hold/held their nerve" is the held-composure-to-win idiom football, cricket,
// golf and tennis recaps lead with when a side comes through a tense finish — a
// penalty shootout, a fourth-innings chase, a final-round lead. It names the
// side that came out on top yet carries no hyphenated scoreline for SCORE_RX,
// and the already-covered "hold on"/"held on" family never reached "… nerve",
// so a completed-match title framed this way leaked. The pattern is anchored to
// the fixed "<hold-verb> <possessive> nerve" frame (their/his/her/its).
test("a 'hold their nerve' composure-to-win reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal HOLD THEIR NERVE to win the shootout",
    "England held their nerve on penalties",
    "Djokovic holds his nerve in the fifth set",
    "Nelly Korda holds her nerve down the stretch",
    "The Netherlands holding their nerve from the spot",
    "India held their nerve in the run chase | Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The required "hold-verb + personal possessive + nerve" frame keeps the
// everyday non-result senses of "nerve" visible — "nerves of steel", "a test of
// nerve", "showed real nerve" carry no result — and the word boundary keeps it
// out of "holders".
test("ordinary uses of 'nerve' are not over-hidden", () => {
  for (const title of [
    "Nerves of steel from the young goalkeeper",
    "A real test of nerve for the debutant",
    "He showed real nerve out there",
    "Holders begin their title defence at home",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
