import assert from "node:assert/strict";
import test from "node:test";
import { ratingTier } from "../src/lib/ratingTier.ts";

test("ratingTier: the four words at the 85 / 70 / 50 lines", () => {
  assert.deepEqual([100, 85, 84, 70, 69, 50, 49, 0].map((r) => ratingTier(r).label),
    ["GREAT", "GREAT", "GOOD", "GOOD", "MEH", "MEH", "SKIP", "SKIP"]);
  assert.equal(ratingTier(88).bg, "bg-green-600");
  assert.equal(ratingTier(41).bg, "bg-red-700");
});
