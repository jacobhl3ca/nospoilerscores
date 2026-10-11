import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { redlibImagePath } from "../scripts/lib/redlib-image.mjs";

// Real cards from the mini's redlib (v0.36): r/baseball 2026-10-04 and
// r/golf 2026-10-10. image-card-legacy.html is the perennialte.ch shape.
const fixture = (name) => readFileSync(new URL(`./fixtures/redlib/${name}`, import.meta.url), "utf8");

test("i.redd.it image card (href before class, svg wrapper) → the anchor href", () => {
  assert.equal(redlibImagePath(fixture("image-card.html")), "/img/ty11js32zeth1.jpeg");
});

test("external-preview image card → the /preview/external-pre/ path", () => {
  assert.equal(
    redlibImagePath(fixture("image-card-external.html")),
    "/preview/external-pre/la8DPh9X3ihcAPMVOhH5Gb8cXLGmw9hRGjF7QJb4Kqw.jpeg?auto=webp&#38;s=b46b61c8a566fd61efd9f50c7f24079682eae3c5",
  );
});

test("perennialte shape (<img> directly after the anchor) → that path", () => {
  assert.equal(
    redlibImagePath(fixture("image-card-legacy.html")),
    "/preview/pre/x1y2z3abc4de5.jpeg?width=1080&#38;format=pjpg&#38;auto=webp&#38;s=0123456789abcdef",
  );
});

test("class before href on the anchor → the href", () => {
  assert.equal(redlibImagePath('<a class="post_media_image short" href="/img/abc123.png"><img src="/img/abc123.png"></a>'), "/img/abc123.png");
});

test("<img> that carries the class itself → its src", () => {
  assert.equal(redlibImagePath('<img class="post_media_image" alt="Post image" src="/img/old1.jpeg">'), "/img/old1.jpeg");
  assert.equal(redlibImagePath('<img src="/img/old2.jpeg" class="post_media_image">'), "/img/old2.jpeg");
});

test("anchor with no href → the first <image> or <img> after it", () => {
  assert.equal(
    redlibImagePath('<a class="post_media_image short">\n<!-- i.redd.it images speical case -->\n<img loading="lazy" src="/img/cmt1.jpeg"></a>'),
    "/img/cmt1.jpeg",
  );
  assert.equal(
    redlibImagePath('<a class="post_media_image"><svg width="640px"><image width="100%" href="/img/svg1.jpeg"/></svg></a>'),
    "/img/svg1.jpeg",
  );
});

test("v.redd.it video card and GIF card → null", () => {
  assert.equal(redlibImagePath(fixture("video-card.html")), null);
  assert.equal(redlibImagePath(fixture("gif-card.html")), null);
});

test("empty input and a thumbnail-only block → null", () => {
  assert.equal(redlibImagePath(""), null);
  assert.equal(
    redlibImagePath('<a class="post_thumbnail" href="https://example.com/story"><img loading="lazy" src="/preview/external-pre/t.jpg?width=140"></a>'),
    null,
  );
});
