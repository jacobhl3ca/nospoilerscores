import assert from "node:assert/strict";
import test from "node:test";

import { buildPicture, type StatsApiRecord } from "../src/lib/playoffPicture.ts";

// Six divisions, three teams each — enough to pin the seeding rules without
// transcribing all thirty clubs. Records are chosen so the AL's best wild card
// (.600) is BETTER than its worst division leader (.550): MLB seeds the three
// division winners 1-3 regardless, and getting that backwards is the classic
// playoff-picture bug.
function tr(id: number, name: string, wins: number, losses: number, extra: Record<string, unknown> = {}) {
  const pct = (wins / (wins + losses)).toFixed(3).replace(/^0/, "");
  return { team: { id, name, abbreviation: name.slice(0, 3).toUpperCase() }, wins, losses, winningPercentage: pct, ...extra };
}

const RECORDS: StatsApiRecord[] = [
  { division: { id: 201 }, lastUpdated: "2026-09-09T02:00:00Z", teamRecords: [
    tr(1, "Alpha", 90, 54, { divisionLeader: true, clinched: true, magicNumber: null, gamesBack: "-" }),
    tr(2, "Bravo", 86, 58, { wildCardGamesBack: "+4.0" }),
    tr(3, "Charlie", 60, 84, { eliminationNumber: "E" }),
  ] },
  { division: { id: 202 }, lastUpdated: "2026-09-09T02:03:00Z", teamRecords: [
    tr(4, "Delta", 79, 65, { divisionLeader: true, magicNumber: "12" }),
    tr(5, "Echo", 78, 66, { wildCardGamesBack: "1.0" }),
    tr(6, "Foxtrot", 70, 74, { wildCardGamesBack: "9.0" }),
  ] },
  { division: { id: 200 }, teamRecords: [
    tr(7, "Golf", 82, 62, { divisionLeader: true, magicNumber: "9" }),
    tr(8, "Hotel", 77, 67, { wildCardGamesBack: "2.0" }),
    tr(9, "India", 55, 89, { eliminationNumber: "E" }),
  ] },
  { division: { id: 204 }, teamRecords: [
    tr(10, "Juliet", 88, 56, { divisionLeader: true }),
    tr(11, "Kilo", 80, 64, {}),
    tr(12, "Lima", 62, 82, { eliminationNumber: "E" }),
  ] },
  { division: { id: 205 }, teamRecords: [
    tr(13, "Mike", 85, 59, { divisionLeader: true }),
    tr(14, "November", 79, 65, {}),
    tr(15, "Oscar", 71, 73, {}),
  ] },
  { division: { id: 203 }, teamRecords: [
    tr(16, "Papa", 83, 61, { divisionLeader: true }),
    tr(17, "Quebec", 76, 68, {}),
    tr(18, "Romeo", 66, 78, {}),
  ] },
];

const al = () => buildPicture(RECORDS, 2026).leagues.find((l) => l.key === "AL")!;
const nl = () => buildPicture(RECORDS, 2026).leagues.find((l) => l.key === "NL")!;

test("division winners take seeds 1-3 even when a wild card has a better record", () => {
  const seeds = al().seeded.map((t) => [t.seed, t.name] as const);
  assert.deepEqual(seeds, [
    [1, "Alpha"],   // 90-54, best division winner
    [2, "Golf"],    // 82-62
    [3, "Delta"],   // 79-65 — still ahead of Bravo at 86-58
    [4, "Bravo"],   // 86-58, best non-winner
    [5, "Echo"],    // 78-66
    [6, "Hotel"],   // 77-67
  ]);
});

test("each league gets exactly six seeds", () => {
  assert.equal(al().seeded.length, 6);
  assert.equal(nl().seeded.length, 6);
});

test("the hunt lists live chasers only, nearest first", () => {
  // AL: Foxtrot (70-74) is the only non-seeded team left alive — Charlie and
  // India are both flagged E.
  assert.deepEqual(al().hunt.map((t) => t.name), ["Foxtrot"]);
  assert.equal(al().hunt.every((t) => !t.eliminated), true);
});

test("an eliminated team never appears in the hunt", () => {
  const names = [...al().hunt, ...nl().hunt].map((t) => t.name);
  for (const out of ["Charlie", "India", "Lima"]) assert.equal(names.includes(out), false);
});

test("teams are split into the right league", () => {
  assert.deepEqual(al().seeded.map((t) => t.league), ["AL", "AL", "AL", "AL", "AL", "AL"]);
  assert.equal(nl().seeded.some((t) => t.league === "AL"), false);
});

test("clinch, magic number and elimination survive the parse", () => {
  const alpha = al().seeded.find((t) => t.name === "Alpha")!;
  assert.equal(alpha.clinched, true);
  assert.equal(alpha.divisionLeader, true);
  const delta = al().seeded.find((t) => t.name === "Delta")!;
  assert.equal(delta.magicNumber, "12");
  assert.equal(delta.eliminated, false);
});

test("the freshest division timestamp is the picture's timestamp", () => {
  assert.equal(buildPicture(RECORDS, 2026).updated, "2026-09-09T02:03:00Z");
});

test("an unknown division is dropped, never guessed into a league", () => {
  const bogus: StatsApiRecord[] = [...RECORDS, { division: { id: 999 }, teamRecords: [tr(99, "Zulu", 99, 45)] }];
  const all = buildPicture(bogus, 2026).leagues.flatMap((l) => [...l.seeded, ...l.hunt]);
  assert.equal(all.some((t) => t.name === "Zulu"), false);
});

test("no records yields empty leagues rather than throwing", () => {
  const empty = buildPicture([], 2026);
  assert.deepEqual(empty.leagues.map((l) => l.seeded.length), [0, 0]);
  assert.equal(empty.updated, null);
});

// ── Playoff odds (ESPN's FanGraphs column) ───────────────────────────────────

import { formatOdds, oddsFromEspn, sortHuntByOdds, type PlayoffOdds } from "../src/lib/playoffPicture.ts";

test("odds labels are whole numbers that never claim 100% or 0% short of the fact", () => {
  assert.equal(formatOdds(85.2, "85.2%"), "85%");
  assert.equal(formatOdds(100, ">99.9%"), ">99%");   // ESPN rounds the value up but not the label
  assert.equal(formatOdds(99.9, "99.9%"), ">99%");
  assert.equal(formatOdds(100, "100.0%"), "100%");
  assert.equal(formatOdds(0, "<0.1%"), "<1%");
  assert.equal(formatOdds(0.4, "0.4%"), "<1%");
  assert.equal(formatOdds(0, "0.0%"), "0%");
  assert.equal(formatOdds(undefined, "7.0%"), "7%");
  assert.equal(formatOdds(undefined, ""), null);
});

test("odds are walked out of ESPN's nested standings and keyed by MLB's abbreviations", () => {
  const entry = (abbreviation: string, value: number, displayValue: string) => ({
    team: { abbreviation },
    stats: [{ name: "gamesBehind", displayValue: "-" }, { name: "playoffPercent", value, displayValue }],
  });
  const odds = oddsFromEspn({
    children: [
      { children: [{ standings: { entries: [entry("ARI", 38.5, "38.5%"), entry("CHW", 85.2, "85.2%")] } }] },
      { standings: { entries: [entry("NYY", 100, ">99.9%"), { team: { abbreviation: "SEA" }, stats: [{ name: "gamesBehind" }] }] } },
    ],
  });
  assert.deepEqual(odds, {
    AZ: { pct: 38.5, label: "39%" },
    CWS: { pct: 85.2, label: "85%" },
    NYY: { pct: 100, label: ">99%" },
  }); // SEA has no odds stat → absent, never "0%"
});

test("the chase sorts by odds, keeps standings order on ties, and is untouched without odds", () => {
  const hunt = nl().hunt; // standings order: Oscar (71-73), Romeo (66-78)
  assert.deepEqual(hunt.map((t) => t.name), ["Oscar", "Romeo"]);
  const odds: PlayoffOdds = { OSC: { pct: 2, label: "2%" }, ROM: { pct: 7, label: "7%" } };
  assert.deepEqual(sortHuntByOdds(hunt, odds).map((t) => t.name), ["Romeo", "Oscar"]);
  assert.deepEqual(sortHuntByOdds(hunt, { OSC: { pct: 7, label: "7%" }, ROM: { pct: 7, label: "7%" } }).map((t) => t.name), ["Oscar", "Romeo"]);
  assert.deepEqual(sortHuntByOdds(hunt, null).map((t) => t.name), ["Oscar", "Romeo"]);
  // A club with no published number sinks below every club that has one.
  assert.deepEqual(sortHuntByOdds(hunt, { ROM: { pct: 1, label: "1%" } }).map((t) => t.name), ["Romeo", "Oscar"]);
  // The seeds are never re-sorted: that order IS the seeding.
  assert.deepEqual(nl().seeded.map((t) => t.seed), [1, 2, 3, 4, 5, 6]);
});
