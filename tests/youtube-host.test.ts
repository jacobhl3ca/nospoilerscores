import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// GitHub #54 / #56 (NotFoundError: The object can not be found here.): the
// YouTube IFrame API REPLACES the element it is given with its <iframe>. When
// that element was a <div> React rendered, React later called removeChild on
// a node that was no longer there. The fix hands YT a child React never sees.
// This guards the fix from a refactor that puts the old div back.

const src = await readFile(new URL("../src/components/VideoModal.tsx", import.meta.url), "utf8");

test("React never renders the #yt-player node YouTube replaces", () => {
  assert.doesNotMatch(src, /<div[^>]*id=["{]["']?yt-player/);
  assert.match(src, /<div ref=\{ytHostRef\}/);
});

test("the player is built on a node we create, not looked up by id", () => {
  assert.match(src, /document\.createElement\("div"\)/);
  assert.match(src, /new YT\.Player\(mount,/);
  assert.doesNotMatch(src, /new YT\.Player\("yt-player"/);
});
