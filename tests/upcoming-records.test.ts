import assert from "node:assert/strict";
import test from "node:test";

import {
  recordKeysForLeagues,
  recordLeagueFor,
  recordShowsForState,
  recordTitle,
  toggleRecordLeague,
  upcomingRecordLeagues,
} from "../src/lib/upcomingRecords.ts";

// Records on upcoming cards, picked per league (Jacob 9/25). The spoiler rule
// is: weekly leagues start on, daily ones stay off until the user asks.

const sorted = (s: Set<string>) => [...s].sort();

test("a fresh install shows records for the weekly football leagues only", () => {
  assert.deepEqual(sorted(upcomingRecordLeagues({})), ["cfl", "ncaaf", "nfl", "ufl"]);
});

test("someone who turned the old NFL switch off gets no records", () => {
  assert.deepEqual(sorted(upcomingRecordLeagues({ hideUpcomingRecords: true })), []);
});

test("a saved list always wins, including an empty one", () => {
  assert.deepEqual(sorted(upcomingRecordLeagues({ upcomingRecordLeagues: ["mlb", "soccer"], hideUpcomingRecords: true })), ["mlb", "soccer"]);
  assert.deepEqual(sorted(upcomingRecordLeagues({ upcomingRecordLeagues: [] })), []);
});

test("a key this build doesn't know is dropped, not shown", () => {
  // A synced blob from a newer or older client can carry anything.
  assert.deepEqual(sorted(upcomingRecordLeagues({ upcomingRecordLeagues: ["nfl", "golf", "bogus" as never] })), ["nfl"]);
});

test("every soccer competition maps to the one soccer key", () => {
  assert.equal(recordLeagueFor("epl", true), "soccer");
  assert.equal(recordLeagueFor("ucl", true), "soccer");
  assert.equal(recordLeagueFor("mls", true), "soccer");
});

test("sports with no team record map to nothing", () => {
  for (const sport of ["golf", "tennis", "f1", "ufc", "boxing", "poker", "llws", "top", "best"] as const) {
    assert.equal(recordLeagueFor(sport, false), null, sport);
  }
  assert.equal(recordLeagueFor("nfl", false), "nfl");
  assert.equal(recordLeagueFor("mlb", false), "mlb");
});

test("one tap adds or removes a league, stored in display order", () => {
  const start = upcomingRecordLeagues({});
  assert.deepEqual(toggleRecordLeague(start, "soccer"), ["nfl", "ncaaf", "cfl", "ufl", "soccer"]);
  assert.deepEqual(toggleRecordLeague(new Set(["soccer", "mlb"] as const), "nfl"), ["nfl", "mlb", "soccer"]);
  assert.deepEqual(toggleRecordLeague(start, "nfl"), ["ncaaf", "cfl", "ufl"]);
});

test("Settings offers one Records chip per league in My leagues, soccer folded into one", () => {
  const lg = (sport: string, isSoccer = false) => ({ sport, isSoccer }) as Parameters<typeof recordKeysForLeagues>[0][number];
  // Every soccer competition is one "soccer" key, at the first soccer league's place.
  assert.deepEqual(
    recordKeysForLeagues([lg("mlb"), lg("epl", true), lg("nfl"), lg("ucl", true), lg("mls", true), lg("nba")]),
    ["mlb", "soccer", "nfl", "nba"],
  );
  // A league with no team record drops; order is kept.
  assert.deepEqual(recordKeysForLeagues([lg("golf"), lg("nhl"), lg("f1"), lg("wnba")]), ["nhl", "wnba"]);
  // Duplicates are removed.
  assert.deepEqual(recordKeysForLeagues([lg("nfl"), lg("nfl"), lg("ncaaf")]), ["nfl", "ncaaf"]);
  assert.deepEqual(recordKeysForLeagues([]), []);
});

test("three-number records say what the third number is", () => {
  assert.match(recordTitle("soccer"), /W-D-L/);
  assert.match(recordTitle("nhl"), /W-L-OT/);
  assert.equal(recordTitle("nfl"), "Record going into this game");
});

test("records show before the start and while live, never once final", () => {
  assert.equal(recordShowsForState("pre"), true);
  assert.equal(recordShowsForState("in"), true);
  assert.equal(recordShowsForState("post"), false);
});
