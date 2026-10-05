import { test } from "node:test";
import assert from "node:assert/strict";
import { pushWidgetPrefs, resetWidgetBridgeForTests } from "../src/lib/widgetBridge.ts";

// The Android widget bridge rides the web deploy into every shell, so it must
// be silent where the plugin is missing and must never throw (10/5).

function withWindow(cap: unknown, fn: () => void) {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = { Capacitor: cap };
  try { fn(); } finally { g.window = prev; resetWidgetBridgeForTests(); }
}

const prefs = { favoriteTeams: ["mlb-19", "nfl-3"], timezone: "America/Chicago" };

test("android with the plugin: sends teams + zone once per change", () => {
  const sent: unknown[] = [];
  withWindow({
    isNativePlatform: () => true, getPlatform: () => "android",
    Plugins: { HideScoreWidget: { setPrefs: (p: unknown) => { sent.push(p); return Promise.resolve(); } } },
  }, () => {
    pushWidgetPrefs(prefs);
    pushWidgetPrefs(prefs);
    pushWidgetPrefs({ favoriteTeams: ["mlb-19"], timezone: undefined });
  });
  assert.deepEqual(sent, [
    { teams: ["mlb-19", "nfl-3"], tz: "America/Chicago" },
    { teams: ["mlb-19"], tz: null },
  ]);
});

test("no-op on web, iOS, and an old Android build without the plugin", () => {
  for (const cap of [
    undefined,
    { isNativePlatform: () => false },
    { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { HideScoreWidget: { setPrefs: () => { throw new Error("ios"); } } } },
    { isNativePlatform: () => true, getPlatform: () => "android", Plugins: {} },
  ]) withWindow(cap, () => assert.doesNotThrow(() => pushWidgetPrefs(prefs)));
});

test("a throwing or rejecting plugin never escapes", async () => {
  withWindow({
    isNativePlatform: () => true, getPlatform: () => "android",
    Plugins: { HideScoreWidget: { setPrefs: () => { throw new Error("boom"); } } },
  }, () => assert.doesNotThrow(() => pushWidgetPrefs(prefs)));
  withWindow({
    isNativePlatform: () => true, getPlatform: () => "android",
    Plugins: { HideScoreWidget: { setPrefs: () => Promise.reject(new Error("no")) } },
  }, () => assert.doesNotThrow(() => pushWidgetPrefs(prefs)));
  await new Promise((r) => setTimeout(r, 0));
});

test("no window (server render): nothing happens", () => {
  assert.doesNotThrow(() => pushWidgetPrefs(prefs));
});
