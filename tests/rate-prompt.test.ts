import assert from "node:assert/strict";
import test from "node:test";

import { noteAppOpen, noteHighlightWatched, noteRateLinkShown, noteRateTapped, shouldShowRateLink } from "../src/lib/rateApp.ts";

// The app shell loads hidescore.com live, so rateApp.ts also runs inside
// native builds that predate the in-app-review plugin. Those must never
// advance lastAskedMs, or the user is locked out for 120 days after updating.

const KEY = "nss-rate-prompt";
const HOUR = 60 * 60 * 1000;

function fakeWindow(pluginAvailable: boolean, seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
    Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => pluginAvailable && name === "InAppReview",
    },
  };
  return store;
}

function threeSessions() {
  const realNow = Date.now;
  const t0 = realNow();
  try {
    for (let i = 0; i < 3; i++) {
      Date.now = () => t0 + i * HOUR;
      noteAppOpen();
    }
  } finally {
    Date.now = realNow;
  }
}

const DAY = 24 * HOUR;

function seedState(extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    [KEY]: JSON.stringify({ firstOpenMs: now, lastSessionMs: now, sessionCount: 2, lastAskedMs: null, ...extra }),
  };
}

// Kept first: rateApp.ts asks at most once per module load, so this must run
// before any test below that records a real ask.
test("♥ Rate tap hides the link and blocks the in-app sheet", () => {
  const store = fakeWindow(true, seedState());
  assert.equal(shouldShowRateLink(), true);
  noteRateTapped();
  assert.equal(shouldShowRateLink(), false);
  noteHighlightWatched();
  assert.equal(JSON.parse(store.get(KEY) ?? "null").lastAskedMs, null);
});

test("♥ Rate link: hidden on a first open, shown from session 2", () => {
  fakeWindow(true);
  noteAppOpen();
  assert.equal(shouldShowRateLink(), false);
  fakeWindow(true, seedState());
  assert.equal(shouldShowRateLink(), true);
});

test("♥ Rate link: hidden on the web", () => {
  fakeWindow(true, seedState());
  (globalThis as unknown as { window: { Capacitor: unknown } }).window.Capacitor = undefined;
  assert.equal(shouldShowRateLink(), false);
});

test("♥ Rate link: hidden within 7 days of the OS review sheet", () => {
  const now = Date.now();
  fakeWindow(true, seedState({ lastAskedMs: now - 6 * DAY }));
  assert.equal(shouldShowRateLink(now), false);
  fakeWindow(true, seedState({ lastAskedMs: now - 8 * DAY }));
  assert.equal(shouldShowRateLink(now), true);
});

test("♥ Rate link: 30 days shown, 180 days rest, then a new 30-day window", () => {
  const t0 = Date.now();
  const store = fakeWindow(true, seedState());
  assert.equal(shouldShowRateLink(t0), true);
  noteRateLinkShown(t0);
  assert.equal(JSON.parse(store.get(KEY) ?? "null").linkShownMs, t0);
  // A later render inside the window does not move its start.
  noteRateLinkShown(t0 + 10 * DAY);
  assert.equal(JSON.parse(store.get(KEY) ?? "null").linkShownMs, t0);
  assert.equal(shouldShowRateLink(t0 + 29 * DAY), true);
  assert.equal(shouldShowRateLink(t0 + 31 * DAY), false);
  assert.equal(shouldShowRateLink(t0 + 209 * DAY), false);
  const t1 = t0 + 211 * DAY;
  assert.equal(shouldShowRateLink(t1), true);
  noteRateLinkShown(t1);
  assert.equal(JSON.parse(store.get(KEY) ?? "null").linkShownMs, t1);
  assert.equal(shouldShowRateLink(t1 + 29 * DAY), true);
  assert.equal(shouldShowRateLink(t1 + 31 * DAY), false);
});

test("old native build without the plugin: 3rd session does not burn the 120-day window", () => {
  const store = fakeWindow(false);
  threeSessions();
  const state = JSON.parse(store.get(KEY) ?? "null");
  assert.equal(state.sessionCount, 3);
  assert.equal(state.lastAskedMs, null);
});

test("build with the plugin: 3rd session records the ask", () => {
  const store = fakeWindow(true);
  threeSessions();
  const state = JSON.parse(store.get(KEY) ?? "null");
  assert.equal(state.sessionCount, 3);
  assert.equal(typeof state.lastAskedMs, "number");
});

// Users from before the prompt shipped have no nss-rate-prompt key, but they
// do have other prefs. They start at session 2, so they are not made to wait
// three more sessions. A true first open still starts at 1.
test("fresh install: first open seeds session 1 and does not ask", () => {
  const store = fakeWindow(true);
  noteAppOpen();
  const state = JSON.parse(store.get(KEY) ?? "null");
  assert.equal(state.sessionCount, 1);
  assert.equal(state.lastAskedMs, null);
});

test("existing prefs, no rate state: first open seeds session 2 and does not ask", () => {
  const store = fakeWindow(true, { "nss-leagues": "[]" });
  noteAppOpen();
  const state = JSON.parse(store.get(KEY) ?? "null");
  assert.equal(state.sessionCount, 2);
  assert.equal(state.lastAskedMs, null);
});

test("any nss-* pref counts; other apps' keys do not", () => {
  let store = fakeWindow(true, { "nss-preferences": "{}" });
  noteAppOpen();
  assert.equal(JSON.parse(store.get(KEY) ?? "null").sessionCount, 2);
  store = fakeWindow(true, { "hs-heal-ts": "1", "other-key": "x" });
  noteAppOpen();
  assert.equal(JSON.parse(store.get(KEY) ?? "null").sessionCount, 1);
});
