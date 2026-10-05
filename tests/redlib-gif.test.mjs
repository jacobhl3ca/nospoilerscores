import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { redlibGifMp4Path } from "../scripts/lib/redlib-gif.mjs";

// Real cards from the mini's redlib r/baseball listing, 2026-10-04.
const fixture = (name) => readFileSync(new URL(`./fixtures/redlib/${name}`, import.meta.url), "utf8");

test("GIF card → the mp4 src, not the png8 poster", () => {
  assert.equal(
    redlibGifMp4Path(fixture("gif-card.html")),
    "/preview/pre/b96c7i43eeth1.gif?format=mp4&#38;s=111a442522ef0ded9852c57e98f657bc91d4c589",
  );
});

test("v.redd.it video card → null", () => {
  assert.equal(redlibGifMp4Path(fixture("video-card.html")), null);
});

test("image card → null", () => {
  assert.equal(redlibGifMp4Path(fixture("image-card.html")), null);
});

test("absolute media host → the full src", () => {
  const src = "https://redlib-media.example.ch/preview/pre/abc123xyz.gif?format=mp4&amp;s=deadbeef";
  assert.equal(redlibGifMp4Path(`<video class="post_media_video short" src="${src}" poster="x" controls>`), src);
});

test("empty input and non-mp4 preview src → null", () => {
  assert.equal(redlibGifMp4Path(""), null);
  assert.equal(redlibGifMp4Path('<video src="/preview/pre/abc.gif?format=png8&amp;s=1">'), null);
});
