import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { formatGameProgress } from "../src/lib/liveProgress.ts";

// PLL + NLL, added 2026-10-13 (a "Major League Lacrosse" league request; the
// MLL merged into the PLL in 2020). Runs the real parseGame through jiti on
// real ESPN events and pins the plumbing every league add touches:
//   pll-championship-event.json   Outlaws at Waterdogs, 2026-09-20, 14-4 final
//   pll-20260530-scoreboard.json  the three PLL games of 2026-05-30 (Week 3)
//   pll-overtime-event.json       Whipsnakes at Cannons, 2026-08-07, 14-12 OT
//   nll-finals-g2-event.json      Rock at Thunderbirds, 2026-05-17, Finals G2
// ESPN files every one of these as season type 2 "regular-season" with no
// notes and no series: the playoff round comes off lib/lacrossePlayoffs.ts.
const jiti = createJiti(import.meta.url);
type Team = { id: string; logo: string; score?: string };
type ParsedGame = {
  sport: string; state: string; period: number; clock: string; statusDetail: string;
  isPlayoff: boolean; playoffLabel: string | null; seriesStatus: string | null; seriesNote: string | null;
  rating: number | null; homeTeam: Team; awayTeam: Team; weekNumber?: number | null;
};
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => ParsedGame;
  eventsToGames: (events: unknown[], sport: string) => ParsedGame[];
  ALL_LEAGUES: { sport: string; label: string; startDate?: string; endDate?: string; championshipDate?: string; excludeFromAuto?: boolean }[];
  espnGameUrl: (game: { sport: string; id: string; recapUrl?: string | null }) => string;
  sportStreamFallback: (sport: string) => string;
  sportGroup: (sport: string) => string;
}>("../src/lib/espn.ts");
const { pairingSpoilsEarlierRound } = await jiti.import<{
  pairingSpoilsEarlierRound: (g: Pick<ParsedGame, "isPlayoff" | "playoffLabel"> & { sport: string; stage?: string | null }) => boolean;
}>("../src/lib/pairingMask.ts");
const { lacrossePlayoffRound, pllWeekNumber } = await jiti.import<{
  lacrossePlayoffRound: (sport: "pll" | "nll", iso: string) => string | null;
  pllWeekNumber: (iso: string) => number | null;
}>("../src/lib/lacrossePlayoffs.ts");
const { hasNoTrustedHighlightSource, getCompetitionTitleTokens, highlightGateMissing } = await jiti.import<{
  hasNoTrustedHighlightSource: (sport: string) => boolean;
  getCompetitionTitleTokens: (sport: string, opts?: { playoff?: boolean; playoffLabel?: string | null }) => string[];
  highlightGateMissing: (g: { sport: string; weekNumber?: number | null; isPlayoff?: boolean; playoffLabel?: string | null }) => boolean;
}>("../src/lib/youtube.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ESPN_SRC = src("../src/lib/espn.ts");
const PREFS_SRC = src("../src/lib/preferences.ts");

// Every string a parsed game carries that a card could print: a score must not
// be among them. (The score lives only on homeTeam/awayTeam.score, which the
// card never renders; the rating reads it.)
function printable(g: ParsedGame): string {
  return [g.statusDetail, g.playoffLabel, g.seriesStatus, g.seriesNote].filter(Boolean).join(" | ");
}

test("the PLL Championship parses as a masked playoff with a low rating and team logos", () => {
  const g = espn.parseGame(fixture("pll-championship-event.json"), "pll");
  assert.equal(g.sport, "pll");
  assert.equal(g.state, "post");
  assert.equal(g.isPlayoff, true, "Sep 20 2026 is the Championship by date");
  assert.equal(g.playoffLabel, "Championship");
  assert.equal(g.seriesStatus, null);
  assert.equal(pairingSpoilsEarlierRound(g), true, "the final pairing names both semifinal winners");
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/pll/500/scoreboard/127637.png");
  assert.ok(!/\b14\b|\b4\b|14-4|4-14/.test(printable(g)), printable(g));
  // 14-4 and 10 up entering the fourth: a blowout reads low.
  assert.ok(typeof g.rating === "number" && g.rating < 50, `rating ${g.rating}`);
});

test("a PLL regular-season day: three cards, no playoff flag, every game rated", () => {
  const games = espn.eventsToGames(fixture("pll-20260530-scoreboard.json").events, "pll");
  assert.equal(games.length, 3);
  for (const g of games) {
    assert.equal(g.isPlayoff, false);
    assert.equal(g.playoffLabel, null);
    assert.equal(pairingSpoilsEarlierRound(g), false);
    assert.equal(typeof g.rating, "number");
    assert.equal(printable(g), "Final");
  }
  // 10-8 (2 goals) rates above 16-9 (7 goals).
  const byMargin = games.map((g) => [Math.abs(+g.homeTeam.score! - +g.awayTeam.score!), g.rating!] as const).sort((a, b) => a[0] - b[0]);
  assert.ok(byMargin[0][1] > byMargin[byMargin.length - 1][1], JSON.stringify(byMargin));
});

test("sudden-death OT earns the OT bonus and labels as OT", () => {
  const g = espn.parseGame(fixture("pll-overtime-event.json"), "pll");
  assert.equal(g.period, 5);
  assert.equal(g.rating, 100);
  assert.equal(formatGameProgress({ ...g, state: "in", statusDetail: "OT", clock: "2:31" } as never).full, "OT - 2:31");
  for (const [period, label] of [[1, "Q1"], [2, "Q2"], [3, "Q3"], [4, "Q4"], [6, "2OT"]] as const) {
    assert.equal(formatGameProgress({ ...g, state: "in", period, statusDetail: "", clock: "5:00" } as never).short, label);
  }
  assert.equal(formatGameProgress({ ...g, state: "in", period: 2, statusDetail: "Halftime", clock: "0:00" } as never).full, "Halftime");
});

test("NLL Finals Game 2: a masked playoff card with no series score", () => {
  const g = espn.parseGame(fixture("nll-finals-g2-event.json"), "nll");
  assert.equal(g.isPlayoff, true);
  assert.equal(g.playoffLabel, "Finals");
  assert.equal(g.seriesStatus, null, "ESPN sends no series object for the NLL");
  assert.equal(pairingSpoilsEarlierRound(g), true);
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/nll/500/125426.png");
  assert.ok(!/\b(7|12)\b|leads|series/i.test(printable(g)), printable(g));
  assert.equal(typeof g.rating, "number");
});

test("playoff rounds by date: quarterfinals show, later rounds mask", () => {
  const cases: [sport: "pll" | "nll", iso: string, round: string | null, masks: boolean][] = [
    ["pll", "2026-05-30T17:00Z", null, false],
    ["pll", "2026-08-30T00:30Z", "Quarterfinals", false], // Aug 29, 8:30 pm ET
    ["pll", "2026-09-07T19:00Z", "Semifinals", true],
    ["pll", "2026-03-07T23:30Z", "Championship Series Semifinal", true],
    ["pll", "2026-03-08T19:00Z", "Championship Series Final", true],
    ["pll", "2026-03-07T01:00Z", null, false], // Mar 6 ET, a group game
    ["nll", "2026-04-25T02:00Z", "Quarterfinals", false], // Apr 24 ET
    ["nll", "2026-05-09T22:00Z", "Semifinals", true],
    ["nll", "2026-04-19T19:00Z", null, false],
    ["nll", "2027-01-09T00:00Z", null, false], // a season with no rows yet
  ];
  for (const [sport, iso, round, masks] of cases) {
    assert.equal(lacrossePlayoffRound(sport, iso), round, `${sport} ${iso}`);
    assert.equal(pairingSpoilsEarlierRound({ sport, isPlayoff: round != null, playoffLabel: round }), masks, `${sport} ${iso}`);
  }
});

test("windows, groups, links, short codes; PLL lit, NLL dark", () => {
  const pll = espn.ALL_LEAGUES.filter((l) => l.sport === "pll");
  const nll = espn.ALL_LEAGUES.filter((l) => l.sport === "nll");
  assert.deepEqual(pll.map((l) => [l.label, l.startDate, l.endDate, l.championshipDate, l.excludeFromAuto]), [
    ["PLL", "02-26", "03-09", "03-08", true],
    ["PLL", "05-07", "09-21", "09-20", true],
  ]);
  assert.deepEqual(nll.map((l) => [l.label, l.startDate, l.endDate, l.championshipDate, l.excludeFromAuto]), [["NLL", "11-26", "05-18", "05-17", true]]);
  assert.equal(espn.sportGroup("pll"), "us");
  assert.equal(espn.sportGroup("nll"), "us");
  assert.ok(ESPN_SRC.includes('pll: "/lacrosse/pll/scoreboard"'));
  assert.ok(ESPN_SRC.includes('nll: "/lacrosse/nll/scoreboard"'));
  assert.equal(espn.espnGameUrl({ sport: "pll", id: "401919201" }), "https://www.espn.com/pll/boxscore/_/gameId/401919201");
  assert.equal(espn.espnGameUrl({ sport: "nll", id: "401872545" }), "https://www.espn.com/nll/boxscore/_/gameId/401872545");
  assert.equal(espn.sportStreamFallback("pll"), "https://www.espn.com/watch/");
  assert.equal(espn.sportStreamFallback("nll"), "https://www.espn.com/watch/");
  assert.ok(PREFS_SRC.includes('pll: "pl", nll: "lx"'));
  const codes = PREFS_SRC.match(/const SPORT_TO_SHORT[^\n]*/)![0].match(/: "([a-z]+)"/g)!;
  assert.equal(new Set(codes).size, codes.length, "every short code is unique");
  assert.equal(hasNoTrustedHighlightSource("pll"), false, "lit behind the week gate (PR 2)");
  assert.equal(hasNoTrustedHighlightSource("nll"), true);
});

// PR 2: the PLL highlight gate. The channel titles regular-season cuts by week
// and playoff cuts by round; ESPN sends neither, so both come off
// lib/lacrossePlayoffs.ts.
test("PLL weeks come off the 2026 table: Friday to Monday, All-Star weekend and playoffs have none", () => {
  const cases: [iso: string, week: number | null][] = [
    ["2026-05-08T23:00Z", 1],  // Fri May 8, the opener
    ["2026-05-11T00:30Z", 1],  // Sun May 10, 8:30 pm ET
    ["2026-05-30T17:00Z", 3],  // the Atlas-Outlaws game the live worker got wrong
    ["2026-07-04T19:00Z", null], // All-Star weekend (titled by event, not week)
    ["2026-07-11T19:00Z", 8],
    ["2026-08-08T19:00Z", 12],
    ["2026-08-15T19:00Z", 13],
    ["2026-08-30T00:30Z", null], // Quarterfinals
    ["2026-09-20T16:30Z", null], // Championship
    ["2026-03-01T19:00Z", null], // Championship Series
    ["2027-05-08T23:00Z", null], // a year with no row
  ];
  for (const [iso, week] of cases) assert.equal(pllWeekNumber(iso), week, iso);
  const games = espn.eventsToGames(fixture("pll-20260530-scoreboard.json").events, "pll");
  assert.deepEqual(games.map((g) => g.weekNumber), [3, 3, 3]);
  assert.equal(espn.parseGame(fixture("pll-championship-event.json"), "pll").weekNumber, null);
  assert.equal(espn.parseGame(fixture("nll-finals-g2-event.json"), "nll").weekNumber, null);
});

test("PLL playoff cards send their round, and a PLL game with no week and no round asks for nothing", () => {
  const final = espn.parseGame(fixture("pll-championship-event.json"), "pll");
  assert.deepEqual(getCompetitionTitleTokens("pll", { playoff: true, playoffLabel: final.playoffLabel }), ["championship game"]);
  assert.deepEqual(getCompetitionTitleTokens("pll", { playoff: true, playoffLabel: "Quarterfinals" }), ["quarterfinals"]);
  assert.deepEqual(getCompetitionTitleTokens("pll", { playoff: true, playoffLabel: "Semifinals" }), ["semifinals"]);
  assert.deepEqual(getCompetitionTitleTokens("pll", { playoff: false }), []);
  assert.equal(highlightGateMissing({ sport: "pll", weekNumber: 3, isPlayoff: false, playoffLabel: null }), false);
  assert.equal(highlightGateMissing({ ...final, sport: "pll" }), false);
  assert.equal(highlightGateMissing({ sport: "pll", weekNumber: null, isPlayoff: true, playoffLabel: "Championship Series Final" }), true);
  assert.equal(highlightGateMissing({ sport: "pll", weekNumber: null, isPlayoff: false, playoffLabel: null }), true);
  assert.equal(highlightGateMissing({ sport: "nfl", weekNumber: null, isPlayoff: false, playoffLabel: null }), false);
});
