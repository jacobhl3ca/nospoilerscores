import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBracket, type PlayoffLeague, type PlayoffTeam } from "../src/lib/playoffPicture.ts";
import { actualPicks, effectivePicks, openKeysAt, rankEntries, scorePicks, startedKeys, type Picks } from "../src/lib/bracketPicks.ts";
import { lateCloseFrom, mlbPickBracket, seriesResults, seriesStarts, type StatsApiPostseason } from "../src/lib/mlbPicks.ts";

// Late brackets against MLB's real 2026 feed as it stood on 10/1: three
// wild-card series done (CHW, NYY, SD), ATL-PHI tied 1-1, every division
// series set for 10/3 (ALDS "B" CLE-CHW first, at 17:00Z).

const feed = JSON.parse(readFileSync(new URL("./fixtures/mlb-postseason-2026-10-01.json", import.meta.url), "utf8")) as StatsApiPostseason;

function team(id: number, abbrev: string, league: "AL" | "NL", seed: number): PlayoffTeam {
  return {
    id, name: abbrev, abbrev, league, division: "", wins: 0, losses: 0, pct: "", seed,
    divisionLeader: seed <= 3, clinched: true, clinch: null, gamesBack: "-", wildCardGamesBack: "-",
    magicNumber: null, eliminated: false, divisionEliminated: false, wildCardEliminated: false,
  };
}
const league = (key: "AL" | "NL", seeds: [number, string][]): PlayoffLeague => ({
  key, name: key, hunt: [], seeded: seeds.map(([id, ab], i) => team(id, ab, key, i + 1)),
});
const AL = league("AL", [[139, "TB"], [114, "CLE"], [117, "HOU"], [147, "NYY"], [111, "BOS"], [145, "CHW"]]);
const NL = league("NL", [[158, "MIL"], [119, "LAD"], [144, "ATL"], [135, "SD"], [112, "CHC"], [143, "PHI"]]);
const bracket = mlbPickBracket(2026, buildBracket(AL), buildBracket(NL), (id) => `logo/${id}`);
const results = seriesResults(feed);
const starts = seriesStarts(feed);
const OCT1 = Date.parse("2026-10-01T12:00:00Z");

test("the 10/1 feed: three wild-card series decided, and they fill their seats", () => {
  assert.equal(results.length, 3);
  assert.deepEqual(actualPicks(bracket, results), { "AL:wc-a": "145", "AL:wc-b": "147", "NL:wc-b": "135" });
});

test("series starts list real clubs only, and late brackets close at World Series Game 1", () => {
  const nlds = starts.find((s) => s.round === 1 && s.teams.includes("119"))!;
  assert.deepEqual(nlds.teams, ["119"]); // ATL/PHI is still a placeholder
  assert.equal(nlds.at, Date.parse("2026-10-03T20:00:00Z"));
  assert.equal(lateCloseFrom(feed)?.toISOString(), "2026-10-23T16:00:00.000Z");
});

test("on 10/1 every wild-card series has started and nothing later has", () => {
  assert.deepEqual([...startedKeys(bracket, results, starts, OCT1)].sort(), ["AL:wc-a", "AL:wc-b", "NL:wc-a", "NL:wc-b"]);
  assert.equal(openKeysAt(bracket, results, starts, OCT1).size, 7);
});

test("between the two ALDS first pitches only the CLE-CHW series is closed", () => {
  const t = Date.parse("2026-10-03T18:00:00Z");
  const started = startedKeys(bracket, results, starts, t);
  assert.ok(started.has("AL:ds-a"));
  assert.ok(!started.has("AL:ds-b"));
  assert.ok(!started.has("NL:ds-a"));
});

test("a late bracket picks into seats the real winners fill, and scores only its open series", () => {
  const open = openKeysAt(bracket, results, starts, OCT1);
  const late: Picks = { "AL:ds-a": "114", "AL:ds-b": "139", "NL:ds-a": "119" };
  const eff = effectivePicks(bracket, late, results, open);
  assert.equal(eff["AL:ds-a"], "114"); // CLE vs the real 3/6 winner, CHW
  assert.equal(eff["AL:wc-a"], "145");
  // The wild-card round is not its pick: nothing scored, nothing possible.
  const none = scorePicks(bracket, late, results, open);
  assert.equal(none.points, 0);
  assert.equal(none.possible, 0);
  assert.equal(none.pct, null);
  assert.equal(none.status["AL:wc-a"], undefined);
  assert.equal(none.perfectAlive, false);
  // CLE wins the ALDS: 2 of 2.
  const later = [...results, { round: 1, winner: "114", loser: "145" }];
  const s = scorePicks(bracket, late, later, open);
  assert.equal(s.points, 2);
  assert.equal(s.possible, 2);
  assert.equal(s.pct, 100);
  assert.equal(s.status["AL:ds-a"], "correct");
});

test("on-time brackets score as before; a late one ranks by points beside them", () => {
  const wrongfellow: Picks = { "AL:wc-a": "117", "AL:wc-b": "111", "NL:wc-a": "144", "NL:wc-b": "112" };
  const jh: Picks = { "AL:wc-a": "145", "AL:wc-b": "147", "NL:wc-a": "143", "NL:wc-b": "112" };
  assert.equal(scorePicks(bracket, wrongfellow, results).pct, 0);
  assert.equal(scorePicks(bracket, jh, results).points, 2);
  const lateAt = "2026-10-01T12:00:00Z";
  const rows = rankEntries(
    bracket,
    [{ name: "Wrongfellow", picks: wrongfellow }, { name: "JH", picks: jh }, { name: "Late", picks: { "AL:ds-a": "114" }, late: true, lateAt }],
    results,
    (e) => (e.lateAt ? openKeysAt(bracket, results, starts, Date.parse(e.lateAt)) : null),
  );
  assert.deepEqual(rows.map((r) => [r.name, r.late, r.score.points]), [["JH", false, 2], ["Late", true, 0], ["Wrongfellow", false, 0]]);
});
