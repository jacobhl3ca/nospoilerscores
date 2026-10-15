import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

// The 4 AM rule in local time. node:test runs each file in its own process,
// so setting TZ here does not reach the other test files.
process.env.TZ = "America/New_York";

import {
  isSeen,
  markSeen,
  mergeSeen,
  morningCutoff,
  nextMorningCutoff,
  openedCounts,
  resetSeenCache,
  seenKeys,
  seenSnapshot,
  setSeenMorningReset,
  setSeenSync,
} from "../src/lib/newsSeen.ts";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

beforeEach(() => {
  process.env.TZ = "America/New_York";
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  resetSeenCache();
  setSeenSync(null);
  setSeenMorningReset(true);
});

const HOUR = 60 * 60 * 1000;
// Wall time in New York (EDT = UTC-4 until Nov 1 2026, EST = UTC-5 after).
const edt = (m: number, d: number, h: number, min = 0) => Date.UTC(2026, m - 1, d, h + 4, min);
const est = (m: number, d: number, h: number, min = 0) => Date.UTC(2026, m - 1, d, h + 5, min);

test("an open counts until 4 AM, then not", () => {
  const opened = edt(10, 14, 22);
  assert.equal(openedCounts(opened, edt(10, 15, 3, 59), true), true);
  assert.equal(openedCounts(opened, edt(10, 15, 4, 0), true), false);
  assert.equal(openedCounts(opened, edt(10, 15, 4, 1), true), false);
  // An open at exactly 4:00 belongs to the new day.
  assert.equal(openedCounts(edt(10, 15, 4), edt(10, 15, 23, 59), true), true);
  assert.equal(openedCounts(edt(10, 15, 4) - 1, edt(10, 15, 4), true), false);
});

test("before 4 AM the cutoff is yesterday's 4 AM; after, today's", () => {
  assert.equal(morningCutoff(edt(10, 15, 3, 59)), edt(10, 14, 4));
  assert.equal(morningCutoff(edt(10, 15, 4)), edt(10, 15, 4));
  assert.equal(morningCutoff(edt(10, 15, 12)), edt(10, 15, 4));
  assert.equal(nextMorningCutoff(edt(10, 15, 3, 59)), edt(10, 15, 4));
  assert.equal(nextMorningCutoff(edt(10, 15, 4)), edt(10, 16, 4));
});

test("across midnight: an open late last night still counts until 4 AM", () => {
  const lateNight = edt(10, 14, 23, 30);
  assert.equal(openedCounts(lateNight, edt(10, 15, 0, 30), true), true);
  assert.equal(openedCounts(lateNight, edt(10, 15, 3, 0), true), true);
  assert.equal(openedCounts(lateNight, edt(10, 15, 5, 0), true), false);
  // Opened after midnight but before 4 AM: still the old day.
  assert.equal(openedCounts(edt(10, 15, 2), edt(10, 15, 5), true), false);
});

test("DST start (Mar 8 2026, 2 AM jumps to 3 AM): the cutoff is 4 AM EDT", () => {
  // 4 AM EDT = 08:00Z. The day before it was 4 AM EST = 09:00Z.
  assert.equal(morningCutoff(Date.UTC(2026, 2, 8, 12)), Date.UTC(2026, 2, 8, 8));
  assert.equal(morningCutoff(Date.UTC(2026, 2, 8, 7, 59)), Date.UTC(2026, 2, 7, 9));
  assert.equal(new Date(morningCutoff(Date.UTC(2026, 2, 8, 12))).getHours(), 4);
  // 3:30 AM EDT (just after the jump) is before the cutoff.
  assert.equal(openedCounts(Date.UTC(2026, 2, 8, 7, 30), Date.UTC(2026, 2, 8, 8, 30), true), false);
  assert.equal(nextMorningCutoff(Date.UTC(2026, 2, 7, 12)), Date.UTC(2026, 2, 8, 8));
});

test("DST end (Nov 1 2026, 2 AM falls back to 1 AM): the cutoff is 4 AM EST", () => {
  assert.equal(morningCutoff(est(11, 1, 12)), Date.UTC(2026, 10, 1, 9));
  assert.equal(morningCutoff(est(11, 1, 3, 59)), edt(10, 31, 4));
  // An open in the repeated 1 AM hour, both times, is before the cutoff.
  assert.equal(openedCounts(edt(11, 1, 1, 30), est(11, 1, 4, 1), true), false);
  assert.equal(openedCounts(est(11, 1, 1, 30), est(11, 1, 4, 1), true), false);
  assert.equal(openedCounts(est(11, 1, 1, 30), est(11, 1, 3, 59), true), true);
  assert.equal(nextMorningCutoff(edt(10, 31, 12)), Date.UTC(2026, 10, 1, 9));
});

test("DST end in London (Oct 25 2026): the cutoff is 4 AM GMT", () => {
  process.env.TZ = "Europe/London";
  assert.equal(morningCutoff(Date.UTC(2026, 9, 25, 12)), Date.UTC(2026, 9, 25, 4));
  assert.equal(morningCutoff(Date.UTC(2026, 9, 24, 12)), Date.UTC(2026, 9, 24, 3));
});

test("a time zone change moves the cutoff to the new local 4 AM", () => {
  const opened = Date.UTC(2026, 9, 15, 6); // 2 AM New York, 3 PM Tokyo
  const now = Date.UTC(2026, 9, 15, 10); // 6 AM New York, 7 PM Tokyo
  assert.equal(openedCounts(opened, now, true), false);
  process.env.TZ = "Asia/Tokyo";
  assert.equal(morningCutoff(now), Date.UTC(2026, 9, 14, 19));
  assert.equal(openedCounts(opened, now, true), true);
});

test("setting off: every open counts, however old", () => {
  assert.equal(openedCounts(edt(10, 1, 12), edt(10, 15, 12), false), true);
  const cutoff = morningCutoff(Date.now());
  markSeen("old", cutoff - HOUR);
  setSeenMorningReset(false);
  assert.equal(isSeen("old", cutoff + HOUR), true);
  setSeenMorningReset(true);
  assert.equal(isSeen("old", cutoff + HOUR), false);
});

test("the store reads through the rule but keeps every time for the sync", () => {
  const cutoff = morningCutoff(Date.now());
  const pushed: string[] = [];
  setSeenSync((key) => pushed.push(key));
  markSeen("yesterday", cutoff - HOUR);
  markSeen("today", cutoff + 60_000);
  const now = cutoff + 2 * HOUR;
  assert.equal(isSeen("yesterday", now), false);
  assert.equal(isSeen("today", now), true);
  assert.deepEqual([...seenKeys(now)], ["today"]);
  // Nothing deleted: the account copy diffs against both, so a pull from
  // another device cannot bring "yesterday" back as a new mark, and no push
  // removes it either.
  assert.deepEqual(Object.keys(seenSnapshot()).sort(), ["today", "yesterday"]);
  mergeSeen({ yesterday: cutoff - HOUR });
  assert.equal(isSeen("yesterday", now), false);
  // Opened again today: counts again.
  markSeen("yesterday", cutoff + HOUR);
  assert.equal(isSeen("yesterday", now), true);
  assert.deepEqual(pushed, ["yesterday", "today", "yesterday"]);
});

test("another device's open from this morning counts here", () => {
  const cutoff = morningCutoff(Date.now());
  mergeSeen({ "from-phone": cutoff + 30 * 60_000, "phone-old": cutoff - 30 * 60_000 });
  assert.equal(isSeen("from-phone", cutoff + HOUR), true);
  assert.equal(isSeen("phone-old", cutoff + HOUR), false);
});
