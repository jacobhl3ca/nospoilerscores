import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { LEAGUE_KEYWORDS, leagueHaystack, leagueMatches, normalize, type LeagueSearchKey } from "../src/lib/leagueSearch.ts";

// Settings → Leagues search box (Jacob 10/17). The haystack here is built the
// way SettingsPanel builds it: the league's catalog labels plus its key and
// keywords.
const jiti = createJiti(import.meta.url);
const { ALL_LEAGUES } = await jiti.import<{ ALL_LEAGUES: { sport: string; label: string }[] }>("../src/lib/espn.ts");

const labels = new Map<string, string[]>();
for (const l of ALL_LEAGUES) labels.set(l.sport, [...(labels.get(l.sport) ?? []), l.label]);
const keys = Object.keys(LEAGUE_KEYWORDS) as LeagueSearchKey[];
const haystacks = new Map(keys.map((k) => [k, leagueHaystack(k, labels.get(k) ?? [])]));
const find = (query: string) => keys.filter((k) => leagueMatches(haystacks.get(k)!, query)).sort();

test("every catalog league and cross-league chip has keywords", () => {
  for (const sport of new Set(ALL_LEAGUES.map((l) => l.sport))) {
    assert.ok(LEAGUE_KEYWORDS[sport as LeagueSearchKey]?.length, `${sport} has no keywords`);
  }
  for (const k of ["top", "best", "topnews"] as const) assert.ok(LEAGUE_KEYWORDS[k].length, `${k} has no keywords`);
});

test("normalize: lowercase, accents and apostrophes off, punctuation to spaces", () => {
  assert.equal(normalize("Women's Hockey"), "womens hockey");
  assert.equal(normalize("Primera División"), "primera division");
  assert.equal(normalize("  DFB-Pokal "), "dfb pokal");
  assert.equal(normalize("NRL (rugby league)"), "nrl rugby league");
});

const cases: [string, string[]][] = [
  // IPL = Indian Premier League, so it answers "prem" too.
  ["prem", ["cricket", "epl", "premrugby"]],
  ["college football", ["ncaaf"]],
  ["col foot", ["ncaaf"]],
  ["champions league", ["ucl"]],
  ["champions cup", ["rugbychamp"]],
  ["march madness", ["ncaam", "ncaaw"]],
  ["hockey", ["ncaah", "ncaawh", "nhl"]],
  ["6 nations", ["sixnations"]],
  ["six nations", ["sixnations"]],
  ["spain", ["copadelrey", "laliga"]],
  ["racing", ["f1", "indycar", "nascar"]],
  ["cricket", ["cricket", "cricketintl"]],
  ["rugby league", ["nrl"]],
  ["zzz", []],
  ["nfl", ["nfl"]],
  ["cfl", ["cfl"]],
  ["wimbledon", ["tennis"]],
  ["us open", ["golf", "tennis"]],
  ["formula 1", ["f1"]],
  ["mma", ["ufc"]],
  ["saudi", ["saudi"]],
  ["grey cup", ["cfl"]],
  ["little league", ["llws"]],
  ["fa cup", ["facup"]],
  ["Copa del Rey", ["copadelrey"]],
  ["womens hockey", ["ncaawh"]],
  ["women's hockey", ["ncaawh"]],
  ["aussie", ["afl"]],
  ["front page", ["top"]],
  ["volleyball", ["ncaavb"]],
];
for (const [query, expected] of cases) {
  test(`"${query}" finds ${expected.join(", ") || "nothing"}`, () => {
    assert.deepEqual(find(query), [...expected].sort());
  });
}

test('"world cup" finds the FIFA and rugby World Cups', () => {
  const got = find("world cup");
  for (const k of ["fifa", "rugbywc"]) assert.ok(got.includes(k as LeagueSearchKey), `${k} missing: ${got.join(", ")}`);
});

test('"football" spans gridiron and soccer, never college soccer', () => {
  const got = find("football");
  for (const k of ["nfl", "ncaaf", "cfl", "epl", "mls"]) assert.ok(got.includes(k as LeagueSearchKey), `${k} missing`);
  assert.ok(!got.includes("ncaawsoc") && !got.includes("ncaamsoc"));
});

test("an empty query matches everything", () => {
  assert.equal(find("  ").length, keys.length);
});
