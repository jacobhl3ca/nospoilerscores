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

    // PR #314 review, finding 1: Serie A + NBA + UFL, with NBA and UFL in
    // their offseason on 9/29. The dropdown lists in-season leagues only, so
    // the sheet names the two that wait, and both are saved for their season.
    test("offseason picks: the sheet says they wait, and they are saved", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const sheet = await openAddMore(page);
      await sheet.getByRole("button", { name: "Show offseason leagues" }).click();
      const grid = sheet.getByTestId("league-picker-grid");
      for (const name of [/^Serie A/, /^NBA/, /^UFL/]) await grid.getByRole("button", { name }).click();
      await expect(grid.getByRole("button", { name: /^NBA/ })).toContainText("offseason");
      await expect(grid.getByRole("button", { name: /^UFL/ })).toContainText("offseason");

      const add = sheet.getByTestId("league-picker-add");
      await expect(add).toHaveText("Add 1");
      await expect(sheet.getByTestId("league-picker-later")).toHaveText(
        "NBA, UFL: offseason. They join this column's list when their seasons start.",
      );

      await add.click();
      await expect(sheet).toHaveCount(0);
      const prefs = await saved(page);
      expect(prefs.thirdLeague).toBe("seriea");
      // UFL is opt-in: saved so it lists when its season starts. NBA is on by
      // default and lists then with nothing saved.
      expect(prefs.shownLeagues).toEqual(["ufl"]);
      expect(prefs.hiddenLeagues ?? []).not.toContain("nba");
    });

    // Finding 1, all offseason: a column pinned to an offseason league takes
    // its Auto league, so the column stays as it is and the note names both.
    test("all picks offseason: the column stays, the sheet says why", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const sheet = await openAddMore(page);
      await sheet.getByRole("button", { name: "Show offseason leagues" }).click();
      const grid = sheet.getByTestId("league-picker-grid");
      await grid.getByRole("button", { name: /^UFL/ }).click();
      const add = sheet.getByTestId("league-picker-add");
      await expect(add).toHaveText("Add");
      await expect(add).toBeEnabled();
      await expect(sheet.getByTestId("league-picker-later")).toHaveText(
        "UFL: offseason. It joins this column's list when its season starts.",
      );
      await add.click();
      await expect(sheet).toHaveCount(0);
      const prefs = await saved(page);
      expect(prefs.thirdLeague).toBe("wnba");
      expect(prefs.shownLeagues).toEqual(["ufl"]);
      await expect(page.locator('[data-league-column="wnba"]')).toBeVisible(LOAD);
    });

    // Finding 2: "Add N" counts the leagues the board shows after Add.
    test("Add N matches the picks the column and its dropdown show", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const sheet = await openAddMore(page);
      await sheet.getByRole("button", { name: "Show offseason leagues" }).click();
      const grid = sheet.getByTestId("league-picker-grid");
      const picks = [/^Serie A/, /^NBA/, /^Bundesliga/, /^UFL/];
      for (const name of picks) await grid.getByRole("button", { name }).click();
      await expect(sheet.getByTestId("league-picker-add")).toHaveText("Add 2");
      await sheet.getByTestId("league-picker-add").click();
      await expect(sheet).toHaveCount(0);

      const column = page.locator('[data-league-column="seriea"]');
      await expect(column).toBeVisible(LOAD);
      await column.locator('button[title="Switch league"]').click();
      const switcher = page.getByRole("dialog", { name: "Switch league" });
      await expect(switcher).toBeVisible();
      let listed = 0;
      for (const name of picks) listed += await switcher.getByRole("button", { name }).count();
      expect(listed).toBe(2);
    });

    // Finding 4: the ✕ and Add are the sheet's two controls in this mode.
    test("✕ and Add are at least 44px tap targets", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const sheet = await openAddMore(page);
      for (const control of [sheet.getByRole("button", { name: "Close", exact: true }), sheet.getByTestId("league-picker-add")]) {
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
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
