import assert from "node:assert/strict";
import test from "node:test";

import { nativeVideoOwnsKey, routeArrowKey, routeModalKey, sliderOwnsKey, type ArrowContext, type ModalKeyContext } from "../src/lib/modalArrowKeys.ts";

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
// by pulling focus out of the iframe. 10/11: on a video plain ↑/↓ are the
// volume and Shift+↑/↓ page.

const mctx = (over: Partial<ModalKeyContext> = {}): ModalKeyContext => ({
  key: "ArrowDown", shift: false, chord: false, repeat: false, inTextEntry: false,
  onControl: false, canSeek: false, galleryCanStep: false, hasPrev: true, hasNext: true,
  hasHeadline: true, ...over,
});

test("↓/↑ page the post list", () => {
  assert.equal(routeModalKey(mctx({ key: "ArrowDown" })), "page-next");
  assert.equal(routeModalKey(mctx({ key: "ArrowUp" })), "page-prev");
});

test("↓/↑ page a gallery and a text body, the posts with no volume", () => {
  for (const over of [{ galleryCanStep: true }, {}]) {
    assert.equal(routeModalKey(mctx({ key: "ArrowDown", ...over })), "page-next");
    assert.equal(routeModalKey(mctx({ key: "ArrowUp", ...over })), "page-prev");
  }
});

// Jacob 10/11: on a video ↑/↓ are the volume, and paging moves to Shift.
test("↑/↓ on a video are the volume, repeat and all", () => {
  for (const key of ["ArrowUp", "ArrowDown"]) {
    assert.equal(routeModalKey(mctx({ key, canSeek: true })), "volume", key);
    // Holding ↑ ramps the volume, the way holding ← scrubs.
    assert.equal(routeModalKey(mctx({ key, canSeek: true, repeat: true })), "volume", key);
    // No neighbour needed: the volume is not the pager.
    assert.equal(routeModalKey(mctx({ key, canSeek: true, hasPrev: false, hasNext: false })), "volume", key);
    // A focused button does not take the arrows.
    assert.equal(routeModalKey(mctx({ key, canSeek: true, onControl: true })), "volume", key);
  }
});

test("Shift+↑/↓ page on every post type", () => {
  for (const over of [{ canSeek: true }, { galleryCanStep: true }, {}]) {
    assert.equal(routeModalKey(mctx({ key: "ArrowDown", shift: true, ...over })), "page-next");
    assert.equal(routeModalKey(mctx({ key: "ArrowUp", shift: true, ...over })), "page-prev");
  }
  // The ends of the list are left to the browser, and a held chord does not
  // run through ten posts.
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", shift: true, canSeek: true, hasNext: false })), null);
  assert.equal(routeModalKey(mctx({ key: "ArrowUp", shift: true, canSeek: true, hasPrev: false })), null);
  assert.equal(routeModalKey(mctx({ key: "ArrowDown", shift: true, canSeek: true, repeat: true })), null);
  assert.equal(routeModalKey(mctx({ key: "ArrowUp", shift: true, canSeek: true, repeat: true })), null);
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

// Jacob 9/12: "if i click play on video in news i lose ability to use h". A
// click on an ESPN/MLB clip's native controls focuses the <video>, and every
// key that landed on it was treated as text entry. Only the keys the element
// acts on itself stay with it now.
test("a focused native <video> keeps Space and the arrows, and nothing else", () => {
  for (const k of [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) assert.equal(nativeVideoOwnsKey(k), true, k);
  for (const k of [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) assert.equal(nativeVideoOwnsKey(k, false), true, k);
  for (const k of ["h", "H", "Escape", "m", "j", "l", "0", "5", "?", "k", "f"]) assert.equal(nativeVideoOwnsKey(k), false, k);
});

// Jacob 10/11: Shift+arrow stopped paging once the player had focus, because
// the helper ignored Shift and the browser seeked or set the volume instead.
// The seek bar and the volume bar in the modal's own control strip: their
// stopPropagation never kept a press from the modal's handler, so one key did
// two things (↓ on the volume bar lowered it and paged).
test("a focused slider keeps the plain arrows, and never a Shift chord", () => {
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.equal(sliderOwnsKey(k), true, k);
    assert.equal(sliderOwnsKey(k, true), false, `Shift+${k}`);
  }
  for (const k of [" ", "h", "Escape", "m", "j", "l", "5", "?", "k", "f"]) assert.equal(sliderOwnsKey(k), false, k);
});

test("a focused native <video> never owns a Shift chord", () => {
  for (const k of [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) assert.equal(nativeVideoOwnsKey(k, true), false, k);
});
