import assert from "node:assert/strict";
import test from "node:test";

import { createJiti } from "jiti";
import type { Preferences } from "../src/lib/preferences.ts";

// preferences.ts imports its siblings without extensions, which bare node does
// not resolve, so load it through jiti like recaps.test does.
const jiti = createJiti(import.meta.url);
const { decodeFavorites, defaultPreferences, encodeFavorites, sharedExtrasPatch, shareExtrasFromPrefs } =
  await jiti.import<typeof import("../src/lib/preferences.ts")>("../src/lib/preferences.ts");

// Jacob 9/30: "hide rankings of teams like #8 phillies". hideRanks rides the
// settings link as hr=1/0, like the other boolean display prefs.

const roundTrip = (p: Preferences) => sharedExtrasPatch(decodeFavorites(encodeFavorites([], [], undefined, undefined, shareExtrasFromPrefs(p))));

test("default is undefined: ranks show", () => {
  assert.equal(defaultPreferences().hideRanks, undefined);
});

test("an unset pref stays out of the link and the patch", () => {
  const params = encodeFavorites([], [], undefined, undefined, shareExtrasFromPrefs(defaultPreferences()));
  assert.equal(params.has("hr"), false);
  assert.equal("hideRanks" in roundTrip(defaultPreferences()), false);
});

test("hidden round-trips as hr=1", () => {
  const p = { ...defaultPreferences(), hideRanks: true };
  assert.equal(encodeFavorites([], [], undefined, undefined, shareExtrasFromPrefs(p)).get("hr"), "1");
  assert.equal(roundTrip(p).hideRanks, true);
});

test("shown again round-trips as hr=0", () => {
  const p = { ...defaultPreferences(), hideRanks: false };
  assert.equal(encodeFavorites([], [], undefined, undefined, shareExtrasFromPrefs(p)).get("hr"), "0");
  assert.equal(roundTrip(p).hideRanks, false);
});

test("a junk hr value is ignored", () => {
  assert.equal(decodeFavorites(new URLSearchParams("hr=yes")).hideRanks, undefined);
});
