import { expect, test, type Locator, type Page } from "@playwright/test";

// Jacob 9/29: "above remove col maybe an add more button for live leagues. and
// a nice modal popup that we already built i believe. and on bottom of that can
// have show offseason leagues". The column switchers list in-season leagues
// only; "Add more…" opens the first-run picker's pill sheet for that column,
// with a saved "Show offseason leagues" toggle in its footer.

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
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "wnba",
  fourthLeague: "empty",
  fifthLeague: "empty",
};

async function seedPrefs(page: Page, extra: Record<string, unknown>) {
  await page.addInitScript(({ base, update }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    sessionStorage.setItem("seeded", "1");
  }, { base: BASE_PREFS, update: extra });
}

const LOAD = { timeout: 30_000 };

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

// The dropdown's rows, top to bottom.
const rowTexts = (switcher: Locator) =>
  switcher.getByRole("button").evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));

const offseasonPills = (sheet: Locator) => sheet.locator("button em", { hasText: /^offseason$/ });

// NBA is between seasons on 9/29 (it tips off 10/20, upcoming from 10/6).
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
});

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("news column: in-season rows, Add more… sheet, saved offseason toggle, pick", async ({ page }) => {
      // Phones merge the news columns into one feed with no column titles,
      // so there is no news switcher to open there.
      test.skip(width < 640, "no news column switcher on a phone");
      await seedPrefs(page, { showNews: true, defaultLandingView: "news" });
      await page.goto("/");
      const titles = page.locator('button[title="Switch news league"]');
      await expect(titles.first()).toBeVisible(LOAD);
      const col = (await titles.count()) - 1;

      // 1. No offseason row; Add more… sits directly above Remove col.
      await titles.nth(col).click();
      const switcher = page.getByRole("dialog", { name: "Switch news league" });
      await expect(switcher).toBeVisible();
      await expect.poll(async () => (await rowTexts(switcher)).slice(-2)).toEqual(["Add more…", "Remove col"]);
      expect((await rowTexts(switcher)).filter((r) => r.includes("offseason"))).toEqual([]);

      // 2. The sheet opens with no offseason pill and the toggle off.
      await switcher.getByTestId("news-switcher-add-more").click();
      const sheet = page.getByRole("dialog", { name: "More leagues" });
      await expect(sheet).toBeVisible();
      await expect(switcher).toHaveCount(0);
      const toggle = sheet.getByRole("button", { name: "Show offseason leagues" });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(offseasonPills(sheet)).toHaveCount(0);
      // Single mode lists every league: no "More leagues" button (the sheet
      // title says it, so match the button role only).
      await expect(sheet.getByRole("button", { name: "More leagues" })).toHaveCount(0);
      await expect(sheet.getByTestId("league-picker-more")).toHaveCount(0);

      // 3. Toggle on: offseason pills appear, and the choice survives a reload.
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(await offseasonPills(sheet).count()).toBeGreaterThan(0);
      expect((await saved(page)).showOffseasonInPicker).toBe(true);
      await page.reload();
      await expect(titles.first()).toBeVisible(LOAD);
      await titles.nth(col).click();
      await switcher.getByTestId("news-switcher-add-more").click();
      await expect(sheet.getByRole("button", { name: "Show offseason leagues" })).toHaveAttribute("aria-pressed", "true");

      // 4. A pick closes the sheet and the column shows that league.
      await sheet.getByRole("button", { name: /^NBA offseason/ }).click();
      await expect(sheet).toHaveCount(0);
      await expect(titles.nth(col)).toHaveText("NBA", LOAD);
      // The pick sticks through a reload (news column 3 keeps only picks in
      // its switcher, and Add more… adds the league to it).
      await page.reload();
      await expect(titles.nth(col)).toHaveText("NBA", LOAD);
    });

    test("scores column: in-season rows, Add more… sheet, saved offseason toggle, pick", async ({ page }) => {
      await seedPrefs(page, { showNews: false, defaultLandingView: "scores" });
      await page.goto("/");
      const header = page.getByRole("button", { name: "WNBA", exact: true });
      await expect(header).toBeVisible(LOAD);

      // 1. The scores switcher also has Remove from list… (Jacob 10/8)
      // between Add more… and Remove col.
      await header.click();
      const switcher = page.getByRole("dialog", { name: "Switch league" });
      await expect(switcher).toBeVisible();
      await expect.poll(async () => (await rowTexts(switcher)).slice(-3)).toEqual(["Add more…", "Remove from list…", "Remove col"]);
      expect((await rowTexts(switcher)).filter((r) => r.includes("offseason"))).toEqual([]);

      // 2.
      await switcher.getByTestId("league-switcher-add-more").click();
      const sheet = page.getByRole("dialog", { name: "More leagues" });
      await expect(sheet).toBeVisible();
      const toggle = sheet.getByRole("button", { name: "Show offseason leagues" });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(offseasonPills(sheet)).toHaveCount(0);
      // This column's league is marked, the others carry their column.
      await expect(sheet.locator('button[aria-current="true"]')).toHaveText(/WNBA/);
      await expect(sheet.getByRole("button", { name: /^MLB/ })).toContainText("· col 1");

      // 3.
      await toggle.click();
      expect(await offseasonPills(sheet).count()).toBeGreaterThan(0);
      await page.reload();
      await expect(header).toBeVisible(LOAD);
      await header.click();
      await switcher.getByTestId("league-switcher-add-more").click();
      await expect(sheet.getByRole("button", { name: "Show offseason leagues" })).toHaveAttribute("aria-pressed", "true");

      // 4.
      await sheet.getByRole("button", { name: /^NBA offseason/ }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "NBA", exact: true })).toBeVisible(LOAD);
      expect((await saved(page)).thirdLeague).toBe("nba");
    });
  });
}

test("Escape and Cancel close the sheet without a change", async ({ page }) => {
  await seedPrefs(page, { showNews: false, defaultLandingView: "scores" });
  await page.goto("/");
  const header = page.getByRole("button", { name: "WNBA", exact: true });
  await expect(header).toBeVisible(LOAD);
  const sheet = page.getByRole("dialog", { name: "More leagues" });
  for (const close of ["Escape", "Cancel"] as const) {
    await header.click();
    await page.getByTestId("league-switcher-add-more").click();
    await expect(sheet).toBeVisible();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0);
  }
  expect((await saved(page)).thirdLeague).toBe("wnba");
});
