import assert from "node:assert/strict";
import test from "node:test";
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
  // Zero clock before ESPN flips the detail still reads as the break.
  assert.equal(full(g("ncaaf", 2, "0:00", "0:00 - 2nd")), "Halftime");
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
