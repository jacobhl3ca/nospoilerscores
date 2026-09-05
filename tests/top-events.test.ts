import assert from "node:assert/strict";
import test from "node:test";

import type { Game, Sport, Team } from "../src/lib/types.ts";
import {
  parseEspnHeader,
  rankTopEvents,
  scoreGame,
  topEventsSourceSports,
  TOP_EVENTS_MAX_PER_LEAGUE,
  type EspnHeaderFeature,
} from "../src/lib/topEvents.ts";

const H = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 4, 23, 0, 0); // Fri Sep 4 2026, 7:00 pm ET

function team(id: string, rank: number | null = null): Team {
  return { id, abbreviation: id.toUpperCase(), displayName: id, shortDisplayName: id, logo: "", color: "000", score: "", winner: false, record: "", rank };
}

function game(over: Partial<Game> & { id: string; sport: Sport }): Game {
  return {
    date: new Date(NOW + 6 * H).toISOString(), // later tonight (+5), not "starting soon"
    name: "", shortName: "", state: "pre", statusDetail: "9:00 PM ET", clock: "", period: 0, completed: false,
    homeTeam: team(`${over.id}h`), awayTeam: team(`${over.id}a`), broadcasts: [], venue: "", rating: null,
    seriesNote: null, isPlayoff: false, isPreseason: false, playoffLabel: null, seriesStatus: null,
    recapUrl: null, streamUrl: null, primeStreamUrl: null,
    ...over,
  };
}

const NO_FEATURES: EspnHeaderFeature[] = [];
const ctx = (over: Partial<Parameters<typeof rankTopEvents>[1]> = {}) => ({
  favoriteTeams: [], features: NO_FEATURES, nowMs: NOW, count: 8, ...over,
});

// ── ESPN homepage strip ──────────────────────────────────────────────────────

test("parseEspnHeader maps ESPN's strip to sports, keeping ESPN's own order", () => {
  const payload = {
    sports: [
      { leagues: [{ slug: "college-football", events: [{ id: "401" }, { id: 402 }] }] },
      { leagues: [{ slug: "mlb", events: [{ id: "9" }] }, { slug: "some-new-thing", events: [{ id: "5" }] }] },
      { leagues: [{ slug: "eng.1", events: [] }] },
    ],
  };
  assert.deepEqual(parseEspnHeader(payload), [
    { sport: "ncaaf", eventIds: ["401", "402"], sportOrder: 0 },
    { sport: "mlb", eventIds: ["9"], sportOrder: 1 },
  ]);
});

test("parseEspnHeader never throws on a reshaped payload", () => {
  assert.deepEqual(parseEspnHeader(null), []);
  assert.deepEqual(parseEspnHeader({}), []);
  assert.deepEqual(parseEspnHeader({ sports: [{ leagues: "nope" }, 7, { leagues: [{}] }] }), []);
});

// ── Ranking ──────────────────────────────────────────────────────────────────

test("a starred team outranks a featured live game", () => {
  const mine = game({ id: "mine", sport: "mlb", homeTeam: team("nym") });
  const featuredLive = game({ id: "big", sport: "ncaaf", state: "in", statusDetail: "3rd Quarter" });
  const features: EspnHeaderFeature[] = [{ sport: "ncaaf", eventIds: ["big"], sportOrder: 0 }];
  const picked = rankTopEvents([featuredLive, mine], ctx({ favoriteTeams: ["mlb-nym"], features }));
  assert.deepEqual(picked.map((g) => g.id), ["mine", "big"]);
  assert.ok(scoreGame(mine, ctx({ favoriteTeams: ["mlb-nym"] })).reasons.includes("your team"));
});

test("what espn.com is featuring beats an identical unfeatured game, in ESPN's order", () => {
  const games = ["a", "b", "c"].map((id) => game({ id, sport: "mlb" }));
  const features: EspnHeaderFeature[] = [{ sport: "mlb", eventIds: ["c", "b"], sportOrder: 0 }];
  assert.deepEqual(rankTopEvents(games, ctx({ features })).map((g) => g.id), ["c", "b", "a"]);
});

test("live beats not-yet-started; starting soon beats later tonight", () => {
  const live = game({ id: "live", sport: "nba", state: "in", statusDetail: "2nd Quarter" });
  const soon = game({ id: "soon", sport: "nba", date: new Date(NOW + 1 * H).toISOString() });
  const later = game({ id: "later", sport: "nba", date: new Date(NOW + 6 * H).toISOString() });
  assert.deepEqual(rankTopEvents([later, soon, live], ctx()).map((g) => g.id), ["live", "soon", "later"]);
});

test("one league can't flood the column — unless it's your team", () => {
  const mlb = ["m1", "m2", "m3", "m4", "m5"].map((id) => game({ id, sport: "mlb" }));
  const nba = ["n1", "n2"].map((id) => game({ id, sport: "nba", date: new Date(NOW + 8 * H).toISOString() }));
  // Five slots, five MLB games that all outrank the two NBA games on start
  // time: the cap still lets both NBA games in.
  const picked = rankTopEvents([...mlb, ...nba], ctx({ count: 5 }));
  assert.equal(picked.filter((g) => g.sport === "mlb").length, TOP_EVENTS_MAX_PER_LEAGUE);
  assert.deepEqual(picked.filter((g) => g.sport === "nba").map((g) => g.id), ["n1", "n2"]);

  const withFav = rankTopEvents([...mlb, ...nba], ctx({ count: 5, favoriteTeams: ["mlb-m5h"] }));
  assert.equal(withFav[0].id, "m5");
  assert.equal(withFav.filter((g) => g.sport === "mlb").length, TOP_EVENTS_MAX_PER_LEAGUE + 1);
  assert.equal(withFav.filter((g) => g.sport === "nba").length, 1);
});

test("the per-league cap yields when nothing else is on: a quiet Thursday still fills", () => {
  const mlb = Array.from({ length: 9 }, (_, i) => game({ id: `m${i}`, sport: "mlb" }));
  const nba = game({ id: "n1", sport: "nba" });
  const picked = rankTopEvents([...mlb, nba], ctx({ count: 8 }));
  assert.equal(picked.length, 8);
  // Diversity first — the NBA game is in even though 8 MLB games outrank the fill pass…
  assert.ok(picked.some((g) => g.id === "n1"));
  // …then MLB fills the rest, best-first.
  assert.deepEqual(picked.slice(0, 3).map((g) => g.id), ["m0", "m1", "m2"]);
});

test("count caps the column and duplicates collapse", () => {
  const many = Array.from({ length: 10 }, (_, i) => game({ id: `g${i}`, sport: (["mlb", "nba", "nhl", "nfl"] as Sport[])[i % 4] }));
  assert.equal(rankTopEvents([...many, ...many], ctx({ count: 5 })).length, 5);
  assert.equal(rankTopEvents(many, ctx({ count: 12 })).length, 10);
});

test("'ranked' means the AP top 25 in college and a top-four clash in the pros", () => {
  const cfb = game({ id: "cfb", sport: "ncaaf", homeTeam: team("uga", 3), awayTeam: team("bama", 7) });
  assert.ok(scoreGame(cfb, ctx()).reasons.includes("ranked matchup"));
  const cfbOne = game({ id: "cfb1", sport: "ncaaf", homeTeam: team("uga", 3), awayTeam: team("vandy", null) });
  assert.ok(scoreGame(cfbOne, ctx()).reasons.includes("ranked team"));
  // Standings rank: every MLB team has one, so 10 vs 12 is nothing special…
  const mid = game({ id: "mid", sport: "mlb", homeTeam: team("x", 10), awayTeam: team("y", 12) });
  assert.equal(scoreGame(mid, ctx()).score, 5); // only the "later tonight" +5
  // …but first vs second is.
  const top = game({ id: "top", sport: "mlb", homeTeam: team("x", 1), awayTeam: team("y", 2) });
  assert.ok(scoreGame(top, ctx()).reasons.includes("top of the table"));
});

test("playoffs and national TV are visible-on-the-card signals that count", () => {
  const plain = game({ id: "plain", sport: "nhl" });
  const cup = game({ id: "cup", sport: "nhl", isPlayoff: true, playoffLabel: "Stanley Cup Final", broadcasts: ["TNT"], seriesNote: "Game 7" });
  const s = scoreGame(cup, ctx());
  assert.ok(s.score > scoreGame(plain, ctx()).score);
  assert.deepEqual(s.reasons, ["stanley cup final", "national TV", "game 7"]);
});

// ── Which leagues get pulled ─────────────────────────────────────────────────

test("manual mode uses exactly the ticked game-card leagues, in order", () => {
  const out = topEventsSourceSports("manual", ["nba", "golf", "mlb", "nba"] as Sport[], NO_FEATURES, ["nfl-1"]);
  assert.deepEqual(out, ["nba", "mlb"]);
});

test("auto mode = your teams' leagues first, then ESPN's strip in ESPN's order, capped", () => {
  const features: EspnHeaderFeature[] = [
    { sport: "mlb", eventIds: ["1"], sportOrder: 1 },
    { sport: "ncaaf", eventIds: ["2"], sportOrder: 0 },
    { sport: "epl", eventIds: ["3"], sportOrder: 2 },
  ];
  assert.deepEqual(topEventsSourceSports("auto", undefined, features, ["nhl-5"]), ["nhl", "ncaaf", "mlb", "epl"]);
  assert.deepEqual(topEventsSourceSports("auto", undefined, features, ["nhl-5"], 2), ["nhl", "ncaaf"]);
  assert.deepEqual(topEventsSourceSports("auto", undefined, [], []), []);
});
