import assert from "node:assert/strict";
import test from "node:test";

import { requestElementFullscreen, safeMediaCall } from "../src/lib/mediaSafe.ts";

// GitHub #245: iPhone's webkitEnterFullscreen() throws InvalidStateError
// synchronously on a <video> with no metadata yet. The fullscreen toggle
// called it bare, so the throw reached Sentry.

const invalidState = () => new DOMException("The object is in an invalid state.", "InvalidStateError");
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a synchronous InvalidStateError is absorbed and reported to onFail", () => {
  const failures: unknown[] = [];
  const ok = safeMediaCall(() => { throw invalidState(); }, (e) => failures.push(e));
  assert.equal(ok, false);
  assert.equal((failures[0] as DOMException).name, "InvalidStateError");
});

test("a rejected promise is absorbed and reported to onFail", async () => {
  const failures: unknown[] = [];
  const ok = safeMediaCall(() => Promise.reject(invalidState()), (e) => failures.push(e));
  assert.equal(ok, true);
  await tick();
  assert.equal(failures.length, 1);
});

test("a rejected promise with no onFail does not become an unhandled rejection", async () => {
  let unhandled: unknown = null;
  const onUnhandled = (e: unknown) => { unhandled = e; };
  process.on("unhandledRejection", onUnhandled);
  try {
    safeMediaCall(() => Promise.reject(invalidState()));
    await tick();
    await tick();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.equal(unhandled, null);
});

test("iPhone <video>: webkitEnterFullscreen throwing InvalidStateError does not escape", () => {
  const video = { webkitEnterFullscreen: () => { throw invalidState(); } } as unknown as HTMLElement;
  let failed = false;
  assert.doesNotThrow(() => requestElementFullscreen(video, () => { failed = true; }));
  assert.equal(failed, true);
});

test("old Safari: requestFullscreen returning undefined does not throw", () => {
  const el = { requestFullscreen: () => undefined } as unknown as HTMLElement;
  assert.equal(requestElementFullscreen(el), true);
});

test("no fullscreen API at all reports failure so the caller can fall back", () => {
  let failed = false;
  assert.equal(requestElementFullscreen({} as HTMLElement, () => { failed = true; }), false);
  assert.equal(failed, true);
});
