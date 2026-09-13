import assert from "node:assert/strict";
import test from "node:test";

import { MIN_RANK_GAMES, gamesPlayed, rankFromStandings, tooEarlyToRank } from "../src/lib/standingsRank.ts";

type Rec = { id: string; w: number; l: number; t?: number; pts?: number; rank?: number; gp?: number };

// Division-split payload (NFL/NBA shape): no `gamesPlayed`, no per-row `rank`,
// and the tie-broken order inside a group is ESPN's listing order.
function split(recs: Rec[], metric: "winPercent" | "points" = "winPercent") {
  const entry = (r: Rec) => ({
    team: { id: r.id },
    stats: [
      { name: "wins", value: r.w },
      { name: "losses", value: r.l },
      ...(r.t != null ? [{ name: "ties", value: r.t }] : []),
      ...(metric === "winPercent"
        ? [{ name: "winPercent", value: r.w + r.l + (r.t ?? 0) ? r.w / (r.w + r.l + (r.t ?? 0)) : 0 }]
        : [{ name: "points", value: r.pts ?? 0 }]),
      ...(r.gp != null ? [{ name: "gamesPlayed", value: r.gp }] : []),
    ],
  });
  const half = Math.ceil(recs.length / 2);
  return {
    children: [
      { standings: { entries: recs.slice(0, half).map(entry) } },
      { standings: { entries: recs.slice(half).map(entry) } },
    ],
  };
}

// Single-table payload (EPL/UCL shape): ESPN's own `rank` is the position.
function table(recs: Rec[]) {
  return {
    standings: {
      entries: recs.map((r) => ({
        team: { id: r.id },
        stats: [
          { name: "gamesPlayed", value: r.gp ?? r.w + r.l + (r.t ?? 0) },
          { name: "rank", value: r.rank ?? 0 },
          { name: "points", value: r.pts ?? 0 },
        ],
      })),
    },
  };
}

// 2026-09-13 reality: 49ers + Seahawks 1-0, Patriots + Rams 0-1, the other 28
// at 0-0. Lions rendered "#22" — pure listing order. Nothing should show.
test("NFL week 1: no rank while the median team has played fewer than 4 games", () => {
  const recs: Rec[] = [{ id: "sf", w: 1, l: 0 }, { id: "sea", w: 1, l: 0 }, { id: "ne", w: 0, l: 1 }, { id: "lar", w: 0, l: 1 }];
  for (let i = 0; i < 28; i++) recs.push({ id: `t${i}`, w: 0, l: 0 });
  assert.equal(tooEarlyToRank("nfl", split(recs).children.flatMap((c) => c.standings.entries)), true);
  assert.equal(rankFromStandings("nfl", split(recs)).size, 0);
});

test("NFL week 5: ranks appear once the median team has 4 games", () => {
  const recs: Rec[] = [];
  for (let i = 0; i < 32; i++) recs.push({ id: `t${i}`, w: i % 5, l: 4 - (i % 5) });
  const ranks = rankFromStandings("nfl", split(recs));
  assert.equal(ranks.size, 32);
  assert.equal(ranks.get("t4"), 1); // 4-0
  assert.equal(ranks.get("t0"), 32 - 6); // first of the seven 0-4 teams
});

test("a lone postponed team does not hold the whole league at zero", () => {
  const recs: Rec[] = [{ id: "bye", w: 0, l: 0 }];
  for (let i = 0; i < 31; i++) recs.push({ id: `t${i}`, w: 2, l: 2 });
  assert.equal(tooEarlyToRank("nfl", split(recs).children.flatMap((c) => c.standings.entries)), false);
});

// The pre-fix defect: 0-1 Patriots sat at #18, above 0-0 teams, because both
// are .000 and the sort was stable on listing order.
test("equal win%: fewer losses first", () => {
  const recs: Rec[] = [
    { id: "lossFirst", w: 0, l: 5 },
    { id: "unplayed", w: 0, l: 4 },
    { id: "moreGames", w: 3, l: 3 },
    { id: "fewerGames", w: 2, l: 2 },
  ];
  const ranks = rankFromStandings("nfl", split(recs));
  assert.deepEqual(
    [...ranks.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
    ["fewerGames", "moreGames", "unplayed", "lossFirst"],
  );
});

test("NHL ranks on points once 15 games are in", () => {
  const recs: Rec[] = [];
  for (let i = 0; i < 32; i++) recs.push({ id: `t${i}`, w: 8, l: 7, pts: 10 + i });
  const ranks = rankFromStandings("nhl", split(recs, "points"));
  assert.equal(ranks.get("t31"), 1);
  assert.equal(ranks.get("t0"), 32);
});

test("single-table soccer trusts ESPN's rank but still waits for matchday 6", () => {
  const early: Rec[] = [];
  for (let i = 0; i < 20; i++) early.push({ id: `c${i}`, w: 0, l: 0, gp: 4, rank: i + 1, pts: 20 - i });
  assert.equal(rankFromStandings("epl", table(early)).size, 0);
  const later = early.map((r) => ({ ...r, gp: 6 }));
  const ranks = rankFromStandings("epl", table(later));
  assert.equal(ranks.size, 20);
  assert.equal(ranks.get("c0"), 1);
  assert.equal(ranks.get("c19"), 20);
});

test("a league with no threshold ranks from game one", () => {
  const recs: Rec[] = [{ id: "a", w: 1, l: 0 }, { id: "b", w: 0, l: 1 }];
  assert.equal(MIN_RANK_GAMES.libertadores, undefined);
  assert.equal(tooEarlyToRank("libertadores", split(recs).children.flatMap((c) => c.standings.entries)), false);
});

test("gamesPlayed falls back to the record when ESPN omits it", () => {
  assert.equal(gamesPlayed({ stats: [{ name: "wins", value: 3 }, { name: "losses", value: 2 }, { name: "ties", value: 1 }] }), 6);
  assert.equal(gamesPlayed({ stats: [{ name: "gamesPlayed", value: 9 }, { name: "wins", value: 1 }] }), 9);
  assert.equal(gamesPlayed({ stats: [{ name: "points", value: 9 }] }), null);
});

test("every RANK_LEAGUES team sport except the group-stage cups has a threshold", () => {
  for (const s of ["nfl", "nba", "wnba", "mlb", "nhl", "ncaam", "ncaaw", "ncaaf", "epl", "mls", "ucl", "uel",
    "laliga", "seriea", "bundesliga", "ligue1", "ligamx", "nwsl", "efl", "saudi"] as const) {
    assert.ok((MIN_RANK_GAMES[s] ?? 0) > 0, `${s} has no early-season threshold`);
  }
});
