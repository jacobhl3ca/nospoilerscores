import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { redlibImagePath, redlibThumbPath } from "../scripts/lib/redlib-image.mjs";

// Real cards from the mini's redlib r/baseball listing, 2026-10-04
// (link-thumb-card.html: 2026-10-06).
const fixture = (name) => readFileSync(new URL(`./fixtures/redlib/${name}`, import.meta.url), "utf8");

test("sized image card (<svg><image>) → the anchor href", () => {
  assert.equal(redlibImagePath(fixture("image-card.html")), "/img/ty11js32zeth1.jpeg");
});

test("unsized image card (comment + bare <img>) → the picture", () => {
  const card = `<a href="/img/abc123.png" class="post_media_image short" >
    <!-- i.redd.it images speical case -->
    <img width="100%" height="100%" loading="lazy" alt="Post image" src="/img/abc123.png"/>
  </a>`;
  assert.equal(redlibImagePath(card), "/img/abc123.png");
});

test("class before href → the href", () => {
  assert.equal(
    redlibImagePath('<a class="post_media_image" href="/preview/pre/x1.jpeg?width=640&amp;s=9">'),
    "/preview/pre/x1.jpeg?width=640&amp;s=9",
  );
});

test("class on the <img> (older builds) → the src", () => {
  assert.equal(redlibImagePath('<img class="post_media_image short" src="/img/old.jpg">'), "/img/old.jpg");
});

test("anchor with no href → the <svg><image> href inside it", () => {
  const card = `<a class="post_media_image short">
    <svg width="10px" height="20px" xmlns="http://www.w3.org/2000/svg">
      <image width="100%" height="100%" href="/img/tall.jpeg"/>
    </svg></a>`;
  assert.equal(redlibImagePath(card), "/img/tall.jpeg");
});

test("GIF and v.redd.it cards → null", () => {
  assert.equal(redlibImagePath(fixture("gif-card.html")), null);
  assert.equal(redlibImagePath(fixture("video-card.html")), null);
});

test("empty input and a link-post thumbnail → null", () => {
  assert.equal(redlibImagePath(""), null);
  assert.equal(redlibImagePath('<a class="post_thumbnail" href="https://example.com/a"><img src="/thumb/x.jpg"></a>'), null);
});

test("link card with a sized <svg> thumbnail → the thumbnail path", () => {
  assert.equal(
    redlibThumbPath(fixture("link-thumb-card.html")),
    "/preview/external-pre/AMgIR0hav9sGwHcGQ8EslngHSPkXVwbh5K4WzPT5M3w.jpeg?width=140&#38;height=78&#38;auto=webp&#38;s=ebe3d54b8e23c0dd6209cceab44ceb7485ec2095",
  );
});

test("link card with a bare <img> thumbnail → the src", () => {
  assert.equal(
    redlibThumbPath('<a class="post_thumbnail" href="https://example.com/a"><div><img src="/preview/external-pre/t.jpeg"></div></a>'),
    "/preview/external-pre/t.jpeg",
  );
});

test("no_thumbnail link card and empty input → null", () => {
  assert.equal(
    redlibThumbPath('<a class="post_thumbnail no_thumbnail" href="https://example.com/a"><svg viewBox="0 0 24 24"><path d="M0 0"/></svg><span>example.com</span></a>'),
    null,
  );
  assert.equal(redlibThumbPath(""), null);
});
