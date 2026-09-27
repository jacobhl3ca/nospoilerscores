import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "spare(s/d) … blushes" is the stock British football idiom for a late goal or result that rescued an
// embarrassed side — the same rescued-result reveal as the already-masked "salvage"/"rescue"/"consolation"
// siblings, yet it carries no digits (SCORE_RX misses it) and fired no existing keyword, so a bare
// "spares his blushes" recap leaked. The noun "blushes" is the anchor and has no benign sense in a match
// title, so the verb plus up to two filler words ahead of it also catches the possessive framings.
test("a 'spare blushes' rescue headline never reads as a clean title", () => {
  for (const title of [
    "Kane spares United's blushes",
    "Late goal spares his blushes",
    "Ronaldo spared their blushes",
    "Keeper sparing City's blushes",
    "Sub spares the team's blushes",
    "Spurs spare their blushes with late equaliser",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The anchor is the noun "blushes"; the everyday "spare" senses that never reach it stay visible — a
// "spare a thought" aside, a named "spare goalkeeper", "no spare capacity" — so a bare "spare" is never
// mistaken for a result reveal.
test("an unrelated 'spare' stays visible", () => {
  for (const title of [
    "Spare a thought for the travelling fans",
    "United name spare goalkeeper on the bench",
    "No spare capacity in the fixture schedule",
    "Coach has spare parts on the bench",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hid: ${title}`);
  }
});
