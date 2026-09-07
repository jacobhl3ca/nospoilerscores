import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "outmuscle …" is the physical-dominance member of the outXXX family (beside
// "overpower"/"outgun"/"outduel"): the verb recaps reach for when a side wins the
// bodies-and-battle contest. It names the winner outright ("Liverpool outmuscle
// Everton") yet carries no scoreline for SCORE_RX and matched no existing keyword,
// so a plain result recap written this way leaked. No non-result English word begins
// with "outmuscle", so the whole outmuscle/outmuscled/outmuscling family is masked.
test("an 'outmuscle' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Liverpool outmuscle Everton at Anfield",
    "Chiefs outmuscled the Broncos in the trenches",
    "Spain outmuscling Germany in midfield",
    "City outmuscle United to the loose balls | Match of the Day",
    "Boks outmuscled the All Blacks up front",
    "Arsenal outmuscles Spurs in the North London derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "outmuscle" has no benign non-result sense, but guard against over-hiding the
// adjacent everyday "muscle"/"fight" vocabulary the stem must NOT swallow.
test("ordinary 'muscle' vocabulary is not over-hidden", () => {
  for (const title of [
    "How to build muscle for football season",
    "The best strength and conditioning drills",
    "Muscle injury rules star out of the squad",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
