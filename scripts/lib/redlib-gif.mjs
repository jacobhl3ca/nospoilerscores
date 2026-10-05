// Reddit GIF posts in a redlib listing.
//
// Reddit serves an uploaded GIF two ways: a still first frame
// (preview.redd.it/<id>.gif?format=png8) and a looping mp4 of the whole GIF
// (preview.redd.it/<id>.gif?format=mp4, its own signature). Redlib draws the
// post as <video class="post_media_video" src="…format=mp4…" poster="…png8…">.
// The bake read only the poster, so a GIF post opened as a still image
// (Jacob 10/4, r/baseball 1wx909w). Pure function only; the caller maps the
// path to Reddit's CDN with redlibMediaToReddit.

const GIF_MP4_SRC =
  /<video\b[^>]*?\bsrc="((?:https?:\/\/[^/"]+)?\/preview\/(?:pre|external-pre)\/[^"]*?(?:\?|&|&amp;|&#0*38;)format=mp4\b[^"]*)"/i;

// The <video> src of a redlib GIF card, relative or on an absolute media host,
// else null (v.redd.it HLS cards and image cards have no such src).
export function redlibGifMp4Path(block) {
  if (!block) return null;
  return (block.match(GIF_MP4_SRC) || [])[1] || null;
}
