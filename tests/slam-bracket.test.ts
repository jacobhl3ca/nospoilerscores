import assert from "node:assert/strict";
import test from "node:test";

import { buildRounds, windowFor, type EspnCompetition } from "../src/lib/slamBracket.ts";

// A synthetic 8-player draw with a known-correct shape. ESPN returns a Slam's
// matches in arbitrary order (verified live: neither array order nor competition
// id encodes the draw), so the builder has to rebuild the tree from who beat
// whom. These tests pin that reconstruction.
//
//   QF1 A>B ┐          QF3 E>F ┐
//           ├ SF1 A>C ┐        ├ SF2 E v G (not played)
//   QF2 C>D ┘         ├ Final A v (winner SF2)
//   QF4 G>H ──────────┘
function m(
  id: string,
  round: string,
  date: string,
  a: string,
  b: string,
  winner?: string,
): EspnCompetition {
  const comp = (name: string) => ({
    athlete: name === "TBD" ? { displayName: "TBD" } : { displayName: name, flag: { href: `${name}.png` } },
    winner: winner != null && name === winner,
  });
  return {
    id,
    date,
    round: { displayName: round },
    competitors: [comp(a), comp(b)],
    status: { type: { completed: winner != null } },
  };
}

const DRAW: EspnCompetition[] = [
  m("1", "Quarterfinal", "2026-09-08T15:00Z", "A", "B", "A"),
  m("2", "Quarterfinal", "2026-09-08T17:00Z", "C", "D", "C"),
  m("3", "Quarterfinal", "2026-09-08T19:00Z", "E", "F", "E"),
  m("4", "Quarterfinal", "2026-09-08T21:00Z", "G", "H", "G"),
  m("5", "Semifinal", "2026-09-11T15:00Z", "A", "C", "A"),
  m("6", "Semifinal", "2026-09-11T19:00Z", "E", "G"),
  m("7", "Final", "2026-09-13T18:00Z", "A", "TBD"),
];

const pairs = (rounds: ReturnType<typeof buildRounds>, key: string) =>
  rounds.find((r) => r.key === key)!.matches.map((x) => x.sides.map((s) => s.player?.name ?? "TBD").join("v"));

test("rebuilds the draw tree from results, not from payload order", () => {
  const rounds = buildRounds(DRAW);
  assert.deepEqual(rounds.map((r) => r.key), ["Quarterfinal", "Semifinal", "Final"]);
  // The two quarterfinals feeding SF1 must land in slots 0-1, and SF2's in 2-3.
  assert.deepEqual(pairs(rounds, "Quarterfinal"), ["AvB", "CvD", "EvF", "GvH"]);
  assert.deepEqual(pairs(rounds, "Semifinal"), ["AvC", "EvG"]);
});

test("payload order does not change the rebuilt tree", () => {
  // Rotate + reverse the input; ESPN's array order is not stable across polls,
  // and an order-dependent tree would visibly reshuffle on every refresh.
  const scrambled = [...DRAW.slice(3), ...DRAW.slice(0, 3)].reverse();
  assert.deepEqual(pairs(buildRounds(scrambled), "Quarterfinal"), ["AvB", "CvD", "EvF", "GvH"]);
  assert.deepEqual(pairs(buildRounds(scrambled), "Semifinal"), ["AvC", "EvG"]);
});

test("an undecided slot points at the match that will fill it", () => {
  const rounds = buildRounds(DRAW);
  const final = rounds.find((r) => r.key === "Final")!.matches[0];
  assert.equal(final.sides[0].player?.name, "A");
  assert.equal(final.sides[0].feederPos, undefined);
  // The empty half of the final is the winner of semifinal 2 (index 1).
  assert.equal(final.sides[1].player, undefined);
  assert.equal(final.sides[1].feederPos, 1);
});

test("hasResults marks exactly the rounds that can spoil", () => {
  const rounds = buildRounds(DRAW);
  assert.deepEqual(rounds.map((r) => [r.key, r.hasResults]), [
    ["Quarterfinal", true],
    ["Semifinal", true], // SF1 is final
    ["Final", false],    // not played — showing it spoils nothing
  ]);
});

test("qualifying rounds never enter the main draw", () => {
  const withQualies = [...DRAW, m("q1", "Qualifying Final", "2026-08-22T15:00Z", "X", "Y", "X")];
  assert.deepEqual(buildRounds(withQualies).map((r) => r.key), ["Quarterfinal", "Semifinal", "Final"]);
});

test("a draw with no results yet still renders in a stable order", () => {
  // Day one: nothing has finished, so there are no edges to wire. The builder
  // must fall back to a deterministic order rather than throwing or dropping
  // matches — the R1 matchups are the published draw and are safe to show.
  const day1 = DRAW.slice(0, 4).map((x) => ({ ...x, competitors: x.competitors!.map((c) => ({ ...c, winner: false })), status: { type: { completed: false } } }));
  const rounds = buildRounds(day1);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].hasResults, false);
  assert.deepEqual(pairs(rounds, "Quarterfinal"), ["AvB", "CvD", "EvF", "GvH"]);
});

test("a retired match with no recorded winner does not drop its slot", () => {
  // ESPN occasionally leaves `winner` unset on a retirement/walkover. That match
  // can't be wired, but losing it entirely would silently shrink the bracket.
  const noWinner = DRAW.map((x) => (x.id === "3" ? { ...x, competitors: x.competitors!.map((c) => ({ ...c, winner: false })) } : x));
  assert.equal(buildRounds(noWinner).find((r) => r.key === "Quarterfinal")!.matches.length, 4);
});

test("the fetch window brackets the tournament in both directions", () => {
  assert.equal(windowFor(new Date("2026-09-08T12:00:00Z")), "20260818-20260929");
});
