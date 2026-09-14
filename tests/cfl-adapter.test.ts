import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import worker from "../public/_worker.js";

// The worker's ESPN-shaped CFL events, run through the real client parser
// (eventsToGames → parseGame) exactly as fetchGames does. No network: the
// upstream theScore call is stubbed with the captured fixtures.

const jiti = createJiti(import.meta.url);
type Game = {
  id: string; state: string; statusDetail: string; period: number; rating: number | null;
  isPlayoff: boolean; playoffLabel: string | null; weekNumber: number | null; broadcasts: string[];
  homeTeam: { id: string; logo: string; score: string; winner: boolean; record: string; shortDisplayName: string };
  awayTeam: { id: string; logo: string; score: string; winner: boolean; record: string; shortDisplayName: string };
  venue: string; venueLocation: string; recapUrl: string | null;
};
const { eventsToGames, espnGameUrl, sportStreamFallback } = await jiti.import<{
  eventsToGames: (events: unknown[], sport: string) => Game[];
  espnGameUrl: (g: Game) => string;
  sportStreamFallback: (s: string) => string;
}>("../src/lib/espn.ts");

const fx = JSON.parse(readFileSync(new URL("./fixtures/cfl-events.json", import.meta.url), "utf8"));

async function viaWorker(events: unknown[], dates: string): Promise<Game[]> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(events), { status: 200 })) as typeof fetch;
  try {
    const res = await worker.fetch(
      new Request(`https://hidescore.com/api/cfl?dates=${dates}`),
      { ASSETS: { async fetch() { return new Response("", { status: 404 }); } } },
    );
    const body = (await res.json()) as { events: unknown[] };
    return eventsToGames(body.events, "cfl");
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("a finished regular-season game rates, carries week 15, logos and W-L chips", async () => {
  const [g] = await viaWorker([fx.final], "20260912");
  assert.equal(g.id, "138558");
  assert.equal(g.state, "post");
  assert.equal(g.statusDetail, "Final");
  assert.equal(g.period, 4);
  assert.equal(typeof g.rating, "number");
  assert.equal(g.isPlayoff, false);
  assert.equal(g.playoffLabel, null);
  assert.equal(g.weekNumber, 15);
  assert.equal(g.homeTeam.id, "cfl-316");
  assert.equal(g.awayTeam.id, "cfl-800");
  assert.equal(g.homeTeam.logo, "https://assets-sports-gcp.thescore.com/football/team/316/logo.png");
  assert.equal(g.homeTeam.score, "26");
  assert.equal(g.awayTeam.score, "23");
  assert.equal(g.homeTeam.winner, true);
  assert.equal(g.homeTeam.record, "7-6");
  assert.equal(g.awayTeam.record, "0-12");
  assert.equal(g.homeTeam.shortDisplayName, "Toronto Argonauts");
  assert.deepEqual(g.broadcasts, ["CFL+"]);
  assert.equal(g.venue, "BMO Field");
  assert.equal(g.venueLocation, "Toronto, ON");
  assert.equal(g.recapUrl, "https://www.thescore.com/cfl/event/138558");
  assert.equal(espnGameUrl(g), "https://www.thescore.com/cfl/event/138558");
});

test("the Grey Cup is a playoff game with a Grey Cup label and no week", async () => {
  const [g] = await viaWorker([fx.greycup], "20251116");
  assert.equal(g.isPlayoff, true);
  assert.equal(g.playoffLabel, "112th Grey Cup");
  assert.equal(g.weekNumber, null);
  assert.deepEqual(g.broadcasts, ["CBS"]);
});

test("division rounds flag as playoff through the notes regex", async () => {
  const games = await viaWorker(fx.dstEdge, "20261031-20261101");
  assert.equal(games.length, 2);
  assert.deepEqual(games.map((g) => g.playoffLabel), ["Eastern Semi-Final", "Western Semi-Final"]);
  assert.ok(games.every((g) => g.isPlayoff));
});

test("overtime final reads Final/OT and period 5", async () => {
  const [g] = await viaWorker([fx.overtime], "20250807");
  assert.equal(g.statusDetail, "Final/OT");
  assert.equal(g.period, 5);
});

test("a pre-game event is a scheduled card with 0-0 and the CBSSN broadcast", async () => {
  const [g] = await viaWorker([fx.pregame], "20260918");
  assert.equal(g.state, "pre");
  assert.equal(g.homeTeam.score, "0");
  assert.equal(g.rating, null);
  assert.deepEqual(g.broadcasts, ["CBS Sports Network"]);
  assert.equal(g.weekNumber, 16);
});

test("postponed games are dropped, ties keep no winner", async () => {
  const games = await viaWorker([fx.postponed, fx.tie], "20260912-20260918");
  assert.equal(games.length, 1);
  assert.equal(games[0].id, "900001");
  assert.equal(games[0].homeTeam.winner, false);
  assert.equal(games[0].awayTeam.winner, false);
});

test("the worker standings rank as playoff seeds, and gate at 0-0", async () => {
  const { rankFromStandings } = await import("../src/lib/standingsRank.ts");
  const realFetch = globalThis.fetch;
  const standingsVia = async (rows: unknown[]) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
    try {
      const res = await worker.fetch(new Request("https://hidescore.com/api/cfl/standings"), { ASSETS: { async fetch() { return new Response("", { status: 404 }); } } });
      return rankFromStandings("cfl", await res.json());
    } finally {
      globalThis.fetch = realFetch;
    }
  };
  const mid = await standingsVia(fx.standings);
  assert.equal(mid.size, 9);
  assert.equal(mid.get(String(fx.standings.find((s: { playoff_seed: number }) => s.playoff_seed === 1).team.id)), 1);
  const opening = (fx.standings as Array<Record<string, unknown>>).map((s) => ({ ...s, wins: 0, losses: 0, ties: 0 }));
  assert.equal((await standingsVia(opening)).size, 0);
});

test("the CFL stream fallback lands on the where-to-watch page", () => {
  assert.equal(sportStreamFallback("cfl"), "https://cfl.ca/where-to-watch-2026-broadcast-information/");
});

test("CFL playoff cards gate the highlight title on the round, regular season on the week", async () => {
  const { getCompetitionTitleTokens } = await jiti.import<{
    getCompetitionTitleTokens: (sport: string, opts?: { preseason?: boolean; playoff?: boolean; playoffLabel?: string | null }) => string[];
  }>("../src/lib/youtube.ts");
  assert.deepEqual(getCompetitionTitleTokens("cfl", { playoff: false }), []);
  assert.deepEqual(getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: "112th Grey Cup" }), ["grey cup"]);
  assert.deepEqual(getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: "Eastern Semi-Final" }), ["semi final"]);
  assert.deepEqual(getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: "Eastern Final" }), ["east final", "eastern final"]);
  assert.deepEqual(getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: "Western Final" }), ["west final", "western final"]);
  assert.ok(getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: null }).includes("grey cup"));
  // The gate is not a regression for the NFL preseason path.
  assert.deepEqual(getCompetitionTitleTokens("nfl", { preseason: true }), ["preseason", "hall of fame"]);
});
