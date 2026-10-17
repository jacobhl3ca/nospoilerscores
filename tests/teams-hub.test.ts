import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { TeamPage, TeamPageLeague } from "../src/lib/teamPages.ts";
import type { TeamPageLeagueMeta } from "../src/lib/teamPageLeagues.ts";

// /teams (the hub): one "Leagues" jump link and one section per
// TEAM_PAGE_LEAGUES entry, each listing teamsInLeague(league) as links to
// teamPagePath(team), with a link to the league's guide in the heading.

// teamPageLeagues.ts imports @/lib/teamPages at runtime, so load it through jiti,
// with the tsconfig "@/" path mapped onto src/.
const jiti = createJiti(import.meta.url, { alias: { "@/": fileURLToPath(new URL("../src/", import.meta.url)) } });
const { TEAM_PAGES } = (await jiti.import("../src/lib/teamPages.ts")) as { TEAM_PAGES: TeamPage[] };
const lib = (await jiti.import("../src/lib/teamPageLeagues.ts")) as {
  TEAM_PAGE_LEAGUES: TeamPageLeagueMeta[];
  leagueMeta: (league: string) => TeamPageLeagueMeta | undefined;
  teamsInLeague: (league: TeamPageLeague) => TeamPage[];
  getTeamPage: (league: string, slug: string) => TeamPage | undefined;
  teamPagePath: (t: Pick<TeamPage, "league" | "slug">) => string;
  teamWithArticle: (t: Pick<TeamPage, "league" | "name">) => string;
};

const LEAGUES = lib.TEAM_PAGE_LEAGUES.map((l) => l.league);

test("five leagues, in the hub's order, each once", () => {
  assert.deepEqual(LEAGUES, ["nfl", "nba", "nhl", "mlb", "premier-league"]);
  assert.deepEqual(lib.TEAM_PAGE_LEAGUES.map((l) => l.label), ["NFL", "NBA", "NHL", "MLB", "Premier League"]);
});

test("every team belongs to a league the hub lists, so no team is orphaned", () => {
  for (const t of TEAM_PAGES) assert.ok(LEAGUES.includes(t.league), `${t.slug}: ${t.league}`);
  const listed = LEAGUES.reduce((n, l) => n + lib.teamsInLeague(l).length, 0);
  assert.equal(listed, TEAM_PAGES.length);
});

test("teamsInLeague: the full club count of each league", () => {
  const counts = Object.fromEntries(LEAGUES.map((l) => [l, lib.teamsInLeague(l).length]));
  assert.deepEqual(counts, { nfl: 32, nba: 30, nhl: 32, mlb: 30, "premier-league": 20 });
});

test("teamsInLeague keeps the generated order and returns only that league", () => {
  for (const l of LEAGUES) {
    const teams = lib.teamsInLeague(l);
    assert.deepEqual(teams, TEAM_PAGES.filter((t) => t.league === l));
    for (const t of teams) assert.equal(t.league, l);
  }
});

test("slugs are unique inside a league and safe in a URL path", () => {
  for (const l of LEAGUES) {
    const slugs = lib.teamsInLeague(l).map((t) => t.slug);
    assert.equal(new Set(slugs).size, slugs.length, l);
    for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, s);
  }
});

test("teamPagePath: /teams/<league>/<slug>", () => {
  assert.equal(lib.teamPagePath({ league: "nfl", slug: "new-york-giants" }), "/teams/nfl/new-york-giants");
  assert.equal(lib.teamPagePath({ league: "premier-league", slug: "arsenal" }), "/teams/premier-league/arsenal");
  const paths = TEAM_PAGES.map(lib.teamPagePath);
  assert.equal(new Set(paths).size, paths.length);
});

test("getTeamPage round-trips every hub link, and rejects a wrong league", () => {
  for (const t of TEAM_PAGES) assert.equal(lib.getTeamPage(t.league, t.slug), t);
  assert.equal(lib.getTeamPage("nba", "new-york-giants"), undefined);
  assert.equal(lib.getTeamPage("nfl", "not-a-team"), undefined);
  assert.equal(lib.getTeamPage("", ""), undefined);
});

test("leagueMeta: known leagues only", () => {
  for (const l of lib.TEAM_PAGE_LEAGUES) assert.equal(lib.leagueMeta(l.league), l);
  assert.equal(lib.leagueMeta("epl"), undefined);
  assert.equal(lib.leagueMeta("NFL"), undefined);
  assert.equal(lib.leagueMeta(""), undefined);
});

test("every league's guide link opens a real page", () => {
  for (const l of lib.TEAM_PAGE_LEAGUES) {
    assert.match(l.guide, /^\/[a-z0-9-]+$/);
    assert.ok(fs.existsSync(new URL(`../src/app${l.guide}/page.tsx`, import.meta.url)), l.guide);
  }
});

test("teamWithArticle: 'the' for US leagues, bare name for English clubs", () => {
  assert.equal(lib.teamWithArticle({ league: "nfl", name: "New York Giants" }), "the New York Giants");
  assert.equal(lib.teamWithArticle({ league: "mlb", name: "Athletics" }), "the Athletics");
  assert.equal(lib.teamWithArticle({ league: "premier-league", name: "Arsenal" }), "Arsenal");
});

test("every hub team has a logo: an https URL or a file under public/", () => {
  for (const t of TEAM_PAGES) {
    assert.ok(t.logo, t.slug);
    if (t.logo.startsWith("/")) assert.ok(fs.existsSync(new URL(`../public${t.logo}`, import.meta.url)), `${t.slug}: ${t.logo}`);
    else assert.match(t.logo, /^https:\/\//, t.slug);
  }
});
