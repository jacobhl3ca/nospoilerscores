// Reload a resumed page when a newer build is live.
//
// A backgrounded phone app or Safari tab that is only resumed, never relaunched,
// keeps running the JS it first loaded — for days. Every fix ships "live" but
// that phone still runs the old code (9/27: the RedZone header kept opening
// nfl.com on a tab loaded before #203 deployed). On resume the board fetches
// /build.json (written by scripts/write-build-json.mjs after `next build`) and
// reloads once when the live id differs from the one baked into this bundle.
//
// Everything here is pure so tests/build-check.test.ts can cover it; the
// listener in HomeContent.tsx supplies the clock, storage and DOM.

/** The id baked into this bundle. Empty/"dev" on a local build with no SHA. */
export const RUNNING_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_SHA || "";

/** At most one /build.json fetch per tab per this many ms. */
export const BUILD_CHECK_GAP_MS = 10 * 60 * 1000;

/** sessionStorage: when this tab last fetched /build.json (ms epoch). */
export const LAST_CHECK_KEY = "hs-build-checked-at";
/** sessionStorage: the live id this tab already reloaded for (loop guard). */
export const RELOADED_FOR_KEY = "hs-build-reloaded-for";

/** True when enough time has passed since this tab's last check. */
export function checkIsDue(now: number, lastCheckedAt: number | null, gapMs = BUILD_CHECK_GAP_MS): boolean {
  if (lastCheckedAt === null || !Number.isFinite(lastCheckedAt)) return true;
  // A clock that moved backwards (manual change, bad NTP) must not block checks forever.
  if (now < lastCheckedAt) return true;
  return now - lastCheckedAt >= gapMs;
}

/** Pull the id out of a /build.json body. Anything malformed → null. */
export function parseBuildId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed && trimmed !== "dev" ? trimmed : null;
}

/**
 * Reload only when both ids are real, they differ, and this tab has not
 * already reloaded for this live id. The last rule stops a loop when the
 * reload still gets the old HTML (an edge cache that has not caught up).
 */
export function shouldReload(running: string, live: string | null, reloadedFor: string | null): boolean {
  if (!running || running === "dev" || !live) return false;
  if (live === running) return false;
  return reloadedFor !== live;
}

/**
 * The user is mid-task: a modal/dialog (Settings, video, game detail…) is
 * open, or a text field has focus. Reloading now would throw that away, so the
 * caller waits for the next resume.
 */
export function pageIsBusy(doc: Pick<Document, "querySelector" | "activeElement">): boolean {
  if (doc.querySelector('[aria-modal="true"]')) return true;
  const el = doc.activeElement as (Element & { isContentEditable?: boolean }) | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || Boolean(el.isContentEditable);
}
