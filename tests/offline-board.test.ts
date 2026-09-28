import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFLINE_BOARD_KEY,
  OFFLINE_SAVE_GAP_MS,
  formatOfflineUpdated,
  latestBoardSnapshot,
  loadBoardSnapshot,
  pullLooksOffline,
  saveBoardSnapshot,
} from "../src/lib/offlineBoard.ts";
import type { LeagueData } from "../src/lib/types.ts";

// 9/27 (7DC87928): offline, the app showed "Failed to load games". It now
// paints the last board from the device with an "Offline · updated" line.

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    raw: m,
  };
}

const league = (sport: string, extra: Partial<LeagueData> = {}) =>
  ({ sport, label: sport.toUpperCase(), games: [], ...extra }) as unknown as LeagueData;

test("saves a board and reads it back for the same day only", () => {
  const s = mem();
  assert.equal(saveBoardSnapshot(s, "20260927", [league("mlb")], 1_000), true);
  assert.equal(loadBoardSnapshot(s, "20260927")?.leagues[0].sport, "mlb");
  assert.equal(loadBoardSnapshot(s, "20260927")?.savedAt, 1_000);
  assert.equal(loadBoardSnapshot(s, "20260926"), null);
});

test("the 10 s live poll does not rewrite the copy inside the gap", () => {
  const s = mem();
  saveBoardSnapshot(s, "20260927", [league("mlb")], 1_000);
  assert.equal(saveBoardSnapshot(s, "20260927", [league("nfl")], 1_000 + OFFLINE_SAVE_GAP_MS - 1), false);
  assert.equal(loadBoardSnapshot(s, "20260927")?.leagues[0].sport, "mlb");
  assert.equal(saveBoardSnapshot(s, "20260927", [league("nfl")], 1_000 + OFFLINE_SAVE_GAP_MS), true);
  assert.equal(loadBoardSnapshot(s, "20260927")?.leagues[0].sport, "nfl");
});

test("an empty or all-failed pull never replaces a useful copy", () => {
  const s = mem();
  saveBoardSnapshot(s, "20260927", [league("mlb")], 1_000);
  assert.equal(saveBoardSnapshot(s, "20260927", [], 100_000), false);
  assert.equal(saveBoardSnapshot(s, "20260927", [league("mlb", { fetchFailed: true })], 100_000), false);
  assert.equal(loadBoardSnapshot(s, "20260927")?.savedAt, 1_000);
});

test("keeps only the 3 newest days", () => {
  const s = mem();
  saveBoardSnapshot(s, "20260924", [league("mlb")], 1);
  saveBoardSnapshot(s, "20260925", [league("mlb")], 2);
  saveBoardSnapshot(s, "20260926", [league("mlb")], 3);
  saveBoardSnapshot(s, "20260927", [league("mlb")], 4);
  assert.equal(loadBoardSnapshot(s, "20260924"), null);
  assert.equal(latestBoardSnapshot(s)?.date, "20260927");
  assert.deepEqual(Object.keys(JSON.parse(s.raw.get(OFFLINE_BOARD_KEY) as string)).sort(), ["20260925", "20260926", "20260927"]);
});

test("junk in storage reads as no copy, and a full quota never throws", () => {
  const s = mem();
  s.setItem(OFFLINE_BOARD_KEY, "{not json");
  assert.equal(loadBoardSnapshot(s, "20260927"), null);
  assert.equal(latestBoardSnapshot(s), null);
  const full = { ...mem(), setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(saveBoardSnapshot(full, "20260927", [league("mlb")], 1), false);
});

test("offline = browser offline, or every column failed", () => {
  assert.equal(pullLooksOffline(false, [league("mlb")]), true);
  assert.equal(pullLooksOffline(true, [league("mlb", { fetchFailed: true }), league("nfl", { fetchFailed: true })]), true);
  assert.equal(pullLooksOffline(true, [league("mlb", { fetchFailed: true }), league("nfl")]), false);
  assert.equal(pullLooksOffline(true, []), false);
});

test("updated line: time the same day, date + time on another", () => {
  const tz = "America/New_York";
  const saved = Date.UTC(2026, 8, 27, 22, 10); // 6:10 PM EDT
  assert.equal(formatOfflineUpdated(saved, saved + 60_000, tz), "6:10 PM");
  assert.equal(formatOfflineUpdated(saved, saved + 24 * 3600_000, tz), "Sep 27, 6:10 PM");
});
