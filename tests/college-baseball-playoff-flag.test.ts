import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Runs the real parseGame through jiti (espn.ts imports "./types" without an
// extension). No network: parseGame is a pure transform of one event.
const jiti = createJiti(import.meta.url);
const { parseGame } = await jiti.import<{
  parseGame: (event: unknown, sport: string) => { isPlayoff: boolean; playoffLabel?: string | null; rating: number | null; period: number };
}>("../src/lib/espn.ts");

// Shapes read live 2026-09-14: a March fixture is season type 2 with no note;
// the CWS / WCWS finals are type 6 ("championship-series") with a note.
function event(opts: { headline?: string; seasonType?: number; period?: number; scores?: [string, string] } = {}) {
  const { headline, seasonType = 2, period = 9, scores = ["3", "2"] } = opts;
  return {
    id: "1",
    date: "2026-03-14T20:00Z",
    name: "Away at Home",
    season: { year: 2026, type: seasonType },
    status: { period, type: { name: "STATUS_FINAL", state: "post", completed: true, detail: period < 9 ? `Final/${period}` : "Final" } },
    competitions: [{
      notes: headline ? [{ headline }] : [],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: scores[0], team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: scores[1], team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}

test("a March regular-season game is not a playoff game", () => {
  assert.equal(parseGame(event(), "ncaabase").isPlayoff, false);
  assert.equal(parseGame(event({ period: 7 }), "ncaasoft").isPlayoff, false);
});

test("regional and super regional notes flag the postseason", () => {
  assert.equal(parseGame(event({ headline: "NCAA Baseball Championship - Chapel Hill Regional" }), "ncaabase").isPlayoff, true);
  assert.equal(parseGame(event({ headline: "Chapel Hill Super Regional - Game 2" }), "ncaabase").isPlayoff, true);
  assert.equal(parseGame(event({ headline: "Norman Super Regional - Game 1", period: 7 }), "ncaasoft").isPlayoff, true);
});

test("season type 6 is the College World Series", () => {
  const cws = parseGame(event({ headline: "Men's College World Series Championship Final - Game 3", seasonType: 6 }), "ncaabase");
  assert.equal(cws.isPlayoff, true);
  assert.equal(cws.playoffLabel, "Men's College World Series Championship Final - Game 3");
  // Type 6 alone (no note) still counts for these two sports.
  assert.equal(parseGame(event({ seasonType: 6 }), "ncaabase").isPlayoff, true);
  assert.equal(parseGame(event({ seasonType: 6, period: 7 }), "ncaasoft").isPlayoff, true);
});

test("the type-6 and regional rules are scoped to the two diamond sports", () => {
  assert.equal(parseGame(event({ seasonType: 6 }), "mlb").isPlayoff, false);
  assert.equal(parseGame(event({ headline: "Regional Showcase" }), "mlb").isPlayoff, false);
});

// A run-rule (mercy) final ends before the seventh: "Final/5" with period 5.
// It must rate like any finished game, never NaN or null.
test("a run-rule softball final still gets a rating", () => {
  const g = parseGame(event({ period: 5, scores: ["10", "1"] }), "ncaasoft");
  assert.equal(g.period, 5);
  assert.equal(typeof g.rating, "number");
  assert.ok(Number.isFinite(g.rating as number));
});
