import assert from "node:assert/strict";
import test from "node:test";

import { buildNflPicture, type NflStandingsPayload } from "../src/lib/nflPlayoffPicture.ts";
import { pickPlayoffRaceGames, playoffRaceGamesFromScoreboard, type PlayoffRaceGame } from "../src/lib/nflPlayoffRace.ts";

// A Week 15 AFC: every club has played 14. The NFC is all on bye this week.
//   East  a1 11-3, a2 10-4, a3 6-8, a4 3-11 (e)
//   North a5 12-2, a6 8-6, a7 7-7, a8 4-10
//   South a9 9-5, a10 8-6, a11 5-9, a12 2-12 (e)
//   West  a13 10-4, a14 9-5, a15 7-7, a16 5-9
// Seeds: a5 a1 a13 a9 (division leaders), then a2 a14 a6; a10 is first out,
// level with a6 at 8-6.
type Row = [id: string, w: number, l: number, seed: number, clincher?: string];
const AFC: Row[][] = [
  [["a1", 11, 3, 2], ["a2", 10, 4, 5], ["a3", 6, 8, 11], ["a4", 3, 11, 15, "e"]],
  [["a5", 12, 2, 1], ["a6", 8, 6, 7], ["a7", 7, 7, 9], ["a8", 4, 10, 14]],
  [["a9", 9, 5, 4], ["a10", 8, 6, 8], ["a11", 5, 9, 13], ["a12", 2, 12, 16, "e"]],
  [["a13", 10, 4, 3], ["a14", 9, 5, 6], ["a15", 7, 7, 10], ["a16", 5, 9, 12]],
];
const NFC: Row[][] = [0, 1, 2, 3].map((d) => [0, 1, 2, 3].map((i): Row => [`n${d * 4 + i + 1}`, 7, 7, d * 4 + i + 1]));

function payload(rows: Record<string, Partial<{ w: number; l: number; t: number; clincher: string }>> = {}): NflStandingsPayload {
  const conf = (abbreviation: string, divs: Row[][]) => ({
    abbreviation,
    children: divs.map((teams, d) => ({
      name: `${abbreviation} ${["East", "North", "South", "West"][d]}`,
      standings: {
        entries: teams.map(([id, w, l, seed, clincher]) => {
          const o = rows[id] ?? {};
          const c = "clincher" in o ? o.clincher : clincher;
          return {
            team: { id, displayName: id.toUpperCase(), abbreviation: id.toUpperCase() },
            stats: [
              { name: "wins", value: o.w ?? w },
              { name: "losses", value: o.l ?? l },
              { name: "ties", value: o.t ?? 0 },
              { name: "playoffSeed", value: seed },
              ...(c ? [{ name: "clincher", displayValue: c }] : []),
            ],
          };
        }),
      },
    })),
  });
  return { season: 2026, children: [conf("AFC", AFC), conf("NFC", NFC)] };
}

const RECORD = Object.fromEntries(AFC.flat().map(([id, w, l]) => [id, `${w}-${l}`]));

function game(id: string, away: string, home: string, hour: number, state: PlayoffRaceGame["state"] = "pre"): PlayoffRaceGame {
  return {
    id,
    date: `2026-12-20T${String(hour).padStart(2, "0")}:00:00Z`,
    state,
    home: { teamId: home, record: RECORD[home], winner: false },
    away: { teamId: away, record: RECORD[away], winner: false },
  };
}

const SLATE: PlayoffRaceGame[] = [
  game("g6", "a16", "a2", 18), // a2 1 game up in the East, a16 3 back: tightness 1, one club in the race
  game("g1", "a10", "a6", 21), // seed 7 v first out, level: tightness 0, both in the race
  game("g4", "a4", "a14", 18), // a4 eliminated
  game("g2", "a15", "a7", 21), // both 1 game off seed 7
  game("g5", "a8", "a5", 18), // a5 4 up in its division, a8 4 back: no race
  game("g3", "a3", "a1", 17), // a1 1 game up: tightness 1, earliest kickoff of that group
  game("g7", "a11", "a13", 21), // a13 1 game up: tightness 1, latest kickoff
  game("g8", "a12", "a9", 18), // a12 eliminated
];

const picture = buildNflPicture(payload());

test("week 12 gets no tags", () => {
  assert.deepEqual(pickPlayoffRaceGames(SLATE, picture, 12), new Set());
  assert.deepEqual(pickPlayoffRaceGames(SLATE, picture, null), new Set());
});

test("both alive and one within a game: picked", () => {
  assert.deepEqual(pickPlayoffRaceGames([SLATE[0]], picture, 15), new Set(["g6"]));
});

test("one team eliminated: not picked", () => {
  const g4 = SLATE.find((g) => g.id === "g4")!;
  assert.deepEqual(pickPlayoffRaceGames([g4], picture, 15), new Set());
  const g5 = SLATE.find((g) => g.id === "g5")!;
  assert.deepEqual(pickPlayoffRaceGames([g5], picture, 15), new Set(), "no club within a game");
});

test("more than 3 candidates: the 3 tightest, then both in the race, then kickoff", () => {
  assert.deepEqual(pickPlayoffRaceGames(SLATE, picture, 15), new Set(["g1", "g2", "g3"]));
});

test("no standings: no tags", () => {
  assert.deepEqual(pickPlayoffRaceGames(SLATE, null, 15), new Set());
});

test("a result from this week moves nothing", () => {
  // g3 goes final (a3 upsets a1) and g1 is live. The feed and the scoreboard
  // both count g3 now, and an "e" for a7 lands after it. That letter may come
  // from this week's games, so it is not read: the picks hold.
  const after = SLATE.map((g) => g.id !== "g3" ? (g.id === "g1" ? { ...g, state: "in" as const } : g) : {
    ...g,
    state: "post" as const,
    home: { teamId: "a1", record: "11-4", winner: false },
    away: { teamId: "a3", record: "7-8", winner: true },
  });
  const feed = buildNflPicture(payload({ a1: { l: 4 }, a3: { w: 7 }, a7: { clincher: "e" } }));
  assert.deepEqual(pickPlayoffRaceGames(after, feed, 15), new Set(["g1", "g2", "g3"]));
});

test("a stale feed (behind the scoreboard) gives no tags", () => {
  const stale = buildNflPicture(payload({ a6: { w: 7 } }));
  assert.deepEqual(pickPlayoffRaceGames(SLATE, stale, 15), new Set());
});

test("scoreboard parse keeps that week's regular-season games", () => {
  const ev = (id: string, week: number, type = 2) => ({
    id,
    date: "2026-12-20T18:00:00Z",
    week: { number: week },
    season: { type },
    status: { type: { state: "pre" } },
    competitions: [{ competitors: [
      { homeAway: "home", team: { id: "a1" }, records: [{ summary: "11-3" }] },
      { homeAway: "away", team: { id: "a3" }, records: [{ summary: "6-8" }] },
    ] }],
  });
  const games = playoffRaceGamesFromScoreboard({ events: [ev("x", 15), ev("y", 14), ev("z", 15, 1)] }, 15);
  assert.deepEqual(games.map((g) => g.id), ["x"]);
  assert.deepEqual(games[0].home, { teamId: "a1", record: "11-3", winner: false });
});
