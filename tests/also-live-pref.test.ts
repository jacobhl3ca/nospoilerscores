import assert from "node:assert/strict";
import test from "node:test";

import { createJiti } from "jiti";

// preferences.ts imports its siblings without extensions, which bare node does
// not resolve, so load it through jiti like hide-ranks-pref.test does.
const jiti = createJiti(import.meta.url);
const { alsoLiveShown, defaultPreferences } =
  await jiti.import<typeof import("../src/lib/preferences.ts")>("../src/lib/preferences.ts");

// Jacob 10/17: "Also live" under the board, with a roll-up chevron and a
// "Don't show again" link that Settings can undo.

test("defaults: shown and open", () => {
  const p = defaultPreferences();
  assert.equal(p.alsoLive, undefined);
  assert.equal(p.alsoLiveCollapsed, undefined);
  assert.equal(alsoLiveShown(p), true);
});

test("an old stored blob without the keys reads as shown", () => {
  const old = JSON.parse('{"theme":"dark","firstLeague":"mlb"}');
  assert.equal(alsoLiveShown({ ...defaultPreferences(), ...old }), true);
});

test("Don't show again (false) hides it; true or unset shows it", () => {
  assert.equal(alsoLiveShown({ alsoLive: false }), false);
  assert.equal(alsoLiveShown({ alsoLive: true }), true);
  assert.equal(alsoLiveShown({}), true);
});
