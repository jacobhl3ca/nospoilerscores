// Which way a ←/→ press inside the post modal (VideoModal) should go.
//
// Three things in that modal want the arrow keys: a multi-picture gallery
// (walk its pictures), a video (scrub ±5s — YouTube's own arrow keys), and the
// Prev/Next post pager (the side chevrons). Plain arrows go to the CONTENT
// first — gallery, then video — and only page when the content has no use for
// them, which is how image and text posts have always paged. Shift+←/→ always
// pages, so a news video keeps both: plain arrows seek, Shift steps posts
// (Jacob 9/4: on a video "it's natural left/right to skip"). Shift is the one
// modifier every platform leaves to the page — Cmd+← is the browser's Back,
// Ctrl+← switches macOS desktops before the page ever sees it, Alt+← is Back
// on Windows — so those chords are not handled at all.
//
// A leaf module on purpose: VideoModal is a component the `node --test` unit
// runner can't load, so the routing lives here where it can be tested (same
// reason pollRank.ts and sessionVisits.ts exist).

export type ArrowAction = "gallery" | "seek" | "page";

export type ArrowContext = {
  /** Shift was held. */
  shift: boolean;
  /** A video is up (YouTube or a direct stream), so the arrows can scrub it. */
  canSeek: boolean;
  /** A multi-picture gallery has another picture in this direction. */
  galleryCanStep: boolean;
  /** A previous/next post exists in this direction (the pager is armed). */
  hasNeighbour: boolean;
};

/** null = leave the key alone (no preventDefault). */
export function routeArrowKey(ctx: ArrowContext): ArrowAction | null {
  if (ctx.shift) return ctx.hasNeighbour ? "page" : null;
  if (ctx.galleryCanStep) return "gallery";
  if (ctx.canSeek) return "seek";
  return ctx.hasNeighbour ? "page" : null;
}
