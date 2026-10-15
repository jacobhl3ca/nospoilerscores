// Fetch cancellation that HideScore does ON PURPOSE: an effect's cleanup on
// unmount or refresh, or a timeout we set. These are not faults, but a bare
// `ctrl.abort()` makes the fetch reject with a nameless AbortError —
// "signal is aborted without reason" (Chrome), "The operation was aborted."
// (Safari/Firefox) — that looks the same as one the browser or a third-party
// script raised. Sentry got both (GitHub #252, #261).
//
// So every abort we start goes through abortOwn(), which aborts with a reason
// that names us. fetch() then rejects with that exact reason, and Sentry's
// ignore rule (OWN_ABORT_PATTERN, in instrumentation-client.ts) matches only
// it. A nameless AbortError still reaches Sentry: it is not ours.
//
// Why a caught abort still reached Sentry (proven 2026-10-15): #252's stack,
// mapped with a local build of its release, is the timeout in espn.ts
// fetchWithRetry, and every caller of fetchWithRetry catches. A clean Chromium
// run with every fetch timing out gives no unhandled rejection. It appears
// only when a page script wraps window.fetch and branches the promise
// (`const p = realFetch(...); p.then(log); return p;`). That branch rejects
// with our abort reason and nothing handles it. Browser extensions and
// privacy browsers (DuckDuckGo, #261) inject such wrappers. No catch of ours
// can reach that branch, so the abort reason must name us.

export const OWN_ABORT_MESSAGE = "HideScore cancelled this request on purpose";

// For Sentry's ignoreErrors. Matches the message however Sentry prefixes it
// ("AbortError: …", "Error: AbortError: …").
export const OWN_ABORT_PATTERN = new RegExp(OWN_ABORT_MESSAGE);

function ownAbortReason(): unknown {
  try {
    return new DOMException(OWN_ABORT_MESSAGE, "AbortError");
  } catch {
    // A runtime with no DOMException constructor: a plain Error still carries
    // the name and the message.
    const e = new Error(OWN_ABORT_MESSAGE);
    e.name = "AbortError";
    return e;
  }
}

/** Abort a controller we own, with a reason Sentry can tell apart. */
export function abortOwn(ctrl: AbortController): void {
  ctrl.abort(ownAbortReason());
}

/**
 * A signal that aborts itself after `ms` through abortOwn(). Use it in place of
 * the built-in timeout signal, whose "TimeoutError: signal timed out" names no one.
 */
export function ownTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => abortOwn(ctrl), ms);
  return ctrl.signal;
}

/** True for any abort rejection: ours, the browser's, or a timeout signal's. */
export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

/** True only for a rejection that abortOwn() caused. */
export function isOwnAbort(e: unknown): boolean {
  if (!isAbortError(e)) return false;
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && OWN_ABORT_PATTERN.test(message);
}
