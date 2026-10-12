// "✓ Opened" across devices (Jacob 10/12). The opened-posts map (lib/newsSeen)
// is per browser; once signed in, this mirrors it to the account so Firefox,
// Safari and the app all see what any of them opened.
//
// The worker (public/_worker.js) exposes:
//   GET  /api/seen   -> { seen: { [key]: openedAtMs } }
//   POST /api/seen   body = { add: { [key]: openedAtMs } } -> { ok, count }
//
// Its own object, not a key inside prefs: 3,000 URLs is far past the 64 KB
// prefs cap, and a POST adds marks instead of replacing the whole blob, so two
// devices never overwrite each other. Inert when signed out: HomeContent
// registers pushSeen (setSeenSync) and calls pullSeen only after /api/me says
// signed in, so an anonymous visitor sends nothing.

// .ts extensions: tests/seen-sync.test.ts loads this file under plain
// node --experimental-strip-types, which needs them on relative imports.
import { mergeSeen, seenSnapshot, setSeenSync } from "./newsSeen.ts";
import { hsClientHeaders } from "./prefsSync.ts";

const PUSH_DEBOUNCE_MS = 2000;
// The worker refuses a body over 64 KB, and a keepalive request is capped at
// 64 KB in total, so a big backlog goes up in slices under that.
const MAX_BODY_CHARS = 48 * 1024;

// Marks waiting to go up. A failed POST puts its slice back, and the next mark
// or pull sends it again.
let pending: Record<string, number> = {};
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let flushHookAttached = false;

function queue(batch: Record<string, number>): void {
  for (const [k, v] of Object.entries(batch)) {
    if (!(Object.hasOwn(pending, k) && pending[k] >= v)) pending[k] = v;
  }
}

// Split into bodies under MAX_BODY_CHARS. Overhead per entry is the quotes,
// colon, comma and the 13-digit time; a key on its own over the limit is dropped.
function slices(batch: Record<string, number>): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  let cur: Record<string, number> = {};
  let size = 16;
  for (const [k, v] of Object.entries(batch)) {
    const cost = JSON.stringify(k).length + String(v).length + 2;
    if (cost + 16 > MAX_BODY_CHARS) continue;
    if (size + cost > MAX_BODY_CHARS) {
      out.push(cur);
      cur = {};
      size = 16;
    }
    cur[k] = v;
    size += cost;
  }
  if (Object.keys(cur).length > 0) out.push(cur);
  return out;
}

function post(batch: Record<string, number>, keepalive: boolean): Promise<void> {
  return fetch("/api/seen", {
    method: "POST",
    credentials: "include",
    headers: hsClientHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ add: batch }),
    // keepalive lets the request outlive a page teardown — see flushSeen.
    keepalive,
  }).then((r) => {
    // A 5xx or a rate limit can pass; a 4xx (signed out, bad body) will not.
    if (!r.ok && (r.status >= 500 || r.status === 429)) queue(batch);
  }, () => queue(batch));
}

function send(keepalive: boolean): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const batch = pending;
  pending = {};
  if (Object.keys(batch).length === 0) return Promise.resolve();
  return Promise.all(slices(batch).map((s) => post(s, keepalive))).then(() => {});
}

// Fire the queued marks now, bypassing the debounce, on tab close / app switch
// (same as flushPendingPrefs in lib/prefsSync).
function flushSeen(): void {
  void send(true);
}

// Registered with setSeenSync once signed in: every new mark lands here.
export function pushSeen(key: string, at: number): void {
  queue({ [key]: at });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void send(false); }, PUSH_DEBOUNCE_MS);
  if (!flushHookAttached && typeof window !== "undefined") {
    flushHookAttached = true;
    window.addEventListener("pagehide", flushSeen);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSeen();
    });
  }
}

// Bring in what the account's other devices opened, then send up anything this
// device holds that the account does not (marks from before sign-in, or a POST
// that failed). Quiet on any failure.
export async function pullSeen(): Promise<void> {
  let remote: Record<string, number>;
  try {
    const r = await fetch("/api/seen", { credentials: "include", headers: hsClientHeaders() });
    if (!r.ok) return;
    const body = (await r.json()) as { seen?: unknown };
    const seen = body?.seen;
    if (!seen || typeof seen !== "object" || Array.isArray(seen)) return;
    remote = seen as Record<string, number>;
  } catch {
    return;
  }
  mergeSeen(remote);
  const missing: Record<string, number> = {};
  for (const [k, v] of Object.entries(seenSnapshot())) {
    if (!(Object.hasOwn(remote, k) && remote[k] >= v)) missing[k] = v;
  }
  queue(missing);
  await send(false);
}

// Sign out / delete account: stop mirroring. The device keeps its own map.
// flush = send what is queued first (sign out); delete account drops it.
export function stopSeenSync(flush: boolean): void {
  setSeenSync(null);
  if (flush) flushSeen();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pending = {};
}

// Test hook.
export function resetSeenSyncState(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pending = {};
}
