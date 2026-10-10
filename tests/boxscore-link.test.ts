import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import type { Game } from "../src/lib/types.ts";

// The detail popup's Box score button opens ESPN's box score page. That href
// is already on the scoreboard event (rel ["boxscore","desktop","event"]); the
// parser used to keep only the first summary/event link as recapUrl.
const jiti = createJiti(import.meta.url);
const { parseGame } = (await jiti.import("../src/lib/espn.ts")) as {
  parseGame: (event: unknown, sport: string) => Game;
};

const event = (links: { rel: string[]; href: string }[] | undefined, state = "post") => ({
  id: "401907993",
  date: "2026-10-07T23:08Z",
  name: "Los Angeles Dodgers at Atlanta Braves",
  shortName: "LAD @ ATL",
  season: { type: 3, year: 2026 },
  status: { displayClock: "0:00", period: 9, type: { name: "STATUS_FINAL", state, detail: "Final", shortDetail: "Final", completed: state === "post" } },
  links,
  competitions: [{
    date: "2026-10-07T23:08Z",
    competitors: [
      { homeAway: "home", team: { id: "15", abbreviation: "ATL", displayName: "Atlanta Braves", shortDisplayName: "Braves" }, score: "1" },
      { homeAway: "away", team: { id: "19", abbreviation: "LAD", displayName: "Los Angeles Dodgers", shortDisplayName: "Dodgers" }, score: "3" },
    ],
    broadcasts: [],
  }],
});

test("the box score href is taken from the event links", () => {
  const g = parseGame(event([
    { rel: ["summary", "desktop", "event"], href: "https://www.espn.com/mlb/game/_/gameId/401907993" },
    { rel: ["boxscore", "desktop", "event"], href: "https://www.espn.com/mlb/boxscore/_/gameId/401907993" },
    { rel: ["pbp", "desktop", "event"], href: "https://www.espn.com/mlb/playbyplay/_/gameId/401907993" },
  ]), "mlb");
  assert.equal(g.boxscoreUrl, "https://www.espn.com/mlb/boxscore/_/gameId/401907993");
  // The recap link is unchanged by it.
  assert.equal(g.recapUrl, "https://www.espn.com/mlb/game/_/gameId/401907993");
});

test("no boxscore link leaves it null", () => {
  assert.equal(parseGame(event([{ rel: ["summary", "desktop", "event"], href: "https://www.espn.com/mlb/game/_/gameId/1" }], "pre"), "mlb").boxscoreUrl, null);
  assert.equal(parseGame(event(undefined, "pre"), "mlb").boxscoreUrl, null);
});
