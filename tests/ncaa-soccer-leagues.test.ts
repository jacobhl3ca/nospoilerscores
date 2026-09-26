import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

import { SHORT_LEAGUE_LABELS } from "../src/lib/leagueLabels.ts";

// NCAA women's + men's soccer (ncaawsoc / ncaamsoc), added 2026-09-26. Runs
// the real parseGame through jiti on a real ESPN event (Stanford at SMU,
// 2026-09-25, usa.ncaa.w.1) and pins the plumbing every league add touches.
const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => {
    sport: string; isPlayoff: boolean; rating: number | null; broadcasts: string[];
    homeTeam: { id: string; logo: string; record: string; rank: number | null; shortDisplayName: string };
    awayTeam: { id: string; logo: string; record: string; rank: number | null; shortDisplayName: string };
  };
  ALL_LEAGUES: { sport: string; label: string; startDate?: string; endDate?: string; excludeFromAuto?: boolean }[];
  espnGameUrl: (game: { sport: string; id: string }) => string;
  sportGroup: (sport: string) => string;
}>("../src/lib/espn.ts");

const EVENT = JSON.parse(readFileSync(new URL("./fixtures/ncaawsoc-event.json", import.meta.url), "utf8"));
const ESPN_SRC = readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
const PREFS_SRC = readFileSync(new URL("../src/lib/preferences.ts", import.meta.url), "utf8");

test("a real women's college soccer event parses: school logo from the payload, W-L-T record, coaches-poll rank", () => {
  const g = espn.parseGame(EVENT, "ncaawsoc");
  assert.equal(g.sport, "ncaawsoc");
  // Team ids are soccer-specific (20327), so the logo must come from team.logo,
  // which points at the school mark — not from the id.
  assert.equal(g.homeTeam.id, "ncaawsoc-20327");
  assert.equal(g.homeTeam.logo, "https://a.espncdn.com/i/teamlogos/ncaa/500/2567.png");
  assert.equal(g.awayTeam.logo, "https://a.espncdn.com/i/teamlogos/ncaa/500/24.png");
  assert.equal(g.homeTeam.record, "5-3-3");
  assert.equal(g.awayTeam.rank, 6, "Stanford is #6 in the United Soccer Coaches poll");
  assert.equal(g.homeTeam.rank, null);
  assert.deepEqual(g.broadcasts, ["ACCNX"]);
  assert.equal(g.isPlayoff, false);
  assert.ok(typeof g.rating === "number");
});

test("both feeds are opt-in leagues in the soccer group with mid-Aug to mid-Dec windows", () => {
  const women = espn.ALL_LEAGUES.find((l) => l.sport === "ncaawsoc");
  const men = espn.ALL_LEAGUES.find((l) => l.sport === "ncaamsoc");
  assert.ok(women && men);
  assert.equal(women.label, "NCAAW Soccer");
  assert.equal(men.label, "NCAA Soccer");
  assert.equal(women.excludeFromAuto, true);
  assert.equal(men.excludeFromAuto, true);
  assert.deepEqual([women.startDate, women.endDate], ["08-12", "12-08"]);
  assert.deepEqual([men.startDate, men.endDate], ["08-20", "12-15"]);
  assert.equal(espn.sportGroup("ncaawsoc"), "soccer");
  assert.equal(espn.sportGroup("ncaamsoc"), "soccer");
  assert.ok(ESPN_SRC.includes('ncaawsoc: "/soccer/usa.ncaa.w.1/scoreboard"'));
  assert.ok(ESPN_SRC.includes('ncaamsoc: "/soccer/usa.ncaa.m.1/scoreboard"'));
  // Soccer clock math (counts up to 5400) applies to both.
  const soccerSet = ESPN_SRC.slice(ESPN_SRC.indexOf("const SOCCER_SPORTS = new Set<Sport>(["), ESPN_SRC.indexOf("const FULL_MATCH_SECONDS"));
  assert.ok(soccerSet.includes('"ncaawsoc", "ncaamsoc"'));
  assert.equal(espn.espnGameUrl({ sport: "ncaawsoc", id: "401889830" }), "https://www.espn.com/soccer/match/_/gameId/401889830");
});

test("short codes, labels and the dark highlight state", () => {
  assert.ok(PREFS_SRC.includes('ncaawsoc: "ws", ncaamsoc: "ms"'));
  const codes = PREFS_SRC.match(/const SPORT_TO_SHORT[^\n]*/)![0].match(/: "([a-z]+)"/g)!;
  assert.equal(new Set(codes).size, codes.length, "every short code is unique");
  assert.equal(SHORT_LEAGUE_LABELS["NCAAW Soccer"], "W. Soccer");
  const yt = readFileSync(new URL("../src/lib/youtube.ts", import.meta.url), "utf8");
  const dark = yt.slice(yt.indexOf("const NO_HIGHLIGHT_FALLBACK = new Set(["), yt.indexOf("export function hasNoTrustedHighlightSource"));
  assert.ok(dark.includes('"ncaawsoc"') && dark.includes('"ncaamsoc"'));
});
