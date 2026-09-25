import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// Promotion is a season-defining result in the up/down leagues the app covers. The filter already
// catches the verb-first form ("Leeds secure promotion") and "promoted to <division>", but a headline
// that LEADS with the outcome — noun-first, with the result verb after "promotion" — slipped through:
// secure/confirm/assure/guarantee/achieve are not standalone win-verbs, so "Promotion secured"/
// "Promotion confirmed" carried no digit for SCORE_RX and matched no other keyword, and the result
// leaked. This is the exact flip of the existing verb-first branch.
test("a noun-first 'promotion secured/confirmed' result reveal never reads as a clean title", () => {
  for (const title of [
    "Promotion secured for Leeds United | Highlights",
    "Promotion confirmed on the final day",
    "Promotion assured with two games to spare",
    "Sunderland: promotion achieved",
    "Promotion guaranteed as Wrexham win again",
    "Promotion complete for the Cobblers",
    "Promotion sealed at the death",
    "Promotion clinched",
    "Promotion won in style",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb is anchored immediately after "promotion", so promotion PREVIEWS and standings talk —
// where "promotion" is followed by race/hopes/picture/battle rather than a result verb — must stay
// visible, and a boxing/MMA org's "promotion" must not trip either.
test("a promotion preview or non-result 'promotion' mention is not over-hidden", () => {
  for (const title of [
    "Promotion race goes down to the wire",
    "Promotion hopes still alive for Forest",
    "The promotion picture explained",
    "Promotion permutations: what each club needs",
    "Matchroom promotion announces its December card",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
