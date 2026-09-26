import assert from "node:assert/strict";
import test from "node:test";

import { accountPrefsBase, samePrefs } from "../src/lib/prefsMerge.ts";

// Jacob 9/25: news column 3 kept coming back as CFL. The account copy had the
// pick cleared (JSON drops undefined, so the key was simply gone), but the pull
// started from a stale device's blob, kept its CFL, and pushed it back up.

test("a key the account copy omits falls back to the default, not to this device's old value", () => {
  const defaults = { theme: "system", newsThirdLeague: undefined as string | undefined };
  const stale = { theme: "dark", newsThirdLeague: "cfl" };
  const remote = JSON.parse(JSON.stringify({ theme: "dark", newsThirdLeague: undefined }));
  const base = accountPrefsBase<typeof stale>(defaults as typeof stale, remote);
  assert.equal(base.newsThirdLeague, undefined);
  assert.equal(base.theme, "dark");
  assert.notEqual(stale.newsThirdLeague, base.newsThirdLeague);
});

test("a key the account copy holds wins over the default", () => {
  const base = accountPrefsBase({ theme: "system", showNews: false }, { showNews: true });
  assert.deepEqual(base, { theme: "system", showNews: true });
});

test("samePrefs ignores key order and undefined values", () => {
  assert.equal(samePrefs({ a: 1, b: { x: 1, y: [1, 2] } }, { b: { y: [1, 2], x: 1 }, a: 1 }), true);
  assert.equal(samePrefs({ a: 1, b: undefined }, { a: 1 }), true);
  assert.equal(samePrefs({ a: 1, n: "cfl" }, { a: 1 }), false);
  assert.equal(samePrefs({ l: [1, 2] }, { l: [2, 1] }), false);
});
