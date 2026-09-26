import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "lock up" is the everyday North-American clinching verb — the direct synonym of the
// already-masked "clinch" — yet it was the one such verb no branch caught. A postseason
// standings result ("Bills lock up the top seed", "Padres lock up a wild-card berth",
// "Astros lock up home-field advantage") is a plain outcome reveal that carries no
// scoreline for SCORE_RX, so those titles leaked. The verb is gated on a standings-position
// tail (playoff spot/berth/seed, the division and its AFC/NFC/AL/NL nicknames, a bye, the
// pennant, home-field/ice/court advantage) so the unrelated senses of "lock up" stay
// visible. Byte-identical token in the worker (public/_worker.js), so the client un-mask
// call and the server pre-skip agree.
test("a 'lock up' clinch of a playoff position never reads as a clean title", () => {
  for (const title of [
    "Bills lock up the top seed",
    "Bills lock up a playoff spot",
    "Chiefs lock up the number one seed",
    "Eagles lock up the NFC East division",
    "Dodgers lock up the division",
    "Braves lock up the NL East",
    "Chiefs lock up AFC West",
    "Astros lock up home-field advantage",
    "Yankees lock up home field advantage",
    "Ravens lock up a first-round bye",
    "Twins locked up a wild card spot",
    "Guardians lock up a wild-card berth",
    "Nuggets locking up the top seed",
    "Bucks lock up the 2 seed",
    "Padres lock up a postseason berth",
    "Astros lock up the pennant",
    "Sooners lock up a playoff position",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The standings-position tail is mandatory: bare "lock up" is a common non-result phrase
// (lockdown defense, contract talk, venue logistics), so none of these should be masked
// by this alternative.
test("ordinary uses of 'lock up' stay visible", () => {
  for (const title of [
    "Bills defense locks up the paint late",
    "How to lock up your bike at the game",
    "Coach wants to lock up the young star long term",
    "The team looks to lock up their franchise QB with a new deal",
    "They lock up the arena after the game",
    "Guards lock up their man in the fourth",
    "NFC East division preview and predictions",
    "Wild card weekend schedule announced",
    "Home-field advantage explained",
    "Padres eye a playoff spot down the stretch",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hid: ${title}`);
  }
});
