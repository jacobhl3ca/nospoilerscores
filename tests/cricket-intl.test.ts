import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// International cricket (cricketintl), added 2026-09-27. Real ESPN payloads:
//   cricket-header.json            the scoreboard header on 2026-09-27, trimmed
//                                  to ids, names, classes and team names
//   cricket-24203-scoreboard.json  South Africa v Australia, 2nd ODI, final
//   cricket-youth-test-event.json  India U19 v Australia U19, a four-day youth
//                                  Test, live on day 1 (a multi-day shape)
const jiti = createJiti(import.meta.url);
type ParsedGame = {
  sport: string; state: string; rating: number | null; stage?: string | null; formatTag?: string | null;
  statusDetail: string; homeTeam: { displayName: string; logo?: string }; awayTeam: { displayName: string };
};
const espn = await jiti.import<{
  eventsToGames: (events: unknown[], sport: string) => ParsedGame[];
  parseGame: (event: unknown, sport: string) => ParsedGame;
  cricketMatchInfo: (e: unknown, now?: number) => { formatTag: string | null; stage: string | null };
  ALL_LEAGUES: { sport: string; label: string; startDate?: string; excludeFromAuto?: boolean }[];
  sportStreamFallback: (sport: string) => string;
}>("../src/lib/espn.ts");
const series = await import("../scripts/lib/cricket-series.mjs");
const yt = await jiti.import<{ hasNoTrustedHighlightSource: (s: string) => boolean }>("../src/lib/youtube.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("the header yields the five full-member series, no domestic, youth or associate ones", () => {
  const picked = series.pickInternationalSeries(fixture("cricket-header.json"));
  assert.deepEqual(picked.map((s: { id: string }) => s.id).sort(), ["22547", "23802", "24203", "24289", "24796"]);
  // County Championship, CSA T20, the Under-19 Test and Nigeria v Sierra Leone
  // (a real T20I, between associates) are all out.
  for (const out of ["8052", "8204", "8656", "24377", "1554562"]) assert.ok(!picked.some((s: { id: string }) => s.id === out), out);
});

test("series merge keeps a series through its rest days and drops it after", () => {
  const prev = [
    { id: "1", name: "old", start: "2026-09-01", end: "2026-09-20" },
    { id: "2", name: "resting", start: "2026-09-20", end: "2026-10-10" },
  ];
  const merged = series.mergeSeries(prev, [{ id: "3", name: "new", start: "2026-09-27", end: "2026-10-17" }], "2026-09-27");
  assert.deepEqual(merged.map((s: { id: string }) => s.id), ["2", "3"]);
});

test("an ODI parses to one card with its format and number, a rating and no result text", () => {
  const games = espn.eventsToGames(fixture("cricket-24203-scoreboard.json").events, "cricketintl");
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.state, "post");
  assert.equal(g.formatTag, "ODI");
  assert.equal(g.stage, "2nd ODI");
  assert.equal(g.statusDetail, "Final");
  assert.ok(typeof g.rating === "number", "a finished ODI rates");
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/cricket/500/3.png");
  // Nation names, not ESPN's codes ("SA", "AUS").
  assert.equal((g.homeTeam as { shortDisplayName?: string }).shortDisplayName, "South Africa");
  // Nothing outside the hidden score slots may carry a result.
  const text = JSON.stringify({ stage: g.stage, formatTag: g.formatTag, statusDetail: g.statusDetail });
  assert.doesNotMatch(text, /won|runs|wkts|target|\d{2,}\//i);
});

test("a multi-day match shows Day N of M and has no rating", () => {
  const e = fixture("cricket-youth-test-event.json");
  const info = espn.cricketMatchInfo(e);
  assert.equal(info.formatTag, "Test · Day 1 of 4");
  assert.match(info.stage ?? "", /^1st Youth Test · Day 1 of 4$/);
  // Before the start it reads the match length instead.
  const pre = { ...e, status: { ...e.status, session: "", type: { ...e.status.type, state: "pre" } } };
  assert.equal(espn.cricketMatchInfo(pre).formatTag, "Test · 4 days");
  assert.equal(espn.parseGame(e, "cricketintl").rating, null);
});

test("a women's side gets its nation's logo", () => {
  const e = structuredClone(fixture("cricket-24203-scoreboard.json").events[0]);
  e.competitions[0].competitors[0].team.displayName = "Zimbabwe Women";
  e.competitions[0].competitors[0].team.logo = "https://a.espncdn.com/i/teamlogos/cricket/500/271866.png";
  const g = espn.parseGame(e, "cricketintl");
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/cricket/500/9.png");
});

test("women's matches are tagged W", () => {
  const e = fixture("cricket-24203-scoreboard.json").events[0];
  const w = structuredClone(e);
  w.competitions[0].class.generalClassCard = "Women's ODI";
  assert.equal(espn.cricketMatchInfo(w).formatTag, "W ODI");
});

test("the column is year-round, opt-in, dark, and watches on Willow", () => {
  const l = espn.ALL_LEAGUES.find((x) => x.sport === "cricketintl");
  assert.ok(l);
  assert.equal(l.label, "Cricket");
  assert.equal(l.startDate, undefined);
  assert.equal(l.excludeFromAuto, true);
  assert.equal(espn.ALL_LEAGUES.find((x) => x.sport === "cricket")?.label, "IPL");
  assert.equal(espn.sportStreamFallback("cricketintl"), "https://www.willow.tv/");
  assert.equal(yt.hasNoTrustedHighlightSource("cricketintl"), true);
});

test("the worker merges series scoreboards and drops tour games", async () => {
  const header = fixture("cricket-header.json");
  const sb = fixture("cricket-24203-scoreboard.json");
  const tour = structuredClone(sb);
  tour.events[0].id = "1525658";
  tour.events[0].competitions[0].class.internationalClassId = "0";
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = String(input instanceof Request ? input.url : input);
    asked.push(u);
    if (u.includes("/scoreboard/header")) return new Response(JSON.stringify(header));
    if (u.includes("/cricket/24203/scoreboard?dates=20260927")) return new Response(JSON.stringify(sb));
    if (u.includes("/cricket/24203/scoreboard?dates=20261003")) return new Response(JSON.stringify(tour));
    return new Response(JSON.stringify({ events: [] }));
  }) as typeof fetch;
  try {
    const worker = (await import("../public/_worker.js")).default;
    const list = { series: [{ id: "24203", name: "Australia tour of South Africa", start: "2026-09-24", end: "2026-10-31" }] };
    // The bake is read from R2 (env.DATA), like every other /news file.
    const env = {
      DATA: { get: async (key: string) => (key === "news/cricket-series.json" ? { json: async () => list } : null) },
      ASSETS: { fetch: async () => new Response("nf", { status: 404 }) },
    };
    const ctx = { waitUntil() {} };
    const day = await (await worker.fetch(new Request("https://hidescore.com/api/cricket-intl?dates=20260927"), env, ctx)).json();
    assert.deepEqual(day.events.map((e: { id: string }) => e.id), ["1525656"]);
    assert.equal(day.events[0].seriesId, "24203");
    const tourDay = await (await worker.fetch(new Request("https://hidescore.com/api/cricket-intl?dates=20261003"), env, ctx)).json();
    assert.deepEqual(tourDay.events, [], "a tour game against a board XI is not an international");
    // A range is asked one day at a time (ESPN's cricket feeds answer a range with nothing).
    assert.ok(!asked.some((u) => /dates=\d{8}-\d{8}/.test(u) && u.includes("/cricket/")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
