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
  // SEA publishes no odds stat at all → absent, never a fabricated "0%".
  assert.deepEqual(Object.keys(odds).sort(), ["AZ", "CWS", "NYY"]);
  assert.equal(odds.AZ.playoff?.label, "39%");
  assert.equal(odds.CWS.playoff?.label, "85%");
  assert.equal(odds.NYY.playoff?.label, ">99%");
  assert.equal(odds.AZ.division, null); // the column reads "—", not 0%
});

test("all three odds come back with a sortable value beside the clamped label", () => {
  const odds = oddsFromEspn({
    standings: { entries: [
      { team: { abbreviation: "TOR" }, stats: [
        { name: "playoffPercent", value: 4.7, displayValue: "4.7%" },
        { name: "divisionPercent", value: 0, displayValue: "0.0%" },
        { name: "wildCardPercent", value: 4.7, displayValue: "4.7%" },
      ] },
      { team: { abbreviation: "DET" }, stats: [
        { name: "playoffPercent", value: 0, displayValue: "<0.1%" },
        { name: "divisionPercent", value: 100, displayValue: ">99.9%" },
        { name: "wildCardPercent", value: 0, displayValue: "0.0%" },
      ] },
    ] },
  });
  assert.deepEqual(odds.TOR, {
    playoff: { value: 4.7, label: "5%" },
    division: { value: 0, label: "0%" },
    wildCard: { value: 4.7, label: "5%" },
  });
  // The clamped edges survive as labels while the raw value stays sortable.
  assert.equal(odds.DET.playoff?.label, "<1%");
  assert.equal(odds.DET.playoff?.value, 0);
  assert.equal(odds.DET.division?.label, ">99%");
  assert.equal(odds.DET.division?.value, 100);
});

// ── Elimination: MLB publishes two numbers, not one ──────────────────────────

import { buildBracket, sortTeams, type PlayoffOdds, type PlayoffTeam } from "../src/lib/playoffPicture.ts";

// Toronto on 2026-09-20: out of the AL East, still 4.7% to take a wild card.
// Reading only `eliminationNumber` hid them from "Still alive" entirely.
const TWO_NUMBERS: StatsApiRecord[] = [
  { division: { id: 201 }, teamRecords: [
    tr(1, "Alpha", 94, 60, { divisionLeader: true, clinchIndicator: "x" }),
    tr(2, "Bravo", 89, 65, { eliminationNumber: "4", wildCardEliminationNumber: "-" }),
    tr(3, "Toronto", 76, 79, { eliminationNumber: "E", wildCardEliminationNumber: "5" }),
    tr(4, "Kansas", 67, 88, { eliminationNumber: "E", wildCardEliminationNumber: "E" }),
  ] },
  // Three more healthy non-leaders, so Toronto and Kansas sit outside the six
  // and the hunt is the thing under test.
  { division: { id: 202 }, teamRecords: [
    tr(5, "Echo", 88, 66, { divisionLeader: true }),
    tr(7, "EchoTwo", 85, 70, {}),
    tr(8, "EchoThree", 84, 71, {}),
  ] },
  { division: { id: 200 }, teamRecords: [
    tr(6, "Golf", 87, 68, { divisionLeader: true }),
    tr(9, "GolfTwo", 83, 72, {}),
  ] },
];
const twoNumbersAl = () => buildPicture(TWO_NUMBERS, 2026).leagues.find((l) => l.key === "AL")!;

test("a team out of its division but alive on the wild card stays in the hunt", () => {
  const league = twoNumbersAl();
  const tor = [...league.seeded, ...league.hunt].find((t) => t.name === "Toronto")!;
  assert.equal(tor.eliminated, false);
  assert.equal(league.hunt.some((t) => t.name === "Toronto"), true);
});

test("a team out of both races is eliminated", () => {
  const league = twoNumbersAl();
  assert.equal(league.hunt.some((t) => t.name === "Kansas"), false);
  assert.equal(league.seeded.some((t) => t.name === "Kansas"), false);
});

test("the hunt is uncapped — the panel decides how many rows fit, not the data", () => {
  const many: StatsApiRecord[] = [
    { division: { id: 201 }, teamRecords: [
      tr(1, "Alpha", 94, 60, { divisionLeader: true }),
      ...["Chase1", "Chase2", "Chase3", "Chase4", "Chase5", "Chase6", "Chase7", "Chase8"].map((n, i) =>
        tr(10 + i, n, 80 - i, 75 + i, { wildCardEliminationNumber: "9" })),
    ] },
    { division: { id: 202 }, teamRecords: [tr(5, "Echo", 81, 74, { divisionLeader: true })] },
    { division: { id: 200 }, teamRecords: [tr(6, "Golf", 82, 73, { divisionLeader: true })] },
  ];
  const league = buildPicture(many, 2026).leagues.find((l) => l.key === "AL")!;
  assert.equal(league.hunt.length, 5); // 8 chasers, 3 of them took seeds 4-6
});

// ── Clinch letters ───────────────────────────────────────────────────────────

test("each clinchIndicator maps to the thing that was actually clinched", () => {
  const records: StatsApiRecord[] = [
    { division: { id: 201 }, teamRecords: [
      tr(1, "Berth", 94, 60, { divisionLeader: true, clinchIndicator: "x" }),
      tr(2, "Division", 93, 61, { clinchIndicator: "y" }),
      tr(3, "Bye", 92, 62, { clinchIndicator: "z" }),
      tr(4, "WildCard", 91, 63, { clinchIndicator: "w" }),
      tr(5, "Nothing", 90, 64, {}),
    ] },
    { division: { id: 202 }, teamRecords: [tr(6, "Echo", 80, 75, { divisionLeader: true })] },
    { division: { id: 200 }, teamRecords: [tr(7, "Golf", 79, 76, { divisionLeader: true })] },
  ];
  const league = buildPicture(records, 2026).leagues.find((l) => l.key === "AL")!;
  const by = (n: string) => [...league.seeded, ...league.hunt].find((t) => t.name === n)!;
  assert.equal(by("Berth").clinch, "berth");
  assert.equal(by("Division").clinch, "division");
  assert.equal(by("Bye").clinch, "bye");
  assert.equal(by("WildCard").clinch, "wildcard");
  assert.equal(by("Nothing").clinch, null);
  // An indicator is itself proof of a clinch, whatever the `clinched` flag says.
  assert.equal(by("Bye").clinched, true);
  assert.equal(by("Nothing").clinched, false);
});

// ── Sorting ──────────────────────────────────────────────────────────────────

const odd = (value: number) => ({ value, label: `${Math.round(value)}%` });
// AL seeds: Alpha 1, Golf 2, Delta 3, Bravo 4, Echo 5, Hotel 6. Foxtrot chases.
const SORT_ODDS: PlayoffOdds = {
  ALP: { playoff: odd(99), division: odd(90), wildCard: odd(9) },
  GOL: { playoff: odd(70), division: odd(60), wildCard: odd(10) },
  DEL: { playoff: odd(30), division: odd(12), wildCard: odd(18) },
  BRA: { playoff: odd(80), division: odd(5), wildCard: odd(75) },
  ECH: { playoff: odd(55), division: odd(12), wildCard: odd(43) },
  HOT: { playoff: odd(40), division: odd(3), wildCard: odd(37) },
  // FOX is deliberately absent: an unpublished club must sort last either way.
};

const alTeams = (): PlayoffTeam[] => { const l = al(); return [...l.seeded, ...l.hunt]; };
const names = (ts: PlayoffTeam[]) => ts.map((t) => t.name);

test("sorting by seed counts up, and unseeded teams land after the six either way", () => {
  assert.deepEqual(names(sortTeams(alTeams(), SORT_ODDS, "seed", "asc")),
    ["Alpha", "Golf", "Delta", "Bravo", "Echo", "Hotel", "Foxtrot"]);
  assert.deepEqual(names(sortTeams(alTeams(), SORT_ODDS, "seed", "desc")),
    ["Hotel", "Echo", "Bravo", "Delta", "Golf", "Alpha", "Foxtrot"]);
});

test("sorting by an odds column orders by the number and flips cleanly", () => {
  assert.deepEqual(names(sortTeams(alTeams(), SORT_ODDS, "playoff", "desc")),
    ["Alpha", "Bravo", "Golf", "Echo", "Hotel", "Delta", "Foxtrot"]);
  assert.deepEqual(names(sortTeams(alTeams(), SORT_ODDS, "playoff", "asc")),
    ["Delta", "Hotel", "Echo", "Golf", "Bravo", "Alpha", "Foxtrot"]);
  assert.deepEqual(names(sortTeams(alTeams(), SORT_ODDS, "wildCard", "desc")),
    ["Bravo", "Echo", "Hotel", "Delta", "Golf", "Alpha", "Foxtrot"]);
});

test("a tie on the sorted column falls back to seed order, not to feed order", () => {
  // Delta (seed 3) and Echo (seed 5) both sit at 12% to win the division.
  const desc = names(sortTeams(alTeams(), SORT_ODDS, "division", "desc"));
  const asc = names(sortTeams(alTeams(), SORT_ODDS, "division", "asc"));
  assert.equal(desc.indexOf("Delta") < desc.indexOf("Echo"), true);
  assert.equal(asc.indexOf("Delta") < asc.indexOf("Echo"), true);
});

test("sorting with no odds at all keeps a stable seed order rather than throwing", () => {
  assert.deepEqual(names(sortTeams(alTeams(), null, "playoff", "desc")),
    ["Alpha", "Golf", "Delta", "Bravo", "Echo", "Hotel", "Foxtrot"]);
});

// ── Bracket ──────────────────────────────────────────────────────────────────

test("the bracket pairs 3 v 6 into the 2 seed and 4 v 5 into the 1 seed", () => {
  const b = buildBracket(al());
  const m = (k: string) => b.matchups.find((x) => x.key === k)!;
  assert.equal(b.league, "AL");
  assert.deepEqual(m("wc-a").sides.map((s) => s.seed), [3, 6]);
  assert.deepEqual(m("wc-a").sides.map((s) => s.team?.name), ["Delta", "Hotel"]);
  assert.deepEqual(m("wc-b").sides.map((s) => s.seed), [4, 5]);
  assert.deepEqual(m("wc-b").sides.map((s) => s.team?.name), ["Bravo", "Echo"]);
  // The 2 seed waits on the 3 v 6 winner; the 1 seed waits on 4 v 5.
  assert.equal(m("ds-a").sides[0].team?.name, "Golf");
  assert.equal(m("ds-a").sides[1].from, "wc-a");
  assert.equal(m("ds-b").sides[0].team?.name, "Alpha");
  assert.equal(m("ds-b").sides[1].from, "wc-b");
  assert.deepEqual(m("cs").sides.map((s) => s.from), ["ds-a", "ds-b"]);
});

test("the bracket carries the right best-of per round and never invents a result", () => {
  const b = buildBracket(al());
  assert.deepEqual(b.matchups.map((m) => m.bestOf), [3, 3, 5, 5, 7]);
  // Every seat past the wild-card round is a winner seat, still empty.
  const later = b.matchups.filter((m) => m.round !== "wildCard").flatMap((m) => m.sides);
  assert.equal(later.filter((s) => s.from !== null).every((s) => s.team === null), true);
});

// ── Who is chasing which seat ────────────────────────────────────────────────

import { contendersBySeed } from "../src/lib/playoffPicture.ts";

// One published probability, shaped the way oddFrom builds them.
const pct = (n: number): PlayoffOdds[string][keyof PlayoffOdds[string]] => ({ value: n, label: `${n}%` });
const oddsFor = (rows: Record<string, [number, number, number]>): PlayoffOdds =>
  Object.fromEntries(Object.entries(rows).map(([ab, [p, d, w]]) => [ab, { playoff: pct(p), division: pct(d), wildCard: pct(w) }]));

// In the shared fixture the AL hunt is exactly Foxtrot (70-74, AL Central),
// whose division leader is Delta at the 3 seat and whose wild-card road ends at
// Hotel's 6 seat. That is both roads in one club, which is what this needs.
const chaseAl = (odds: PlayoffOdds | null, league = al()) => contendersBySeed(league, odds);

test("a chaser sits with the division leader when the division is its better road", () => {
  const seats = chaseAl(oddsFor({ FOX: [25, 20, 5] }));
  assert.deepEqual([...seats.keys()], [3]);                       // Delta's seat
  assert.deepEqual(seats.get(3)!.map((t) => t.name), ["Foxtrot"]);
});

test("a chaser with no division road left sits with the last wild card still open", () => {
  const seats = chaseAl(oddsFor({ FOX: [5, 0, 5] }));
  assert.deepEqual([...seats.keys()], [6]);                       // Hotel's seat
  assert.deepEqual(seats.get(6)!.map((t) => t.name), ["Foxtrot"]);
});

test("a clinched seat takes no chasers — that spot is settled", () => {
  // Clinch the 6 seat and the chase moves up to the next seat still open.
  const league = al();
  league.seeded.find((t) => t.seed === 6)!.clinched = true;
  const seats = contendersBySeed(league, oddsFor({ FOX: [5, 0, 5] }));
  assert.deepEqual([...seats.keys()], [5]);                       // Echo's seat
});

test("a chaser out of both races is left off the bracket entirely", () => {
  assert.equal(chaseAl(oddsFor({ FOX: [0, 0, 0] })).size, 0);
});

test("with no odds published the elimination numbers still place the chase", () => {
  const league = al();
  const fox = league.hunt.find((t) => t.name === "Foxtrot")!;
  assert.equal(chaseAl(null, league).get(3)?.[0]?.name, "Foxtrot"); // division road open
  fox.divisionEliminated = true;
  assert.equal(chaseAl(null, league).get(6)?.[0]?.name, "Foxtrot"); // only the wild card left
});

test("two clubs after the same seat are listed best chance first", () => {
  const records: StatsApiRecord[] = [
    { division: { id: 201 }, teamRecords: [tr(1, "Alpha", 94, 60, { divisionLeader: true })] },
    { division: { id: 202 }, teamRecords: [tr(2, "Echo", 90, 64, { divisionLeader: true })] },
    { division: { id: 200 }, teamRecords: [
      tr(3, "Golf", 88, 66, { divisionLeader: true }),
      tr(4, "Seed4", 87, 67, {}),
      tr(5, "Seed5", 86, 68, {}),
      tr(6, "Seed6", 85, 69, {}),
      // Nearer on the field, worse on the odds — the sort follows the odds.
      tr(7, "Near", 84, 70, { wildCardEliminationNumber: "9" }),
      tr(8, "Far", 80, 74, { wildCardEliminationNumber: "9" }),
    ] },
  ];
  const league = buildPicture(records, 2026).leagues.find((l) => l.key === "AL")!;
  const seats = contendersBySeed(league, oddsFor({ NEA: [10, 0, 10], FAR: [30, 0, 30] }));
  assert.deepEqual(seats.get(6)!.map((t) => t.name), ["Far", "Near"]);
});

test("a division elimination closes only the division road, not the wild card", () => {
  const league = al();
  league.hunt.find((t) => t.name === "Foxtrot")!.divisionEliminated = true;
  const seats = contendersBySeed(league, oddsFor({ FOX: [5, 20, 5] }));
  // 20% division beats 5% wild card on the number, but that road is shut.
  assert.deepEqual([...seats.keys()], [6]);
});
