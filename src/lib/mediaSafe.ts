// Media and fullscreen calls that can fail on state we do not control.
//
// WebKit throws "InvalidStateError: The object is in an invalid state."
// SYNCHRONOUSLY from webkitEnterFullscreen() on a <video> that has no metadata
// yet (iPhone: tap fullscreen while an HLS clip is still loading), and from
// webkitRequestFullscreen() in a frame that may not go fullscreen. Older Safari
// returns undefined from requestFullscreen(), so a bare `.catch` on it throws
// a TypeError instead. Sentry got the first one (GitHub #245).
//
// safeMediaCall() runs the call, absorbs a synchronous throw AND a rejected
// promise, and reports failure through onFail so the caller can fall back.
//
// Each absorbed failure also leaves a "media" breadcrumb. The #245 event had
// no HideScore frame (its one frame was line 1756 of the page URL, and our
// static HTML is a single line), so its source is not known. If a later event
// does come from one of our media calls, its breadcrumbs name the call.

import { breadcrumb, describeThrown } from "./breadcrumb.ts";

function noteMediaFailure(label: string, e: unknown): void {
  breadcrumb({ category: "media", level: "warning", message: `${label} failed: ${describeThrown(e)}` });
}

export function safeMediaCall(fn: () => unknown, onFail?: (e: unknown) => void, label = "media call"): boolean {
  let result: unknown;
  try {
    result = fn();
  } catch (e) {
    noteMediaFailure(label, e);
    onFail?.(e);
    return false;
  }
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    (result as Promise<unknown>).then(undefined, (e: unknown) => {
      noteMediaFailure(label, e);
      onFail?.(e);
    });
  }
  return true;
}

/**
 * Play a <video>. play() rejects on an autoplay refusal (NotAllowedError) and
 * when a new load interrupts it (AbortError, WebKit "The operation was
 * aborted."); onFail gets the reason. Never throws, never leaves a rejection.
 */
export function playMedia(v: HTMLMediaElement, onFail?: (e: unknown) => void): void {
  safeMediaCall(() => v.play(), onFail, "play()");
}

/** Pause a <video>. Never throws. */
export function pauseMedia(v: HTMLMediaElement): void {
  safeMediaCall(() => v.pause(), undefined, "pause()");
}

/** Seek a <video> to `t` seconds. Never throws; returns false when it did. */
export function seekMedia(v: HTMLMediaElement, t: number): boolean {
  return safeMediaCall(() => { v.currentTime = t; }, undefined, "seek");
}

type FullscreenTarget = HTMLElement & {
  webkitEnterFullscreen?: () => void;
  webkitRequestFullscreen?: () => void;
};

/**
 * Ask for fullscreen on `el` with whichever API it has. Returns false (after
 * calling onFail) when no API exists or the call threw; a later rejection
 * also calls onFail.
 */
export function requestElementFullscreen(el: FullscreenTarget, onFail?: (e: unknown) => void): boolean {
  if (typeof el.requestFullscreen === "function") return safeMediaCall(() => el.requestFullscreen(), onFail, "requestFullscreen()");
  if (typeof el.webkitEnterFullscreen === "function") return safeMediaCall(() => el.webkitEnterFullscreen!(), onFail, "webkitEnterFullscreen()");
  if (typeof el.webkitRequestFullscreen === "function") return safeMediaCall(() => el.webkitRequestFullscreen!(), onFail, "webkitRequestFullscreen()");
  onFail?.(undefined);
  return false;
}

/** Leave document fullscreen, if any. Never throws. */
export function exitDocumentFullscreen(): void {
  if (typeof document === "undefined" || typeof document.exitFullscreen !== "function") return;
  safeMediaCall(() => document.exitFullscreen(), undefined, "exitFullscreen()");
}
