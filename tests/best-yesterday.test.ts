import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { Game, Sport, Team } from "../src/lib/types.ts";
import {
  BEST_YESTERDAY_COUNT,
  BEST_YESTERDAY_LABEL,
  BEST_YESTERDAY_MAX_PER_LEAGUE,
  bestYesterdaySourceSports,
  isFinishedGame,
  prevYmd,
  rankBestYesterday,
} from "../src/lib/bestYesterday.ts";

function team(id: string): Team {
  return { id, abbreviation: id.toUpperCase(), displayName: id, shortDisplayName: id, logo: "", color: "000", score: "", winner: false, record: "", rank: null };
}

// A finished game from last night. `rating` is the only thing the ranking reads
// off the game itself; the score fields stay empty on purpose.
function game(over: Partial<Game> & { id: string; sport: Sport }): Game {
  return {
    date: "2026-09-22T23:00:00Z",
    name: "", shortName: "", state: "post", statusDetail: "Final", clock: "", period: 9, completed: true,
    homeTeam: team(`${over.id}h`), awayTeam: team(`${over.id}a`), broadcasts: [], venue: "", rating: 50,
    seriesNote: null, isPlayoff: false, isPreseason: false, playoffLabel: null, seriesStatus: null,
    recapUrl: null, streamUrl: null, primeStreamUrl: null,
    ...over,
  };
}

const withClip = () => true;

// 12 finished games across 4 leagues — the plan's acceptance fixture.
const SLATE: Game[] = [
  game({ id: "mlb1", sport: "mlb", rating: 97 }),
  game({ id: "mlb2", sport: "mlb", rating: 91 }),
  game({ id: "mlb3", sport: "mlb", rating: 88 }),
  game({ id: "mlb4", sport: "mlb", rating: 86 }), // 4th MLB: over the per-league cap
  game({ id: "nfl1", sport: "nfl", rating: 95 }),
  game({ id: "nfl2", sport: "nfl", rating: 62 }),
  game({ id: "nfl3", sport: "nfl", rating: 40 }),
  game({ id: "wnba1", sport: "wnba", rating: 91 }), // ties mlb2 on rating
  game({ id: "wnba2", sport: "wnba", rating: 55 }),
  game({ id: "epl1", sport: "epl", rating: 70 }),
  game({ id: "epl2", sport: "epl", rating: 68 }),
  game({ id: "epl3", sport: "epl", rating: 30 }),
];
const ORDER: Sport[] = ["nfl", "mlb", "wnba", "epl"];

test("12 finished games, 4 leagues → the expected top 5", () => {
  const top5 = rankBestYesterday(SLATE, { leagueOrder: ORDER, hasClip: withClip, count: 5 });
  // Rating first; the 91-91 tie goes to the league the user ranks higher
  // (MLB before WNBA); the 4th MLB game never makes it past the cap.
  assert.deepEqual(top5.map((g) => g.id), ["mlb1", "nfl1", "mlb2", "wnba1", "mlb3"]);
});

test("the full column: 8 cards, never more than 3 from one league", () => {
  const col = rankBestYesterday(SLATE, { leagueOrder: ORDER, hasClip: withClip });
  assert.equal(col.length, BEST_YESTERDAY_COUNT);
  assert.equal(BEST_YESTERDAY_COUNT, 8);
  assert.equal(BEST_YESTERDAY_MAX_PER_LEAGUE, 3);
  assert.deepEqual(col.map((g) => g.id), ["mlb1", "nfl1", "mlb2", "wnba1", "mlb3", "epl1", "epl2", "nfl2"]);
  const perLeague = new Map<string, number>();
  for (const g of col) perLeague.set(g.sport, (perLeague.get(g.sport) ?? 0) + 1);
  assert.ok([...perLeague.values()].every((n) => n <= 3));
  assert.ok(!col.some((g) => g.id === "mlb4"), "the 4th MLB game is held out even with room left");
});

test("a game with nothing to play never makes the column, however good it was", () => {
  const noClip = new Set(["mlb1", "nfl1"]);
  const col = rankBestYesterday(SLATE, { leagueOrder: ORDER, hasClip: (g) => !noClip.has(g.id), count: 3 });
  assert.deepEqual(col.map((g) => g.id), ["mlb2", "wnba1", "mlb3"]);
});

test("only finished games: live, upcoming and postponed are left out", () => {
  const games = [
    game({ id: "done", sport: "mlb", rating: 60 }),
    game({ id: "live", sport: "mlb", state: "in", completed: false, rating: 99 }),
    game({ id: "later", sport: "mlb", state: "pre", completed: false, rating: null }),
    game({ id: "ppd", sport: "mlb", state: "post", completed: false, statusDetail: "Postponed", rating: null }),
  ];
  assert.ok(isFinishedGame(games[0]) && !isFinishedGame(games[3]));
  assert.deepEqual(rankBestYesterday(games, { leagueOrder: ["mlb"], hasClip: withClip }).map((g) => g.id), ["done"]);
});

test("ties past the league order break on bake time, then id", () => {
  const games = [
    game({ id: "b", sport: "epl", rating: 80 }),
    game({ id: "a", sport: "epl", rating: 80 }),
    game({ id: "c", sport: "epl", rating: 80 }),
  ];
  const bakedAt = (g: Game) => ({ c: 100, b: 200 } as Record<string, number>)[g.id];
  assert.deepEqual(rankBestYesterday(games, { leagueOrder: ["epl"], hasClip: withClip, bakedAt }).map((g) => g.id), ["c", "b", "a"]);
  assert.deepEqual(rankBestYesterday(games, { leagueOrder: ["epl"], hasClip: withClip }).map((g) => g.id), ["a", "b", "c"]);
});

test("a league the user never ranked sorts after the ranked ones on a tie", () => {
  const games = [game({ id: "x", sport: "cfl", rating: 75 }), game({ id: "y", sport: "nhl", rating: 75 })];
  assert.deepEqual(rankBestYesterday(games, { leagueOrder: ["nhl"], hasClip: withClip }).map((g) => g.id), ["y", "x"]);
});

test("the same game handed in twice (two source lists) shows once", () => {
  const g = game({ id: "dup", sport: "mlb", rating: 90 });
  assert.deepEqual(rankBestYesterday([g, { ...g }], { leagueOrder: ["mlb"], hasClip: withClip }).map((x) => x.id), ["dup"]);
});

// ── Sources ──────────────────────────────────────────────────────────────────

test("sources keep the user's order, drop hidden and non-game leagues, and cap the fan-out", () => {
  const ordered: Sport[] = ["nfl", "golf", "mlb", "nfl", "chess", "wnba", "epl", "cfl", "tennis", "nhl", "mls", "ucl", "laliga", "nwsl"];
  assert.deepEqual(bestYesterdaySourceSports(ordered, ["wnba"]), ["nfl", "mlb", "epl", "cfl", "tennis", "nhl", "mls", "ucl"]);
  assert.deepEqual(bestYesterdaySourceSports(ordered, [], 3), ["nfl", "mlb", "wnba"]);
  assert.deepEqual(bestYesterdaySourceSports(["top", "best"] as Sport[]), []);
});

// ── Days ─────────────────────────────────────────────────────────────────────

test("prevYmd walks back across month, year and DST edges", () => {
  assert.equal(prevYmd("20260923"), "20260922");
  assert.equal(prevYmd("20260301"), "20260228");
  assert.equal(prevYmd("20240301"), "20240229");
  assert.equal(prevYmd("20270101"), "20261231");
  assert.equal(prevYmd("20261102"), "20261101");
});

// ── Wiring ───────────────────────────────────────────────────────────────────

test("the espn.ts config spells the same label (league-labels.test reads it as text)", () => {
  const espn = readFileSync(fileURLToPath(new URL("../src/lib/espn.ts", import.meta.url)), "utf8");
  assert.ok(
    espn.includes(`BEST_YESTERDAY_CONFIG: LeagueConfig = { sport: "best", label: "${BEST_YESTERDAY_LABEL}"`),
    "BEST_YESTERDAY_CONFIG's label drifted from BEST_YESTERDAY_LABEL",
  );
});
