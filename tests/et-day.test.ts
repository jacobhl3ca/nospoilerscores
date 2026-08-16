import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

import {
  toYmd,
  fromYmd,
  nextYmd,
  etSlateYmd,
  getTimeZone,
  setServiceTimeZone,
} from "../src/lib/etDay.ts";

// etDay.ts is the app's single source of truth for date bucketing, and its
// comments record two distinct production bugs these tests lock down: the "24"
// hour some ICU builds emit at midnight (which used to skip the 1 AM rollback
// and drift the service day vs. the date nav), and `new Date("YYYYMMDD…")`
// silently returning Invalid Date (which once made the chess/boxing tiles
// vanish on past board dates). The time-zone override path is likewise guarded
// against a corrupted stored IANA name taking the whole board down.

// The override is module-level state; clear it between tests so one test's zone
// can't leak into the next.
beforeEach(() => setServiceTimeZone(undefined));
afterEach(() => setServiceTimeZone(undefined));

test("toYmd/fromYmd round-trip and zero-pad month and day", () => {
  assert.equal(toYmd(fromYmd("20260809")), "20260809");
  assert.equal(toYmd(fromYmd("20260101")), "20260101");
  // The whole reason fromYmd exists: a dashless YYYYMMDD fed straight to
  // `new Date()` returns Invalid Date, and every comparison against its NaN
  // getTime() is silently false. fromYmd must yield a real, valid date.
  assert.equal(Number.isNaN(fromYmd("20260809").getTime()), false);
});

test("nextYmd rolls over month and year and is DST-safe via UTC math", () => {
  assert.equal(nextYmd("20261231"), "20270101");
  // 2026 is not a leap year: Feb has 28 days.
  assert.equal(nextYmd("20260228"), "20260301");
  // 2028 is a leap year: Feb 29 exists.
  assert.equal(nextYmd("20280228"), "20280229");
  // US spring-forward is 2026-03-08; UTC math must step cleanly past it and
  // never land on the same or a skipped day.
  assert.equal(nextYmd("20260308"), "20260309");
});

test("etSlateYmd applies the 1 AM rollover in the effective time zone", () => {
  setServiceTimeZone("America/New_York");
  // 00:30 EDT → before 1 AM → counts as the previous day's slate.
  assert.equal(etSlateYmd("2026-08-10T04:30:00Z"), "20260809");
  // 01:30 EDT → at/after 1 AM → stays on its own calendar day.
  assert.equal(etSlateYmd("2026-08-10T05:30:00Z"), "20260810");
  // Midday is unambiguous.
  assert.equal(etSlateYmd("2026-08-10T16:00:00Z"), "20260810");
});

test("etSlateYmd returns empty string for an unparseable timestamp", () => {
  assert.equal(etSlateYmd("not-a-real-date"), "");
});

test("getTimeZone returns a valid override and falls back on a bad one", () => {
  setServiceTimeZone("America/Chicago");
  assert.equal(getTimeZone(), "America/Chicago");

  // A corrupted/stale IANA name must not be handed to the dozens of
  // Intl.DateTimeFormat({ timeZone }) callers that would throw on it — the
  // override is dropped in favor of the device zone.
  setServiceTimeZone("Not/AZone");
  assert.notEqual(getTimeZone(), "Not/AZone");
  assert.equal(getTimeZone().length > 0, true);

  // An empty string clears the override (treated as "no override").
  setServiceTimeZone("");
  assert.equal(getTimeZone().length > 0, true);
});
