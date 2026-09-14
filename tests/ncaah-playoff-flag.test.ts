import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Runs the real parseGame through jiti (espn.ts imports "./types" without an
// extension). No network: parseGame is a pure transform of one event.
const jiti = createJiti(import.meta.url);
const { parseGame } = await jiti.import<{
  parseGame: (event: unknown, sport: string) => { isPlayoff: boolean; playoffLabel?: string | null };
}>("../src/lib/espn.ts");

function event(headline: string) {
  return {
    id: "1",
    date: "2026-10-10T23:00Z",
    name: "Away at Home",
    season: { year: 2027, type: 2 },
    status: { period: 5, type: { name: "STATUS_FINAL", state: "post", completed: true } },
    competitions: [{
      notes: [{ headline }],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: "3", team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: "2", team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}

// Regular-season in-season tournaments keep the shootout format, so a round
// word is required before college hockey flags a game as playoff.
test("ncaah in-season tournaments are not playoff games", () => {
  assert.equal(parseGame(event("Ice Breaker Tournament"), "ncaah").isPlayoff, false);
  assert.equal(parseGame(event("Governor's Cup"), "ncaah").isPlayoff, false);
});

test("ncaah conference and NCAA tournament rounds are playoff games", () => {
  assert.equal(parseGame(event("Hockey East - Quarterfinal"), "ncaah").isPlayoff, true);
  assert.equal(parseGame(event("ECAC - 1st Round"), "ncaah").isPlayoff, true);
  assert.equal(parseGame(event("NCAA Men's Hockey Championship - Worcester Regional Final"), "ncaah").isPlayoff, true);
});

// The women's feed shares the format, so the same rule applies.
test("ncaawh in-season tournaments are not playoff games", () => {
  assert.equal(parseGame(event("Ice Breaker Tournament"), "ncaawh").isPlayoff, false);
  assert.equal(parseGame(event("Smashville Showcase"), "ncaawh").isPlayoff, false);
});

test("ncaawh conference and NCAA tournament rounds are playoff games", () => {
  assert.equal(parseGame(event("WCHA - Semifinal"), "ncaawh").isPlayoff, true);
  assert.equal(parseGame(event("NCAA Women's Ice Hockey Championship - Frozen Four"), "ncaawh").isPlayoff, true);
});

test("the round-word rule is scoped to college hockey", () => {
  assert.equal(parseGame(event("Ice Breaker Tournament"), "nhl").isPlayoff, true);
});
