import assert from "node:assert/strict";
import test from "node:test";

import { createJiti } from "jiti";
import { accountPrefsBase } from "../src/lib/prefsMerge.ts";

// "Playoff race tags" (hidePlayoffRaceTags) must survive the signed-in prefs
// pull: HomeContent's mergeRemotePreferences starts from accountPrefsBase,
// then savePreferences pushes the pref to the store the cards read.

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
});

// preferences.ts imports its siblings without extensions; load both through
// jiti so they share one copy of the playoffRacePrefs store.
const jiti = createJiti(import.meta.url);
const { defaultPreferences, savePreferences, loadPreferences } =
  await jiti.import<typeof import("../src/lib/preferences.ts")>("../src/lib/preferences.ts");
const { playoffRaceTagsOn } =
  await jiti.import<typeof import("../src/lib/playoffRacePrefs.ts")>("../src/lib/playoffRacePrefs.ts");

// The account copy travels as JSON, so an unset pref is simply missing.
const fromAccount = (remote: object) => JSON.parse(JSON.stringify(remote));

test("default: tags on", () => {
  assert.equal(defaultPreferences().hidePlayoffRaceTags, undefined);
  savePreferences(defaultPreferences());
  assert.equal(playoffRaceTagsOn(), true);
});

test("tags off on the account copy: off after the pull, and after reload", () => {
  const merged = accountPrefsBase(defaultPreferences(), fromAccount({ hidePlayoffRaceTags: true }));
  savePreferences(merged);
  assert.equal(playoffRaceTagsOn(), false);
  savePreferences(defaultPreferences());
  assert.equal(playoffRaceTagsOn(), true);
  store.set("nss-preferences", JSON.stringify(merged));
  loadPreferences();
  assert.equal(playoffRaceTagsOn(), false);
});

test("tags back on on the account copy: on after the pull", () => {
  savePreferences({ ...defaultPreferences(), hidePlayoffRaceTags: true });
  assert.equal(playoffRaceTagsOn(), false);
  const merged = accountPrefsBase(defaultPreferences(), fromAccount({ hidePlayoffRaceTags: undefined }));
  savePreferences(merged);
  assert.equal(playoffRaceTagsOn(), true);
});
