import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import type { BoxScore } from "../src/lib/boxscore.ts";

// Our own box score is parsed from ESPN's summary?event=<id>. Fixtures are
// real responses (10/8/2026), trimmed to 3 athletes per group.
const jiti = createJiti(import.meta.url);
const { parseBoxScore, summaryUrl } = (await jiti.import("../src/lib/boxscore.ts")) as {
  parseBoxScore: (json: unknown) => BoxScore | null;
  summaryUrl: (g: { id: string; sport: string }) => string | null;
};
const fixture = (s: string) => JSON.parse(readFileSync(new URL(`./fixtures/boxscore-${s}.json`, import.meta.url), "utf8"));

test("MLB: line score with R/H/E, batting + pitching with totals, away first", () => {
  const box = parseBoxScore(fixture("mlb"))!;
  assert.deepEqual(box.teams.map((t) => t.abbr), ["LAD", "ATL"]);
  const [lad, atl] = box.teams;
  assert.deepEqual(lad.lineScore, ["0", "0", "0", "3", "0", "0", "0", "0", "0"]);
  assert.equal(lad.total, "3");
  assert.equal(atl.total, "1");
  assert.equal(lad.hits, "8");
  assert.equal(atl.errors, "2");
  assert.deepEqual(lad.groups.map((g) => g.title), ["Batting", "Pitching"]);
  assert.equal(lad.groups[0].labels[0], "H-AB");
  assert.equal(lad.groups[0].rows[0].name, "M. Betts");
  assert.equal(lad.groups[0].rows[0].stats.length, lad.groups[0].labels.length);
  assert.equal(lad.groups[0].totals?.[2], "3");
  assert.match(lad.logo, /^https:\/\//);
});

test("NFL: one group per stat type, empty groups dropped, camelCase titles split", () => {
  const box = parseBoxScore(fixture("nfl"))!;
  const ind = box.teams.find((t) => t.abbr === "IND")!;
  const titles = ind.groups.map((g) => g.title);
  assert.equal(titles[0], "Passing");
  assert.ok(titles.includes("Kick returns"));
  // IND had no punt returns: the group came back with 0 athletes.
  assert.ok(!titles.includes("Punt returns"));
  assert.equal(ind.hits, null);
  assert.deepEqual(ind.lineScore, ["0", "10", "10", "10"]);
});

test("NHL: the empty skaters group is dropped", () => {
  const box = parseBoxScore(fixture("nhl"))!;
  for (const t of box.teams) {
    assert.deepEqual(t.groups.map((g) => g.title), ["Forwards", "Defenses", "Goalies"]);
    assert.equal(t.groups[0].totals, null);
  }
  assert.deepEqual(box.teams.map((t) => t.abbr), ["PHI", "OTT"]);
});

test("WNBA: a nameless group reads Players, totals kept", () => {
  const box = parseBoxScore(fixture("wnba"))!;
  const g = box.teams[0].groups[0];
  assert.equal(g.title, "Players");
  assert.equal(g.labels[1], "PTS");
  assert.equal(g.totals?.[1], box.teams[0].total);
});

test("junk returns null", () => {
  assert.equal(parseBoxScore(null), null);
  assert.equal(parseBoxScore({}), null);
  assert.equal(parseBoxScore({ header: { competitions: [] } }), null);
  assert.equal(parseBoxScore({ header: { competitions: [{ competitors: [{ team: {} }] }] } }), null);
  // Teams but no score and no stats: nothing to show.
  assert.equal(parseBoxScore({ header: { competitions: [{ competitors: [
    { homeAway: "home", team: { id: "1", abbreviation: "A" } },
    { homeAway: "away", team: { id: "2", abbreviation: "B" } },
  ] }] } }), null);
});

test("summary URL per league; unsupported leagues get none", () => {
  assert.equal(summaryUrl({ id: "401907993", sport: "mlb" }), "https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=401907993");
  assert.equal(summaryUrl({ id: "1", sport: "ncaaf" }), "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=1");
  assert.equal(summaryUrl({ id: "1", sport: "epl" }), null);
});

test("a live cache entry is not served once the game is final", async () => {
  const { fetchBoxScore } = (await jiti.import("../src/lib/boxscore.ts")) as {
    fetchBoxScore: (g: { id: string; sport: string; state: string }) => Promise<BoxScore | null>;
  };
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(fixture("mlb")), { status: 200 });
  }) as typeof fetch;
  try {
    const g = { id: "cache-1", sport: "mlb", state: "in" };
    await fetchBoxScore(g);
    await fetchBoxScore(g); // inside 30 s: cached
    assert.equal(calls.length, 1);
    await fetchBoxScore({ ...g, state: "post" }); // went final: refetch
    assert.equal(calls.length, 2);
    await fetchBoxScore({ ...g, state: "post" }); // final entry: kept
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = real;
  }
});
