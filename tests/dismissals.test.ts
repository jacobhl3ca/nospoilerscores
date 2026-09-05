import assert from "node:assert/strict";
import test from "node:test";

import { mergeDismissedKeys, KICKOFF_DISMISSALS_CAP } from "../src/lib/dismissals.ts";

// The launch reconcile: local just dismissed UCL, the server still has last
// year's list. Old merge = take the server's → banner comes back. New = union.
test("a dismissal tapped during the account reconcile survives it", () => {
  const local = ["epl-2026-08-15", "ucl-2026-09-08"];
  const remote = ["epl-2026-08-15", "nfl-2025-09-04"];
  assert.deepEqual(mergeDismissedKeys(local, remote), ["epl-2026-08-15", "nfl-2025-09-04", "ucl-2026-09-08"]);
});

test("union is empty-safe and capped to the newest keys", () => {
  assert.equal(mergeDismissedKeys(undefined, undefined), undefined);
  assert.equal(mergeDismissedKeys([], []), undefined);
  assert.deepEqual(mergeDismissedKeys(["a"], undefined), ["a"]);
  const many = Array.from({ length: KICKOFF_DISMISSALS_CAP + 3 }, (_, i) => `k${i}`);
  const merged = mergeDismissedKeys(many.slice(-2), many)!;
  assert.equal(merged.length, KICKOFF_DISMISSALS_CAP);
  assert.equal(merged.at(-1), `k${KICKOFF_DISMISSALS_CAP + 2}`);
});

