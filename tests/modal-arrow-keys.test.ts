import assert from "node:assert/strict";
import test from "node:test";

import { routeArrowKey, routeModalKey, type ArrowContext, type ModalKeyContext } from "../src/lib/modalArrowKeys.ts";

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

// ── routeModalKey: the whole modal keyboard (Jacob 9/5) ─────────────────────
// ↓/↑ page posts, ←/→ keep the 9/4 routing, Space/k play-pause, H peeks this
// post's headline, and m / j / l / 0-9 give back the YouTube keys we take away
// by pulling focus out of the iframe.

const mctx = (over: Partial<ModalKeyContext> = {}): ModalKeyContext => ({
  key: "ArrowDown", shift: false, chord: false, repeat: false, inTextEntry: false,
  onControl: false, canSeek: false, galleryCanStep: false, hasPrev: true, hasNext: true,
  hasHeadline: true, ...over,
});

test("↓/↑ page the post list", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowDown" })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "ArrowUp" })), "page-prev");
});

test("↓/↑ page every post type — a video, a gallery and a text body all step", () => {
  for (const over of [{ canSeek: true }, { galleryCanStep: true }, { canSeek: true, galleryCanStep: true }, {}]) {
    assert.equal(routeModalKey(mctx({ key: "ArrowDown", ...over })), "page-next");
    assert.equal(routeModalKey(mctx({ key: "ArrowUp", ...over })), "page-prev");
  }
});

test("↓/↑ at the end of the list are left to the browser", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", hasNext: false })), null);
  assert.equal(routeModalKey(mctx({ key: "ArrowUp", hasPrev: false })), null);
  // ...and the other direction still works from that same post.
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", hasPrev: false })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "ArrowUp", hasNext: false })), "page-prev");
});

test("holding ↓ does not run through ten posts", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", repeat: true })), null);
  assert.equal(routeModalKey(mctx({ key: "ArrowUp", repeat: true })), null);
});

test("←/→ keep the 9/4 routing, repeat and all", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowRight", canSeek: true })), "seek");
  assert.equal(routeModalKey(mctx({ key: "ArrowLeft", canSeek: true })), "seek");
  assert.equal(routeModalKey(mctx({ key: "ArrowRight", canSeek: true, repeat: true })), "seek");
  assert.equal(routeModalKey(mctx({ key: "ArrowRight", galleryCanStep: true })), "gallery");
  assert.equal(routeModalKey(mctx({ key: "ArrowRight" })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "ArrowLeft" })), "page-prev");
  assert.equal(routeModalKey(mctx({ key: "ArrowLeft", hasPrev: false })), null);
});

test("Shift+←/→ stays a working alias of the pager", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowRight", shift: true, canSeek: true })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "ArrowLeft", shift: true, canSeek: true })), "page-prev");
  assert.equal(routeModalKey(mctx({ key: "ArrowRight", shift: true, hasNext: false })), null);
});

test("Shift+N / Shift+P page, plain n / p do nothing", () => {
  assert.equal(routeModalKey(mctx({ key: "N", shift: true })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "P", shift: true })), "page-prev");
  assert.equal(routeModalKey(mctx({ key: "N", shift: true, hasNext: false })), null);
  assert.equal(routeModalKey(mctx({ key: "P", shift: true, hasPrev: false })), null);
  assert.equal(routeModalKey(mctx({ key: "N", shift: true, repeat: true })), null);
  assert.equal(routeModalKey(mctx({ key: "n" })), null);
  assert.equal(routeModalKey(mctx({ key: "p" })), null);
});

test("Space and k toggle play, but only when there is something playing", () => {
  assert.equal(routeModalKey(mctx({ key: " ", canSeek: true })), "toggle-play");
  assert.equal(routeModalKey(mctx({ key: "k", canSeek: true })), "toggle-play");
  assert.equal(routeModalKey(mctx({ key: "K", canSeek: true })), "toggle-play");
  assert.equal(routeModalKey(mctx({ key: " " })), null);          // text/image post
  assert.equal(routeModalKey(mctx({ key: " ", canSeek: true, repeat: true })), null);
});

test("Space still belongs to a focused button or link", () => {
  assert.equal(routeModalKey(mctx({ key: " ", canSeek: true, onControl: true })), null);
  assert.equal(routeModalKey(mctx({ key: "k", canSeek: true, onControl: true })), null);
  // ...but a focused button does not stop you paging or peeking.
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", onControl: true })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "h", onControl: true })), "peek-headline");
});

test("H peeks the headline, and only when there is one", () => {
  assert.equal(routeModalKey(mctx({ key: "h" })), "peek-headline");
  assert.equal(routeModalKey(mctx({ key: "H" })), "peek-headline");
  assert.equal(routeModalKey(mctx({ key: "h", hasHeadline: false })), null);
  assert.equal(routeModalKey(mctx({ key: "h", repeat: true })), null);
});

test("the YouTube keys we take back: m, j/l, 0-9 — video only", () => {
  assert.equal(routeModalKey(mctx({ key: "m", canSeek: true })), "mute");
  assert.equal(routeModalKey(mctx({ key: "j", canSeek: true })), "seek-10");
  assert.equal(routeModalKey(mctx({ key: "l", canSeek: true })), "seek-10");
  assert.equal(routeModalKey(mctx({ key: "L", canSeek: true, repeat: true })), "seek-10");
  assert.equal(routeModalKey(mctx({ key: "0", canSeek: true })), "jump-pct");
  assert.equal(routeModalKey(mctx({ key: "9", canSeek: true })), "jump-pct");
  for (const key of ["m", "j", "l", "0", "5", "9"]) {
    assert.equal(routeModalKey(mctx({ key })), null, `${key} on a text post`);
  }
  assert.equal(routeModalKey(mctx({ key: "m", canSeek: true, repeat: true })), null);
  assert.equal(routeModalKey(mctx({ key: "5", canSeek: true, repeat: true })), null);
});

test("a Cmd/Ctrl/Alt chord is never ours — not one key", () => {
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", " ", "k", "h", "m", "j", "l", "5", "N", "P", "?"]) {
    assert.equal(routeModalKey(mctx({ key, chord: true, shift: true, canSeek: true })), null, key);
  }
});

test("typing is sacred — a focused input, or a native <video>, takes every key", () => {
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", " ", "k", "h", "m", "j", "l", "5", "N", "P", "?"]) {
    assert.equal(routeModalKey(mctx({ key, inTextEntry: true, shift: true, canSeek: true, galleryCanStep: true })), null, key);
  }
});

test("keys we deliberately do not handle stay the browser's", () => {
  // "?" left this list on 9/8 — it now shows/hides the key legend in the
  // modal's corner (see modal-key-legend.test.ts). "/" takes its place here:
  // "?" is Shift+/ on a US layout, and the unshifted key stays the browser's.
  for (const key of ["Enter", "Tab", "PageDown", "PageUp", "Home", "End", "a", "z", "/", "Shift", "f", "Escape"]) {
    assert.equal(routeModalKey(mctx({ key, canSeek: true })), null, key);
  }
});
