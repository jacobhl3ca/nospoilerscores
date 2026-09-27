import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { compareRatedLive } from "../src/lib/liveSort.ts";

// Live rating time cap (Jacob 9/26): "meh on any time doesn't make sense … no
// time cap is better, I like ties, but later ties ranked higher, and keep an
// easy revert." Runs the real parseGame through jiti (espn.ts imports
// "./types" without an extension). No network.
type Mode = "off" | "good-floor" | "legacy";
const jiti = createJiti(import.meta.url);
const { parseGame, liveTimeCap, LIVE_TIME_CAP } = await jiti.import<{
  parseGame: (event: unknown, sport: string) => { rating: number | null; liveProgress?: number };
  liveTimeCap: (raw: number, progress: number, mode?: Mode) => number;
  LIVE_TIME_CAP: Mode;
}>("../src/lib/espn.ts");

// ESPN scoreboard event. `clock` = numeric status.clock (seconds left in the
// period; soccer counts UP in total match seconds). `shortDetail` = the
// status line ESPN sends ("Bot 2nd", "6:00 - 1st").
function event(opts: {
  home: number; away: number; state?: "in" | "post"; period: number;
  clock?: number; shortDetail?: string; homeLs?: number[]; awayLs?: number[];
}) {
  const { home, away, state = "in", period, clock, shortDetail, homeLs, awayLs } = opts;
  const ls = (pts?: number[]) => pts?.map((value) => ({ value }));
  return {
    id: "1",
    date: "2026-09-26T23:00Z",
    name: "Away at Home",
    season: { year: 2026, type: 2 },
    status: {
      period, clock, displayClock: "",
      type: {
        name: state === "post" ? "STATUS_FINAL" : "STATUS_IN_PROGRESS", state, completed: state === "post",
        shortDetail: shortDetail ?? (state === "post" ? "Final" : ""), detail: shortDetail ?? "",
      },
    },
    competitions: [{
      notes: [],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: String(home), winner: state === "post" && home > away, linescores: ls(homeLs), team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: String(away), winner: state === "post" && away > home, linescores: ls(awayLs), team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}
const tier = (r: number | null) => (r == null ? null : r >= 85 ? "GREAT" : r >= 70 ? "GOOD" : r >= 50 ? "MEH" : "SKIP");
const game = (sport: string, e: ReturnType<typeof event>) => parseGame(e, sport);
// Rating under a given mode: mode "off" returns the raw score, so any other
// mode is that raw score run through the cap with the game's own progress.
function ratingIn(mode: Mode, sport: string, e: ReturnType<typeof event>): number | null {
  const g = game(sport, e);
  if (g.rating == null) return null;
  return liveTimeCap(g.rating, g.liveProgress ?? 1, mode);
}
const mlb = (home: number, away: number, inning: number) => event({ home, away, period: inning });

test("the shipped mode is off", () => {
  assert.equal(LIVE_TIME_CAP, "off");
});

test("off: an MLB 1-1 tie is too early in the 1st, then GREAT 100 every inning", () => {
  const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ratingIn("off", "mlb", mlb(1, 1, i)));
  assert.deepEqual(labels, [null, 100, 100, 100, 100, 100, 100, 100, 100]);
});

test("off: the MLB label comes from the margin only", () => {
  assert.equal(tier(ratingIn("off", "mlb", mlb(2, 1, 4))), "GREAT");
  assert.equal(ratingIn("off", "mlb", mlb(4, 2, 4)), 74);
  assert.equal(ratingIn("off", "mlb", mlb(5, 2, 4)), 60);
  assert.equal(tier(ratingIn("off", "mlb", mlb(7, 0, 4))), "SKIP");
  // Same margin, same label in the 2nd and the 9th.
  assert.equal(ratingIn("off", "mlb", mlb(5, 2, 2)), ratingIn("off", "mlb", mlb(5, 2, 9)));
});

test("off: an NBA tie at Q1 6:00 is GREAT; a 15-point Q1 lead stays SKIP", () => {
  assert.equal(tier(ratingIn("off", "nba", event({ home: 20, away: 20, period: 1, clock: 360 }))), "GREAT");
  assert.equal(tier(ratingIn("off", "nba", event({ home: 25, away: 10, period: 1, clock: 360 }))), "SKIP");
});

test("off: soccer is unchanged — 0-0 MEH 50, an early 1-0 MEH 55", () => {
  assert.equal(ratingIn("off", "epl", event({ home: 0, away: 0, period: 1, clock: 1200 })), 50);
  assert.equal(ratingIn("off", "epl", event({ home: 1, away: 0, period: 1, clock: 1200 })), 55);
});

test("good-floor: an MLB 1-1 tie reads GOOD through the 6th, GREAT from the 7th", () => {
  const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => tier(ratingIn("good-floor", "mlb", mlb(1, 1, i))));
  assert.deepEqual(labels, [null, "GOOD", "GOOD", "GOOD", "GOOD", "GOOD", "GREAT", "GREAT", "GREAT"]);
});

test("legacy: the old cap is pinned — MLB 1-1 in the 2nd reads MEH 67", () => {
  assert.equal(ratingIn("legacy", "mlb", mlb(1, 1, 2)), 67);
});

test("MLB progress reads the half-inning: Top 2nd < Mid < Bot < End 2nd", () => {
  const p = (d: string) => game("mlb", event({ home: 1, away: 1, period: 2, shortDetail: d })).liveProgress!;
  const [top, mid, bot, end] = ["Top 2nd", "Mid 2nd", "Bot 2nd", "End 2nd"].map(p);
  assert.ok(top < mid && mid < bot && bot < end, `${top} ${mid} ${bot} ${end}`);
  assert.equal(top, 1.125 / 9);
  assert.equal(end, 1.875 / 9);
  // No shortDetail → the old midpoint.
  assert.equal(game("mlb", mlb(1, 1, 2)).liveProgress, 1.5 / 9);
  // Bot 1st is still too early; Top 2nd is rated.
  assert.equal(game("mlb", event({ home: 1, away: 1, period: 1, shortDetail: "Bot 1st" })).rating, null);
  assert.equal(game("mlb", event({ home: 1, away: 1, period: 2, shortDetail: "Top 2nd" })).rating, 100);
});

test("liveProgress is set on live games only", () => {
  assert.equal(game("mlb", event({ home: 3, away: 2, period: 9, state: "post" })).liveProgress, undefined);
  assert.ok((game("nba", event({ home: 20, away: 20, period: 1, clock: 360 })).liveProgress ?? 0) > 0);
});

test("sort: later ties first; a higher rating wins regardless of progress", () => {
  const early = { rating: 100, liveProgress: 0.3 };
  const late = { rating: 100, liveProgress: 0.8 };
  assert.deepEqual([early, late].sort(compareRatedLive), [late, early]);
  const great = { rating: 100, liveProgress: 0.2 };
  const good = { rating: 87, liveProgress: 0.9 };
  assert.deepEqual([good, great].sort(compareRatedLive), [great, good]);
});

test("finals: every mode leaves a finished game uncapped", () => {
  const finals: Array<[string, ReturnType<typeof event>]> = [
    ["nba", event({ state: "post", period: 4, home: 102, away: 100, homeLs: [25, 26, 25, 26], awayLs: [26, 25, 26, 23] })],
    ["nba", event({ state: "post", period: 4, home: 120, away: 100, homeLs: [30, 30, 30, 30], awayLs: [25, 25, 25, 25] })],
    ["nfl", event({ state: "post", period: 4, home: 24, away: 21, homeLs: [7, 3, 7, 7], awayLs: [0, 14, 0, 7] })],
    ["mlb", event({ state: "post", period: 9, home: 3, away: 2, homeLs: [0, 1, 0, 0, 1, 0, 0, 0, 1], awayLs: [1, 0, 0, 0, 0, 1, 0, 0, 0] })],
  ];
  for (const [sport, e] of finals) {
    const r = game(sport, e).rating;
    assert.ok(r != null);
    for (const mode of ["off", "good-floor", "legacy"] as Mode[]) assert.equal(liveTimeCap(r, 1, mode), r, `${sport} ${mode}`);
  }
  assert.equal(tier(game(...finals[0]).rating), "GREAT");
  assert.equal(tier(game(...finals[1]).rating), "SKIP");
});
