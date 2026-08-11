import { expect, test } from "@playwright/test";

// The news board's "Top news (ESPN)" entry used to only ever target column 3,
// so picking it from a league column silently did nothing (Jacob 8/9). It now
// moves the generic column to whichever column asked for it.
const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultLandingView: "news",
  defaultDateMode: "today",
};

async function seedPrefs(page: import("@playwright/test").Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
  }, { base: BASE_PREFS, update: extra });
}

test("Top news is reachable from a league column, not just column 3", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, {
    firstLeague: "mlb",
    secondLeague: "nfl",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
  });
  await page.goto("/");

  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveCount(3);
  await expect(titles.nth(0)).toHaveText("MLB");
  await expect(titles.nth(2)).toHaveText("News");

  await titles.nth(0).click();
  await page.getByRole("dialog", { name: "Switch news league" })
    .getByRole("button", { name: "Top news (ESPN)" }).click();

  // The column the menu was opened from now IS the Top news column, and the
  // league it displaced shifted right instead of being dropped.
  await expect(titles.nth(0)).toHaveText("News");
  await expect(titles.nth(1)).toHaveText("MLB");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.newsGenericSlot).toBe(0);
});

test("the switcher marks what Auto resolves to and dates upcoming leagues as M/D", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  // Pin col 1 to something Auto would NOT choose, so the Auto fallback is a
  // different row and the "· default" tag has somewhere to show.
  await seedPrefs(page, { showNews: false, defaultLandingView: "scores", firstLeague: "nba" });
  await page.goto("/");

  await page.locator('button[title="Switch league"]').first().click();
  const menu = page.getByRole("dialog", { name: "Switch league" }).first();
  await expect(menu).toBeVisible();
  // Exactly one option is tagged as the Auto fallback for this column.
  await expect(menu.getByText("· default")).toHaveCount(1);

  // Pre-season leagues read "EPL · 8/21" — a spelled month wrapped the row.
  const rows = await menu.getByRole("button").allTextContents();
  expect(rows.some((r) => /\d{1,2}\/\d{1,2}$/.test(r.trim()))).toBe(true);
  expect(rows.some((r) => /starts \w{3} \d{1,2}/.test(r))).toBe(false);
});
