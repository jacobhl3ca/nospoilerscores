import assert from "node:assert/strict";
import test from "node:test";

import { noteAppOpen } from "../src/lib/rateApp.ts";

// The app shell loads hidescore.com live, so rateApp.ts also runs inside
// native builds that predate the in-app-review plugin. Those must never
// advance lastAskedMs, or the user is locked out for 120 days after updating.

const KEY = "nss-rate-prompt";
const HOUR = 60 * 60 * 1000;

function fakeWindow(pluginAvailable: boolean) {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
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
