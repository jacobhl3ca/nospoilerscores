import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// Club rugby (Premiership, URC, Top 14, Challenge Cup, MLR) + the 2026
// rugbytest window, added 2026-09-27. Real ESPN events:
//   urc-round1-event.json       Lions v Leinster, 2026-09-26, 27-26
//   urc-no-halftime-event.json  Benetton Treviso v Dragons, 2026-09-25, 19-19,
//                               no half-time snapshot on the feed
//   top14-ghost-events.json     a played Top 14 game plus ESPN's stale copy
const jiti = createJiti(import.meta.url);
type Team = { shortDisplayName: string; logo: string };
type ParsedGame = { sport: string; state: string; isPlayoff: boolean; isPreseason: boolean; rating: number | null; homeTeam: Team; awayTeam: Team };
type League = { sport: string; label: string; startDate?: string; endDate?: string; championshipDate?: string; excludeFromAuto?: boolean; yearCycle?: { mod: number; anchor: number } };
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => ParsedGame;
  eventsToGames: (events: unknown[], sport: string) => ParsedGame[];
  ALL_LEAGUES: League[];
  isLeagueActive: (league: League, viewDate: Date) => boolean;
  espnGameUrl: (game: { sport: string; id: string }) => string;
  sportStreamFallback: (sport: string) => string;
  sportGroup: (sport: string) => string;
  normalizeRugbyLinescores: (competitors: unknown[]) => void;
}>("../src/lib/espn.ts");
const yt = await jiti.import<{ hasNoTrustedHighlightSource: (sport: string) => boolean }>("../src/lib/youtube.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const CLUB = ["premrugby", "urc", "top14", "challengecup", "mlr"] as const;
const IDS = { premrugby: "267979", urc: "270557", top14: "270559", challengecup: "272073", mlr: "289262" };

test("a URC game survives the type-1 filter and rates off real half-time rows", () => {
  const games = espn.eventsToGames([fixture("urc-round1-event.json")], "urc");
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.state, "post");
  assert.equal(g.isPlayoff, false);
  // ESPN's type 1 is the regular season in rugby, so no "PRE" chip.
  assert.equal(g.isPreseason, false);
  assert.match(g.homeTeam.logo, /teamlogos\/rugby\/teams\/500\/\d+\.png$/);
  // 27-26, trailing 17-19 at half-time: a one-point comeback.
  assert.ok(typeof g.rating === "number" && g.rating >= 80, `rating ${g.rating}`);
});

test("a feed with no half-time snapshot rates off the final margin, not a 0-0 half", () => {
  const e = fixture("urc-no-halftime-event.json");
  const g = espn.parseGame(e, "urc");
  assert.equal(g.state, "post");
  assert.ok(typeof g.rating === "number", "a draw still rates");
  // The rows are dropped rather than read as a 0-0 half-time.
  const competitors = fixture("urc-no-halftime-event.json").competitions[0].competitors;
  espn.normalizeRugbyLinescores(competitors);
  for (const c of competitors) assert.deepEqual(c.linescores, []);
  // A real half-time row (Lions 17, Leinster 19) is kept and differenced.
  const real = fixture("urc-round1-event.json").competitions[0].competitors;
  espn.normalizeRugbyLinescores(real);
  assert.deepEqual(real.map((c: { linescores: { value: number }[] }) => c.linescores.map((r) => r.value)), [[17, 10], [19, 7]]);
});

test("a Top 14 ghost copy of a played game is dropped, the real final kept", () => {
  // 604732 "Bordeaux v Stade Toulousain" (no venue, scheduled forever) next to
  // 604373 "Stade Toulousain v Bordeaux Begles" (final 48-12), 2026-09-13.
  const games = espn.eventsToGames(fixture("top14-ghost-events.json"), "top14");
  assert.equal(games.length, 1);
  assert.equal(games[0].state, "post");
});

test("club windows, links and groups", () => {
  for (const s of CLUB) {
    const l = espn.ALL_LEAGUES.find((x) => x.sport === s);
    assert.ok(l, s);
    assert.equal(l.excludeFromAuto, true, `${s} is opt-in`);
    assert.ok(l.championshipDate, `${s} has a final`);
    assert.equal(espn.sportGroup(s), "other");
    assert.equal(espn.espnGameUrl({ sport: s, id: "1" }), `https://www.espn.com/rugby/match/_/gameId/1/league/${IDS[s]}`);
    assert.equal(espn.sportStreamFallback(s), "https://www.espn.com/rugby/");
    assert.ok(src("../src/lib/espn.ts").includes(`${s}: "/rugby/${IDS[s]}/scoreboard"`), `${s} path`);
  }
  const urc = espn.ALL_LEAGUES.find((x) => x.sport === "urc")!;
  assert.ok(espn.isLeagueActive(urc, new Date(2026, 8, 27)));
  assert.ok(espn.isLeagueActive(urc, new Date(2027, 5, 18)), "URC final day");
  assert.ok(!espn.isLeagueActive(urc, new Date(2027, 6, 15)), "URC off in July");
});

test("rugby tests show in 2026 for the Aug–Oct tests, and still in odd years", () => {
  const rows = espn.ALL_LEAGUES.filter((x) => x.sport === "rugbytest");
  const on = (d: Date) => rows.some((l) => espn.isLeagueActive(l, d));
  assert.ok(on(new Date(2026, 8, 27)), "Australia v South Africa, 2026-09-27");
  assert.ok(on(new Date(2026, 9, 17)), "Bledisloe, 2026-10-17");
  assert.ok(!on(new Date(2026, 6, 10)), "July 2026 belongs to nationschamp");
  assert.ok(!on(new Date(2026, 10, 20)), "November 2026 belongs to nationschamp");
  assert.ok(on(new Date(2027, 6, 10)), "odd-year July tests unchanged");
});

test("only URC is lit; the other four stay dark", () => {
  assert.equal(yt.hasNoTrustedHighlightSource("urc"), false);
  for (const s of ["premrugby", "top14", "challengecup", "mlr"]) assert.equal(yt.hasNoTrustedHighlightSource(s), true, s);
  const bake = src("../scripts/prebake-news.mjs");
  const audit = src("../scripts/check-highlight-fallbacks.mjs");
  assert.ok(/sport: "urc",\s+path: "\/rugby\/270557\/scoreboard",\s+channel: "United Rugby Championship"/.test(bake));
  assert.ok(audit.includes('urc: "United Rugby Championship"'));
  for (const f of [src("../src/lib/youtube.ts"), bake, audit]) {
    assert.ok(f.includes('"Cardiff Blues": "Cardiff Rugby"'), "Cardiff alias in all three");
    assert.ok(f.includes('"Benetton Treviso": "Benetton"'), "Benetton alias in all three");
  }
});

test("every union column reads the shared r/rugbyunion bake", () => {
  const news = src("../src/lib/news.ts");
  for (const s of ["sixnations", "urc", "premrugby", "top14", "challengecup", "mlr", "rugbytest"]) {
    assert.ok(news.includes(`${s}: { key: "reddit-rugbyunion", label: "r/rugbyunion" }`), s);
  }
  assert.ok(src("../scripts/prebake-news.mjs").includes('["reddit-rugbyunion", () => fetchReddit("rugbyunion", "r/rugbyunion")]'));
  assert.ok(src("../scripts/check-staleness.mjs").includes('"reddit-rugbyunion"'));
});
