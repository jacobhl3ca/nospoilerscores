// Reddit image posts in a redlib listing.
//
// Redlib draws an image post as <a href="<image>" class="post_media_image …">
// and puts one of two things inside it: a bare <img src> when Reddit sent no
// size ("i.redd.it images speical case"), or an <svg><image href> sized to the
// picture. The bake read only the bare <img>, so every picture that came with
// a size baked image-less and showed as a text post (Jacob 10/6, r/baseball
// 1wyze8m + 1wyohvx). The anchor's href is the picture in both shapes, so read
// that first. Pure function only; the caller maps the path to Reddit's CDN
// with redlibMediaToReddit.

// The post_media_image anchor's href, whatever order its attributes come in.
const ANCHOR_HREF = /<a\b(?=[^>]*\bclass="[^"]*\bpost_media_image\b)[^>]*?\bhref="([^"]+)"/i;
// Older builds put the class on the <img> itself.
const IMG_SRC = /<img[^>]*class="post_media_image[^"]*"[^>]*src="([^"]+)"/i;
// Backstop for an anchor with no href: the first <img src> or <svg><image
// href> inside it, past any HTML comment.
const INNER_SRC =
  /post_media_image[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*(?:<img[^>]+\bsrc|<svg\b[\s\S]*?<image[^>]+\bhref)="([^"]+)"/i;

// The picture path of a redlib image card, else null (video, GIF, link and
// text cards carry no post_media_image).
export function redlibImagePath(block) {
  if (!block) return null;
  for (const re of [ANCHOR_HREF, IMG_SRC, INNER_SRC]) {
    const m = block.match(re);
    if (m) return m[1];
  }
  return null;
}

// Link posts get the same <svg> wrapper around their 140px thumbnail, and a
// long signed preview URL pushed the <img> past the 500-char window, so the
// row baked with no tile (r/baseball 1wz5j6d, 10/6). The <image href> comes
// first and carries the same path.
const THUMB_SRC =
  /<a[^>]*class="post_thumbnail[^"]*"[\s\S]{0,500}?<(?:img[^>]*\bsrc|image[^>]*\bhref)="([^"]+)"/i;

// The listing thumbnail of a link card, else null ("no_thumbnail" cards draw
// an icon with no picture).
export function redlibThumbPath(block) {
  if (!block) return null;
  return (block.match(THUMB_SRC) || [])[1] || null;
}
