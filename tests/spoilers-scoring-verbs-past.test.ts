import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put N past" already caught the goals-scored idiom ("City put four past United"), but its
// exact synonyms in the same construction — stick/slam/bang/slot/rifle/fire/bury — named no
// token, so "City stick four past United" leaked while "City put four past United" was hidden.
// Every one of these verbs means "score N goals against" here and nothing else, and the tally
// IS the reveal (the comfortable winner with it), so the mask must hold.
test("a <verb> N past goals-scored recap never reads as a clean title", () => {
  for (const title of [
    "Bayern put five past Werder",
    "City stick four past United",
    "Liverpool slam four past Leeds",
    "Arsenal bang three past Palace",
    "Salah slots two past the keeper",
    "Son rifles three past Chelsea",
    "Haaland fires four past Wolves",
    "Kane buries four past Villa",
    "Spurs stuck three past Fulham",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory number between the verb and "past" is what keeps these ubiquitous verbs safe:
// the everyday non-scoring senses ("stick to the plan", "fire on all cylinders", "bang the
// drum") never carry a count in that exact slot, and preview/listing titles that name no result
// stay visible.
test("the scoring-verb idiom does not swallow non-scoring or listing titles", () => {
  for (const title of [
    "Ferrari fire on all cylinders",
    "Arsenal told to stick to the game plan",
    "City bang the drum for VAR reform",
    "He slams the referee after the game",
    "Van Dijk bundles the ball out for a corner",
    "Extended highlights: Arsenal vs Spurs",
    "Match preview: Arsenal host Spurs",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
