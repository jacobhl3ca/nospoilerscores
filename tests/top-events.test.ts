import assert from "node:assert/strict";
import test from "node:test";

import type { Game, Sport, Team } from "../src/lib/types.ts";
import {
  espnFrontPageSports,
  groupEspnFrontPage,
  orderByEspnHeader,
  parseEspnFrontPageFeed,
  parseEspnHeader,
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

// ── ESPN front page column ──────────────────────────────────────────────────

// Saturday 9/26 in miniature: college football leads the strip, then MLB,
// then two soccer leagues that share one "soccer" sport entry.
const FEATURES: EspnHeaderFeature[] = [
  { sport: "ncaaf", eventIds: ["f1", "f2"], sportOrder: 0 },
  { sport: "mlb", eventIds: ["b1"], sportOrder: 1 },
  { sport: "nwsl", eventIds: ["w1"], sportOrder: 2 },
  { sport: "mls", eventIds: ["s1", "s2"], sportOrder: 2 },
];

test("the column is ESPN's picks in ESPN's order, whatever order the boards arrive in", () => {
  const games = [
    game({ id: "s2", sport: "mls" }),
    game({ id: "b1", sport: "mlb", state: "in" }),
    game({ id: "f2", sport: "ncaaf" }),
    game({ id: "s1", sport: "mls" }),
    game({ id: "w1", sport: "nwsl" }),
    game({ id: "f1", sport: "ncaaf", state: "post", completed: true }),
  ];
  assert.deepEqual(orderByEspnHeader(games, FEATURES).map((g) => g.id), ["f1", "f2", "b1", "w1", "s1", "s2"]);
});

test("games ESPN is not featuring stay out, even live ones or a bigger league's", () => {
  const games = [
    game({ id: "b1", sport: "mlb" }),
    game({ id: "b2", sport: "mlb", state: "in", isPlayoff: true }),
    game({ id: "x9", sport: "nfl" }),
  ];
  assert.deepEqual(orderByEspnHeader(games, FEATURES).map((g) => g.id), ["b1"]);
});

test("an id only matches inside its own sport, and duplicates collapse", () => {
  const games = [
    game({ id: "b1", sport: "nhl" }), // same id, wrong sport
    game({ id: "b1", sport: "mlb" }),
    game({ id: "b1", sport: "mlb" }), // a league on the board twice
  ];
  const out = orderByEspnHeader(games, FEATURES);
  assert.equal(out.length, 1);
  assert.equal(out[0].sport, "mlb");
});

test("no ESPN signal = an empty column, never a guess", () => {
  assert.deepEqual(orderByEspnHeader([game({ id: "b1", sport: "mlb" })], []), []);
});

test("the leagues to pull follow the strip, deduped and capped", () => {
  assert.deepEqual(espnFrontPageSports(FEATURES), ["ncaaf", "mlb", "nwsl", "mls"]);
  assert.deepEqual(espnFrontPageSports(FEATURES, 2), ["ncaaf", "mlb"]);
  assert.deepEqual(espnFrontPageSports([]), []);
});

test("the live 9/26 strip shape parses into the front page's league order", () => {
  const payload = {
    sports: [
      { slug: "football", leagues: [{ slug: "college-football", events: [{ id: "401", priority: 0 }, { id: "402", priority: 1 }] }] },
      { slug: "baseball", leagues: [{ slug: "mlb", events: [{ id: "501", priority: 17 }] }] },
      { slug: "golf", leagues: [{ slug: "pga", events: [{ id: "g1", priority: 26 }] }] },
      { slug: "hockey", leagues: [{ slug: "nhl", events: [{ id: "601", priority: 27 }] }] },
      { slug: "soccer", leagues: [
        { slug: "fifa.friendly", events: [{ id: "x1", priority: 37 }] },
        { slug: "usa.nwsl", events: [{ id: "701", priority: 39 }] },
        { slug: "usa.1", events: [{ id: "801", priority: 42 }] },
      ] },
    ],
  };
  const features = parseEspnHeader(payload);
  assert.deepEqual(espnFrontPageSports(features), ["ncaaf", "mlb", "nhl", "nwsl", "mls"]);
  const games = [
    game({ id: "801", sport: "mls" }), game({ id: "601", sport: "nhl" }),
    game({ id: "402", sport: "ncaaf" }), game({ id: "501", sport: "mlb" }),
    game({ id: "401", sport: "ncaaf" }), game({ id: "701", sport: "nwsl" }),
  ];
  assert.deepEqual(orderByEspnHeader(games, features).map((g) => g.id), ["401", "402", "501", "601", "701", "801"]);
});

// ── ESPN homepage body (the "highlighted" games, Jacob 9/26) ───────────────

// The 9/26 9 pm feed in miniature: the Texas A&M–LSU hero block, the College
// Football Scoreboard module (a final first, as ESPN lists it), a story
// module, then the MLB scoreboard module.
const BODY = {
  feed: [
    { data: { event: { id: "702", shortName: "TA&M @ LSU" }, now: [{ type: "Module", inlines: [{ type: "Module", headline: "Collection" }] }] } },
    { data: { now: [{ type: "Module", inlines: [
      { type: "SportingEvent", eventId: "466" }, { type: "SportingEvent", eventId: "238" }, { type: "SportingEvent", eventId: 696 },
    ] }] } },
    { data: { now: [{ type: "Module", inlines: [{ type: "Module", headline: "Iowa beats Michigan" }] }] } },
    { data: { now: [{ type: "Module", inlines: [{ type: "SportingEvent", eventId: "097" }, { type: "SportingEvent", eventId: "238" }] }] } },
  ],
};

test("parseEspnFrontPageFeed reads game blocks and scoreboard modules top to bottom", () => {
  assert.deepEqual(parseEspnFrontPageFeed(BODY), ["702", "466", "238", "696", "097"]);
});

test("parseEspnFrontPageFeed never throws on a reshaped payload", () => {
  assert.deepEqual(parseEspnFrontPageFeed(null), []);
  assert.deepEqual(parseEspnFrontPageFeed({ feed: "nope" }), []);
  assert.deepEqual(parseEspnFrontPageFeed({ feed: [null, 7, { data: { now: "x", event: 3 } }, { data: { now: [{ inlines: [null, { type: "SportingEvent" }] }] } }] }), []);
});

test("the body's games lead, then the rest of the strip in strip order", () => {
  const features: EspnHeaderFeature[] = [
    { sport: "ncaaf", eventIds: ["238", "696", "702", "466", "999"], sportOrder: 0 },
    { sport: "mlb", eventIds: ["097", "098"], sportOrder: 1 },
  ];
  const games = ["238", "696", "702", "466", "999"].map((id) => game({ id, sport: "ncaaf" }))
    .concat(["097", "098"].map((id) => game({ id, sport: "mlb" })));
  const featured = parseEspnFrontPageFeed(BODY);
  assert.deepEqual(orderByEspnHeader(games, features, featured).map((g) => g.id), ["702", "466", "238", "696", "097", "999", "098"]);
  // No body signal = the strip's order, as before.
  assert.deepEqual(orderByEspnHeader(games, features).map((g) => g.id), ["238", "696", "702", "466", "999", "097", "098"]);
});

test("a body game the strip does not carry stays out, and takes its sport from the strip", () => {
  const features: EspnHeaderFeature[] = [{ sport: "mlb", eventIds: ["b1"], sportOrder: 0 }];
  const games = [game({ id: "x1", sport: "nfl" }), game({ id: "b1", sport: "nhl" }), game({ id: "b1", sport: "mlb" })];
  const out = orderByEspnHeader(games, features, ["x1", "b1"]);
  assert.deepEqual(out.map((g) => `${g.sport}:${g.id}`), ["mlb:b1"]);
// ── espn.com's layout: league blocks, live first inside each ─────────────────

test("the front page groups by league in strip order, live games first inside a league", () => {
  // The 9/26 9:30 pm strip: the feed lists CFB finals (priority 0-10) before
  // its live games (11-16), MLB finals before live before the late game.
  const games = [
    game({ id: "c0", sport: "ncaaf", state: "post" }), game({ id: "c1", sport: "ncaaf", state: "post" }),
    game({ id: "c11", sport: "ncaaf", state: "in" }), game({ id: "c12", sport: "ncaaf", state: "in" }),
    game({ id: "m17", sport: "mlb", state: "post" }), game({ id: "m20", sport: "mlb", state: "in" }),
    game({ id: "m25", sport: "mlb", state: "pre" }),
    game({ id: "s41", sport: "nwsl", state: "in" }),
  ];
  const groups = groupEspnFrontPage(games);
  assert.deepEqual(groups.map((g) => g.sport), ["ncaaf", "mlb", "nwsl"]);
  assert.deepEqual(groups.map((g) => g.games.map((x) => x.id)), [
    ["c11", "c12", "c0", "c1"],
    ["m20", "m17", "m25"],
    ["s41"],
  ]);
});

test("a league that shows up again later joins its first block", () => {
  const groups = groupEspnFrontPage([
    game({ id: "1", sport: "mlb" }), game({ id: "2", sport: "nhl" }), game({ id: "3", sport: "mlb", state: "in" }),
  ]);
  assert.deepEqual(groups.map((g) => [g.sport, g.games.map((x) => x.id)]), [["mlb", ["3", "1"]], ["nhl", ["2"]]]);
  assert.deepEqual(groupEspnFrontPage([]), []);
});
