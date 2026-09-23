import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBracket, type PlayoffLeague, type PlayoffTeam } from "../src/lib/playoffPicture.ts";
import {
  applyPick,
  championOf,
  cleanName,
  cleanPicks,
  isComplete,
  maxPoints,
  nameKey,
  rankEntries,
  scorePicks,
  sidesFor,
  type Picks,
} from "../src/lib/bracketPicks.ts";
import { lockIsPlaceholder, lockTimeFrom, mlbPickBracket, seriesResults, type StatsApiPostseason } from "../src/lib/mlbPicks.ts";

// The 2025 postseason, end to end: real seeds, and MLB's real postseason feed
// (tests/fixtures/mlb-postseason-2025.json, trimmed from
// /schedule/postseason/series?season=2025). 2026 is the feed as it stood on
// 2026-09-23, every game still at MLB's 07:33Z TBD placeholder.

const fx = (y: number) => JSON.parse(readFileSync(new URL(`./fixtures/mlb-postseason-${y}.json`, import.meta.url), "utf8")) as StatsApiPostseason;

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
const AL = league("AL", [[141, "TOR"], [136, "SEA"], [114, "CLE"], [147, "NYY"], [111, "BOS"], [116, "DET"]]);
const NL = league("NL", [[158, "MIL"], [143, "PHI"], [119, "LAD"], [112, "CHC"], [135, "SD"], [113, "CIN"]]);
const bracket = mlbPickBracket(2025, buildBracket(AL), buildBracket(NL), (id) => `logo/${id}`);

// What actually happened in 2025.
const PERFECT: Picks = {
  "AL:wc-a": "116", "AL:wc-b": "147", "NL:wc-a": "119", "NL:wc-b": "112",
  "AL:ds-a": "136", "AL:ds-b": "141", "NL:ds-a": "119", "NL:ds-b": "158",
  "AL:cs": "141", "NL:cs": "119", ws: "119",
};

test("the MLB bracket has 11 series worth 28 points and pairs 3v6, 4v5 under the byes", () => {
  assert.equal(bracket.matchups.length, 11); // 4 WC + 4 DS + 2 CS + the World Series
  assert.equal(maxPoints(bracket), 4 * 1 + 4 * 2 + 2 * 4 + 8);
  assert.deepEqual(sidesFor(bracket, {}, "AL:wc-a").map((t) => t?.abbrev), ["CLE", "DET"]);
  assert.deepEqual(sidesFor(bracket, {}, "AL:wc-b").map((t) => t?.abbrev), ["NYY", "BOS"]);
  // ds-a is the 2 seed against the 3/6 winner, which is empty until picked.
  assert.deepEqual(sidesFor(bracket, {}, "AL:ds-a").map((t) => t?.abbrev), ["SEA", undefined]);
  const empty = bracket.matchups.find((m) => m.key === "AL:ds-a")!.sides[1];
  assert.equal(empty.label, "CLE/DET winner");
});

test("a pick fills the next seat, and changing it clears everything it fed", () => {
  let p = applyPick(bracket, {}, "AL:wc-a", "116");
  assert.deepEqual(sidesFor(bracket, p, "AL:ds-a").map((t) => t?.abbrev), ["SEA", "DET"]);
  p = applyPick(bracket, p, "AL:ds-a", "116");
  p = applyPick(bracket, p, "AL:wc-b", "147");
  p = applyPick(bracket, p, "AL:ds-b", "141");
  p = applyPick(bracket, p, "AL:cs", "116");
  p = applyPick(bracket, p, "NL:wc-a", "119");
  p = applyPick(bracket, p, "NL:ds-a", "119");
  p = applyPick(bracket, p, "NL:wc-b", "112");
  p = applyPick(bracket, p, "NL:ds-b", "158");
  p = applyPick(bracket, p, "NL:cs", "119");
  p = applyPick(bracket, p, "ws", "116");
  assert.ok(isComplete(bracket, p));
  assert.equal(championOf(bracket, p)?.abbrev, "DET");
  // Flip the 3/6 series: DET's whole run is orphaned, the rest stays.
  const q = applyPick(bracket, p, "AL:wc-a", "114");
  assert.equal(q["AL:ds-a"], undefined);
  assert.equal(q["AL:cs"], undefined);
  assert.equal(q.ws, undefined);
  assert.equal(q["AL:ds-b"], "141");
  assert.equal(q["NL:cs"], "119");
});

test("cleanPicks drops a pick into a series the team cannot reach, and unknown keys", () => {
  const { picks, dropped } = cleanPicks(bracket, { "AL:wc-a": "147", "AL:wc-b": "147", bogus: "119" });
  assert.deepEqual(picks, { "AL:wc-b": "147" });
  assert.deepEqual(dropped.sort(), ["AL:wc-a", "bogus"]);
});

test("a seed that moves clears the picks it touched", () => {
  // DET and BOS swap seeds 5 and 6: the 3v6 series is now CLE/BOS.
  const moved = league("AL", [[141, "TOR"], [136, "SEA"], [114, "CLE"], [147, "NYY"], [116, "DET"], [111, "BOS"]]);
  const b2 = mlbPickBracket(2025, buildBracket(moved), buildBracket(NL), () => "");
  const { picks, dropped } = cleanPicks(b2, PERFECT);
  // DET is no longer in the 3v6 series; NYY is still in the 4v5 one, and a
  // bye team's pick stands on its own seat.
  assert.deepEqual(dropped, ["AL:wc-a"]);
  assert.equal(picks["AL:wc-b"], "147");
  assert.equal(picks["AL:ds-a"], "136");
});

test("2025's feed yields all 11 series winners", () => {
  const r = seriesResults(fx(2025));
  assert.equal(r.length, 11);
  const w = (round: number) => r.filter((x) => x.round === round).map((x) => x.winner).sort();
  assert.deepEqual(w(0), ["112", "116", "119", "147"]);
  assert.deepEqual(w(1), ["119", "136", "141", "158"]);
  assert.deepEqual(w(2), ["119", "141"]);
  assert.deepEqual(r.find((x) => x.round === 3), { round: 3, winner: "119", loser: "141" });
});

test("the real 2025 bracket scores 28 of 28 and is perfect", () => {
  const s = scorePicks(bracket, PERFECT, seriesResults(fx(2025)));
  assert.equal(s.points, 28);
  assert.equal(s.possible, 28);
  assert.equal(s.pct, 100);
  assert.ok(s.perfect);
});

test("a bust takes every later pick of that team with it, and ranks below the perfect one", () => {
  const results = seriesResults(fx(2025));
  // Picked CLE over DET and rode CLE to the title.
  let p: Picks = { ...PERFECT };
  p = applyPick(bracket, p, "AL:wc-a", "114");
  p = applyPick(bracket, p, "AL:ds-a", "114");
  p = applyPick(bracket, p, "AL:cs", "114");
  p = applyPick(bracket, p, "ws", "114");
  const s = scorePicks(bracket, p, results);
  assert.equal(s.status["AL:wc-a"], "wrong");
  assert.equal(s.status["AL:ds-a"], "wrong");
  assert.equal(s.status.ws, "wrong");
  assert.equal(s.points, 28 - 1 - 2 - 4 - 8);
  assert.ok(!s.perfectAlive);
  const rows = rankEntries(bracket, [{ name: "cle fan", picks: p }, { name: "Jacob", picks: PERFECT }], results);
  assert.deepEqual(rows.map((r) => [r.rank, r.name]), [[1, "Jacob"], [2, "cle fan"]]);
  assert.equal(rows[1].champion?.abbrev, "CLE");
});

test("mid-postseason: only decided series count toward % correct", () => {
  const wc = seriesResults(fx(2025)).filter((r) => r.round === 0);
  const s = scorePicks(bracket, PERFECT, wc);
  assert.equal(s.possible, 4);
  assert.equal(s.points, 4);
  assert.equal(s.pct, 100);
  assert.equal(s.status["AL:ds-a"], "pending");
  assert.ok(s.perfectAlive);
  assert.equal(s.maxLeft, 28);
});

test("tied scores share a rank", () => {
  const rows = rankEntries(bracket, [{ name: "b", picks: PERFECT }, { name: "a", picks: PERFECT }, { name: "c", picks: {} }], []);
  assert.deepEqual(rows.map((r) => [r.rank, r.name]), [[1, "a"], [1, "b"], [3, "c"]]);
});

test("lock: TBD games lock at noon ET on the opening day; a set first pitch wins", () => {
  const d = fx(2026);
  assert.equal(lockTimeFrom(d)?.toISOString(), "2026-09-29T16:00:00.000Z");
  assert.ok(lockIsPlaceholder(d));
  // MLB sets one game at 1:08 PM ET and the rest are still TBD: noon still wins.
  const set = structuredClone(d);
  const g = set.series!.flatMap((s) => s.games ?? []).find((x) => x.gameType === "F" && x.officialDate === "2026-09-29")!;
  g.status = { ...g.status, startTimeTBD: false };
  g.gameDate = "2026-09-29T17:08:00Z";
  assert.equal(lockTimeFrom(set)?.toISOString(), "2026-09-29T16:00:00.000Z");
  // Every opening-day game set: the earliest real first pitch.
  for (const x of set.series!.flatMap((s) => s.games ?? [])) {
    if (x.gameType === "F" && x.officialDate === "2026-09-29") {
      x.status = { ...x.status, startTimeTBD: false };
      if (x !== g) x.gameDate = "2026-09-29T20:08:00Z";
    }
  }
  assert.equal(lockTimeFrom(set)?.toISOString(), "2026-09-29T17:08:00.000Z");
  assert.ok(!lockIsPlaceholder(set));
  assert.equal(lockTimeFrom({ series: [] }), null);
});

test("2025's feed locks at the real first pitch of wild-card game 1", () => {
  const at = lockTimeFrom(fx(2025))!;
  const firstDay = fx(2025).series!.flatMap((s) => s.games ?? []).filter((g) => g.gameType === "F").map((g) => g.gameDate!).sort()[0];
  assert.equal(at.toISOString(), new Date(firstDay).toISOString());
});

test("2026 today: no series decided", () => {
  assert.deepEqual(seriesResults(fx(2026)), []);
});

test("names: trimmed, capped, letters/digits/space/.'- only; keys ignore case and spacing", () => {
  assert.equal(cleanName("  Jacob   H-L "), "Jacob H-L");
  assert.equal(cleanName("J.H."), "J.H.");
  assert.equal(cleanName("José"), "José");
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("x".repeat(21)), null);
  assert.equal(cleanName("<b>hi</b>"), null);
  assert.equal(cleanName("http://x.co"), null);
  assert.equal(cleanName("-dash"), null);
  assert.equal(nameKey("Jacob  HL"), nameKey("jacob hl"));
});
