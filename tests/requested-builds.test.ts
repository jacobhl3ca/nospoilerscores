import assert from "node:assert/strict";
import test from "node:test";
import { REQUESTED_BUILDS, requestedBuildDay } from "../src/lib/requestedBuilds.ts";

// "Built from your requests" on /contact (2026-10-09). The list is public and
// thanks people by initials, so these pin the shape: real dates, newest
// first, known kinds, initials only (no names, no emails).

test("every date is a real YYYY-MM-DD day", () => {
  for (const r of REQUESTED_BUILDS) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.title);
    const d = new Date(`${r.date}T12:00:00Z`);
    assert.equal(d.toISOString().slice(0, 10), r.date, r.title);
  }
});

test("rows are newest first", () => {
  for (let i = 1; i < REQUESTED_BUILDS.length; i++) {
    assert.ok(REQUESTED_BUILDS[i - 1].date >= REQUESTED_BUILDS[i].date, REQUESTED_BUILDS[i].title);
  }
});

test("kinds are League, Fix or Feature", () => {
  for (const r of REQUESTED_BUILDS) assert.ok(["League", "Fix", "Feature"].includes(r.kind), r.title);
});

test("every title is set and no row repeats", () => {
  for (const r of REQUESTED_BUILDS) assert.ok(r.title.trim().length > 0);
  const keys = REQUESTED_BUILDS.map((r) => `${r.date}|${r.title}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("credits are initials like K.S., never a name", () => {
  for (const r of REQUESTED_BUILDS) {
    for (const by of r.by) assert.match(by, /^([A-Z]\.){1,3}$/, `${r.title}: ${by}`);
  }
});

test("no email address anywhere in the list", () => {
  assert.ok(!JSON.stringify(REQUESTED_BUILDS).includes("@"));
});

test("day label reads the date string, not a UTC Date", () => {
  assert.equal(requestedBuildDay("2026-10-07"), "Oct 7");
  assert.equal(requestedBuildDay("2026-01-01"), "Jan 1");
  assert.equal(requestedBuildDay("2026-12-31"), "Dec 31");
});
