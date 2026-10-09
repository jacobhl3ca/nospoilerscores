import assert from "node:assert/strict";
import test from "node:test";

import {
  COVERAGE_LEAGUES, bakedSlots, bufferHours, coverageRow, finishedGames, gapHints, highlightPlan,
  liveLookupArgs, mlbSlots, renderGaps, renderTable, scoreboardPaths, tally, windowDates,
} from "../scripts/lib/highlight-coverage.mjs";

// scripts/highlight-coverage.mjs, offline: a scoreboard and a baked manifest in
// the shapes ESPN and the bake write, run through the card's own rules.

const team = (id, abbreviation, displayName, shortDisplayName, location, extra = {}) =>
  ({ id, abbreviation, displayName, shortDisplayName, location, ...extra });
const event = ({ id, date, away, home, state = "post", season = { type: 2 }, week, notes = [] }) => ({
  id,
  date,
  name: `${away.displayName} at ${home.displayName}`,
  shortName: `${away.abbreviation} @ ${home.abbreviation}`,
  season,
  ...(week ? { week: { number: week } } : {}),
  status: { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state, detail: "Final", shortDetail: "Final", completed: state === "post" } },
  competitions: [{
    competitors: [
      { homeAway: "home", team: home, score: "24" },
      { homeAway: "away", team: away, score: "17" },
    ],
    broadcasts: [{ names: ["FOX"] }],
    notes,
  }],
});

const LIONS = team("8", "DET", "Detroit Lions", "Lions", "Detroit");
const BEARS = team("3", "CHI", "Chicago Bears", "Bears", "Chicago");
const baked = (extra) => ({
  t: Date.now(),
  teams: ["Bears", "Lions"],
  matchup: "bears|lions",
  sourcePolicy: "official-channel",
  ...extra,
});

test("league list, paths and buffers come from the app", () => {
  const paths = scoreboardPaths();
  for (const lg of COVERAGE_LEAGUES) assert.ok(paths[lg.sport], `${lg.sport} has a scoreboard path`);
  assert.equal(paths.ncaaf, "/football/college-football/scoreboard");
  const buffers = bufferHours();
  assert.equal(buffers.nfl, 5);
  assert.equal(buffers.epl, 3);
});

test("the window is seven ET dates, newest first", () => {
  const dates = windowDates(7, Date.parse("2026-10-09T03:00:00Z"));
  assert.deepEqual(dates, ["20261008", "20261007", "20261006", "20261005", "20261004", "20261003", "20261002"]);
});

test("only finished games are counted", () => {
  const games = finishedGames("nfl", { events: [
    event({ id: "1", date: "2026-10-05T17:00Z", away: BEARS, home: LIONS, week: 5 }),
    event({ id: "2", date: "2026-10-05T20:00Z", away: BEARS, home: LIONS, state: "in" }),
  ] });
  assert.deepEqual(games.map((g) => g.id), ["1"]);
});

test("NFL plan: league channel, week gate, one strict lookup", () => {
  const [game] = finishedGames("nfl", { events: [event({ id: "1", date: "2026-10-05T17:00Z", away: BEARS, home: LIONS, week: 5 })] });
  const plan = highlightPlan(game);
  assert.equal(plan.primaryChannel, "NFL");
  assert.equal(plan.week, 5);
  assert.deepEqual(liveLookupArgs(plan), {
    query: "Bears vs Lions highlights Oct 5, 2026",
    channel: "NFL",
    week: 5,
    compTokens: [],
    gates: undefined,
  });
});

test("a baked slot counts only when the card would trust it", () => {
  const [game] = finishedGames("nfl", { events: [event({ id: "1", date: "2026-10-05T17:00Z", away: BEARS, home: LIONS, week: 5 })] });
  const plan = highlightPlan(game);
  assert.deepEqual(bakedSlots(plan, baked({ official: "abc", officialChannel: "NFL" })).official, { id: "abc", channel: "NFL" });
  // Wrong uploader, wrong matchup, stale record: the card drops each.
  assert.equal(bakedSlots(plan, baked({ official: "abc", officialChannel: "Detroit Lions" })).official, null);
  assert.equal(bakedSlots(plan, baked({ official: "abc", officialChannel: "NFL", matchup: "bears|packers" })).official, null);
  assert.equal(bakedSlots(plan, baked({ official: "abc", officialChannel: "NFL", t: Date.now() - 11 * 86400000 })).official, null);
  assert.equal(bakedSlots(plan, null).official, null);
});

test("rows: baked, live-only, extended-only, none and pending", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const [game] = finishedGames("nfl", { events: [event({ id: "1", date: "2026-10-05T17:00Z", away: BEARS, home: LIONS, week: 5 })] });
  const plan = highlightPlan(game);
  const row = (slots, live, date = game.date) => coverageRow({ game: { ...game, date }, plan, slots, live, nowMs: now, buffers: { nfl: 5 } });
  assert.equal(row({ official: { id: "a" }, extended: null }, null).status, "official");
  const liveOnly = row({ official: null, extended: null }, { id: "b" });
  assert.equal(liveOnly.officialVia, "live");
  assert.match(liveOnly.hints[0], /bake missed/);
  assert.equal(row({ official: null, extended: "c" }, { id: null }).status, "extended");
  assert.equal(row({ official: null, extended: null }, { id: null }).status, "none");
  assert.equal(row({ official: null, extended: null }, null, "2026-10-09T09:00:00Z").status, "pending");

  const rows = [
    row({ official: { id: "a" }, extended: "x" }, null),
    liveOnly,
    row({ official: null, extended: "c" }, { id: null }),
    row({ official: null, extended: null }, { id: null }),
    row({ official: null, extended: null }, null, "2026-10-09T09:00:00Z"),
  ];
  assert.deepEqual(tally(rows), { games: 4, official: 2, liveOnly: 1, extended: 2, none: 1, pending: 1 });
  const table = renderTable([{ sport: "nfl", label: "NFL" }, { sport: "wnba", label: "WNBA" }], { nfl: rows }, { outOfSeason: new Set(["wnba"]) });
  assert.match(table, /\| NFL \| 4 \| 2 \| 1 \| 2 \| 1 \| 1 \|/);
  assert.match(table, /\| WNBA \| out of season/);
  assert.match(renderGaps(rows), /nfl 20261005 Bears @ Lions \(ESPN 1\) live=miss/);
});

test("MLB reads MLB.com recap + condensed, game 2 of a doubleheader by start time", () => {
  const SOX = team("2", "BOS", "Boston Red Sox", "Red Sox", "Boston");
  const YANKS = team("10", "NYY", "New York Yankees", "Yankees", "New York");
  const games = finishedGames("mlb", { events: [
    event({ id: "g1", date: "2026-09-26T17:05Z", away: SOX, home: YANKS }),
    event({ id: "g2", date: "2026-09-26T23:05Z", away: SOX, home: YANKS }),
  ] });
  const clip = (n) => ({ url: `https://www.mlb.com/video/${n}`, playback: `https://mlb-cuts-diamond.mlb.com/${n}.mp4`, poster: null });
  const entries = [
    { date: "2026-09-26T17:05:00Z", away: "Red Sox", home: "Yankees", recap: clip("r1"), condensed: clip("c1") },
    { date: "2026-09-26T23:05:00Z", away: "Red Sox", home: "Yankees", recap: clip("r2"), condensed: null },
  ];
  assert.equal(mlbSlots(games[0], entries).official.id, clip("r1").playback);
  assert.equal(mlbSlots(games[1], entries).official.id, clip("r2").playback);
  assert.equal(mlbSlots(games[1], entries).extended, null);
  assert.ok(gapHints(games[1], highlightPlan(games[1]), games).some((h) => /doubleheader/.test(h)));
});

test("college football plans with the school name and the conference chain", () => {
  const WKU = team("98", "WKU", "Western Kentucky Hilltoppers", "Western KY", "Western Kentucky", { conferenceId: "12" });
  const UGA = team("61", "UGA", "Georgia Bulldogs", "Georgia", "Georgia", { conferenceId: "8" });
  const [game] = finishedGames("ncaaf", { events: [event({ id: "9", date: "2026-10-03T16:00Z", away: WKU, home: UGA, week: 6 })] });
  const plan = highlightPlan(game);
  assert.equal(plan.hlAway, "Western Kentucky");
  assert.equal(plan.primaryChannel, "ESPN College Football");
  assert.ok(plan.fallbacks.some((f) => f.channel === "SEC"));
});
