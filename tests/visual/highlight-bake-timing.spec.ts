import { expect, test, type Page } from "@playwright/test";

// When does a finished game on TODAY's board get its highlight button?
//   1. A baked id shows at once. The kickoff + buffer wait (3.5 h for the WNBA)
//      only applies to a card the bake has nothing for, where it stops a useless
//      live YouTube search.
//   2. A card with no baked id stays hidden (no live search) until the buffer.
//   3. An id the bake adds AFTER the page loaded appears on the next manifest
//      re-read (every 10 min while a finished card has no button, and when the
//      tab comes back to the front), with no reload.

const NOW = new Date("2026-08-05T20:00:00-04:00"); // Wed 8 pm ET, today's board
const KICKOFF_ISO = "2026-08-05T23:30:00Z"; // 7:30 pm ET: the game is 30 min old and already final

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
    defaultDateMode: "today",
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
    date: KICKOFF_ISO,
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

const SCOREBOARD = JSON.stringify({ events: [finishedEvent("401999901", LYNX, DREAM)] });

const BAKED_RECORD = {
  t: NOW.getTime() - 60_000,
  firstSeen: NOW.getTime() - 60_000,
  teams: ["Lynx", "Dream"],
  matchup: "dream|lynx",
  eventDate: KICKOFF_ISO,
  official: "wnbaBakedAAA",
  officialChannel: "WNBA",
  officialDurationSec: 545,
  sourcePolicy: "official-channel",
};

const manifest = (withId: boolean, stamp = "14:00:00") => JSON.stringify({
  fetchedAt: `2026-08-05T${stamp}Z`,
  games: withId ? { "wnba:401999901": BAKED_RECORD } : {},
});

async function mock(page: Page, state: { manifest: string; manifestReads: number; youtubeCalls: number }) {
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
  await page.route("**/news/highlights.json", route => {
    state.manifestReads++;
    return route.fulfill({ status: 200, contentType: "application/json", body: state.manifest });
  });
  await page.route("**/api/youtube?**", route => {
    state.youtubeCalls++;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":null}' });
  });
}

const button = (page: Page) => page.getByRole("button", { name: "WNBA highlights" });

test("a baked id shows 30 min after kickoff, with no live search and no pending marker", async ({ page }) => {
  const state = { manifest: manifest(true), manifestReads: 0, youtubeCalls: 0 };
  await page.clock.install({ time: NOW });
  await seed(page);
  await mock(page, state);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect(button(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(button(page)).toHaveText(/^9m$/);
  await expect(page.locator("[data-hl-pending]")).toHaveCount(0);
  expect(state.youtubeCalls).toBe(0);
});

test("no baked id stays hidden and runs no live search until the buffer opens", async ({ page }) => {
  const state = { manifest: manifest(false), manifestReads: 0, youtubeCalls: 0 };
  await page.clock.install({ time: NOW });
  await seed(page);
  await mock(page, state);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => state.manifestReads, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(button(page)).toHaveCount(0);
  // The card is pending (its clip is coming), so no blank band is reserved.
  await expect(page.locator("[data-hl-pending]")).toHaveCount(1);
  expect(state.youtubeCalls).toBe(0);

  // 30 min after kickoff + 3.5 h buffer = 4 h more is plenty: the 60 s tick
  // opens the gate and the live search runs.
  await page.clock.fastForward("04:00:00");
  await expect.poll(() => state.youtubeCalls, { timeout: 15_000 }).toBeGreaterThan(0);
});

test("an id the bake adds after page load appears on the next 10-minute manifest re-read", async ({ page }) => {
  const state = { manifest: manifest(false), manifestReads: 0, youtubeCalls: 0 };
  await page.clock.install({ time: NOW });
  await seed(page);
  await mock(page, state);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => state.manifestReads, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(button(page)).toHaveCount(0);

  // The bake finishes a cycle and the clip is now in the manifest.
  state.manifest = manifest(true, "15:00:00");
  const readsBefore = state.manifestReads;
  await page.clock.fastForward("10:05");
  await expect.poll(() => state.manifestReads, { timeout: 15_000 }).toBeGreaterThan(readsBefore);
  await expect(button(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(button(page)).toHaveText(/^9m$/);
  await expect(page.locator("[data-hl-pending]")).toHaveCount(0);
  expect(state.youtubeCalls).toBe(0);
});

test("an id the bake adds while the tab was in the background appears when the tab returns", async ({ page }) => {
  const state = { manifest: manifest(false), manifestReads: 0, youtubeCalls: 0 };
  await page.clock.install({ time: NOW });
  await seed(page);
  await mock(page, state);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => state.manifestReads, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(button(page)).toHaveCount(0);

  state.manifest = manifest(true, "15:00:00");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(button(page)).toHaveCount(1, { timeout: 15_000 });
});
