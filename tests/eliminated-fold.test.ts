import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CLINCH_STALE_MS,
  foldRowLabel,
  nflClinchSnapshot,
  nflSeasonOf,
  splitFoldable,
  type ClinchSnapshot,
} from "../src/lib/eliminatedFold.ts";
import { buildNflPicture, type NflStandingsPayload } from "../src/lib/nflPlayoffPicture.ts";
import type { Game } from "../src/lib/types.ts";

// "Fold games with no playoff stakes" (Jacob 9/24, rule 10/9): only a game
// between two eliminated NFL teams folds.

const NOW = Date.parse("2026-12-20T15:00:00Z");
const team = (id: string) => ({ id }) as Game["homeTeam"];
const game = (id: string, away: string, home: string, over: Partial<Game> = {}): Game =>
  ({ id, sport: "nfl", date: "2026-12-20T18:00:00Z", awayTeam: team(away), homeTeam: team(home), state: "pre", ...over }) as Game;

const snap = (over: Partial<ClinchSnapshot> = {}): ClinchSnapshot => ({
  at: NOW - 60_000,
  season: 2026,
  teams: { "nfl-1": "eliminated", "nfl-2": "eliminated", "nfl-3": "eliminated", "nfl-4": null, "nfl-5": "berth" },
  ...over,
});

const ids = (gs: Game[]) => gs.map((g) => g.id);

test("both teams eliminated → folded", () => {
  const r = splitFoldable([game("a", "nfl-1", "nfl-2")], snap(), [], NOW);
  assert.deepEqual(ids(r.folded), ["a"]);
  assert.deepEqual(ids(r.shown), []);
});

test("one team eliminated → shown", () => {
  const r = splitFoldable([game("a", "nfl-1", "nfl-4"), game("b", "nfl-5", "nfl-2")], snap(), [], NOW);
  assert.deepEqual(ids(r.shown), ["a", "b"]);
  assert.deepEqual(r.folded, []);
});

test("a favourite team → shown", () => {
  const r = splitFoldable([game("a", "nfl-1", "nfl-2"), game("b", "nfl-2", "nfl-3")], snap(), ["nfl-1"], NOW);
  assert.deepEqual(ids(r.shown), ["a"]);
  assert.deepEqual(ids(r.folded), ["b"]);
});

test("a live game → shown; a game past its start the feed still calls pre → shown", () => {
  const r = splitFoldable([
    game("live", "nfl-1", "nfl-2", { state: "in" }),
    game("late", "nfl-1", "nfl-3", { date: "2026-12-20T14:00:00Z" }),
    game("final", "nfl-2", "nfl-3", { state: "post", date: "2026-12-20T14:00:00Z" }),
  ], snap(), [], NOW);
  assert.deepEqual(ids(r.shown), ["live", "late"]);
  assert.deepEqual(ids(r.folded), ["final"]);
});

test("no standings, stale standings, or another season → all shown", () => {
  const games = [game("a", "nfl-1", "nfl-2")];
  for (const s of [null, undefined, snap({ at: NOW - CLINCH_STALE_MS - 1 }), snap({ season: 2025 }), snap({ season: null })]) {
    const r = splitFoldable(games, s, [], NOW);
    assert.deepEqual(ids(r.shown), ["a"]);
    assert.deepEqual(r.folded, []);
  }
});

test("other leagues never fold", () => {
  const r = splitFoldable([game("a", "nfl-1", "nfl-2", { sport: "ncaaf" })], snap(), [], NOW);
  assert.deepEqual(ids(r.shown), ["a"]);
});

test("NFL season of a date", () => {
  assert.equal(nflSeasonOf("2026-09-10T00:20:00Z"), 2026);
  assert.equal(nflSeasonOf("2027-01-10T18:00:00Z"), 2026);
  assert.equal(nflSeasonOf("2027-02-14T23:30:00Z"), 2026);
  assert.equal(nflSeasonOf("nope"), null);
});

test("snapshot from the live ESPN standings keys teams the board's way", () => {
  const live = JSON.parse(
    fs.readFileSync(new URL("./fixtures/espn-nfl-standings-level3-2026-10-07.json", import.meta.url), "utf8"),
  ) as NflStandingsPayload;
  const s = nflClinchSnapshot(buildNflPicture(live), NOW);
  assert.equal(s.season, 2026);
  assert.equal(Object.keys(s.teams).length, 32);
  assert.ok(Object.keys(s.teams).every((k) => /^nfl-\d+$/.test(k)));
  // Week 4: nobody is out yet, so nothing folds.
  assert.ok(Object.values(s.teams).every((c) => c !== "eliminated"));
});

test("row label", () => {
  assert.equal(foldRowLabel(1), "1 game between eliminated teams");
  assert.equal(foldRowLabel(2), "2 games between eliminated teams");
});
