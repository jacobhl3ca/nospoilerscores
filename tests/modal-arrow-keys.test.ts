import assert from "node:assert/strict";
import test from "node:test";

import { routeArrowKey, type ArrowContext } from "../src/lib/modalArrowKeys.ts";

// ←/→ inside the post modal (Jacob 9/4): plain arrows belong to the content —
// a video scrubs, a gallery walks its pictures — and Shift+←/→ is the pager.
// Before this, a news video paged on plain arrows and could not seek by
// keyboard at all.

const ctx = (over: Partial<ArrowContext> = {}): ArrowContext => ({
  shift: false, canSeek: false, galleryCanStep: false, hasNeighbour: true, ...over,
});

test("a news video: plain arrows seek, Shift pages", () => {
  assert.equal(routeArrowKey(ctx({ canSeek: true })), "seek");
  assert.equal(routeArrowKey(ctx({ canSeek: true, shift: true })), "page");
});

test("image and text posts still page on plain arrows", () => {
  assert.equal(routeArrowKey(ctx()), "page");
  assert.equal(routeArrowKey(ctx({ shift: true })), "page");
});

test("a gallery walks its pictures first, then runs off the end onto the next post", () => {
  assert.equal(routeArrowKey(ctx({ galleryCanStep: true })), "gallery");
  assert.equal(routeArrowKey(ctx({ galleryCanStep: false })), "page");
});

test("Shift skips the rest of a gallery and goes straight to the next post", () => {
  assert.equal(routeArrowKey(ctx({ galleryCanStep: true, shift: true })), "page");
});

test("with no neighbouring post the arrows fall back to the content, or do nothing", () => {
  assert.equal(routeArrowKey(ctx({ hasNeighbour: false, canSeek: true })), "seek");
  assert.equal(routeArrowKey(ctx({ hasNeighbour: false, canSeek: true, shift: true })), null);
  assert.equal(routeArrowKey(ctx({ hasNeighbour: false })), null);
  assert.equal(routeArrowKey(ctx({ hasNeighbour: false, galleryCanStep: true })), "gallery");
});

test("a video never traps the keyboard: Shift always leads out when a neighbour exists", () => {
  for (const galleryCanStep of [false, true]) {
    assert.equal(routeArrowKey(ctx({ canSeek: true, galleryCanStep, shift: true })), "page");
  }
});
