import { expect, test, type Page } from "@playwright/test";

// The official-highlight button reads the clip's LENGTH, not the league badge.
// The league name is redundant on the card - the card already sits under its
// league's heading - so "9m" is the whole label, and the league badge survives
// only as the fallback for a video the bake has no duration for yet.
//
// WNBA rather than the NFL on purpose: the minutes used to be gated on
// `isNfl` at both the bake and the label, so a non-NFL league is the only
// thing that proves the gate is gone.

const NOW = new Date("2026-08-05T16:00:00-04:00"); // Wed 4 pm ET -> /yesterday = Tue 8/4
const EVENT_ISO = "2026-08-05T02:00:00Z"; // Tue 8/4, 10 pm ET

async function seed(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["wnba"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "wnba",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "yesterday",
    defaultLandingView: "scores",
  })));
}

type Team = { id: string; displayName: string; shortDisplayName: string; abbreviation: string; score: string };

function finishedEvent(id: string, away: Team, home: Team) {
  const competitor = (team: Team, homeAway: "home" | "away") => ({
    homeAway,
    team: { ...team, logo: "", color: "666666" },
    score: team.score,
    winner: homeAway === "home",
    records: [{ summary: "1-0" }],
  });
  return {
    id,
    date: EVENT_ISO,
    name: `${away.displayName} at ${home.displayName}`,
    shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 4,
      type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
    },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const LYNX: Team = { id: "min", displayName: "Minnesota Lynx", shortDisplayName: "Lynx", abbreviation: "MIN", score: "80" };
const DREAM: Team = { id: "atl", displayName: "Atlanta Dream", shortDisplayName: "Dream", abbreviation: "ATL", score: "90" };
const ACES: Team = { id: "lv", displayName: "Las Vegas Aces", shortDisplayName: "Aces", abbreviation: "LV", score: "77" };
const LIBERTY: Team = { id: "ny", displayName: "New York Liberty", shortDisplayName: "Liberty", abbreviation: "NY", score: "88" };

const SCOREBOARD = JSON.stringify({
  events: [finishedEvent("401999901", LYNX, DREAM), finishedEvent("401999902", ACES, LIBERTY)],
});

// Shape written by bakeGameHighlights. The first game carries a duration, the
// second does not - the bake can miss a watch page and still keep the clip.
const HIGHLIGHTS = JSON.stringify({
  fetchedAt: "2026-08-05T14:00:00Z",
  games: {
    "wnba:401999901": {
      t: NOW.getTime() - 60_000, teams: ["Lynx", "Dream"], matchup: "dream|lynx", eventDate: EVENT_ISO,
      official: "wnbaDurationA", officialChannel: "WNBA", officialDurationSec: 545,
      sourcePolicy: "official-channel",
    },
    "wnba:401999902": {
      t: NOW.getTime() - 60_000, teams: ["Aces", "Liberty"], matchup: "aces|liberty", eventDate: EVENT_ISO,
      official: "wnbaDurationB", officialChannel: "WNBA",
      sourcePolicy: "official-channel",
    },
  },
});

test("a non-NFL official button reads the clip length, and falls back to the league badge without one", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: HIGHLIGHTS }));
  await page.route("**/api/youtube?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":null}' }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });

  // The accessible name still carries the league - a screen reader has no
  // column context to read the minutes against.
  const buttons = page.getByRole("button", { name: "WNBA highlights" });
  await expect(buttons).toHaveCount(2, { timeout: 15_000 });

  // 545s -> "9m". Minutes alone, no "WNBA" in the visible label.
  await expect(buttons.first()).toHaveText(/^9m$/, { timeout: 15_000 });
  await expect(buttons.first()).not.toHaveText(/WNBA/);

  // No baked duration -> today's league badge, never a blank label.
  await expect(buttons.nth(1)).toHaveText(/^WNBA$/);
});
