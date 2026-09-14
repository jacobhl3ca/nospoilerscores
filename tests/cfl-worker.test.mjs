import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../public/_worker.js";

// /api/cfl converts theScore's app API into the ESPN scoreboard shape so the
// client's parseGame reads the CFL like any football league. Fixtures are real
// theScore payloads captured 2026-09-13 (tests/fixtures/cfl-events.json), plus
// a synthesized tie, a postponed game and two DST-edge kickoffs.

const fx = JSON.parse(readFileSync(new URL("./fixtures/cfl-events.json", import.meta.url), "utf8"));

function withUpstream(handler) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.startsWith("https://api.thescore.com/")) throw new Error(`unexpected fetch ${url}`);
    return handler(url);
  };
  return () => { globalThis.fetch = realFetch; };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function route(path, upstream) {
  const restore = withUpstream(upstream);
  try {
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { res, body: await res.json() };
  } finally {
    restore();
  }
}
const scoreboard = (events) => (url) => (url.includes("/cfl/events") ? json(events) : json([]));

test("a final converts to a finished ESPN event with theScore logos and the US broadcast", async () => {
  const { body } = await route("/api/cfl?dates=20260912", scoreboard([fx.final]));
  assert.equal(body.events.length, 1);
  const e = body.events[0];
  assert.equal(e.id, "138558");
  assert.equal(e.date, "2026-09-12T17:00:00.000Z");
  assert.equal(e.name, "Ottawa REDBLACKS at Toronto Argonauts");
  assert.equal(e.shortName, "OTT @ TOR");
  assert.deepEqual(e.season, { type: 2, year: 2026 });
  assert.equal(e.week.number, 15);
  assert.equal(e.status.type.state, "post");
  assert.equal(e.status.type.name, "STATUS_FINAL");
  assert.equal(e.status.type.completed, true);
  assert.equal(e.status.type.shortDetail, "Final");
  assert.equal(e.status.period, 4);
  const [home, away] = e.competitions[0].competitors;
  assert.equal(home.homeAway, "home");
  assert.equal(home.team.id, "316");
  assert.equal(home.team.abbreviation, "TOR");
  assert.equal(home.team.displayName, "Toronto Argonauts");
  // Load-bearing: TSN titles carry full names and the highlight query is built
  // from shortDisplayName.
  assert.equal(home.team.shortDisplayName, "Toronto Argonauts");
  assert.equal(home.team.logo, "https://assets-sports-gcp.thescore.com/football/team/316/logo.png");
  assert.equal(home.team.color, "5f90b2");
  assert.equal(home.score, "26");
  assert.equal(away.score, "23");
  assert.equal(home.winner, true);
  assert.equal(away.winner, false);
  assert.deepEqual(home.records, [{ summary: "7-6" }]);
  // No US listing on this one → CFL+ (free stream).
  assert.deepEqual(e.competitions[0].broadcasts, [{ names: ["CFL+"] }]);
  assert.deepEqual(e.competitions[0].notes, []);
  assert.equal(e.competitions[0].venue.fullName, "BMO Field");
  assert.deepEqual(e.competitions[0].venue.address, { city: "Toronto", state: "ON", country: "Canada" });
  assert.equal(e.links[0].href, "https://www.thescore.com/cfl/event/138558");
});

test("a zero ties tail is dropped from the event record, a real tie is kept", async () => {
  const ev = JSON.parse(JSON.stringify(fx.final));
  ev.standings.home.short_record = "10-8-0";
  ev.standings.away.short_record = "6-6-1";
  const { body } = await route("/api/cfl?dates=20260912", scoreboard([ev]));
  const [home, away] = body.events[0].competitions[0].competitors;
  assert.deepEqual(home.records, [{ summary: "10-8" }]);
  assert.deepEqual(away.records, [{ summary: "6-6-1" }]);
});

test("pre-game: box_score is null, scores read 0, CBS Sports Network carries it", async () => {
  const { body } = await route("/api/cfl?dates=20260918", scoreboard([fx.pregame]));
  const e = body.events[0];
  assert.equal(e.status.type.state, "pre");
  assert.equal(e.status.type.name, "STATUS_SCHEDULED");
  assert.equal(e.status.type.shortDetail, "");
  assert.equal(e.status.period, 0);
  assert.equal(e.status.displayClock, "0:00");
  assert.equal(e.week.number, 16);
  for (const c of e.competitions[0].competitors) {
    assert.equal(c.score, "0");
    assert.equal(c.winner, false);
  }
  assert.deepEqual(e.competitions[0].broadcasts, [{ names: ["CBS Sports Network"] }]);
});

test("Grey Cup: season type 3, no week, note carries the title, neutral site", async () => {
  const { body } = await route("/api/cfl?dates=20251116", scoreboard([fx.greycup]));
  const e = body.events[0];
  assert.equal(e.season.type, 3);
  assert.equal(e.week, undefined);
  assert.deepEqual(e.competitions[0].notes, [{ headline: "112th Grey Cup" }]);
  assert.equal(e.competitions[0].neutralSite, true);
  assert.deepEqual(e.competitions[0].broadcasts, [{ names: ["CBS"] }]);
});

test("overtime final reads Final/OT with period 5", async () => {
  const { body } = await route("/api/cfl?dates=20250807", scoreboard([fx.overtime]));
  const e = body.events[0];
  assert.equal(e.status.type.shortDetail, "Final/OT");
  assert.equal(e.status.period, 5);
  assert.equal(e.status.type.state, "post");
});

test("a tie has no winner on either side", async () => {
  const { body } = await route("/api/cfl?dates=20260912", scoreboard([fx.tie]));
  const [home, away] = body.events[0].competitions[0].competitors;
  assert.equal(home.score, "24");
  assert.equal(away.score, "24");
  assert.equal(home.winner, false);
  assert.equal(away.winner, false);
});

test("postponed maps to STATUS_POSTPONED so eventsToGames drops it", async () => {
  const { body } = await route("/api/cfl?dates=20260918", scoreboard([fx.postponed]));
  assert.equal(body.events[0].status.type.name, "STATUS_POSTPONED");
  assert.equal(body.events[0].status.type.state, "pre");
});

test("a record-setting sentence in game_description never reaches the client", async () => {
  // "Bo Levi Mitchell becomes the 10th QB in CFL history to reach 100 career
  // wins…" names the winner of a finished game. Only short titles pass through.
  const { body } = await route("/api/cfl?dates=20250627", scoreboard([fx.recordSentence]));
  assert.deepEqual(body.events[0].competitions[0].notes, []);
  assert.equal(JSON.stringify(body).includes("Bo Levi"), false);
});

test("events bucket onto their ET day: a 02:14Z Sunday kickoff is Saturday's game", async () => {
  const sat = await route("/api/cfl?dates=20260912", scoreboard(fx.sep12));
  assert.deepEqual(sat.body.events.map((e) => e.shortName), ["OTT @ TOR", "SSK @ WPG", "CGY @ EDM", "MTL @ BC"]);
  const sun = await route("/api/cfl?dates=20260913", scoreboard(fx.sep12));
  assert.deepEqual(sun.body.events, []);
  const range = await route("/api/cfl?dates=20260911-20260913", scoreboard(fx.sep12));
  assert.equal(range.body.events.length, 4);
});

test("the theScore query window covers the ET day with slack on both sides", async () => {
  let asked = "";
  await route("/api/cfl?dates=20260912", (url) => { asked = url; return json([]); });
  const q = decodeURIComponent(asked);
  assert.match(q, /game_date\.in=2026-09-12T00:00:00\.000Z,2026-09-13T12:00:00\.000Z/);
  assert.match(q, /rpp=200/);
});

test("DST edge (Nov 1 fall-back): 03:30Z is still Oct 31 ET, 23:00Z is Nov 1 ET", async () => {
  const oct31 = await route("/api/cfl?dates=20261031", scoreboard(fx.dstEdge));
  assert.deepEqual(oct31.body.events.map((e) => e.id), ["900003"]);
  const nov1 = await route("/api/cfl?dates=20261101", scoreboard(fx.dstEdge));
  assert.deepEqual(nov1.body.events.map((e) => e.id), ["900004"]);
  // Playoff placeholders carry the round as a note and no week.
  assert.deepEqual(oct31.body.events[0].competitions[0].notes, [{ headline: "Eastern Semi-Final" }]);
  assert.equal(oct31.body.events[0].season.type, 3);
  assert.equal(oct31.body.events[0].week, undefined);
});

test("cache: 300s when nothing is live, 20s while a game is in progress", async () => {
  const idle = await route("/api/cfl?dates=20260912", scoreboard([fx.final]));
  assert.equal(idle.res.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(idle.res.headers.get("Access-Control-Allow-Origin"), "*");
  const live = JSON.parse(JSON.stringify(fx.final));
  live.event_status = "in_progress"; live.status = "in_progress";
  live.box_score.progress = { clock_label: "8:32 2nd", status: "in_progress", segment: 2, segment_string: "2nd", clock: "8:32", overtime: false };
  const hot = await route("/api/cfl?dates=20260912", scoreboard([live]));
  assert.equal(hot.res.headers.get("Cache-Control"), "public, max-age=20");
  const e = hot.body.events[0];
  assert.equal(e.status.type.state, "in");
  assert.equal(e.status.displayClock, "8:32");
  assert.equal(e.status.period, 2);
  assert.equal(e.status.type.shortDetail, "8:32 - 2nd");
});

test("live break labels map onto ESPN's Halftime / End of Nth shapes", async () => {
  const mk = (progress) => {
    const ev = JSON.parse(JSON.stringify(fx.final));
    ev.event_status = "in_progress"; ev.status = "in_progress"; ev.box_score.progress = progress;
    return ev;
  };
  const half = await route("/api/cfl?dates=20260912", scoreboard([mk({ clock_label: "Halftime", status: "in_progress", segment: 2, clock: "0:00" })]));
  assert.equal(half.body.events[0].status.type.shortDetail, "Halftime");
  assert.equal(half.body.events[0].status.type.name, "STATUS_HALFTIME");
  const end = await route("/api/cfl?dates=20260912", scoreboard([mk({ clock_label: "End of 3rd", status: "in_progress", segment: 3, clock: "0:00" })]));
  assert.equal(end.body.events[0].status.type.shortDetail, "End of 3rd");
  const ot = await route("/api/cfl?dates=20260912", scoreboard([mk({ clock_label: "OT", status: "in_progress", segment: 5, clock: "", overtime: true })]));
  assert.equal(ot.body.events[0].status.type.shortDetail, "OT");
  assert.equal(ot.body.events[0].status.period, 5);
});

test("upstream failure is a 200 with an empty slate, never a 5xx", async () => {
  const down = await route("/api/cfl?dates=20260912", () => json({ error: "nope" }, 500));
  assert.equal(down.res.status, 200);
  assert.deepEqual(down.body, { events: [] });
  const thrown = await route("/api/cfl?dates=20260912", () => { throw new Error("boom"); });
  assert.equal(thrown.res.status, 200);
  assert.deepEqual(thrown.body, { events: [] });
});

test("standings: one table, rank = playoff_seed, W-L-T only when ties > 0", async () => {
  const rows = JSON.parse(JSON.stringify(fx.standings));
  rows[3].ties = 1; rows[3].wins = 6; rows[3].losses = 6;
  const { res, body } = await route("/api/cfl/standings", (url) => (url.endsWith("/cfl/standings") ? json(rows) : json([])));
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=600");
  assert.equal(body.children.length, 1);
  const entries = body.children[0].standings.entries;
  assert.equal(entries.length, 9);
  const stat = (e, n) => e.stats.find((s) => s.name === n);
  const seeds = entries.map((e) => stat(e, "rank").value).sort((a, b) => a - b);
  assert.deepEqual(seeds, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const top = entries.find((e) => stat(e, "rank").value === 1);
  assert.equal(top.team.id, String(rows.find((r) => r.playoff_seed === 1).team.id));
  assert.equal(stat(top, "overall").summary, "10-3");
  const tied = entries[3];
  assert.equal(stat(tied, "overall").summary, "6-6-1");
  assert.equal(stat(top, "winPercent").value, 0.769);
  assert.equal(stat(top, "wins").value, 10);
  assert.equal(stat(tied, "ties").value, 1);
});

test("teams: ESPN core-API items with theScore logos", async () => {
  const { res, body } = await route("/api/cfl/teams", (url) => (url.endsWith("/cfl/teams") ? json(fx.teams) : json([])));
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=86400");
  assert.equal(body.items.length, 9);
  const ham = body.items.find((t) => t.abbreviation === "HAM");
  assert.equal(ham.id, "312");
  assert.equal(ham.displayName, "Hamilton Tiger-Cats");
  assert.equal(ham.active, true);
  assert.deepEqual(ham.logos, [{ href: "https://assets-sports-gcp.thescore.com/football/team/312/logo.png" }]);
});

test("OPTIONS preflight answers with CORS headers", async () => {
  const res = await worker.fetch(new Request("https://hidescore.com/api/cfl", { method: "OPTIONS" }), stubEnv());
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});
