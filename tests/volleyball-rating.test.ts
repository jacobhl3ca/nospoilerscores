import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Runs the real parseGame through jiti (espn.ts imports "./types" without an
// extension), so the rating below is the one the card shows. No network.
const jiti = createJiti(import.meta.url);
const { parseGame } = await jiti.import<{
  parseGame: (event: unknown, sport: string) => { rating: number | null };
}>("../src/lib/espn.ts");

// An ESPN women's-volleyball event: `score` = sets won, linescores = points
// per set (shape read live 2026-09-14). `home`/`away` are the per-set points.
function event(opts: { home: number[]; away: number[]; state?: "in" | "post"; period?: number; noLinescores?: boolean }) {
  const { home, away, state = "post", noLinescores = false } = opts;
  const sets = home.map((h, i) => (h > away[i] ? "home" : "away"));
  const homeSets = sets.filter((s) => s === "home").length;
  const awaySets = sets.filter((s) => s === "away").length;
  const period = opts.period ?? home.length;
  const ls = (pts: number[]) => (noLinescores ? undefined : pts.map((value) => ({ value })));
  return {
    id: "1",
    date: "2026-09-12T23:00Z",
    name: "Away at Home",
    season: { year: 2026, type: 2 },
    status: { period, displayClock: "0:00", type: { name: state === "post" ? "STATUS_FINAL" : "STATUS_IN_PROGRESS", state, completed: state === "post", detail: state === "post" ? "Final" : `Set ${period}` } },
    competitions: [{
      notes: [],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: String(homeSets), winner: homeSets > awaySets, linescores: ls(home), team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: String(awaySets), winner: awaySets > homeSets, linescores: ls(away), team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}
const rating = (e: unknown) => parseGame(e, "ncaavb").rating;

test("a three-set sweep rates low", () => {
  // Wright State at Pittsburgh, 2026-09-14: 25-10 / 25-14 / 25-14.
  const r = rating(event({ home: [25, 25, 25], away: [10, 14, 14] }));
  assert.ok(r !== null && r < 35, `sweep rated ${r}`);
});

test("a four-setter with one deuce set rates mid", () => {
  // Georgia Tech at Nebraska, 2026-09-12: 24-26 / 25-17 / 25-18 / 25-12.
  const r = rating(event({ home: [24, 25, 25, 25], away: [26, 17, 18, 12] }));
  assert.ok(r !== null && r >= 40 && r <= 75, `four-setter rated ${r}`);
});

test("a five-setter with two deuce sets and an 0-2 comeback rates at the top", () => {
  const r = rating(event({ home: [23, 24, 25, 27, 15], away: [25, 26, 21, 25, 12] }));
  assert.ok(r !== null && r >= 90, `five-set comeback rated ${r}`);
});

test("no sweep outrates a five-setter", () => {
  const closeSweep = rating(event({ home: [25, 26, 25], away: [23, 24, 23] }));
  const dullFive = rating(event({ home: [25, 15, 25, 15, 15], away: [15, 25, 15, 25, 9] }));
  assert.ok(closeSweep !== null && dullFive !== null && dullFive > closeSweep, `sweep ${closeSweep} vs five ${dullFive}`);
});

test("live: too early after one set, high when level at 2-2", () => {
  assert.equal(rating(event({ home: [25], away: [20], state: "in", period: 1 })), null);
  // Level at 2-2 in the fifth, 8-6 in progress: the in-progress set is ignored.
  const r = rating(event({ home: [25, 22, 25, 23, 8], away: [22, 25, 20, 25, 6], state: "in", period: 5 }));
  assert.ok(r !== null && r >= 85, `2-2 live rated ${r}`);
});

test("missing linescores fall back to the sets-only score, never NaN", () => {
  const sweep = rating(event({ home: [25, 25, 25], away: [10, 14, 14], noLinescores: true }));
  const five = rating(event({ home: [25, 20, 25, 20, 15], away: [20, 25, 20, 25, 10], noLinescores: true }));
  assert.equal(sweep, 30);
  assert.equal(five, 100);
  assert.ok(!Number.isNaN(sweep) && !Number.isNaN(five));
});
