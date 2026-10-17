import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { abortOwn, OWN_ABORT_PATTERN, ownTimeoutSignal } from "../src/lib/abort.ts";
import { setBreadcrumbSink, type Breadcrumb } from "../src/lib/breadcrumb.ts";
import { pauseMedia, playMedia, requestElementFullscreen, seekMedia } from "../src/lib/mediaSafe.ts";
import { isCrawlerHeadRemoval } from "../src/lib/sentryNoise.ts";

// Sentry web errors #390, #252, #261, #245, #79 (pulled 2026-10-15).

const root = new URL("..", import.meta.url);
const src = (p: string) => readFile(new URL(p, root), "utf8");
// grep -rn over src; [] when nothing matches (grep exits 1).
function grepSrc(pattern: string): string[] {
  try {
    return execFileSync("grep", ["-rnE", pattern, "src", "--include=*.ts", "--include=*.tsx"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── #390: React removeChild on a <head> node a crawler already removed ──────

const SEBOT = "Mozilla/5.0 (compatible; SEBot/1.0; +https://example.com/bot)";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const CUBOT = "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const removeChildEvent = (value: string) => ({ exception: { values: [{ type: "TypeError", value }] } });

test("#390: the crawler's removeChild-on-null event is dropped", () => {
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("Cannot read properties of null (reading 'removeChild')"), SEBOT), true);
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("null is not an object (evaluating 'e.parentNode.removeChild')"), "Googlebot/2.1"), true);
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("can't access property \"removeChild\", e.parentNode is null"), "HeadlessChrome/125"), true);
});

test("#390: the same error from a person's browser still reports", () => {
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("Cannot read properties of null (reading 'removeChild')"), CHROME), false);
  // A phone brand that ends in "bot" is not a crawler.
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("Cannot read properties of null (reading 'removeChild')"), CUBOT), false);
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("Cannot read properties of null (reading 'removeChild')"), undefined), false);
});

test("#390: any other crawler error still reports", () => {
  assert.equal(isCrawlerHeadRemoval(removeChildEvent("Cannot read properties of null (reading 'appendChild')"), SEBOT), false);
  assert.equal(isCrawlerHeadRemoval({ message: "RangeError: Invalid time zone specified: Etc/Unknown" }, SEBOT), false);
});

test("#390: beforeSend applies the rule, and no HideScore code removes a <head> node", async () => {
  const init = await src("src/instrumentation-client.ts");
  assert.match(init, /beforeSend\(event, hint\) \{[^}]*isCrawlerHeadRemoval\(event/);
  assert.deepEqual(grepSrc("document\\.head\\.(removeChild|replaceChild|replaceChildren|innerHTML)"), []);
  // Body probes use remove(), which never throws when the node is already gone.
  assert.deepEqual(grepSrc("document\\.body\\.removeChild\\("), []);
});

// ── #252, #261: an abort we caught still reached Sentry ─────────────────────

// A server that answers nothing, so only our abort ends the request.
async function hangingServer(): Promise<{ url: string; server: Server }> {
  const server = createServer(() => { /* never respond */ });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, server };
}

// What extensions and privacy browsers inject: a fetch wrapper that branches
// the promise for its own logging and never handles the branch.
async function withBranchingFetchWrapper(fn: () => Promise<void>): Promise<unknown[]> {
  const realFetch = globalThis.fetch;
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => { unhandled.push(e); };
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    const p = realFetch(...args);
    void p.then(() => {});
    return p;
  }) as typeof fetch;
  // The test runner fails a test on any unhandled rejection; this test wants
  // to see them, so it takes the listener slot for the duration.
  const runnerListeners = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", onUnhandled);
  try {
    await fn();
    await tick();
    await tick();
  } finally {
    globalThis.fetch = realFetch;
    process.off("unhandledRejection", onUnhandled);
    for (const l of runnerListeners) process.on("unhandledRejection", l);
  }
  return unhandled;
}

// The fetchWithRetry shape from the #252 stack: a timeout abort we catch.
async function timedFetch(url: string, abort: (c: AbortController) => void): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => abort(ctrl), 20);
  try {
    await fetch(url, { signal: ctrl.signal });
  } catch {
    /* our call site handles it */
  } finally {
    clearTimeout(timer);
  }
}

test("#252/#261: a bare abort we catch still leaves a nameless unhandled rejection (the reported events)", async () => {
  const { url, server } = await hangingServer();
  try {
    const unhandled = await withBranchingFetchWrapper(() => timedFetch(url, (c) => c.abort()));
    assert.equal(unhandled.length, 1);
    const e = unhandled[0] as Error;
    assert.equal(e.name, "AbortError");
    assert.doesNotMatch(`${e.name}: ${e.message}`, OWN_ABORT_PATTERN);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("#252/#261: abortOwn names the abort, so Sentry's rule drops the branch's rejection", async () => {
  const { url, server } = await hangingServer();
  try {
    const unhandled = await withBranchingFetchWrapper(() => timedFetch(url, abortOwn));
    assert.equal(unhandled.length, 1);
    const e = unhandled[0] as Error;
    // Sentry titles a stackless DOMException "Error: AbortError: <message>".
    assert.match(`Error: ${e.name}: ${e.message}`, OWN_ABORT_PATTERN);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("#252/#261: ownTimeoutSignal times out with our named reason", async () => {
  const { url, server } = await hangingServer();
  try {
    let caught: unknown;
    try {
      await fetch(url, { signal: ownTimeoutSignal(20) });
    } catch (e) {
      caught = e;
    }
    assert.match(`${(caught as Error).name}: ${(caught as Error).message}`, OWN_ABORT_PATTERN);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("#252/#261: no fetch timeout in src uses the nameless AbortSignal.timeout()", () => {
  assert.deepEqual(grepSrc("AbortSignal\\.timeout\\("), []);
});

// ── #245: InvalidStateError from a media call ───────────────────────────────

const invalidState = () => new DOMException("The object is in an invalid state.", "InvalidStateError");

// A <video> in the wrong state: every call throws or rejects InvalidStateError.
function brokenVideo(): HTMLMediaElement {
  const v = {
    paused: false,
    play: () => Promise.reject(invalidState()),
    pause: () => { throw invalidState(); },
    webkitEnterFullscreen: () => { throw invalidState(); },
  };
  Object.defineProperty(v, "currentTime", { get: () => 0, set: () => { throw invalidState(); } });
  return v as unknown as HTMLMediaElement;
}

test("#245: media calls in the wrong state do not throw, and leave a breadcrumb", async () => {
  const crumbs: Breadcrumb[] = [];
  setBreadcrumbSink((b) => crumbs.push(b));
  try {
    const v = brokenVideo();
    // Each one threw (or rejected) InvalidStateError before the guard.
    assert.throws(() => v.pause(), { name: "InvalidStateError" });
    assert.throws(() => { v.currentTime = 5; }, { name: "InvalidStateError" });

    const playFailures: unknown[] = [];
    assert.doesNotThrow(() => pauseMedia(v));
    assert.equal(seekMedia(v, 5), false);
    assert.doesNotThrow(() => playMedia(v, (e) => playFailures.push(e)));
    assert.equal(requestElementFullscreen(v as unknown as HTMLElement), false);
    await tick();
    assert.equal((playFailures[0] as DOMException).name, "InvalidStateError");
    assert.deepEqual(crumbs.map((c) => [c.category, c.message]), [
      ["media", "pause() failed: InvalidStateError: The object is in an invalid state."],
      ["media", "seek failed: InvalidStateError: The object is in an invalid state."],
      ["media", "webkitEnterFullscreen() failed: InvalidStateError: The object is in an invalid state."],
      ["media", "play() failed: InvalidStateError: The object is in an invalid state."],
    ]);
  } finally {
    setBreadcrumbSink(null);
  }
});

test("#245: a breadcrumb sink that throws does not break the media call", () => {
  setBreadcrumbSink(() => { throw new Error("sink down"); });
  try {
    assert.doesNotThrow(() => pauseMedia(brokenVideo()));
  } finally {
    setBreadcrumbSink(null);
  }
});

test("#245: the highlight player makes no bare play/pause/seek/fullscreen call", async () => {
  const modal = await src("src/components/VideoModal.tsx");
  assert.doesNotMatch(modal, /\.play\(\)|\.pause\(\)|\.currentTime\s*=[^=]|\.webkitEnterFullscreen\(|\.requestFullscreen\(/);
  assert.match(modal, /if \(v\.paused\) playMedia\(v, handleNativePlayError\);\s*else pauseMedia\(v\);/);
});

// ── #79: an invalid device time zone ────────────────────────────────────────

test("#79: every read of the device zone is validated before Intl sees it", async () => {
  const reads = grepSrc("resolvedOptions\\(\\)\\.timeZone").map((l) => l.split(":")[0]);
  // etDay.ts is the helper; Settings reads it directly for a lint reason (see there).
  assert.deepEqual([...new Set(reads)].sort(), ["src/components/SettingsPanel.tsx", "src/lib/etDay.ts"]);
  const settings = await src("src/components/SettingsPanel.tsx");
  assert.match(settings, /if \(!isValidTimeZone\(deviceTimeZone\)\) deviceTimeZone = DEFAULT_TIME_ZONE;/);
});

test("#79: the weather row formats in the same validated zone it asks the API for", async () => {
  const weather = await src("src/lib/weather.ts");
  assert.match(weather, /const apiTz = tz \?\? getDeviceTimeZone\(\);/);
  assert.doesNotMatch(weather, /timeZone: tz[,\s}]/);
});
