import assert from "node:assert/strict";
import test from "node:test";

import { createJiti } from "jiti";
import {
  applyRankedOnly,
  filterRankedOnly,
  hasRankedTeam,
  keepRankedOnly,
  rankedOnlyOn,
} from "../src/lib/rankedOnly.ts";
import type { Game, LeagueData, Sport } from "../src/lib/types.ts";

// preferences.ts imports its siblings without extensions, so load it through
// jiti like hide-ranks-pref.test does.
const jiti = createJiti(import.meta.url);
const { defaultPreferences } = await jiti.import<typeof import("../src/lib/preferences.ts")>("../src/lib/preferences.ts");

// NCAAF "Ranked only": a college football game stays when at least one team
// carries a poll rank (Team.rank, the #N chip's value). Every other league is
// left alone. No fixture here holds a score or a result.

const team = (id: string, rank?: number | null) => ({ id, ...(rank === undefined ? {} : { rank }) }) as Game["homeTeam"];
const game = (id: string, sport: Sport, awayRank?: number | null, homeRank?: number | null): Game =>
  ({ id, sport, awayTeam: team(`${id}-a`, awayRank), homeTeam: team(`${id}-h`, homeRank), state: "pre" }) as Game;

const ncaaf = (over: Partial<LeagueData> = {}): LeagueData => ({
  sport: "ncaaf",
  label: "NCAAF",
  games: [game("1", "ncaaf", 5, null), game("2", "ncaaf", null, null), game("3", "ncaaf", 3, 12), game("4", "ncaaf")],
  ...over,
});

test("one ranked team keeps the game, home or away", () => {
  assert.equal(hasRankedTeam(game("1", "ncaaf", 5, null)), true);
  assert.equal(hasRankedTeam(game("1", "ncaaf", null, 25)), true);
});

test("both teams ranked keeps the game", () => {
  assert.equal(hasRankedTeam(game("1", "ncaaf", 3, 12)), true);
});

test("both teams unranked drops the game", () => {
  assert.equal(hasRankedTeam(game("1", "ncaaf", null, null)), false);
  assert.equal(keepRankedOnly(game("1", "ncaaf", null, null), true), false);
});

test("missing rank data counts as unranked", () => {
  assert.equal(hasRankedTeam(game("1", "ncaaf")), false);
  assert.equal(hasRankedTeam({ sport: "ncaaf", homeTeam: {}, awayTeam: {} }), false);
  // Shapes the poll never uses are not a rank either.
  assert.equal(hasRankedTeam(game("1", "ncaaf", 99, 0)), false);
  assert.equal(hasRankedTeam(game("1", "ncaaf", 26, Number.NaN)), false);
});

test("pref missing reads as off", () => {
  assert.equal(defaultPreferences().ncaafRankedOnly, undefined);
  assert.equal(rankedOnlyOn(defaultPreferences()), false);
  assert.equal(rankedOnlyOn({}), false);
  assert.equal(rankedOnlyOn({ ncaafRankedOnly: false }), false);
  assert.equal(rankedOnlyOn({ ncaafRankedOnly: true }), true);
  // An old stored blob without the key, spread over the defaults as
  // loadPreferences does.
  const old = { ...defaultPreferences(), ...JSON.parse('{"favoriteLeagues":["ncaaf"],"favoriteTeams":[]}') };
  assert.equal(rankedOnlyOn(old), false);
});

test("off: the league comes back as the same object", () => {
  const l = ncaaf();
  assert.equal(applyRankedOnly(l, false), l);
  assert.equal(keepRankedOnly(game("2", "ncaaf", null, null), false), true);
});

test("on: the NCAAF column keeps only the ranked games", () => {
  const out = applyRankedOnly(ncaaf(), true);
  assert.deepEqual(out.games.map((g) => g.id), ["1", "3"]);
  assert.equal(out.rankedOnlyEmpty, undefined);
});

test("on: other leagues are untouched", () => {
  const mlb: LeagueData = { sport: "mlb", label: "MLB", games: [game("9", "mlb", null, null)] };
  assert.equal(applyRankedOnly(mlb, true), mlb);
});

test("on: a mixed column loses only its unranked NCAAF games", () => {
  const top: LeagueData = {
    sport: "top",
    label: "ESPN",
    games: [game("1", "ncaaf", null, null), game("2", "nfl", null, null), game("3", "ncaaf", 7, null)],
  };
  assert.deepEqual(applyRankedOnly(top, true).games.map((g) => g.id), ["2", "3"]);
  assert.equal(applyRankedOnly(top, true).rankedOnlyEmpty, undefined);
  assert.deepEqual(filterRankedOnly(top.games, true).map((g) => g.id), ["2", "3"]);
});

test("on: a day with games but none ranked is marked empty", () => {
  const out = applyRankedOnly(ncaaf({ games: [game("2", "ncaaf", null, null), game("4", "ncaaf")] }), true);
  assert.equal(out.games.length, 0);
  assert.equal(out.rankedOnlyEmpty, true);
});

test("on: the lookahead day is cut too, and dropped when nothing is left", () => {
  const kept = applyRankedOnly(ncaaf({
    games: [],
    nextGameDay: { date: "20261017", games: [game("5", "ncaaf", null, null), game("6", "ncaaf", 9, null)] },
  }), true);
  assert.deepEqual(kept.nextGameDay?.games.map((g) => g.id), ["6"]);
  assert.equal(kept.rankedOnlyEmpty, undefined);

  const gone = applyRankedOnly(ncaaf({
    games: [],
    nextGameDay: { date: "20261017", games: [game("5", "ncaaf", null, null)] },
  }), true);
  assert.equal(gone.nextGameDay, null);
  assert.equal(gone.rankedOnlyEmpty, true);
});

test("on: an empty day with no lookahead is left as it was", () => {
  const l = ncaaf({ games: [], nextGameDay: null });
  assert.equal(applyRankedOnly(l, true), l);
});
