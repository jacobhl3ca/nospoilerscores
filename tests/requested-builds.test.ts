import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUESTED_BUILDS,
  WALL_LINKS,
  requestedBuildDay,
  requestedBuildGroup,
  requestedBuildPeople,
  requestedBuildSections,
  type RequestedBuild,
} from "../src/lib/requestedBuilds.ts";

// "Built from your requests" (2026-10-09; on /wall-of-fame from 10/11). The
// list is public and names people by what they picked, so these pin the
// shape: real dates, rows grouped by person (newest first inside a group),
// known kinds, a name or initials (no emails), https-only wall links.

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

test("credits are a name or initials like K.S., at most 40 characters", () => {
  for (const r of REQUESTED_BUILDS) {
    for (const by of r.by) assert.match(by, /^[A-Z][A-Za-z.' -]{0,39}$/, `${r.title}: ${by}`);
  }
});

test("no email address anywhere in the list or the links", () => {
  assert.ok(!JSON.stringify(REQUESTED_BUILDS).includes("@"));
  for (const url of Object.values(WALL_LINKS)) assert.ok(!url.startsWith("mailto:"), url);
});

test("wall links: one per person on the wall, https only", () => {
  const people = new Set(requestedBuildPeople().map((p) => p.who));
  for (const [who, url] of Object.entries(WALL_LINKS)) {
    assert.ok(people.has(who), `${who} is not on the wall`);
    assert.equal(new URL(url).protocol, "https:", `${who}: ${url}`);
  }
});

test("day label reads the date string, not a UTC Date", () => {
  assert.equal(requestedBuildDay("2026-10-07"), "Oct 7");
  assert.equal(requestedBuildDay("2026-01-01"), "Jan 1");
  assert.equal(requestedBuildDay("2026-12-31"), "Dec 31");
});

const row = (title: string, by: string[]): RequestedBuild => ({ date: "2026-09-13", kind: "League", title, by });

test("ranked people: one entry per person, counts match the rows, most first", () => {
  const people = requestedBuildPeople();
  const credited = REQUESTED_BUILDS.filter((r) => r.by.length > 0);
  assert.equal(new Set(people.map((p) => p.who)).size, people.length);
  assert.equal(people.reduce((n, p) => n + p.count, 0), credited.length);
  for (const p of people) {
    assert.equal(p.count, credited.filter((r) => requestedBuildGroup(r) === p.who).length, p.who);
  }
  for (let i = 1; i < people.length; i++) assert.ok(people[i - 1].count >= people[i].count);
  assert.ok(people.every((p) => p.who !== ""), "rows with no initials are not ranked");
});

test("ranked people: sorted by count, a tie keeps the file's order", () => {
  const rows = [row("a", ["A.A."]), row("b", ["B.B."]), row("c", ["B.B."]), row("d", ["C.C."]), row("e", [])];
  assert.deepEqual(requestedBuildPeople(rows), [
    { who: "B.B.", count: 2 },
    { who: "A.A.", count: 1 },
    { who: "C.C.", count: 1 },
  ]);
});

test("sections: one per person in file order, then the rows with no initials", () => {
  const sections = requestedBuildSections();
  assert.deepEqual(sections.flatMap((s) => s.rows), REQUESTED_BUILDS);
  assert.equal(new Set(sections.map((s) => s.who)).size, sections.length);
  const blank = sections.findIndex((s) => s.who === "");
  if (blank >= 0) assert.equal(blank, sections.length - 1);
  assert.deepEqual(
    sections.filter((s) => s.who).map((s) => ({ who: s.who, count: s.rows.length })),
    requestedBuildPeople(),
  );
});
