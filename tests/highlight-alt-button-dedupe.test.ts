import assert from "node:assert/strict";
import test from "node:test";

import { isDuplicateHighlightId } from "../src/lib/highlightDedupe.ts";

// The "official alternate" button (GameHighlights.tsx) must never render
// alongside a 1st button playing the identical clip — two buttons, one video.
// Resolve-time dedup (bake-level and the live re-resolve) covers the common
// paths, but this is the last-line render guard, so it has to hold on its own.

test("same non-null id on both slots is a duplicate", () => {
  assert.equal(isDuplicateHighlightId("abc123", "abc123"), true);
});

test("different ids are not a duplicate", () => {
  assert.equal(isDuplicateHighlightId("abc123", "xyz789"), false);
});

test("either slot missing is never a duplicate", () => {
  assert.equal(isDuplicateHighlightId(null, "abc123"), false);
  assert.equal(isDuplicateHighlightId("abc123", null), false);
  assert.equal(isDuplicateHighlightId(null, null), false);
  assert.equal(isDuplicateHighlightId(undefined, undefined), false);
});
