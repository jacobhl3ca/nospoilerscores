import { expect, test, type Page } from "@playwright/test";

// Jacob 10/9: a pinned league between seasons keeps its column (it used to
// take the slot's Auto league, one the user never picked). The column says
// when the league returns and asks once, inline, "Close this column?".
// Oct 25 2026: the WNBA Finals are over (window ends 10/19); MLB still plays.

const PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  wideSlotsVersion: 1,
  defaultDateMode: "today",
  defaultLandingView: "scores",
  showNews: false,
  firstLeague: "wnba",
  secondLeague: "mlb",
  thirdLeague: "nfl",
  fourthLeague: "empty",
  fifthLeague: "empty",
};

const LOAD = { timeout: 30_000 };
const columns = (page: Page) => page.locator("[data-league-column]");
const columnSports = (page: Page) =>
  columns(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-league-column")));
const prompt = (page: Page) => page.locator("[data-offseason-pin-prompt]");
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-25T15:00:00-04:00"));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.addInitScript((p) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify(p));
    sessionStorage.setItem("seeded", "1");
  }, PREFS);
  await page.goto("/");
  await expect.poll(() => columnSports(page), LOAD).toEqual(["wnba", "mlb", "nfl"]);
});

test("the offseason pin keeps its column and asks once", async ({ page }) => {
  await expect(prompt(page)).toHaveCount(1, LOAD);
  await expect(columns(page).first().locator("[data-offseason-pin-prompt]"))
    .toContainText(/WNBA is off until ~?\w{3} \d+\. Close this column\?/);
});

test("Close column empties the slot and shows the + button", async ({ page }) => {
  await prompt(page).getByRole("button", { name: "Close column" }).click();
  await expect.poll(() => columnSports(page), LOAD).toEqual(["mlb", "nfl"]);
  await expect(page.getByRole("button", { name: "Add a league column" })).toBeVisible(LOAD);
  expect((await saved(page)).firstLeague).toBe("empty");
});

test("Keep hides the question for good", async ({ page }) => {
  await prompt(page).getByRole("button", { name: "Keep" }).click();
  await expect(prompt(page)).toHaveCount(0);
  expect((await saved(page)).offseasonKeep).toEqual(["wnba"]);
  await page.reload();
  await expect.poll(() => columnSports(page), LOAD).toEqual(["wnba", "mlb", "nfl"]);
  await expect(prompt(page)).toHaveCount(0);
});

test("Settings names the return date", async ({ page }) => {
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.locator("[data-offseason-slot-note]")).toHaveText(/^Column 1: Offseason · returns ~?\w{3} \d+$/, LOAD);
});
