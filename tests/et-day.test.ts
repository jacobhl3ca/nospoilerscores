import assert from "node:assert/strict";
import test from "node:test";

import { etSlateYmd, getEtServiceDate, getTimeZone, setServiceTimeZone, toYmd } from "../src/lib/etDay.ts";

// "Today" and the slate day follow the Settings zone, with the 1 AM rollover,
// in every zone the picker offers or a saved value can hold.

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

// The wall-clock Y/M/D and hour of an instant in a zone, read independently.
function wall(atMs: number, tz: string): { ymd: string; hour: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(atMs));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { ymd: `${get("year")}${get("month")}${get("day")}`, hour: +get("hour") };
}
function prevYmd(ymd: string): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function expectedServiceYmd(atMs: number, tz: string): string {
  const w = wall(atMs, tz);
  return w.hour < 1 ? prevYmd(w.ymd) : w.ymd;
}

// Instants that sit near midnight in several zones, plus both 2026 DST flips.
const INSTANTS = [
  "2026-10-04T03:30:00Z", // 11:30 PM ET, 12:30 AM in Brazil-ish offsets
  "2026-10-04T04:30:00Z", // 12:30 AM ET → still Oct 3 in NY
  "2026-10-04T05:30:00Z", // 1:30 AM ET → Oct 4
  "2026-10-04T15:00:00Z", // 12:00 AM next day in Tokyo
  "2026-10-04T15:30:00Z", // 12:30 AM Tokyo → still Oct 4 in Tokyo
  "2026-10-25T00:30:00Z", // EU change night
  "2026-11-01T05:30:00Z", // US fall-back morning
  "2026-12-31T23:30:00Z", // New Year in UTC, 6:30 PM ET
].map((s) => Date.parse(s));

test("getEtServiceDate = the zone's day, rolled back before 1 AM, for every zone", (t) => {
  for (const tz of ZONES) {
    for (const at of INSTANTS) {
      t.mock.timers.enable({ apis: ["Date"], now: at });
      setServiceTimeZone(tz);
      try {
        assert.equal(toYmd(getEtServiceDate()), expectedServiceYmd(at, tz), `${tz} @ ${new Date(at).toISOString()}`);
      } finally {
        setServiceTimeZone(undefined);
        t.mock.timers.reset();
      }
    }
  }
});

test("etSlateYmd buckets a kickoff the same way, for every zone", () => {
  for (const tz of ZONES) {
    setServiceTimeZone(tz);
    try {
      for (const at of INSTANTS) {
        assert.equal(etSlateYmd(new Date(at).toISOString()), expectedServiceYmd(at, tz), `${tz} @ ${new Date(at).toISOString()}`);
      }
    } finally {
      setServiceTimeZone(undefined);
    }
  }
  assert.equal(etSlateYmd("not a date"), "");
});

test("spot checks: 12:30 AM ET is last night in NY and LA, today in Tokyo", () => {
  const at = "2026-10-04T04:30:00Z";
  setServiceTimeZone("America/New_York");
  assert.equal(etSlateYmd(at), "20261003");
  setServiceTimeZone("America/Los_Angeles");
  assert.equal(etSlateYmd(at), "20261003"); // 9:30 PM PT Oct 3
  setServiceTimeZone("Asia/Tokyo");
  assert.equal(etSlateYmd(at), "20261004"); // 1:30 PM JST Oct 4
  setServiceTimeZone(undefined);
});

test("a bad zone name falls back to the device zone", (t) => {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  setServiceTimeZone("Not/AZone");
  try {
    assert.equal(getTimeZone(), device);
    const at = Date.parse("2026-10-04T15:30:00Z");
    t.mock.timers.enable({ apis: ["Date"], now: at });
    assert.equal(toYmd(getEtServiceDate()), expectedServiceYmd(at, device));
    assert.equal(etSlateYmd("2026-10-04T15:30:00Z"), expectedServiceYmd(at, device));
  } finally {
    t.mock.timers.reset();
    setServiceTimeZone(undefined);
  }
  setServiceTimeZone("");
  assert.equal(getTimeZone(), device, "empty string = Auto");
});
