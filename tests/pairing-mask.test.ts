// Finals pairings that name an earlier round's winners stay behind a
// "Show teams" tap (src/lib/pairingMask.ts). Real ESPN events from
// tests/fixtures; the NRL Grand Final is the prelim fixture moved to week 4,
// the way ESPN files it (event 604845, read 2026-09-27).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
type G = { sport: string; isPlayoff: boolean; playoffLabel: string | null };
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => G;
  aflFinalsLabel: (headline: string) => string;
}>("../src/lib/espn.ts");
const { pairingSpoilsEarlierRound } = await jiti.import<{
  pairingSpoilsEarlierRound: (g: G) => boolean;
}>("../src/lib/pairingMask.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const nrlWeek = (week: number) => {
  const ev = fixture("nrl-prelim-final-event.json");
  ev.week = { number: week };
  return espn.parseGame(ev, "nrl");
};

test("NRL: finals week 1 shows its teams, every later round masks", () => {
  assert.equal(pairingSpoilsEarlierRound(nrlWeek(1)), false);
  for (const [week, label] of [[2, "Semi-Final"], [3, "Preliminary Final"], [4, "Grand Final"]] as const) {
    const g = nrlWeek(week);
    assert.equal(g.playoffLabel, label);
    assert.equal(pairingSpoilsEarlierRound(g), true, label);
  }
});

test("NRL regular season never masks", () => {
  assert.equal(pairingSpoilsEarlierRound(espn.parseGame(fixture("nrl-round27-event.json"), "nrl")), false);
});

test("AFL finals labels keep the round and drop the team names", () => {
  assert.equal(espn.aflFinalsLabel("GF - Dockers vs Lions"), "Grand Final");
  assert.equal(espn.aflFinalsLabel("QF2 - Swans vs Lions"), "Qualifying Final");
  assert.equal(espn.aflFinalsLabel("EF2 - Crows vs Bulldogs"), "Elimination Final");
  assert.equal(espn.aflFinalsLabel("SF2 - Lions vs Crows"), "Semi-Final");
  assert.equal(espn.aflFinalsLabel("PF1 - Hawks vs Lions"), "Preliminary Final");
  assert.equal(espn.aflFinalsLabel("Hawks vs Lions"), "Finals", "an unknown shape never passes team names through");
  const gf = espn.parseGame(fixture("afl-grand-final-event.json"), "afl");
  assert.equal(gf.playoffLabel, "Grand Final");
  assert.equal(pairingSpoilsEarlierRound(gf), true);
});

test("AFL: wildcard and qualifying finals are ladder-seeded, elimination finals on mask", () => {
  const g = (playoffLabel: string) => ({ sport: "afl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("Wildcard Round")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Qualifying Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Elimination Final")), true);
  assert.equal(pairingSpoilsEarlierRound(g("Finals")), true, "unknown round masks");
});

test("CFL: division semi-finals show, division finals and the Grey Cup mask", () => {
  const g = (playoffLabel: string | null) => ({ sport: "cfl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("Eastern Semi-Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Western Semi-Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Eastern Final")), true);
  assert.equal(pairingSpoilsEarlierRound(g("112th Grey Cup")), true);
  assert.equal(pairingSpoilsEarlierRound(g(null)), true, "a playoff game with no title masks");
  assert.equal(pairingSpoilsEarlierRound({ sport: "cfl", isPlayoff: false, playoffLabel: null }), false);
});

test("other leagues' playoffs are untouched", () => {
  assert.equal(pairingSpoilsEarlierRound({ sport: "nfl", isPlayoff: true, playoffLabel: "Super Bowl" }), false);
  assert.equal(pairingSpoilsEarlierRound({ sport: "mlb", isPlayoff: true, playoffLabel: "World Series" }), false);
});
