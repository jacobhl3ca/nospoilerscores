import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// NRL (rugby league) + AFL, added 2026-09-27. Runs the real parseGame through
// jiti on real ESPN events and pins the plumbing every league add touches:
//   nrl-prelim-final-event.json  Panthers v Knights, 2026-09-27, finals week 3
//   nrl-round27-event.json       Warriors v Sea Eagles, 2026-09-05, round 27
//   afl-grand-final-event.json   Brisbane Lions at Fremantle, 2026-09-26
const jiti = createJiti(import.meta.url);
type Team = { id: string; logo: string; shortDisplayName: string };
type ParsedGame = {
  sport: string; state: string; isPlayoff: boolean; playoffLabel: string | null; rating: number | null;
  homeTeam: Team; awayTeam: Team;
};
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => ParsedGame;
  eventsToGames: (events: unknown[], sport: string) => ParsedGame[];
  normalizeRugbyLinescores: (competitors: { score?: string; linescores?: { value?: number; period?: number }[] }[]) => void;
  ALL_LEAGUES: { sport: string; label: string; startDate?: string; endDate?: string; championshipDate?: string; excludeFromAuto?: boolean }[];
  espnGameUrl: (game: { sport: string; id: string }) => string;
  sportStreamFallback: (sport: string) => string;
  sportGroup: (sport: string) => string;
}>("../src/lib/espn.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ESPN_SRC = src("../src/lib/espn.ts");
const PREFS_SRC = src("../src/lib/preferences.ts");
const YT_SRC = src("../src/lib/youtube.ts");
const BAKE_SRC = src("../scripts/prebake-news.mjs");
const AUDIT_SRC = src("../scripts/check-highlight-fallbacks.mjs");

test("ESPN's cumulative rugby linescores become per-half points, junk rows dropped", () => {
  const competitors = fixture("nrl-prelim-final-event.json").competitions[0].competitors;
  espn.normalizeRugbyLinescores(competitors);
  const rows = (c: { linescores: { value: number }[] }) => c.linescores.map((r) => r.value);
  // Panthers 14 (14 at half-time), Knights 22 (6 at half-time).
  assert.deepEqual(rows(competitors[0]), [14, 0]);
  assert.deepEqual(rows(competitors[1]), [6, 16]);
  // Rows that are not cumulative (a total that goes down) keep their values.
  const odd = [
    { score: "10", linescores: [{ value: 7, period: 1 }, { value: 3, period: 2 }, { value: 0, period: 20 }] },
    { score: "5", linescores: [{ value: 0, period: 1 }, { value: 5, period: 2 }] },
  ];
  espn.normalizeRugbyLinescores(odd);
  assert.deepEqual(odd[0].linescores.map((r) => r.value), [7, 3]);
});

test("an NRL prelim final parses as a playoff with its round, a rating and rugby logos", () => {
  const g = espn.parseGame(fixture("nrl-prelim-final-event.json"), "nrl");
  assert.equal(g.sport, "nrl");
  assert.equal(g.state, "post");
  assert.equal(g.isPlayoff, true, "finals are season type 2 under the 2026-final-nrl slug");
  assert.equal(g.playoffLabel, "Preliminary Final");
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/rugby/teams/500/289199.png");
  // 22-14: an 8-point game that was 8 at half-time too. Before the linescore
  // fix the two junk rows read it as level entering the "last period" (83).
  assert.equal(g.rating, 65);
});

test("an NRL regular-season game (ESPN type 1) survives the preseason filter", () => {
  const games = espn.eventsToGames([fixture("nrl-round27-event.json")], "nrl");
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.isPlayoff, false);
  assert.equal(g.playoffLabel, null);
  // 31-30 after trailing 12-20 at half-time: the comeback bonus tops it out.
  assert.equal(g.rating, 100);
});

test("the AFL Grand Final parses as a playoff with a rating and AFL logos", () => {
  const g = espn.parseGame(fixture("afl-grand-final-event.json"), "afl");
  assert.equal(g.sport, "afl");
  assert.equal(g.isPlayoff, true);
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/afl/500/fre.png");
  assert.equal(g.awayTeam.logo, "https://a.espncdn.com/i/teamlogos/afl/500/bl.png");
  // 96-89 (one goal and a behind); per-quarter rows, so no rewrite applies.
  assert.ok(typeof g.rating === "number" && g.rating >= 70, `rating ${g.rating}`);
  // Five goals up and pulling away every quarter must not read as close.
  const blowout = fixture("afl-grand-final-event.json");
  const away = blowout.competitions[0].competitors[1];
  away.score = "121";
  [30, 29, 37, 25].forEach((v, i) => { away.linescores[i].value = v; });
  assert.ok((espn.parseGame(blowout, "afl").rating ?? 100) < 50);
});

test("windows, groups, links and short codes", () => {
  const nrl = espn.ALL_LEAGUES.find((l) => l.sport === "nrl");
  const afl = espn.ALL_LEAGUES.find((l) => l.sport === "afl");
  assert.ok(nrl && afl);
  assert.deepEqual([nrl.label, nrl.startDate, nrl.endDate, nrl.championshipDate, nrl.excludeFromAuto], ["NRL", "02-28", "10-05", "10-04", true]);
  assert.deepEqual([afl.label, afl.startDate, afl.endDate, afl.championshipDate, afl.excludeFromAuto], ["AFL", "03-05", "09-27", "09-26", true]);
  assert.equal(espn.sportGroup("nrl"), "other");
  assert.equal(espn.sportGroup("afl"), "other");
  assert.ok(ESPN_SRC.includes('nrl: "/rugby-league/3/scoreboard"'));
  assert.ok(ESPN_SRC.includes('afl: "/australian-football/afl/scoreboard"'));
  assert.equal(espn.espnGameUrl({ sport: "nrl", id: "604844" }), "https://www.espn.com/nrl/match/_/gameId/604844/league/3");
  assert.equal(espn.espnGameUrl({ sport: "afl", id: "1133711" }), "https://www.espn.com/afl/game/_/gameId/1133711");
  // Watch landings, never a scorecard.
  assert.equal(espn.sportStreamFallback("nrl"), "https://www.watchnrl.com/");
  assert.equal(espn.sportStreamFallback("afl"), "https://www.watchafl.com.au/");
  assert.ok(PREFS_SRC.includes('nrl: "rl", afl: "au"'));
  const codes = PREFS_SRC.match(/const SPORT_TO_SHORT[^\n]*/)![0].match(/: "([a-z]+)"/g)!;
  assert.equal(new Set(codes).size, codes.length, "every short code is unique");
});

test("highlight channels agree across the client, the bake and the audit", () => {
  for (const [sport, channel] of [["nrl", "NRL - National Rugby League"], ["afl", "AFL"]]) {
    assert.ok(YT_SRC.includes(`${sport}: "${channel}"`), `youtube.ts ${sport}`);
    assert.ok(new RegExp(`sport: "${sport}",\\s+path: "[^"]+",\\s+channel: "${channel}"`).test(BAKE_SRC), `prebake ${sport}`);
    assert.ok(AUDIT_SRC.includes(`${sport}: "${channel}"`), `audit ${sport}`);
  }
  const dark = YT_SRC.slice(YT_SRC.indexOf("const NO_HIGHLIGHT_FALLBACK = new Set(["), YT_SRC.indexOf("export function hasNoTrustedHighlightSource"));
  assert.ok(!dark.includes('"nrl"') && !dark.includes('"afl"'));
});
