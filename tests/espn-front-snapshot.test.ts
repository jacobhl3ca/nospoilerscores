import assert from "node:assert/strict";
import test from "node:test";

import { etServiceYmd, mergeEspnFrontSnapshot } from "../scripts/lib/espn-front.mjs";

type Strip = { sports: { slug: string; leagues: { slug: string; events: { id: string }[] }[] }[] };
const strip = (spec: Record<string, Record<string, string[]>>): Strip => ({
  sports: Object.entries(spec).map(([slug, leagues]) => ({
    slug,
    leagues: Object.entries(leagues).map(([lg, ids]) => ({ slug: lg, events: ids.map((id) => ({ id })) })),
  })),
});
const flat = (s: Strip) => s.sports.map((sp) => `${sp.slug}[${sp.leagues.map((l) => `${l.slug}:${l.events.map((e) => e.id).join(",")}`).join(" ")}]`);
const sample = (date: string, s: Strip, featured: string[] = [], fetchedAt = "2026-09-29T20:00:00Z") => ({ date, fetchedAt, strip: s, featured });

test("the first sample of a day is the file", () => {
  const out = mergeEspnFrontSnapshot(null, sample("20260929", strip({ football: { "college-football": ["1", "2"] } }), ["2"]));
  assert.equal(out.samples, 1);
  assert.equal(out.date, "20260929");
  assert.deepEqual(flat(out.strip), ["football[college-football:1,2]"]);
  assert.deepEqual(out.featured, ["2"]);
});

test("the latest order leads; ids that rolled off stay at the end of their league", () => {
  const am = mergeEspnFrontSnapshot(null, sample("20260929", strip({ football: { "college-football": ["1", "2", "3"] }, baseball: { mlb: ["m1"] } })));
  const pm = mergeEspnFrontSnapshot(am, sample("20260929", strip({ baseball: { mlb: ["m2", "m1"] }, football: { "college-football": ["4", "2"] } })));
  assert.equal(pm.samples, 2);
  assert.deepEqual(flat(pm.strip), ["baseball[mlb:m2,m1]", "football[college-football:4,2,1,3]"]);
});

test("a league or a whole sport that left the strip is kept after the rest", () => {
  const am = mergeEspnFrontSnapshot(null, sample("20260929", strip({ football: { "college-football": ["1"], nfl: ["n1"] }, hockey: { nhl: ["h1"] } })));
  const pm = mergeEspnFrontSnapshot(am, sample("20260929", strip({ football: { "college-football": ["2"] } })));
  assert.deepEqual(flat(pm.strip), ["football[college-football:2,1 nfl:n1]", "hockey[nhl:h1]"]);
});

test("ids and featured dedupe; featured keeps the latest order first", () => {
  const a = mergeEspnFrontSnapshot(null, sample("20260929", strip({ baseball: { mlb: ["1", "2"] } }), ["x", "y"]));
  const b = mergeEspnFrontSnapshot(a, sample("20260929", strip({ baseball: { mlb: ["2", "1"] } }), ["z", "x"]));
  const c = mergeEspnFrontSnapshot(b, sample("20260929", strip({ baseball: { mlb: ["2", "1"] } }), []));
  assert.deepEqual(flat(c.strip), ["baseball[mlb:2,1]"]);
  assert.deepEqual(b.featured, ["z", "x", "y"]);
  assert.deepEqual(c.featured, ["z", "x", "y"]);
  assert.equal(c.samples, 3);
});

test("a new day starts a fresh file", () => {
  const yday = mergeEspnFrontSnapshot(null, sample("20260928", strip({ football: { nfl: ["n1"] } }), ["n1"]));
  const today = mergeEspnFrontSnapshot(yday, sample("20260929", strip({ baseball: { mlb: ["m1"] } })));
  assert.equal(today.samples, 1);
  assert.deepEqual(flat(today.strip), ["baseball[mlb:m1]"]);
  assert.deepEqual(today.featured, []);
});

test("the day key is the ET service day: before 1 AM ET still counts as the day before", () => {
  assert.equal(etServiceYmd(new Date("2026-09-29T16:00:00Z")), "20260929"); // noon EDT
  assert.equal(etServiceYmd(new Date("2026-09-30T04:30:00Z")), "20260929"); // 12:30 am EDT
  assert.equal(etServiceYmd(new Date("2026-09-30T05:10:00Z")), "20260930"); // 1:10 am EDT
  assert.equal(etServiceYmd(new Date("2026-10-01T03:59:00Z")), "20260930"); // 11:59 pm EDT
});
