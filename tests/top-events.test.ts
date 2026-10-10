import assert from "node:assert/strict";
import test from "node:test";

import type { Game, Sport, Team } from "../src/lib/types.ts";
import {
  espnFeaturedKeys,
  espnFrontPageSports,
  groupEspnFrontPage,
  orderByEspnHeader,
  orderBySports,
  parseEspnFrontPageFeed,
  parseEspnHeader,
  type EspnHeaderFeature,
} from "../src/lib/topEvents.ts";
import { parseFrontPageFeedIds, trimEspnHeader } from "../scripts/lib/espn-front.mjs";

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
});

// ── espn.com's layout: league blocks, live first inside each ─────────────────

test("the front page groups by league in strip order: live, then upcoming, then final inside a league", () => {
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
    ["m20", "m25", "m17"],
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

test("ESPN's featured games lead their state inside a league block; live games still lead the block", () => {
  const features: EspnHeaderFeature[] = [
    { sport: "ncaaf", eventIds: ["c1", "c2", "c3"], sportOrder: 0 },
    { sport: "mlb", eventIds: ["m1", "m2"], sportOrder: 1 },
  ];
  // The body's hero is a FINAL MLB game, then its CFB module lists c3.
  const featured = espnFeaturedKeys(features, ["m2", "c3", "zz"]);
  assert.deepEqual(featured, ["mlb:m2", "ncaaf:c3"]);
  const games = orderByEspnHeader([
    game({ id: "c1", sport: "ncaaf", state: "in" }), game({ id: "c2", sport: "ncaaf", state: "post" }),
    game({ id: "c3", sport: "ncaaf", state: "post" }), game({ id: "m1", sport: "mlb", state: "in" }),
    game({ id: "m2", sport: "mlb", state: "post" }),
  ], features, ["m2", "c3", "zz"]);
  const groups = groupEspnFrontPage(games, featured);
  // The hero's league still leads the column; inside it the live game beats
  // the final hero, and featured final c3 leads non-featured final c2.
  assert.deepEqual(groups.map((g) => [g.sport, g.games.map((x) => x.id)]), [
    ["mlb", ["m1", "m2"]],
    ["ncaaf", ["c1", "c3", "c2"]],
  ]);
});

test("the 9/26 10:18 pm column: no final sits above a live game in its league", () => {
  // Jacob's screenshot: the body featured live TA&M–LSU (hero) plus finals
  // WIS–PSU and CMU–MIA, and those finals sat above four live CFB games.
  const ids = ["tam", "wis", "cmu", "sc", "ore", "miz", "most", "tex", "ill"];
  const states: Game["state"][] = ["in", "post", "post", "in", "in", "in", "in", "post", "post"];
  const features: EspnHeaderFeature[] = [{ sport: "ncaaf", eventIds: ids, sportOrder: 0 }];
  const body = ["tam", "wis", "cmu"];
  const games = orderByEspnHeader(ids.map((id, i) => game({ id, sport: "ncaaf", state: states[i] })), features, body);
  const [block] = groupEspnFrontPage(games, espnFeaturedKeys(features, body));
  assert.deepEqual(block.games.map((g) => g.id), ["tam", "sc", "ore", "miz", "most", "wis", "cmu", "tex", "ill"]);
  const lastLive = block.games.map((g) => g.state).lastIndexOf("in");
  const firstFinal = block.games.findIndex((g) => g.state === "post");
  assert.ok(lastLive < firstFinal);
});

test("a delayed live game sits below the other live games, above upcoming and finals", () => {
  const [block] = groupEspnFrontPage([
    game({ id: "rain", sport: "mlb", state: "in", statusDetail: "Rain Delay" }),
    game({ id: "fin", sport: "mlb", state: "post" }),
    game({ id: "live", sport: "mlb", state: "in", statusDetail: "Top 5th" }),
    game({ id: "late", sport: "mlb", state: "pre" }),
  ], ["mlb:rain"]);
  assert.deepEqual(block.games.map((g) => g.id), ["live", "rain", "late", "fin"]);
});

test("grouping is stable: regrouping a grouped column changes nothing", () => {
  const games = [
    game({ id: "a", sport: "mlb", state: "post" }), game({ id: "b", sport: "mlb", state: "pre" }),
    game({ id: "c", sport: "nhl", state: "in" }), game({ id: "d", sport: "mlb", state: "in" }),
  ];
  const once = groupEspnFrontPage(games, ["mlb:a"]).flatMap((g) => g.games);
  const twice = groupEspnFrontPage(once, ["mlb:a"]).flatMap((g) => g.games);
  assert.deepEqual(twice.map((g) => g.id), once.map((g) => g.id));
  assert.deepEqual(once.map((g) => g.id), ["d", "b", "a", "c"]);
});

test("Ratings view: each block's live games and finals sort by rating; upcoming and block order stay", () => {
  const games = [
    game({ id: "f1", sport: "ncaaf", state: "post", rating: 40 }),
    game({ id: "f2", sport: "ncaaf", state: "post", rating: 90 }),
    game({ id: "f3", sport: "ncaaf", state: "post", rating: null }),
    game({ id: "l1", sport: "ncaaf", state: "in", rating: null }),
    game({ id: "l2", sport: "ncaaf", state: "in", rating: 55, liveProgress: 0.3 }),
    game({ id: "l3", sport: "ncaaf", state: "in", rating: 55, liveProgress: 0.8 }),
    game({ id: "p1", sport: "ncaaf", state: "pre" }), game({ id: "p2", sport: "ncaaf", state: "pre" }),
    game({ id: "m1", sport: "mlb", state: "post", rating: 20 }),
    game({ id: "m2", sport: "mlb", state: "post", rating: 70 }),
  ];
  // The featured hero f1 leads its finals in the default view, not in Ratings.
  const featured = ["ncaaf:f1", "ncaaf:p2"];
  assert.deepEqual(groupEspnFrontPage(games, featured).map((g) => g.games.map((x) => x.id)), [
    ["l1", "l2", "l3", "p2", "p1", "f1", "f2", "f3"],
    ["m1", "m2"],
  ]);
  assert.deepEqual(groupEspnFrontPage(games, featured, true).map((g) => [g.sport, g.games.map((x) => x.id)]), [
    ["ncaaf", ["l3", "l2", "l1", "p2", "p1", "f2", "f1", "f3"]],
    ["mlb", ["m2", "m1"]],
  ]);
});

test("Ratings view: a tied rating keeps the featured order, and regrouping changes nothing", () => {
  const games = [
    game({ id: "a", sport: "nfl", state: "post", rating: 60 }),
    game({ id: "b", sport: "nfl", state: "post", rating: 60 }),
    game({ id: "c", sport: "nfl", state: "post", rating: 80 }),
  ];
  const once = groupEspnFrontPage(games, ["nfl:b"], true).flatMap((g) => g.games);
  assert.deepEqual(once.map((g) => g.id), ["c", "b", "a"]);
  const twice = groupEspnFrontPage(once, ["nfl:b"], true).flatMap((g) => g.games);
  assert.deepEqual(twice.map((g) => g.id), once.map((g) => g.id));
});

// ── Past days (Jacob 9/29): the day snapshot and its no-snapshot fallback ──

test("orderBySports: the given leagues in the given order, every game, nothing else", () => {
  const games = [
    game({ id: "m1", sport: "mlb" }), game({ id: "c1", sport: "ncaaf" }), game({ id: "n1", sport: "nfl" }),
    game({ id: "c2", sport: "ncaaf" }), game({ id: "m2", sport: "mlb" }), game({ id: "c1", sport: "ncaaf" }),
  ];
  assert.deepEqual(orderBySports(games, ["ncaaf", "mlb"]).map((g) => `${g.sport}:${g.id}`), ["ncaaf:c1", "ncaaf:c2", "mlb:m1", "mlb:m2"]);
  assert.deepEqual(orderBySports(games, []), []);
});

test("a baked snapshot reads back as the same features and body ids as the live payloads", () => {
  const payload = {
    sports: [
      { slug: "football", uid: "s:20", leagues: [
        { slug: "college-football", abbreviation: "NCAAF", events: [{ id: "401", priority: 0, competitors: [] }, { id: 402 }] },
        { slug: "nfl", events: [{ id: "901" }] },
      ] },
      { slug: "golf", leagues: [{ slug: "pga", events: [{ id: "g1" }] }] },
      { slug: "baseball", leagues: [{ slug: "mlb", events: [{ id: "501" }, { id: "502" }] }, { slug: "empty", events: [] }] },
      { slug: "tennis", leagues: [] },
      { slug: "soccer", leagues: [{ slug: "usa.1", events: [{ id: "801" }] }] },
    ],
  };
  const snap = JSON.parse(JSON.stringify(trimEspnHeader(payload)));
  assert.deepEqual(parseEspnHeader(snap), parseEspnHeader(payload));
  assert.deepEqual(parseFrontPageFeedIds(BODY), parseEspnFrontPageFeed(BODY));
  assert.deepEqual(trimEspnHeader(null), { sports: [] });
});
