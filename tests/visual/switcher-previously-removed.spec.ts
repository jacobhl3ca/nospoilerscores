import { expect, test, type Locator, type Page } from "@playwright/test";

// Jacob 10/8: the leagues taken off a column switcher ("Remove from list…" or
// a Settings untick) say "Previously removed" and sit in their own group at
// the bottom of the Add more… sheet, newest first (removedLeagues).

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
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "wnba",
  fourthLeague: "empty",
  fifthLeague: "empty",
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

const pickRows = (switcher: Locator) => switcher.locator("button[aria-pressed]");

// The sheet's pills, split at the "Previously removed" heading.
const sheetGroups = (sheet: Locator) =>
  sheet.getByTestId("league-picker-grid").evaluate((grid) => {
    const main: string[] = [];
    const removed: string[] = [];
    let after = false;
    for (const el of Array.from(grid.children)) {
      if (el.getAttribute("data-testid") === "league-picker-removed") { after = true; continue; }
      (after ? removed : main).push((el.textContent ?? "").trim());
    }
    return { main, removed };
  });

// A pill or row text starts with the league label; tails ("offseason",
// "· col 2", "· starts …") follow it.
const label = (text: string) => text.split(/offseason|·/)[0].trim();

async function openAddMore(page: Page, headerName: string) {
  const header = page.getByRole("button", { name: headerName, exact: true });
  await expect(header).toBeVisible(LOAD);
  await header.click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await expect(switcher).toBeVisible();
  await switcher.getByTestId("league-switcher-add-more").click();
  const sheet = page.getByRole("dialog", { name: "More leagues" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
});

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("removed rows sit under Previously removed, newest first; a tap brings one back", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const header = page.getByRole("button", { name: "WNBA", exact: true });
      await expect(header).toBeVisible(LOAD);
      await header.click();
      const switcher = page.getByRole("dialog", { name: "Switch league" });

      // 1. Remove two rows via pick mode.
      await switcher.getByTestId("league-switcher-remove-from-list").click();
      // League rows only: Best of yesterday is not a sheet pill (Settings
      // has its own switch for it).
      const rows = (await pickRows(switcher).evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim())))
        .map(label).filter((name) => name !== "Best of yesterday").slice(0, 2);
      expect(rows).toHaveLength(2);
      for (const name of rows) await pickRows(switcher).filter({ hasText: name }).first().click();
      await switcher.getByTestId("league-switcher-remove-confirm").click();
      const removedSaved: string[] = (await saved(page)).removedLeagues;
      expect(removedSaved).toHaveLength(2);

      // 2. Add more…: heading shows, both pills after it in pick order, and
      //    neither is in the main grid.
      await switcher.getByTestId("league-switcher-add-more").click();
      const sheet = page.getByRole("dialog", { name: "More leagues" });
      await expect(sheet.getByTestId("league-picker-removed")).toHaveText("Previously removed");
      const groups = await sheetGroups(sheet);
      expect(groups.removed.map(label)).toEqual(rows);
      for (const name of rows) expect(groups.main.map(label)).not.toContain(name);

      // 3. Tap the newest: the column switches to it, the saved list drops it.
      await sheet.getByRole("button", { name: new RegExp(`^${rows[0]}`) }).click();
      await expect(sheet).toHaveCount(0);
      const prefs = await saved(page);
      expect(prefs.thirdLeague).toBe(removedSaved[0]);
      expect(prefs.removedLeagues).toEqual([removedSaved[1]]);

      // 4. Reopen from the new column: one pill left in the group.
      const again = await openAddMore(page, rows[0]);
      expect((await sheetGroups(again)).removed.map(label)).toEqual([rows[1]]);
    });
  });
}

test("a Settings untick feeds the group; Undo takes it back out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await seedPrefs(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const openSettings = () => expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  await openSettings();
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const nfl = catalog.getByRole("checkbox", { name: "NFL", exact: true });

  // Untick → saved; Undo → gone again.
  await nfl.click();
  expect((await saved(page)).removedLeagues).toEqual(["nfl"]);
  await dialog.getByRole("status").filter({ hasText: "NFL off" }).getByRole("button", { name: "Undo" }).click();
  await expect(nfl).toHaveAttribute("aria-checked", "true");
  expect((await saved(page)).removedLeagues).toBeUndefined();

  // Untick again, close Settings: NFL is in the sheet's group.
  await nfl.click();
  await expect(nfl).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const sheet = await openAddMore(page, "WNBA");
  const groups = await sheetGroups(sheet);
  expect(groups.removed.map(label)).toEqual(["NFL"]);
  expect(groups.main.map(label)).not.toContain("NFL");
});

test("an offseason removed league shows with the offseason toggle off", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // NBA is between seasons on 9/29.
  await seedPrefs(page, { hiddenLeagues: ["nba"], removedLeagues: ["nba"] });
  await page.goto("/");
  const sheet = await openAddMore(page, "WNBA");
  await expect(sheet.getByRole("button", { name: "Show offseason leagues" })).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByTestId("league-picker-removed")).toBeVisible();
  const groups = await sheetGroups(sheet);
  expect(groups.removed).toHaveLength(1);
  expect(groups.removed[0]).toMatch(/^NBA.*offseason/);
});

test("nothing removed, or only leagues back in the switcher → no heading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // MLB is in the switcher, so the stale entry never shows.
  await seedPrefs(page, { removedLeagues: ["mlb"] });
  await page.goto("/");
  const sheet = await openAddMore(page, "WNBA");
  await expect(sheet.getByTestId("league-picker-grid")).toBeVisible();
  await expect(sheet.getByTestId("league-picker-removed")).toHaveCount(0);
  expect((await sheetGroups(sheet)).main.map(label)).toContain("MLB");
});
