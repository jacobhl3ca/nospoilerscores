import assert from "node:assert/strict";
import test from "node:test";

import { clearCardField, globalPostFilterPatch, postFilterOf, postFilterPatch, type PostFilter } from "../src/lib/postFilter.ts";

// News Posts switch (Jacob 10/9): All / No text / Videos over the two
// booleans videosOnly + textPosts.

test("postFilterPatch → postFilterOf round-trips all 3 values", () => {
  for (const f of ["all", "notext", "videos"] as PostFilter[]) {
    const p = postFilterPatch(f);
    assert.equal(postFilterOf(p.videosOnly, p.textPosts), f);
  }
});

test("Videos leaves textPosts as is", () => {
  assert.deepEqual(postFilterPatch("videos"), { videosOnly: true });
  assert.equal(postFilterOf(true, false), "videos");
  assert.equal(postFilterOf(true, true), "videos");
  assert.deepEqual(globalPostFilterPatch("videos"), { newsVideosOnly: true });
});

test("All and No text set both booleans", () => {
  assert.deepEqual(postFilterPatch("all"), { videosOnly: false, textPosts: true });
  assert.deepEqual(postFilterPatch("notext"), { videosOnly: false, textPosts: false });
  assert.deepEqual(globalPostFilterPatch("notext"), { newsVideosOnly: false, showTextPosts: false });
  assert.equal(postFilterOf(undefined, undefined), "notext");
  assert.equal(postFilterOf(false, true), "all");
});

test("clearCardField deletes only the named fields and drops empty entries", () => {
  const before = {
    a: { revealMedia: false, revealTitles: true },
    b: { revealMedia: true },
    c: { videosOnly: true, textPosts: false },
  };
  const after = clearCardField(before, ["revealMedia"]);
  assert.deepEqual(after, { a: { revealTitles: true }, c: { videosOnly: true, textPosts: false } });
  assert.deepEqual(clearCardField(after, ["videosOnly", "textPosts"]), { a: { revealTitles: true } });
  // The input is not changed.
  assert.deepEqual(before.b, { revealMedia: true });
  assert.deepEqual(clearCardField(undefined, ["revealMedia"]), {});
});
