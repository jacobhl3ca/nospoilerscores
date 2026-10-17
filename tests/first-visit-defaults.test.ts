import assert from "node:assert/strict";
import test from "node:test";

import { createJiti } from "jiti";
import type { Game, Sport, Team } from "../src/lib/types.ts";
import type { EspnHeaderFeature } from "../src/lib/topEvents.ts";

// preferences.ts imports its siblings without extensions, which bare node does
// not resolve, so load both through jiti like hide-ranks-pref.test does.
const jiti = createJiti(import.meta.url);
const { FRESH_THIRD_COLUMN, PREFS_STORAGE_KEY, loadPreferences } =
  await jiti.import<typeof import("../src/lib/preferences.ts")>("../src/lib/preferences.ts");
const { orderPastDayByStart } = await jiti.import<typeof import("../src/lib/topEvents.ts")>("../src/lib/topEvents.ts");

// loadPreferences reads window.localStorage; give it a plain in-memory one.
function withStorage(blob: string | null, run: () => void) {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const prevWindow = g.window, prevStorage = g.localStorage;
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = { localStorage };
  g.localStorage = localStorage;
  try {
    if (blob !== null) store.set(PREFS_STORAGE_KEY, blob);
    run();
  } finally {
    g.window = prevWindow;
    g.localStorage = prevStorage;
  }
}

test("a new visitor's column 3 is the ESPN front page", () => {
  assert.equal(FRESH_THIRD_COLUMN, "top");
  withStorage(null, () => {
    const p = loadPreferences();
    assert.equal(p.thirdLeague, "top");
    // Slots 1, 2, 4 and 5 stay on Auto: MLB · NFL · ESPN · EPL · UCL on a wide screen.
    assert.equal(p.firstLeague, undefined);
    assert.equal(p.secondLeague, undefined);
    assert.equal(p.fourthLeague, undefined);
    assert.equal(p.fifthLeague, undefined);
    assert.equal(p.wideSlotsVersion, 1);
  });
});

test("a stored blob with no thirdLeague stays on Auto", () => {
  withStorage(JSON.stringify({ theme: "dark", showRatings: false }), () => {
    assert.equal(loadPreferences().thirdLeague, undefined);
  });
});

test("a stored blob keeps its own column 3", () => {
  withStorage(JSON.stringify({ thirdLeague: "nba" }), () => {
    assert.equal(loadPreferences().thirdLeague, "nba");
  });
});

// ── Past-day ESPN column order ───────────────────────────────────────────────

function team(id: string): Team {
  return { id, abbreviation: id.toUpperCase(), displayName: id, shortDisplayName: id, logo: "", color: "000", score: "", winner: false, record: "", rank: null };
}
function game(id: string, sport: Sport, hour: number): Game {
  return {
    id, sport, date: new Date(Date.UTC(2026, 9, 14, hour)).toISOString(),
    name: "", shortName: "", state: "post", statusDetail: "Final", clock: "", period: 0, completed: true,
    homeTeam: team(`${id}h`), awayTeam: team(`${id}a`), broadcasts: [], venue: "", rating: null,
    seriesNote: null, isPlayoff: false, isPreseason: false, playoffLabel: null, seriesStatus: null,
    recapUrl: null, streamUrl: null, primeStreamUrl: null,
  };
}

test("a past day's ESPN column is in start-time order inside each league, strip league order kept", () => {
  // End-of-day strip: ESPN moved the late, dramatic MLB game to the front.
  const features: EspnHeaderFeature[] = [
    { sport: "mlb", eventIds: ["m3", "m1", "m2"], sportOrder: 0 },
    { sport: "nfl", eventIds: ["n2", "n1"], sportOrder: 1 },
  ];
  const games = [game("n1", "nfl", 17), game("m1", "mlb", 17), game("x9", "mlb", 12), game("m2", "mlb", 20), game("m3", "mlb", 23), game("n2", "nfl", 20)];
  const ids = orderPastDayByStart(games, features).map((g) => g.id);
  // x9 is not on ESPN's strip, so it stays out (membership is ESPN's).
  assert.deepEqual(ids, ["m1", "m2", "m3", "n1", "n2"]);
});

test("a past day's ESPN column ignores the body's featured game", () => {
  const features: EspnHeaderFeature[] = [
    { sport: "mlb", eventIds: ["m1", "m2"], sportOrder: 0 },
    { sport: "nfl", eventIds: ["n1"], sportOrder: 1 },
  ];
  // orderPastDayByStart takes no featured ids at all; the NFL game ESPN's
  // body featured at night does not jump the MLB block.
  const ids = orderPastDayByStart([game("n1", "nfl", 23), game("m2", "mlb", 20), game("m1", "mlb", 18)], features).map((g) => g.id);
  assert.deepEqual(ids, ["m1", "m2", "n1"]);
});

test("a game with no start time sorts last in its league", () => {
  const features: EspnHeaderFeature[] = [{ sport: "mlb", eventIds: ["a", "b"], sportOrder: 0 }];
  const a = { ...game("a", "mlb", 18), date: "" };
  const ids = orderPastDayByStart([a, game("b", "mlb", 20)], features).map((g) => g.id);
  assert.deepEqual(ids, ["b", "a"]);
});
