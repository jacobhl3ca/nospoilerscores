// Reddit image posts in a redlib listing.
//
// Redlib draws an i.redd.it / preview image post as an anchor with the class
// post_media_image, and the anchor's href is the full-size picture. The
// markup around it changes by build:
//   - the mini's Redlib v0.36: <a href="/img/<id>.jpeg" class="post_media_image short">
//     <svg><image href/><desc><img src/></desc></svg></a>, href BEFORE class
//   - perennialte.ch: <a href="/preview/pre/…" class="post_media_image short"><img src></a>
//   - the mini's 9/29 build: an HTML comment between the anchor and the <img>
//   - older builds: <img class="post_media_image" src>
// The bake matched on attribute order and on <img> sitting right after the
// anchor, so every v0.36 image post baked with no picture (Jacob 10/10,
// r/baseball 1x2hgqe). Pure function only; the caller maps the path to
// Reddit's CDN with redlibMediaToReddit.

// The anchor's href, in either attribute order.
const ANCHOR_HREF = /<a\b(?=[^>]*\bclass="post_media_image)[^>]*\bhref="([^"]+)"/i;
// An <img> that carries the class itself, in either attribute order.
const CLASSED_IMG = /<img\b(?=[^>]*\bclass="post_media_image)[^>]*\bsrc="([^"]+)"/i;
// A build that omits the anchor href: the first <image href> or <img src> after it.
const INNER_MEDIA = /post_media_image[\s\S]{0,600}?<(?:image|img)\b[^>]*\b(?:href|src)="([^"]+)"/i;

// The full-size picture path of a redlib image card, relative or on an
// absolute media host, else null (video, GIF, thumbnail-only and text cards
// carry no post_media_image).
export function redlibImagePath(block) {
  if (!block) return null;
  return (block.match(ANCHOR_HREF) || [])[1]
    || (block.match(CLASSED_IMG) || [])[1]
    || (block.match(INNER_MEDIA) || [])[1]
    || null;
}
