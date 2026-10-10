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

export function safeMediaCall(fn: () => unknown, onFail?: (e: unknown) => void): boolean {
  let result: unknown;
  try {
    result = fn();
  } catch (e) {
    onFail?.(e);
    return false;
  }
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    (result as Promise<unknown>).then(undefined, (e: unknown) => onFail?.(e));
  }
  return true;
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
  if (typeof el.requestFullscreen === "function") return safeMediaCall(() => el.requestFullscreen(), onFail);
  if (typeof el.webkitEnterFullscreen === "function") return safeMediaCall(() => el.webkitEnterFullscreen!(), onFail);
  if (typeof el.webkitRequestFullscreen === "function") return safeMediaCall(() => el.webkitRequestFullscreen!(), onFail);
  onFail?.(undefined);
  return false;
}

/** Leave document fullscreen, if any. Never throws. */
export function exitDocumentFullscreen(): void {
  if (typeof document === "undefined" || typeof document.exitFullscreen !== "function") return;
  safeMediaCall(() => document.exitFullscreen());
}
