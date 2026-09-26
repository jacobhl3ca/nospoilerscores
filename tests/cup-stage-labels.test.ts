import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Runs the real parseGame through jiti (espn.ts imports "./types" without an
// extension) so deriveStage is exercised on the exact event shape ESPN sends
// for the cups added 2026-09-14. No network: parseGame is a pure transform.
const jiti = createJiti(import.meta.url);
const { parseGame } = await jiti.import<{
  parseGame: (event: unknown, sport: string) => { stage?: string | null };
}>("../src/lib/espn.ts");

function event(slug: string, altGameNote?: string) {
  return {
    id: "1",
    date: "2027-01-09T15:00Z",
    name: "Away at Home",
    season: { year: 2026, type: 2, slug },
    status: { period: 2, type: { name: "STATUS_FULL_TIME", state: "post", completed: true } },
    competitions: [{
      altGameNote,
      notes: [],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: "1", team: { id: "10", abbreviation: "HOM", displayName: "Home", shortDisplayName: "Home" } },
        { homeAway: "away", score: "0", team: { id: "20", abbreviation: "AWY", displayName: "Away", shortDisplayName: "Away" } },
      ],
    }],
  };
}

// The slug fallback: the whitelist must resolve the cup rounds ESPN actually
// tags (read live 2026-09-14 off eng.fa / esp.copa_del_rey / ger.dfb_pokal /
// uefa.europa.conf), and keep returning null for league play.
test("cup season.slugs resolve to a stage line", () => {
  assert.equal(parseGame(event("third-round"), "facup").stage, "Third Round");
  assert.equal(parseGame(event("league-phase"), "uecl").stage, "League Phase");
  assert.equal(parseGame(event("round-of-16"), "copadelrey").stage, "Round of 16");
  assert.equal(parseGame(event("knockout-round-playoffs"), "uecl").stage, "Knockout Round Playoffs");
  assert.equal(parseGame(event("first-round"), "dfbpokal").stage, "First Round");
});

test("league play still shows no stage line", () => {
  assert.equal(parseGame(event("regular-season"), "epl").stage ?? null, null);
  assert.equal(parseGame(event("regular-season"), "facup").stage ?? null, null);
});

// altGameNote is the primary source. ESPN's cup notes are "English FA Cup,
// Third Round" / "German Cup, First Round" / "UEFA Conference League, League
// Phase" — the last segment is the round and never the result.
test("cup altGameNote rounds resolve ahead of the slug", () => {
  assert.equal(parseGame(event("third-round", "English FA Cup, Third Round"), "facup").stage, "Third Round");
  assert.equal(parseGame(event("first-round", "German Cup, First Round"), "dfbpokal").stage, "First Round");
  assert.equal(parseGame(event("league-phase", "UEFA Conference League, League Phase"), "uecl").stage, "League Phase");
  assert.equal(parseGame(event("qualifying-round", "Copa del Rey, Qualifying Round"), "copadelrey").stage, "Qualifying Round");
});

// Nations League (added 2026-09-26). Notes read live off uefa.nations the same
// day: league phase "UEFA Nations League, Group A2" (League A, group 2) with
// slug league-phase; the 2024-25 knockouts "…, Quarterfinals" /
// "…, Relegation Playoffs" / "…, Semifinals" / "…, Final", third place under
// slug 3rd-place-match.
test("Nations League groups and knockout rounds resolve to a stage line", () => {
  assert.equal(parseGame(event("league-phase", "UEFA Nations League, Group A2"), "nations").stage, "Group A2");
  assert.equal(parseGame(event("league-phase", "UEFA Nations League, Group D1"), "nations").stage, "Group D1");
  assert.equal(parseGame(event("quarterfinals", "UEFA Nations League, Quarterfinals"), "nations").stage, "Quarterfinals");
  assert.equal(parseGame(event("relegation-playoffs", "UEFA Nations League, Relegation Playoffs"), "nations").stage, "Relegation Playoffs");
  assert.equal(parseGame(event("3rd-place-match", "UEFA Nations League, 3rd-Place Match"), "nations").stage, "Third Place");
  assert.equal(parseGame(event("final", "UEFA Nations League, Final"), "nations").stage, "Final");
});

// The group arm is League A–D × group 1–4 only. A score-shaped or out-of-range
// segment must not pass through as a stage line.
test("Nations League group arm stays narrow", () => {
  assert.equal(parseGame(event("regular-season", "UEFA Nations League, Group E9"), "nations").stage ?? null, null);
  assert.equal(parseGame(event("regular-season", "Germany 2-1 Netherlands"), "nations").stage ?? null, null);
});
