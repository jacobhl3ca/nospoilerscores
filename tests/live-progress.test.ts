import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { formatGameProgress } from "../src/lib/liveProgress.ts";

// Live-card status between periods (Jacob 9/12): ESPN leaves displayClock at
// "0:00" through a break, and the card read "Q2 - 0:00" for all of halftime.
// Shapes below are ESPN scoreboard `status.type.shortDetail` + `displayClock`.

type G = Parameters<typeof formatGameProgress>[0];
const g = (sport: string, period: number, clock: string, statusDetail: string, isPlayoff = false) =>
  ({ sport, period, clock, statusDetail, isPlayoff }) as unknown as G;
const full = (x: G) => formatGameProgress(x).full;
const short = (x: G) => formatGameProgress(x).short;

test("football halftime reads Halftime, not Q2 - 0:00", () => {
  assert.equal(full(g("ncaaf", 2, "0:00", "Halftime")), "Halftime");
  assert.equal(short(g("ncaaf", 2, "0:00", "Halftime")), "HT");
  assert.equal(full(g("nfl", 2, "0:00", "Halftime")), "Halftime");
  // A stopped clock alone is not a break (a play or PAT can still run at
  // 0:00) — it just drops the "- 0:00" tail.
  assert.equal(full(g("ncaaf", 2, "0:00", "0:00 - 2nd")), "Q2");
  assert.equal(full(g("nba", 4, "0.0", "0.0 - 4th")), "Q4");
});

test("live ESPN shapes captured 2026-09-12 10:40pm ET", () => {
  // CP @ SJSU: STATUS_HALFTIME. TXSO @ UTEP: still STATUS_IN_PROGRESS.
  assert.equal(full(g("ncaaf", 2, "0:00", "Halftime")), "Halftime");
  assert.equal(full(g("ncaaf", 2, "0:00", "End of 2nd")), "Halftime");
  assert.equal(full(g("ncaaf", 3, "15:00", "15:00 - 3rd")), "Q3 - 15:00");
});

test("end of a quarter reads End of Qn", () => {
  assert.equal(full(g("ncaaf", 1, "0:00", "End of 1st")), "End of Q1");
  assert.equal(short(g("ncaaf", 1, "0:00", "End of 1st")), "End Q1");
  assert.equal(full(g("nfl", 3, "0:00", "End of 3rd")), "End of Q3");
  assert.equal(full(g("nba", 4, "0.0", "End of 4th")), "End of Q4");
  assert.equal(full(g("nba", 2, "0.0", "Halftime")), "Halftime");
});

test("running clocks are unchanged", () => {
  assert.equal(full(g("ncaaf", 4, "6:22", "6:22 - 4th")), "Q4 - 6:22");
  assert.equal(full(g("nba", 4, "5.3", "5.3 - 4th")), "Q4 - 5.3");
  assert.equal(full(g("nba", 4, "0.4", "0.4 - 4th")), "Q4 - 0.4");
  assert.equal(full(g("ncaam", 2, "10:00", "10:00 - 2nd Half")), "H2 - 10:00");
});

test("college-football OT has no clock, so its 0:00 is live play", () => {
  assert.equal(full(g("ncaaf", 5, "0:00", "OT")), "OT");
  assert.equal(full(g("ncaaf", 6, "0:00", "2OT")), "2OT");
  assert.equal(full(g("ncaaf", 5, "0:00", "End of OT")), "End of OT");
});

test("halves and hockey intermissions", () => {
  assert.equal(full(g("ncaam", 1, "0:00", "Halftime")), "Halftime");
  assert.equal(full(g("ncaam", 2, "0:00", "End of 2nd Half")), "End of H2");
  assert.equal(full(g("nhl", 1, "0:00", "End of 1st")), "End of P1");
  assert.equal(full(g("nhl", 2, "0:00", "End of 2nd")), "End of P2");
  assert.equal(full(g("nhl", 5, "0:00", "Shootout")), "SO");
});

// Women's college hockey rides the NHL branch: regular-season period 5 is a
// shootout, period 4 is the single OT with its running clock.
test("ncaawh overtime and shootout", () => {
  assert.equal(full(g("ncaawh", 5, "0:00", "Shootout")), "SO");
  assert.equal(full(g("ncaawh", 4, "2:10", "2:10 - OT")), "OT - 2:10");
  assert.equal(full(g("ncaawh", 5, "12:00", "12:00 - 2OT", true)), "2OT - 12:00");
});

// "End of 4th" with a winner is the final (Jacob 9/12): settle it in espn.ts so
// the card leaves the live group instead of reading "End of Q4" for minutes.
const jiti = createJiti(import.meta.url);
const { settleEndOfRegulation } = (await jiti.import("../src/lib/espn.ts")) as {
  settleEndOfRegulation: (event: unknown, sport: string) => void;
};
const ev = (period: number, shortDetail: string, scores: [string, string]) => ({
  id: "1",
  date: "2026-09-13T00:00Z",
  status: { displayClock: "0:00", period, type: { name: "STATUS_IN_PROGRESS", state: "in", shortDetail, detail: shortDetail, completed: false } },
  competitions: [{ competitors: [{ homeAway: "home", score: scores[0] }, { homeAway: "away", score: scores[1] }] }],
});
type Ev = ReturnType<typeof ev>;
const settled = (sport: string, e: Ev) => { settleEndOfRegulation(e, sport); return e.status.type; };

test("End of 4th with a winner settles as Final", () => {
  const t = settled("ncaaf", ev(4, "End of 4th", ["31", "24"]));
  assert.equal(t.state, "post");
  assert.equal(t.completed, true);
  assert.equal(t.shortDetail, "Final");
  assert.equal(settled("nba", ev(4, "End of 4th", ["101", "99"])).state, "post");
  assert.equal(settled("nhl", ev(3, "End of 3rd", ["3", "2"])).state, "post");
  assert.equal(settled("ncaam", ev(2, "End of 2nd Half", ["70", "68"])).state, "post");
  assert.equal(settled("nba", ev(5, "End of OT", ["110", "108"])).shortDetail, "Final/OT");
});

test("level score, earlier breaks and a bare 0:00 stay live", () => {
  assert.equal(settled("ncaaf", ev(4, "End of 4th", ["24", "24"])).state, "in");
  assert.equal(settled("ncaaf", ev(3, "End of 3rd", ["31", "24"])).state, "in");
  assert.equal(settled("ncaaf", ev(2, "Halftime", ["31", "24"])).state, "in");
  assert.equal(settled("ncaaf", ev(4, "0:00 - 4th", ["30", "24"])).state, "in");
  assert.equal(settled("nhl", ev(4, "End of OT", ["2", "2"])).state, "in");
  assert.equal(settled("mlb", ev(9, "End of 9th", ["5", "4"])).state, "in");
  assert.equal(settled("epl", ev(2, "End of 2nd Half", ["1", "0"])).state, "in");
});

// UFL (added 2026-09-14) shares the gridiron branch: four quarters, then OT.
test("ufl takes the football branch", () => {
  assert.equal(full(g("ufl", 2, "0:00", "Halftime")), "Halftime");
  assert.equal(short(g("ufl", 2, "0:00", "Halftime")), "HT");
  assert.equal(full(g("ufl", 3, "0:00", "End of 3rd")), "End of Q3");
  assert.equal(full(g("ufl", 4, "6:22", "6:22 - 4th")), "Q4 - 6:22");
  assert.equal(full(g("ufl", 5, "0:00", "OT")), "OT");
});

// College baseball and softball (added 2026-09-14) share MLB's "Top 5th" /
// "Bot 7th" status shape, so they take the ▲/▼ inning branch, not the raw
// statusDetail fallthrough (which truncated to "Top" on mobile).
test("college baseball and softball read innings like MLB", () => {
  const cb = formatGameProgress(g("ncaabase", 5, "", "Top 5th"));
  assert.equal(cb.full, "▲5");
  assert.equal(cb.short, "▲5");
  assert.equal(cb.label, "Top of the 5th inning");
  const cs = formatGameProgress(g("ncaasoft", 7, "", "Bot 7th"));
  assert.equal(cs.full, "▼7");
  assert.equal(cs.label, "Bottom of the 7th inning");
  const delay = formatGameProgress(g("ncaabase", 1, "", "Rain Delay, Top 1st"));
  assert.equal(delay.full, "▲1 Rain");
  assert.equal(delay.delayed, true);
  assert.equal(delay.label, "Top of the 1st inning, Rain");
});

test("volleyball reads the set number, no clock", () => {
  // Shapes are the plan's (no live sample captured yet — a Monday); ESPN's
  // volleyball period is the set in play and its clock is parked at 0:00.
  assert.equal(full(g("ncaavb", 2, "0:00", "Set 2")), "Set 2");
  assert.equal(short(g("ncaavb", 2, "0:00", "Set 2")), "S2");
  assert.equal(full(g("ncaavb", 5, "0:00", "5th Set")), "Set 5");
  assert.equal(full(g("ncaavb", 1, "0:00", "End of 1st Set")), "End of Set 1");
  assert.equal(short(g("ncaavb", 1, "0:00", "End of 1st Set")), "End S1");
  assert.equal(full(g("ncaavb", 3, "0:00", "Between sets")), "End of Set 3");
});
