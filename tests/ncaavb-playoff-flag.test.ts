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
    date: "2026-09-12T23:00Z",
    name: "Away at Home",
    // ESPN tags the whole volleyball season type 2, the NCAA tournament included
    // (read from ?dates=20251201-20251231 on 2026-09-14).
    season: { year: 2026, type: 2 },
    status: { period: 3, type: { name: "STATUS_FINAL", state: "post", completed: true } },
    competitions: [{
      notes: [{ headline }],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: "3", team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: "0", team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}

// Every one of these is a regular-season note from the 2025 or 2026 feed.
test("ncaavb in-season invitationals are not playoff games", () => {
  for (const h of ["Paradise Invitational", "SFA Tournament", "Wildcat Classic", "UConn Challenge", "Ocean State Cup", "Quest For The Crown", "Allstate Big Ten/SEC Volleyball Challenge"]) {
    assert.equal(parseGame(event(h), "ncaavb").isPlayoff, false, h);
  }
});

test("ncaavb conference and NCAA tournament rounds are playoff games", () => {
  for (const h of [
    "SEC Women's Volleyball Tournament - Quarterfinal",
    "CAA Women's Volleyball Championship - Quartefinal", // ESPN's own typo, 2025
    "Big East Women's Volleyball Championship - Semifinal",
    "NCAA Women's Volleyball Championship - First Round",
    "NCAA Women's Volleyball Championship - Lexington Regional",
    "NCAA Women's Volleyball Championship",
  ]) {
    assert.equal(parseGame(event(h), "ncaavb").isPlayoff, true, h);
  }
});

test("the volleyball rule leaves the other sports alone", () => {
  assert.equal(parseGame(event("SFA Tournament"), "ncaaw").isPlayoff, true);
  assert.equal(parseGame(event("Ice Breaker Tournament"), "ncaah").isPlayoff, false);
});
