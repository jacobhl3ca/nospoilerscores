import { expect, test, type Page } from "@playwright/test";

// Watch queue (Jacob 9/27): the card's "Later" pill queues a game; after a
// reload the game sits in a strip ABOVE the league columns with a Done button,
// on Today and Yesterday alike; Done / Clear all empty it and the strip goes.

function prefs(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    favoriteLeagues: ["mlb"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  });
}

function event(id: string, away: [string, string, string], home: [string, string, string]) {
  const team = ([tid, name, abbr]: [string, string, string], homeAway: string) => ({
    homeAway,
    team: { id: tid, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
    score: "0",
    records: [{ summary: "80-80" }],
  });
  return {
    id,
    date: "2026-09-30T23:08:00Z",
    name: `${away[1]} at ${home[1]}`,
    shortName: `${away[2]} @ ${home[2]}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "7:08 PM EDT", shortDetail: "7:08 PM EDT", completed: false },
    },
    competitions: [{ competitors: [team(home, "home"), team(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const SCOREBOARD = JSON.stringify({
  events: [
    event("401999101", ["2", "Boston Red Sox", "BOS"], ["10", "New York Yankees", "NYY"]),
    event("401999102", ["21", "New York Mets", "NYM"], ["22", "Philadelphia Phillies", "PHI"]),
  ],
});

async function setup(page: Page, width: number, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00-04:00"));
  // Only on a fresh context: a reload must keep what the pill saved.
  await page.addInitScript((blob) => {
    if (!sessionStorage.getItem("wq-seeded")) {
      localStorage.setItem("nss-preferences", blob);
      sessionStorage.setItem("wq-seeded", "1");
    }
  }, prefs(extra));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
}

const strip = (page: Page) => page.locator("[data-watch-queue]");

for (const width of [390, 1440]) {
  test(`${width}px: Later queues a game, the strip leads the board after reload, Done empties it`, async ({ page }) => {
    await setup(page, width);
    await page.goto("/");
    const pill = page.getByRole("button", { name: "Add to Watch queue" }).first();
    await expect(pill).toBeVisible();
    await expect(strip(page)).toHaveCount(0);

    await pill.click();
    // The pill must not open the card's details popup.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove from Watch queue" })).toHaveCount(1);

    await page.reload();
    await expect(strip(page)).toBeVisible();
    await expect(strip(page).locator("[data-watch-queue-item]")).toHaveCount(1);
    await expect(strip(page)).toContainText("Watch queue");
    await expect(strip(page)).toContainText("Yankees");
    // Above the league column, not inside it.
    const stripBox = await strip(page).boundingBox();
    const colCard = page.getByRole("button", { name: /Red Sox at New York Yankees/ }).last();
    const colBox = await colCard.boundingBox();
    expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(colBox!.y);
    // No score anywhere on the strip.
    expect(await strip(page).innerText()).not.toMatch(/\b\d+\s*[-–]\s*\d+\b(?!\s*(AM|PM))/);

    // Yesterday's board shows it too.
    await page.getByRole("button", { name: "Go back one day" }).click();
    await expect(strip(page).locator("[data-watch-queue-item]")).toHaveCount(1);
    await expect(strip(page)).toContainText("Yankees");

    await strip(page).locator("[data-watch-queue-done]").click();
    await expect(strip(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Add to Watch queue" }).first()).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
  });
}

test("Clear all empties a two-game queue", async ({ page }) => {
  await setup(page, 1440);
  await page.goto("/");
  const pills = page.getByRole("button", { name: "Add to Watch queue" });
  await expect(pills).toHaveCount(2);
  await pills.first().click();
  await page.getByRole("button", { name: "Add to Watch queue" }).first().click();
  await expect(strip(page).locator("[data-watch-queue-item]")).toHaveCount(2);
  await strip(page).locator("[data-watch-queue-clear]").click();
  await expect(strip(page)).toHaveCount(0);
});

test("Settings off switch hides the pill", async ({ page }) => {
  await setup(page, 1440, { hideWatchLaterPill: true });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Red Sox at New York Yankees/ }).first()).toBeVisible();
  await expect(page.locator("[data-watch-later]")).toHaveCount(0);
});
