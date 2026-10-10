import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FEED_SPORTS, RADIO_SPORTS, deniedRadioHost, type RadioSource, type RadioTable } from "../src/lib/radio.ts";

// The shipped station table (public/radio-stations.json). Offline shape and
// safety checks; the live "does every URL still answer" pass is
// scripts/check-radio-stations.mjs (npm run radio:check).

const table: RadioTable = JSON.parse(readFileSync(new URL("../public/radio-stations.json", import.meta.url), "utf8"));

const all: { where: string; s: RadioSource }[] = [
  ...Object.entries(table.teams).flatMap(([k, list]) => list.map((s) => ({ where: k, s }))),
  ...Object.entries(table.national).map(([k, s]) => ({ where: `national:${k}`, s })),
  ...Object.entries(table.leagues).flatMap(([k, l]) => [...(l.free ?? []), ...(l.paid ?? [])].map((s) => ({ where: `league:${k}`, s }))),
  ...Object.entries(table.events ?? {}).flatMap(([k, list]) => list.map((s) => ({ where: `event:${k}`, s }))),
];

// League sizes on ESPN for the 2026-27 seasons. The checker compares the
// actual team ids against ESPN live; this only catches a league dropped whole.
// College counts are the conferences done so far: ncaaf = all FBS, ncaam and
// ncaaw = ACC, Big 12, Big East, Big Ten and SEC.
const TEAMS: Record<string, number> = {
  nfl: 32, mlb: 30, nba: 30, nhl: 32,
  wnba: 15, mls: 30, nwsl: 16, cfl: 9, ufl: 8, ligamx: 18,
  ncaaf: 138, ncaam: 79, ncaaw: 79,
};
// Phase 1 leagues always carry a SiriusXM line; later leagues only where a
// paid product really carries every game.
const PAID_REQUIRED = ["nfl", "mlb", "nba", "nhl"];

test("every row has the full schema", () => {
  assert.ok(all.length > 0);
  for (const { where, s } of all) {
    const at = `${where} ${s.name}`;
    assert.equal(typeof s.name, "string", at);
    assert.ok(s.name.trim(), at);
    assert.match(s.lang, /^[a-z]{2}$/, at);
    assert.match(s.checked, /^\d{4}-\d{2}-\d{2}$/, at);
    assert.ok(["free", "paid"].includes(s.access.cost), at);
    assert.ok(["none", "market", "country"].includes(s.access.geo), at);
    if (s.access.geo === "market") assert.ok(s.access.dma?.length && s.access.dma.every((n) => Number.isInteger(n) && n > 0), `${at}: market needs dma`);
    if (s.access.geo === "country") assert.ok(s.access.countries?.length && s.access.countries.every((c) => /^[A-Z]{2}$/.test(c)), `${at}: country needs countries`);
  }
});

test("https only, and never a denylisted (score-bar) host", () => {
  for (const { where, s } of all) {
    assert.match(s.url, /^https:\/\//, `${where} ${s.name}`);
    assert.equal(deniedRadioHost(s.url), null, `${where} ${s.name} → ${s.url}`);
  }
});

test("every team in the shipped leagues has a row or a written reason, and every row's league is shipped", () => {
  const missing = table.missing ?? {};
  for (const sport of RADIO_SPORTS) {
    const keys = new Set([...Object.keys(table.teams), ...Object.keys(missing)].filter((k) => k.startsWith(`${sport}:`)));
    assert.equal(keys.size, TEAMS[sport], `${sport}: ${keys.size} team keys`);
    for (const k of keys) {
      const hasFree = (table.teams[k] ?? []).some((s) => s.access.cost === "free");
      assert.ok(hasFree || (missing[k] ?? "").trim().length > 10, `${k}: no free row and no reason in "missing"`);
    }
  }
  for (const sport of PAID_REQUIRED) assert.ok(table.leagues[sport]?.paid?.length, `${sport}: needs a paid line`);
  for (const k of Object.keys(missing)) {
    assert.ok(RADIO_SPORTS.has(k.split(":")[0] as never), `missing ${k}: league not in RADIO_SPORTS`);
    assert.match(k, /^[a-z]+:\d+$/, k);
  }
  for (const k of Object.keys(table.teams)) {
    const sport = k.split(":")[0];
    assert.ok(RADIO_SPORTS.has(sport as never), `${k}: league not in RADIO_SPORTS`);
    assert.match(k, /^[a-z]+:\d+$/, k);
  }
});

test("team rows list English first, and teams carry free rows only", () => {
  for (const [k, list] of Object.entries(table.teams)) {
    const firstOther = list.findIndex((s) => s.lang !== "en");
    if (firstOther >= 0) assert.ok(list.slice(firstOther).every((s) => s.lang !== "en"), `${k}: English after another language`);
    assert.ok(list.every((s) => s.access.cost === "free"), `${k}: paid row on a team`);
  }
});

test("feed-only sports (series and event radio) match FEED_SPORTS both ways", () => {
  const withFeeds = new Set([
    ...Object.entries(table.leagues).filter(([, l]) => l.free?.length || l.paid?.length).map(([k]) => k),
    ...Object.keys(table.events ?? {}).map((k) => k.split(":")[0]),
  ].filter((sport) => !RADIO_SPORTS.has(sport as never)));
  assert.deepEqual([...withFeeds].sort(), [...FEED_SPORTS].sort());
  for (const k of Object.keys(table.events ?? {})) {
    // Lowercase, matched as a substring of the event title or venue.
    assert.match(k, /^[a-z0-9]+:[a-z0-9][a-z0-9 .'-]+$/, k);
    assert.ok(table.events![k].length, `${k}: empty event list`);
  }
});

test("ESPN Radio (ERADM) has a national row", () => {
  assert.ok(table.national.ERADM?.url);
});
