import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WORLD_CUP_TEAMS, getWorldCupTeam } from "../src/lib/worldCupTeams.ts";

// /worldcup/teams (the 48-country grid) renders WORLD_CUP_TEAMS as it stands:
// one link per entry, in array order, to /worldcup/teams/<slug>, with the
// "#N" rank beside the name. The page's JSON-LD ItemList says that order is
// FIFA rank. These pin the list the grid and the 48 static detail pages are
// built from.

test("48 teams, one per slot of the 2026 field", () => {
  assert.equal(WORLD_CUP_TEAMS.length, 48);
});

test("slugs are unique, lower-case kebab, and safe in a URL path", () => {
  const slugs = WORLD_CUP_TEAMS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z]+(-[a-z]+)*$/, slug);
});

test("each slug is the team name in kebab case", () => {
  for (const t of WORLD_CUP_TEAMS) {
    const kebab = t.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    assert.equal(t.slug, kebab, t.name);
  }
});

test("names are unique and non-empty", () => {
  const names = WORLD_CUP_TEAMS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.ok(n.trim().length > 0);
});

test("the grid order is FIFA rank, best first, with no tie", () => {
  const ranks = WORLD_CUP_TEAMS.map((t) => t.rank);
  for (const r of ranks) assert.ok(r !== null && Number.isInteger(r) && r > 0, String(r));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok((ranks[i] as number) > (ranks[i - 1] as number), `${WORLD_CUP_TEAMS[i].name} is out of rank order`);
  }
});

test("every team has a flag, and a text tag where no emoji flag exists", () => {
  for (const t of WORLD_CUP_TEAMS) assert.ok(t.flag.trim().length > 0, t.name);
  // England and Scotland have no regional-indicator flag pair.
  assert.equal(getWorldCupTeam("england")?.flag, "ENG");
  assert.equal(getWorldCupTeam("scotland")?.flag, "SCO");
});

test("getWorldCupTeam: finds by exact slug only", () => {
  assert.equal(getWorldCupTeam("united-states")?.name, "United States");
  assert.equal(getWorldCupTeam("bosnia-herzegovina")?.name, "Bosnia-Herzegovina");
  // The page calls notFound() on undefined, so near-misses must not resolve.
  assert.equal(getWorldCupTeam(""), undefined);
  assert.equal(getWorldCupTeam("Spain"), undefined);
  assert.equal(getWorldCupTeam("spain "), undefined);
  assert.equal(getWorldCupTeam("united states"), undefined);
  assert.equal(getWorldCupTeam("not-a-team"), undefined);
});

test("getWorldCupTeam returns the same entry the grid renders", () => {
  for (const t of WORLD_CUP_TEAMS) assert.equal(getWorldCupTeam(t.slug), t);
});

test("the grid page links each team to its static detail route", () => {
  const src = fs.readFileSync(new URL("../src/app/worldcup/teams/page.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("href={`/worldcup/teams/${team.slug}`}"));
  assert.ok(fs.existsSync(new URL("../src/app/worldcup/teams/[team]/page.tsx", import.meta.url)));
});
