// Which way a keypress inside the post modal (VideoModal) should go.
//
// Three things in that modal want the arrow keys: a multi-picture gallery
// (walk its pictures), a video (scrub ±5s — YouTube's own arrow keys), and the
// Prev/Next post pager (the ‹ › buttons). Plain arrows go to the CONTENT
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

export type ArrowAction = "gallery" | "clip" | "seek" | "page";

export type ArrowContext = {
  /** Shift was held. */
  shift: boolean;
  /** A video is up (YouTube or a direct stream), so the arrows can scrub it. */
  canSeek: boolean;
  /** A multi-picture gallery has another picture in this direction. */
  galleryCanStep: boolean;
  /** An ESPN clip set is up (Jacob 10/7): ←/→ step its clips, never seek. */
  inClipSet?: boolean;
  /** The clip set has another clip in this direction. */
  clipCanStep?: boolean;
  /** A previous/next post exists in this direction (the pager is armed). */
  hasNeighbour: boolean;
};

/** null = leave the key alone (no preventDefault). */
export function routeArrowKey(ctx: ArrowContext): ArrowAction | null {
  if (ctx.shift) return ctx.hasNeighbour ? "page" : null;
  if (ctx.galleryCanStep) return "gallery";
  // A clip set is a gallery of videos: ←/→ walk the clips like pictures, and
  // J/L keep the seeking. At either end the key does nothing (rather than
  // seek 5 s), so the legend's "Prev / next clip" is the whole story.
  if (ctx.inClipSet) return ctx.clipCanStep ? "clip" : null;
  if (ctx.canSeek) return "seek";
  return ctx.hasNeighbour ? "page" : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The whole modal keyboard, not just ←/→ (Jacob 9/5).
//
// ↓/↑ page posts, ←/→ scrub, Space/k play-pause, H peeks this post's headline.
// The vertical pair is the headline change: ↓/↑ did nothing but scroll the page
// behind the modal, so on a video — where plain ←/→ now seek — the only
// keyboard way to the next post was a chord nobody would guess. ↓/↑ is what a
// feed reader reaches for, and it is the same walk the ‹ › buttons do.
//
// routeArrowKey above still owns the ←/→ decision; this wraps it so one call
// site decides every key, and so the "should this key be handled at all"
// gates (chords, text entry, key repeat) are written once and tested once.

export type ModalKeyContext = {
  /** e.key, with e.code === "Space" normalised to " ". */
  key: string;
  /** Shift was held. */
  shift: boolean;
  /** Cmd, Ctrl or Alt was held — the browser's and the OS's, never ours. */
  chord: boolean;
  /** e.repeat — the key is auto-repeating because it is being held down. */
  repeat: boolean;
  /** Focus is in an INPUT/TEXTAREA/SELECT/contentEditable, or a native <video>. */
  inTextEntry: boolean;
  /** Focus is on a button or link, which owns Space itself. */
  onControl: boolean;
  /** A video is up (YouTube or a direct stream), so the keys can drive it. */
  canSeek: boolean;
  /** A multi-picture gallery has another picture in the ←/→ direction. */
  galleryCanStep: boolean;
  /** An ESPN clip set is up, so ←/→ step clips instead of seeking. */
  inClipSet?: boolean;
  /** The clip set has another clip in the ←/→ direction. */
  clipCanStep?: boolean;
  /** A previous post exists (the pager is armed backwards). */
  hasPrev: boolean;
  /** A next post exists (the pager is armed forwards). */
  hasNext: boolean;
  /** This post has a headline that H can blur or show. */
  hasHeadline: boolean;
};

export type ModalKeyAction =
  | "gallery"
  | "clip"
  | "seek"
  | "page-prev"
  | "page-next"
  | "toggle-play"
  | "peek-headline"
  | "mute"
  | "seek-10"
  | "jump-pct"
  | "toggle-keys";

/**
 * The keys a focused native <video controls> acts on by itself: Space toggles
 * it, the arrows seek it (and, in some browsers, set its volume). Only these
 * count as "text entry" when the key lands on the video, so routing them again
 * would double-act. Every other modal key (H, Esc, m, j/l, 0-9, ?) still
 * reaches the modal. Before 9/23 ANY key on a focused video was dropped, so
 * one click on a news clip's player silenced H until the modal closed
 * (Jacob 9/12: "if i click play on video in news i lose ability to use h").
 */
export function nativeVideoOwnsKey(key: string): boolean {
  return key === " " || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

/** null = leave the key alone (no preventDefault). */
export function routeModalKey(ctx: ModalKeyContext): ModalKeyAction | null {
  // Cmd/Ctrl/Alt belong to the browser and the window manager: Cmd+← is Back,
  // Ctrl+←/→/↑/↓ switch macOS desktops before the page is even told, Alt+← is
  // Back on Windows. The 9/4 reasoning for ←/→, now for every key here.
  if (ctx.chord) return null;
  // Typing is sacred. A native <video controls> counts as text entry only for
  // the keys it acts on itself (nativeVideoOwnsKey): the caller decides that.
  if (ctx.inTextEntry) return null;

  const { key } = ctx;

  // "?" shows or hides the key legend in the modal's bottom-right corner
  // (ModalKeyHints). Deliberately not gated on ctx.shift: "?" is Shift+/ on a
  // US layout but Shift+ß on a German one and its own key elsewhere, and every
  // layout reports e.key === "?" regardless — so the glyph is the test, not the
  // chord that produced it. Not gated on onControl either: unlike Space, "?"
  // does nothing to a focused button, so it stays available while Tabbing.
  // This is the one key that works when nothing else on the list does, which is
  // why it's checked before the content keys rather than after them.
  if (key === "?") {
    if (ctx.repeat) return null; // holding it must not strobe the panel
    return "toggle-keys";
  }

  if (key === "ArrowLeft" || key === "ArrowRight") {
    // Unchanged from 9/4, repeat included: holding ← to scrub a clip is the
    // point, and holding it on an image post has always walked the list.
    const dir = key === "ArrowLeft" ? -1 : 1;
    const action = routeArrowKey({
      shift: ctx.shift,
      canSeek: ctx.canSeek,
      galleryCanStep: ctx.galleryCanStep,
      inClipSet: ctx.inClipSet,
      clipCanStep: ctx.clipCanStep,
      hasNeighbour: dir < 0 ? ctx.hasPrev : ctx.hasNext,
    });
    if (action === "page") return dir < 0 ? "page-prev" : "page-next";
    return action;
  }

  if (key === "ArrowDown" || key === "ArrowUp") {
    // ONE rule for every post type — video, image, gallery, text. A long Reddit
    // body therefore scrolls by wheel / PageUp / PageDown, never by ↑/↓; the
    // rejected alternative ("scroll first, page once you're at the bottom") is
    // surprising to use and fiddly to detect. With no neighbour we return null
    // and DON'T preventDefault, so the key stays the browser's.
    if (ctx.repeat) return null; // holding ↓ must not run through ten posts
    return key === "ArrowDown"
      ? (ctx.hasNext ? "page-next" : null)
      : (ctx.hasPrev ? "page-prev" : null);
  }

  // Shift+N / Shift+P — YouTube's own playlist keys, a silent alias of ↓/↑ for
  // anyone who already has them in their fingers. Plain n/p stay free.
  if (ctx.shift && (key === "N" || key === "n")) {
    if (ctx.repeat) return null;
    return ctx.hasNext ? "page-next" : null;
  }
  if (ctx.shift && (key === "P" || key === "p")) {
    if (ctx.repeat) return null;
    return ctx.hasPrev ? "page-prev" : null;
  }

  // Space (or k, YouTube's own key). onControl keeps Space activating a focused
  // button or link, which is what Space is FOR on those.
  if (key === " " || key === "Spacebar" || key === "k" || key === "K") {
    if (ctx.repeat || ctx.onControl) return null;
    return ctx.canSeek ? "toggle-play" : null;
  }

  // H flips THIS post's headline to the opposite of the Headlines chip, and H
  // again hands it back to the chip (headlineOverride in VideoModal — per
  // post, never written to prefs). So H works with the chip on or off
  // (Jacob 10/7). Repeat would strobe it.
  if (key === "h" || key === "H") {
    if (ctx.repeat) return null;
    return ctx.hasHeadline ? "peek-headline" : null;
  }

  // The YouTube keys we take back. With focus pulled out of the iframe (so ↓/↑,
  // Esc and f reach us at all — see the focus-recovery effect in VideoModal),
  // YouTube's own shortcuts stop working in native-controls mode, so the ones
  // worth having are re-served through the player API the modal already drives.
  if (key === "m" || key === "M") {
    if (ctx.repeat) return null;
    return ctx.canSeek ? "mute" : null;
  }
  if (key === "j" || key === "J" || key === "l" || key === "L") {
    // ∓10s, YouTube's own step. Repeat allowed, like ←/→: holding it scrubs.
    return ctx.canSeek ? "seek-10" : null;
  }
  if (key.length === 1 && key >= "0" && key <= "9") {
    if (ctx.repeat) return null;
    return ctx.canSeek ? "jump-pct" : null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The gates every page-level key handler shares (the post modal above, the
// News list below), written once.

/** Cmd, Ctrl or Alt held: the browser's and the OS's chord, never ours. */
export function isChord(e: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): boolean {
  return !!(e.metaKey || e.ctrlKey || e.altKey);
}

/** Focus is somewhere a key types: INPUT, TEXTAREA, SELECT or contentEditable. */
export function isTypingTarget(t: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!t.isContentEditable;
}

// ─────────────────────────────────────────────────────────────────────────────
// The News list's own keys (Jacob 10/7), live only while the News view is up
// and nothing sits over it: H flips the Headlines chip, M the Media chip, E
// Hide seen, and ? opens or closes the Keys card. Each is the same tap its
// chip takes, so the chip's aria-pressed is the read-back.

export type NewsListKeyAction = "headlines" | "media" | "hide-seen" | "keys";

export type NewsListKeyContext = {
  /** e.key. */
  key: string;
  /** Cmd, Ctrl or Alt was held (isChord). */
  chord: boolean;
  /** e.repeat. */
  repeat: boolean;
  /** Focus is in a text field (isTypingTarget). */
  inTextEntry: boolean;
  /** The News view is on screen and no modal, panel or popover is open. */
  active: boolean;
};

/** null = leave the key alone (no preventDefault). */
export function routeNewsListKey(ctx: NewsListKeyContext): NewsListKeyAction | null {
  if (!ctx.active || ctx.chord || ctx.inTextEntry || ctx.repeat) return null;
  switch (ctx.key) {
    case "h": case "H": return "headlines";
    case "m": case "M": return "media";
    case "e": case "E": return "hide-seen";
    case "?": return "keys";
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// H in the post modal (Jacob 10/7): a true two-way toggle whatever the
// Headlines chip says. null = the headline follows the chip; "show" / "hide"
// = this post's override. H from null goes to the opposite of the chip (so
// the first press always changes what is on screen), and H again hands the
// headline back to the chip.

export type HeadlineOverride = "show" | "hide" | null;

export function nextHeadlineOverride(current: HeadlineOverride, chipOn: boolean): HeadlineOverride {
  if (current !== null) return null;
  return chipOn ? "hide" : "show";
}
