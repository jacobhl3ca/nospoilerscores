import { expect, test, type Page } from "@playwright/test";

// Jacob 10/1: "multi select", "doesn't stay selected? add btn". The Add more…
// sheet lights each tapped pill; one "Add N" button puts the first pick in
// the column and the rest in its league list. No new column opens, and ✕
// adds nothing.

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
  showNews: false,
  defaultLandingView: "scores",
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "wnba",
  fourthLeague: "empty",
  fifthLeague: "empty",
};

async function seedPrefs(page: Page) {
  await page.addInitScript((base) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify(base));
    sessionStorage.setItem("seeded", "1");
  }, BASE_PREFS);
}

const LOAD = { timeout: 30_000 };

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

async function openAddMore(page: Page) {
  const header = page.locator('[data-league-column="wnba"] button[title="Switch league"]');
  await expect(header).toBeVisible(LOAD);
  await header.click();
  await page.getByTestId("league-switcher-add-more").click();
  const sheet = page.getByRole("dialog", { name: "More leagues" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// UEL is on by default; Serie A and Bundesliga are opt-in. All three are in
// season on 9/29.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
});

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("tap several, Add: the column shows the first, the dropdown lists the rest", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const columns = page.locator("[data-league-column]");
      await expect(columns.first()).toBeVisible(LOAD);
      const before = await columns.count();
      const sheet = await openAddMore(page);

      const add = sheet.getByTestId("league-picker-add");
      await expect(add).toHaveText("Add");
      await expect(add).toBeDisabled();

      const pill = (name: RegExp) => sheet.getByTestId("league-picker-grid").getByRole("button", { name });
      const uel = pill(/^UEL/);
      const serieA = pill(/^Serie A/);
      const bundesliga = pill(/^Bundesliga/);
      for (const p of [uel, serieA, bundesliga]) {
        await expect(p).toHaveAttribute("aria-pressed", "false");
        await p.click();
      }
      for (const p of [uel, serieA, bundesliga]) await expect(p).toHaveAttribute("aria-pressed", "true");
      await expect(add).toHaveText("Add 3");
      await expect(add).toBeEnabled();

      // A second tap puts a pill out.
      await uel.click();
      await expect(uel).toHaveAttribute("aria-pressed", "false");
      await expect(add).toHaveText("Add 2");

      await add.click();
      await expect(sheet).toHaveCount(0);
      const prefs = await saved(page);
      expect(prefs.thirdLeague).toBe("seriea");
      expect(prefs.shownLeagues).toEqual(["bundesliga"]);
      const column = page.locator('[data-league-column="seriea"]');
      await expect(column).toBeVisible(LOAD);
      await expect(columns).toHaveCount(before);

      // The dropdown reaches the second pick.
      await column.locator('button[title="Switch league"]').click();
      const switcher = page.getByRole("dialog", { name: "Switch league" });
      await expect(switcher).toBeVisible();
      await expect(switcher.getByRole("button", { name: /^Bundesliga/ })).toBeVisible();
    });

    test("✕ with pills lit adds nothing", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const sheet = await openAddMore(page);
      const grid = sheet.getByTestId("league-picker-grid");
      await grid.getByRole("button", { name: /^Serie A/ }).click();
      await grid.getByRole("button", { name: /^Bundesliga/ }).click();
      await expect(sheet.getByTestId("league-picker-add")).toHaveText("Add 2");
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      await expect(sheet).toHaveCount(0);
      const prefs = await saved(page);
      expect(prefs.thirdLeague).toBe("wnba");
      expect(prefs.shownLeagues).toBeUndefined();
    });
  });
}
