// What the post modal's key legend should say, given what's actually on screen.
//
// The legend is a promise: every row it prints has to be a key that does
// something RIGHT NOW. routeModalKey (modalArrowKeys.ts) already decides that,
// and it decides it from a handful of context flags — so the legend is built
// from the same flags, in the same file family, rather than from a hand-kept
// list that drifts the first time a key moves. A text post shows four rows; a
// YouTube clip inside a news column shows eight.
//
// A leaf module for the same reason routeModalKey is one: VideoModal can't be
// loaded by `node --test`, so the rules live here where they can be tested
// against routeModalKey's own behaviour.

// Type-only: this module stays free of a runtime import so it loads under
// `node --test`'s type stripper the same way modalArrowKeys.ts does.
import type { ModalKeyContext } from "./modalArrowKeys";

export type KeyLegendContext = {
  /** A video is up (YouTube or a direct stream), so the playback keys are live. */
  canSeek: boolean;
  /** A multi-picture gallery is up, so ←/→ walk pictures instead of scrubbing. */
  galleryCanStep: boolean;
  /** A previous post exists (the pager is armed backwards). */
  hasPrev: boolean;
  /** A next post exists (the pager is armed forwards). */
  hasNext: boolean;
  /** This post has a blurred headline, so H has something to peek. */
  hasHeadline: boolean;
};

/**
 * One printed line. `keys` are chips shown left-to-right; a chip may be a pair
 * ("←" "→") or a range ("0–9"). `label` is what pressing them does.
 */
export type KeyLegendRow = { id: string; keys: string[]; label: string };

/**
 * The rows, in the order they're printed — playback first (the thing the eye is
 * already on), then paging, then the two housekeeping keys. Never empty: Esc
 * and ? are always live, which is what keeps the panel honest even on a plain
 * text post with no neighbours.
 */
// The pager is often one-armed — the first post in a column has no previous,
// the last has no next — and routeModalKey returns null for the missing side.
// Print only the direction that actually goes somewhere, or the panel promises
// a key that does nothing (which the "never prints a dead key" test catches).
function pagingKeys(ctx: KeyLegendContext, back: string, fwd: string): string[] {
  const keys: string[] = [];
  if (ctx.hasPrev) keys.push(back);
  if (ctx.hasNext) keys.push(fwd);
  return keys;
}

function pagingLabel(ctx: KeyLegendContext): string {
  if (ctx.hasPrev && ctx.hasNext) return "Prev / next post";
  return ctx.hasNext ? "Next post" : "Previous post";
}

export function buildKeyLegend(ctx: KeyLegendContext): KeyLegendRow[] {
  const rows: KeyLegendRow[] = [];
  const hasNeighbour = ctx.hasPrev || ctx.hasNext;

  if (ctx.canSeek) {
    rows.push({ id: "play", keys: ["Space"], label: "Play / pause" });
  }

  // ←/→ go to the CONTENT first — gallery, then video — and only page when the
  // content has no use for them. Same three-way as routeArrowKey, so whichever
  // branch is live is the one we print.
  if (ctx.galleryCanStep) {
    rows.push({ id: "arrows", keys: ["←", "→"], label: "Prev / next picture" });
  } else if (ctx.canSeek) {
    rows.push({ id: "arrows", keys: ["←", "→"], label: "Skip 5s" });
    rows.push({ id: "jl", keys: ["J", "L"], label: "Skip 10s" });
    rows.push({ id: "pct", keys: ["0–9"], label: "Jump ahead" });
    rows.push({ id: "mf", keys: ["M", "F"], label: "Mute / fullscreen" });
  }

  // One paging row, however many keys reach it. On a text post that's all four
  // arrows (←/→ have nothing else to do there, so they page); on a video or a
  // gallery the plain pair is spoken for and Shift+←/→ takes its place beside
  // ↑/↓. Printing the plain pair as its own row would have given a text post
  // two rows both labelled "Next post".
  if (hasNeighbour) {
    const contentOwnsArrows = ctx.galleryCanStep || ctx.canSeek;
    const keys = contentOwnsArrows ? [] : pagingKeys(ctx, "←", "→");
    keys.push(...pagingKeys(ctx, "↑", "↓"));
    if (contentOwnsArrows) keys.push(...pagingKeys(ctx, "⇧←", "⇧→"));
    rows.push({ id: "page", keys, label: pagingLabel(ctx) });
  }

  if (ctx.hasHeadline) {
    rows.push({ id: "peek", keys: ["H"], label: "Peek headline" });
  }

  rows.push({ id: "esc", keys: ["Esc"], label: "Close" });
  rows.push({ id: "help", keys: ["?"], label: "Show / hide these" });
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// The pieces tests/modal-key-legend.test.ts needs to check that the legend
// can't lie: it feeds every chip the panel prints back through routeModalKey
// under the same context and asserts an action comes out. The router isn't
// imported here — only its context type — so this stays a leaf.

/** Keys VideoModal handles itself, above routeModalKey (fullscreen timing). */
export const KEYS_HANDLED_IN_MODAL = ["Esc", "F", "?"] as const;

/**
 * Chips are printed as glyphs; keyboards emit names. "0–9" stands for ten keys
 * that share one branch of the router, so one probe covers the range.
 */
export const CHIP_TO_KEY: Record<string, string> = {
  "←": "ArrowLeft", "→": "ArrowRight", "↑": "ArrowUp", "↓": "ArrowDown",
  "Space": " ", "0–9": "5",
};

/** The legend's context, widened to the one routeModalKey wants. */
export function toModalKeyContext(
  ctx: KeyLegendContext,
  key: string,
  shift = false
): ModalKeyContext {
  return {
    key,
    shift,
    chord: false,
    repeat: false,
    inTextEntry: false,
    onControl: false,
    canSeek: ctx.canSeek,
    galleryCanStep: ctx.galleryCanStep,
    hasPrev: ctx.hasPrev,
    hasNext: ctx.hasNext,
    hasHeadline: ctx.hasHeadline,
  };
}
