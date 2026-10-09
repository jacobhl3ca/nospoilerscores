import { expect, test, type Page } from "@playwright/test";

// Jacob 10/8: "i think ive removed these columns before and they keep adding
// back if i do fullscreen and theres space. if not explicitly added a league
// i dont think they should be added to homepage?" Once the board is shaped,
// extra room shows the + button, never an Auto league; and a column whose
// league leaves the switcher list closes instead of taking the next league.

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultDateMode: "today",
  defaultLandingView: "scores",
  showNews: false,
};

async function seedPrefs(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    sessionStorage.setItem("seeded", "1");
  }, { base: BASE_PREFS, update: extra });
}

const LOAD = { timeout: 30_000 };

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

const columns = (page: Page) => page.locator("[data-league-column]");
const columnSports = (page: Page) =>
  columns(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-league-column")));
const addButton = (page: Page) => page.getByRole("button", { name: "Add a league column" });

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  return dialog;
}

// 9/29: Auto puts MLB, NFL, NCAAF on a 3-column board.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
});

test("a column removed on a narrow board stays closed in fullscreen", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 844 });
  await seedPrefs(page, { wideSlotsVersion: 1 });
  await page.goto("/");
  await expect(columns(page)).toHaveCount(3, LOAD);
  const [first, , third] = await columnSports(page);

  // Column 2 → Remove col.
  await columns(page).nth(1).locator('button[aria-haspopup="dialog"][aria-expanded]').click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await switcher.getByRole("button", { name: "Remove col", exact: true }).click();
  // The board first drops its last column, then refetches.
  await expect.poll(() => columnSports(page), LOAD).toEqual([first, third]);
  const prefs = await saved(page);
  expect([prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague, prefs.fourthLeague, prefs.fifthLeague])
    .toEqual([first, "empty", third, "empty", "empty"]);

  // Fullscreen: room for five, but only the two kept columns and the + button.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(addButton(page)).toBeVisible(LOAD);
  await expect.poll(() => columnSports(page), LOAD).toEqual([first, third]);

  // It holds through a reload.
  await page.reload();
  await expect(addButton(page)).toBeVisible(LOAD);
  await expect(columns(page)).toHaveCount(2);
});

test("a board shaped before the fix gets slots 4-5 closed once", async ({ page }) => {
  // The backed-up account's state: slots 1-3 set, 4-5 Auto, no marker.
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPrefs(page, { firstLeague: "mlb", secondLeague: "nfl", thirdLeague: "wnba" });
  await page.goto("/");
  await expect(addButton(page)).toBeVisible(LOAD);
  await expect.poll(() => columnSports(page), LOAD).toEqual(["mlb", "nfl", "wnba"]);
});

test("a fresh all-Auto board still fills five columns in fullscreen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPrefs(page);
  await page.goto("/");
  await expect(columns(page)).toHaveCount(5, LOAD);
});

test("unticking an Auto column's league closes it; ticking it back reopens it", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 844 });
  await seedPrefs(page, { wideSlotsVersion: 1 });
  await page.goto("/");
  await expect(columns(page)).toHaveCount(3, LOAD);
  const sports = await columnSports(page);
  expect(sports[2]).toBe("ncaaf");

  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const chip = catalog.locator('[role="checkbox"]', { has: page.locator('[data-league-mark="ncaaf"]') }).first();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "false");
  // The Columns pill reads Remove col for it.
  await expect(dialog.locator('select[aria-label="Slot 3 league"]')).toHaveValue("empty");
  const off = await saved(page);
  expect(off.thirdLeague).toBe("ncaaf");
  expect(off.hiddenLeagues).toContain("ncaaf");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The column is gone and no other league took it.
  await expect.poll(() => columnSports(page), LOAD).toEqual(sports.slice(0, 2));
  await expect(addButton(page)).toBeVisible();

  // Tick it back (an unticked league sits under More leagues): the column
  // returns.
  await openSettings(page);
  await catalog.getByRole("button", { name: "More leagues" }).click();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect.poll(() => columnSports(page), LOAD).toEqual(sports);
});
