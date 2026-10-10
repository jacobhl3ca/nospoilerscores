import assert from "node:assert/strict";
import test from "node:test";
import { REQUESTED_BUILDS, requestedBuildDay, requestedBuildGroup } from "../src/lib/requestedBuilds.ts";

// "Built from your requests" on /contact (2026-10-09). The list is public and
// thanks people by initials, so these pin the shape: real dates, rows grouped
// by person (newest first inside a group), known kinds, initials only (no
// names, no emails).

test("every date is a real YYYY-MM-DD day", () => {
  for (const r of REQUESTED_BUILDS) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.title);
    const d = new Date(`${r.date}T12:00:00Z`);
    assert.equal(d.toISOString().slice(0, 10), r.date, r.title);
  }
});

test("each person's rows sit together, newest first inside the group", () => {
  const seen = new Set<string>();
  for (let i = 0; i < REQUESTED_BUILDS.length; i++) {
    const r = REQUESTED_BUILDS[i];
    const g = requestedBuildGroup(r);
    const prev = i > 0 ? REQUESTED_BUILDS[i - 1] : undefined;
    if (prev && requestedBuildGroup(prev) === g) {
      assert.ok(prev.date >= r.date, `${r.title} is newer than ${prev.title} in group "${g}"`);
    } else {
      assert.ok(!seen.has(g), `group "${g}" is split: ${r.title}`);
      seen.add(g);
    }
  }
});

test("rows with initials come before rows with none", () => {
  const firstBlank = REQUESTED_BUILDS.findIndex((r) => r.by.length === 0);
  if (firstBlank < 0) return;
  for (const r of REQUESTED_BUILDS.slice(firstBlank)) assert.equal(r.by.length, 0, r.title);
});

test("credited groups run from most rows to fewest", () => {
  const sizes: number[] = [];
  let last = "";
  for (const r of REQUESTED_BUILDS) {
    if (!r.by.length) break;
    const g = requestedBuildGroup(r);
    if (g === last) sizes[sizes.length - 1]++;
    else sizes.push(1);
    last = g;
  }
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i - 1] >= sizes[i], `group sizes ${sizes.join(",")}`);
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
