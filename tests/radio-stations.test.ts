import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RADIO_SPORTS, deniedRadioHost, type RadioSource, type RadioTable } from "../src/lib/radio.ts";

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
const TEAMS: Record<string, number> = { nfl: 32, mlb: 30, nba: 30, nhl: 32 };

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

test("every team in the shipped leagues has a row, and every row's league is shipped", () => {
  for (const sport of RADIO_SPORTS) {
    const keys = Object.keys(table.teams).filter((k) => k.startsWith(`${sport}:`));
    assert.equal(keys.length, TEAMS[sport], `${sport}: ${keys.length} team keys`);
    assert.ok(table.leagues[sport]?.paid?.length, `${sport}: needs a paid line`);
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

test("ESPN Radio (ERADM) has a national row", () => {
  assert.ok(table.national.ERADM?.url);
});
