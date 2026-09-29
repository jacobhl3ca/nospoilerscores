import { expect, test } from "@playwright/test";

// The news board's "Top news" entry used to only ever target column 3,
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
  // Best of yesterday in scores column 3 falls back to Top news; an Empty
  // one gives no news column 3 (Jacob 9/29).
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, {
    firstLeague: "mlb",
    secondLeague: "nfl",
    thirdLeague: "best",
    fourthLeague: "empty",
    fifthLeague: "empty",
  });
  await page.goto("/");

  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveCount(3);
  await expect(titles.nth(0)).toHaveText("MLB");
  await expect(titles.nth(2)).toHaveText("Top news");

  await titles.nth(0).click();
  await page.getByRole("dialog", { name: "Switch news league" })
    .getByRole("button", { name: "Top news" }).click();

  // The column the menu was opened from now IS the Top news column, and the
  // league it displaced shifted right instead of being dropped.
  await expect(titles.nth(0)).toHaveText("Top news");
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

// Top news leads the news switcher, the way Best of yesterday leads the scores
// one (Jacob 9/26): straight after Auto, not under a divider at the bottom.
test("Top news is the first row after Auto in a news switcher", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, { firstLeague: "mlb", secondLeague: "nfl", thirdLeague: "best", fourthLeague: "empty", fifthLeague: "empty" });
  await page.goto("/");
  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveCount(3);
  await titles.nth(0).click();
  const rows = await page.getByRole("dialog", { name: "Switch news league" }).getByRole("button").allTextContents();
  expect(rows[0]).toBe("Auto");
  expect(rows[1]).toMatch(/^Top news/);
});

// Turned off in Settings: gone from every news switcher, and the column that
// fell back to it takes a league instead.
test("Top news turned off: column 3 shows a league and no switcher offers it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, {
    firstLeague: "mlb", secondLeague: "nfl", thirdLeague: "best", fourthLeague: "empty", fifthLeague: "empty",
    topNewsHidden: true,
  });
  await page.goto("/");
  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveCount(3);
  const labels = await titles.allTextContents();
  expect(labels[0]).toBe("MLB");
  expect(labels[1]).toMatch(/^NFL/); // "NFL Preseason" on 8/7
  expect(labels[2]).not.toBe("Top news");
  expect(labels[2]).not.toMatch(/^(MLB|NFL)/);
  console.log("col 3 with Top news off:", labels[2]);
  await titles.nth(2).click();
  const menu = page.getByRole("dialog", { name: "Switch news league" });
  await expect(menu.getByRole("button", { name: "Auto" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /Top news/ })).toHaveCount(0);
});

test("Settings lists both cross-league columns and unticking them saves the prefs", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, { showNews: false, defaultLandingView: "scores" });
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByRole("button", { name: "More leagues", exact: true }).click();
  const best = page.getByRole("checkbox", { name: "Best of yesterday" });
  const top = page.getByRole("checkbox", { name: "Top news" });
  await expect(best).toBeChecked();
  await expect(top).toBeChecked();
  await best.uncheck();
  await top.uncheck();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hiddenLeagues).toContain("best");
  expect(saved.topNewsHidden).toBe(true);
});
