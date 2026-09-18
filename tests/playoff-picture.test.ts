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

import { formatOdds, oddsFromEspn } from "../src/lib/playoffPicture.ts";

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
  assert.deepEqual(odds, { AZ: "39%", CWS: "85%", NYY: ">99%" }); // SEA has no odds stat → absent, never "0%"
});

// ── Hunt order (2026-09-13) ──────────────────────────────────────────────────

import { HUNT_LIMIT, oddsValue, orderHunt } from "../src/lib/playoffPicture.ts";

test("odds labels sort as numbers, with the capped labels on the right side", () => {
  assert.ok(oddsValue(">99%") > oddsValue("99%"));
  assert.ok(oddsValue("<1%") > oddsValue("0%"));
  assert.ok(oddsValue("1%") > oddsValue("<1%"));
  assert.equal(oddsValue(null), -1);
});

test("the hunt is ordered by playoff odds, record only breaks a tie, cut to the limit", () => {
  const team = (id: number, name: string, abbrev: string, wins: number, losses: number) => ({
    id, name, abbrev, league: "AL" as const, division: "AL East", wins, losses,
    pct: (wins / (wins + losses)).toFixed(3), seed: null, divisionLeader: false, clinched: false,
    gamesBack: "-", wildCardGamesBack: "-", magicNumber: null, eliminated: false,
  });
  // Record order: TOR, TEX, BAL, MIN, DET, SEA. Odds order differs.
  const hunt = [
    team(1, "Toronto", "TOR", 74, 75), team(2, "Texas", "TEX", 73, 76), team(3, "Baltimore", "BAL", 72, 77),
    team(4, "Minnesota", "MIN", 70, 78), team(5, "Detroit", "DET", 70, 79), team(6, "Seattle", "SEA", 70, 79),
  ];
  const odds = { TOR: "35%", TEX: "24%", BAL: "4%", MIN: "2%", DET: "<1%", SEA: "7%" };
  assert.deepEqual(orderHunt(hunt, odds).map((t) => t.abbrev), ["TOR", "TEX", "SEA", "BAL"]);
  assert.equal(HUNT_LIMIT, 4);
  // No odds yet (feed down): falls back to record order, still capped.
  assert.deepEqual(orderHunt(hunt, null).map((t) => t.abbrev), ["TOR", "TEX", "BAL", "MIN"]);
  // Equal odds → record decides; a club with no label goes last.
  assert.deepEqual(
    orderHunt(hunt, { TOR: "5%", TEX: "5%", BAL: "5%", MIN: "5%", DET: "5%" }).map((t) => t.abbrev),
    ["TOR", "TEX", "BAL", "MIN"],
  );
});
