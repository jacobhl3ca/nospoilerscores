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
