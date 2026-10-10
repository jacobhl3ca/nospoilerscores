import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import type { Game } from "../src/lib/types.ts";
import { buildCollegeFallbackChain, type CollegeHighlightConfig } from "../src/lib/collegeHighlights.ts";

// ESPN sends "Fox" from Oct 2026 (it sent "FOX" on 9/26). The app shows the
// brand in caps, and the college highlight lookup matches the exact "FOX".
const jiti = createJiti(import.meta.url);
const { parseGame, normalizeNetworkName } = (await jiti.import("../src/lib/espn.ts")) as {
  parseGame: (event: unknown, sport: string) => Game;
  normalizeNetworkName: (name: string) => string;
};

const CONFIG = JSON.parse(
  readFileSync(new URL("../src/lib/collegeHighlightChannels.json", import.meta.url), "utf8"),
) as Record<string, CollegeHighlightConfig>;

const event = (names: string[]) => ({
  id: "401778001",
  date: "2026-10-11T17:00Z",
  name: "Dallas Cowboys at New York Giants",
  shortName: "DAL @ NYG",
  season: { type: 2, year: 2026 },
  status: { displayClock: "15:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sun", shortDetail: "Sun", completed: false } },
  competitions: [{
    date: "2026-10-11T17:00Z",
    competitors: [
      { homeAway: "home", team: { id: "19", abbreviation: "NYG", displayName: "New York Giants", shortDisplayName: "Giants" }, score: "0" },
      { homeAway: "away", team: { id: "6", abbreviation: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys" }, score: "0" },
    ],
    broadcasts: [{ market: "national", names }],
  }],
});

test("Fox becomes FOX, other names stay as sent", () => {
  assert.equal(normalizeNetworkName("Fox"), "FOX");
  assert.equal(normalizeNetworkName("Fox Deportes"), "FOX Deportes");
  assert.equal(normalizeNetworkName(" Fox "), "FOX");
  for (const n of ["FOX", "FS1", "FOX Sports 1", "ESPN", "Foxtel"]) assert.equal(normalizeNetworkName(n), n);
});

test("parseGame shows ESPN's Fox as FOX and drops the duplicate", () => {
  assert.deepEqual(parseGame(event(["Fox"]), "nfl").broadcasts, ["FOX"]);
  assert.deepEqual(parseGame(event(["Fox", "FOX", "Fox Deportes"]), "nfl").broadcasts, ["FOX", "FOX Deportes"]);
});

test("a college game ESPN lists on Fox gets its FOX highlight channel back", () => {
  const broadcasts = parseGame(event(["Fox"]), "college-football").broadcasts;
  const chain = buildCollegeFallbackChain(CONFIG.ncaaf, "ESPN College Football", undefined, undefined, broadcasts);
  assert.deepEqual(chain.map((f) => f.channel), ["CFB ON FOX"]);
});
