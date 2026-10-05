import assert from "node:assert/strict";
import test from "node:test";

import { withoutDeviceLocalPrefs, keepDeviceLocalPrefs } from "../src/lib/devicePrefs.ts";

// A10: single-column view is per device. Jacob 9/22 set it on the PC, it
// synced to the phone, and the phone had no portrait toggle to undo it.

test("the push to the account copy drops single-column and keeps everything else", () => {
  const pushed = withoutDeviceLocalPrefs({ theme: "dark", singleColumn: true, newsSingleColumn: true, favoriteTeams: ["nyy"] });
  assert.deepEqual(pushed, { theme: "dark", favoriteTeams: ["nyy"] });
});

test("a pull keeps this device's single-column choice over an older server blob", () => {
  const merged = { theme: "light" as const, singleColumn: true, newsSingleColumn: true };
  assert.deepEqual(keepDeviceLocalPrefs(merged, { singleColumn: false }), { theme: "light", singleColumn: false });
  assert.deepEqual(keepDeviceLocalPrefs(merged, {}), { theme: "light" });
  assert.deepEqual(keepDeviceLocalPrefs({ theme: "light" as const }, { newsSingleColumn: true }), { theme: "light", newsSingleColumn: true });
});

// Scroll columns (10/5) is a screen choice too: a PC never needs it, a phone may.
test("scroll columns stays on this device: dropped from the push, kept on pull", () => {
  assert.deepEqual(withoutDeviceLocalPrefs({ theme: "dark", scrollColumns: true }), { theme: "dark" });
  const merged = { theme: "light" as const, scrollColumns: false };
  assert.deepEqual(keepDeviceLocalPrefs(merged, { scrollColumns: true }), { theme: "light", scrollColumns: true });
  assert.deepEqual(keepDeviceLocalPrefs(merged, {}), { theme: "light" });
});
