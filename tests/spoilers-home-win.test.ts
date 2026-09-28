import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "coast/stroll/saunter/waltz/gallop home" is the "walked it home" branch of the
// comfortable-win family beside cruise/canter/romp home. Each names the winning side
// and frames an easy result, yet carries no scoreline for SCORE_RX and — unlike its
// standalone-verb siblings cruise/canter/romp — matched no existing keyword (coast/
// stroll/waltz previously sat only in the "X past Y" cluster, saunter/gallop nowhere),
// so an easy win told this way leaked through as a clean title.
test("a '<verb> home' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Man City coast home",
    "City coasted home in the derby",
    "Real Madrid stroll home",
    "United strolled home",
    "Bayern waltz home",
    "Chelsea saunter home",
    "Frankel gallops home at Ascot",
    "Arsenal coasting home",
    "City waltzed home in style",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the trailing destination adverb "home", so the common bare
// verbs cannot fire alone, and a negative lookahead splits that "home" from the
// "home <noun>" collocations. The everyday, result-free uses below must stay visible.
test("ordinary '<verb>' and 'home <noun>' phrases are not over-hidden", () => {
  for (const title of [
    "West Coast home game preview",
    "Coast home opener sells out",
    "Seahawks announce West Coast home fixtures",
    "Coast home crowd expected to be loud",
    "Coast home side name unchanged",
    "West Coast home debut for the rookie",
    "Gulf Coast home prices climb",
    "Measures to ease home ownership costs",
    "A stroll home from the pub: fan diary",
    "Waltz workshop comes to town",
    "Gallop through the fixtures: our guide",
    "Sunday stroll: how to enjoy matchday",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
