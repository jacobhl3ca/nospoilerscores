import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFavoritesFilter,
  favCountForSport,
  favoritesMode,
  filterLeague,
  involvesFavorite,
} from "../src/lib/favoritesFilter.ts";
import type { Game, LeagueData, Sport } from "../src/lib/types.ts";

// "Only my teams" (Jacob 10/7). A column keeps the starred teams' games; a
// league with nobody starred shows everything under a banner unless its ✕
// was pressed; every non-team column is left alone.

const team = (id: string) => ({ id }) as Game["homeTeam"];
const game = (id: string, away: string, home: string): Game =>
  ({ id, awayTeam: team(away), homeTeam: team(home), state: "pre" }) as Game;

const mlb = (over: Partial<LeagueData> = {}): LeagueData => ({
  sport: "mlb",
  label: "MLB",
  games: [game("1", "mlb-21", "mlb-10"), game("2", "mlb-1", "mlb-2"), game("3", "mlb-3", "mlb-21")],
  nextGameDay: { date: "20261008", games: [game("4", "mlb-5", "mlb-6"), game("5", "mlb-21", "mlb-7")] },
  previousGameDay: { date: "20261006", games: [game("6", "mlb-8", "mlb-9")] },
  ...over,
});

test("mode table", () => {
  const L = mlb();
  assert.equal(favoritesMode(L, ["mlb-21"], false, [], false), "off");
  assert.equal(favoritesMode(L, ["mlb-21"], true, [], false), "filter");
  assert.equal(favoritesMode(L, ["nfl-21"], true, [], false), "banner");
  assert.equal(favoritesMode(L, ["nfl-21"], true, ["mlb"], false), "strict-empty");
  assert.equal(favoritesMode(L, ["mlb-21"], true, [], true), "off", "team view is never filtered");
  assert.equal(favoritesMode({ sport: "golf" }, [], true, ["golf"], false), "off");
  assert.equal(favoritesMode({ sport: "poker" }, [], true, [], false), "off");
  assert.equal(favoritesMode({ sport: "top" }, ["mlb-21"], true, [], false), "off", "ESPN front page mixes leagues");
  assert.equal(favoritesMode({ sport: "best" }, [], true, [], false), "off");
  assert.equal(favoritesMode({ sport: "f1" as Sport, eventCard: {} as LeagueData["eventCard"] }, [], true, [], false), "off");
});

test("a star in a league with a longer name that shares the prefix does not count", () => {
  assert.equal(favCountForSport("ncaam", ["ncaamsoc-5"]), 0);
  assert.equal(favCountForSport("ncaam", ["ncaam-5", "ncaamsoc-5"]), 1);
});

test("a TBD side (empty id) never matches", () => {
  const g = game("x", "", "mlb-4");
  assert.equal(involvesFavorite(g, [""]), false);
  assert.equal(involvesFavorite(g, ["mlb-4"]), true);
});

test("filter mode cuts all three lists", () => {
  const f = filterLeague(mlb(), ["mlb-21"], true, []);
  assert.equal(f.mode, "filter");
  assert.deepEqual(f.games.map((g) => g.id), ["1", "3"]);
  assert.deepEqual(f.nextGames.map((g) => g.id), ["5"]);
  assert.deepEqual(f.prevGames.map((g) => g.id), []);
  const L = applyFavoritesFilter(mlb(), f);
  assert.equal(L.games.length, 2);
  assert.equal(L.nextGameDay?.games.length, 1);
  assert.equal(L.previousGameDay, null, "an emptied day is dropped, not left as an empty slate");
});

test("banner and off keep the league object untouched", () => {
  const L = mlb();
  assert.equal(applyFavoritesFilter(L, filterLeague(L, [], true, [])), L);
  assert.equal(applyFavoritesFilter(L, filterLeague(L, ["mlb-21"], false, [])), L);
});

test("strict-empty shows nothing", () => {
  const f = filterLeague(mlb(), [], true, ["mlb"]);
  assert.equal(f.mode, "strict-empty");
  const L = applyFavoritesFilter(mlb(), f);
  assert.equal(L.games.length, 0);
  assert.equal(L.nextGameDay, null);
  assert.equal(L.previousGameDay, null);
});

test("a league with no lookahead keeps it absent, not null", () => {
  const raw = mlb({ nextGameDay: undefined });
  const L = applyFavoritesFilter(raw, filterLeague(raw, ["mlb-21"], true, []));
  assert.equal(L.nextGameDay, undefined);
});
