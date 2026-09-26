import { expect, test, type Page } from "@playwright/test";

// Jacob 9/25: "cfl keeps popping up as my 3rd news league, shouldnt it match
// 1 for 1 with my leagues on homepage unless manually set there?" News column 3
// now follows scores column 3 like columns 1-2 follow theirs; a pick in its own
// switcher still overrides it. And a pick reset on one device stays reset: the
// signed-in pull no longer lets a stale device push its old pick back up.

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

// The league columns wait on the scores fetch; the News column does not.
const LOAD = { timeout: 30_000 };

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-20T15:00:00-04:00"));
});

test("news column 3 follows scores column 3 by default", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveText(["MLB", "NFL", "WNBA"], LOAD);

  // Auto is marked on the scores column 3 league, not on Top news.
  await titles.nth(2).click();
  const menu = page.getByRole("dialog", { name: "Switch news league" });
  await expect(menu.getByRole("button", { name: /^WNBA/ })).toHaveAttribute("aria-current", "true");
});

test("a league picked in news column 3 overrides the mirror, and Auto hands it back", async ({ page }) => {
  await seedPrefs(page, { newsThirdLeague: "cfl" });
  await page.goto("/");
  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveText(["MLB", "NFL", "CFL"], LOAD);

  await titles.nth(2).click();
  await page.getByRole("dialog", { name: "Switch news league" }).getByRole("button", { name: "Auto", exact: true }).click();
  await expect(titles).toHaveText(["MLB", "NFL", "WNBA"]);
  const p = await saved(page);
  expect(p.newsThirdLeague).toBeUndefined();
  expect(p.newsTopNews).toBe(false);
  // The scores board was not touched.
  expect(p.thirdLeague).toBe("wnba");
});

test("Top news picked in column 3 stays, even with a league in scores column 3", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  const titles = page.locator('button[title="Switch news league"]');
  await expect(titles).toHaveText(["MLB", "NFL", "WNBA"], LOAD);
  await titles.nth(2).click();
  await page.getByRole("dialog", { name: "Switch news league" }).getByRole("button", { name: "Top news (ESPN)" }).click();
  await expect(titles).toHaveText(["MLB", "NFL", "News"]);
  expect((await saved(page)).newsTopNews).toBe(true);
  await page.reload();
  await expect(titles).toHaveText(["MLB", "NFL", "News"], LOAD);
});

test("an older Top news pick (newsGenericSlot, no newsTopNews) is kept", async ({ page }) => {
  await seedPrefs(page, { newsGenericSlot: 0 });
  await page.goto("/");
  await expect(page.locator('button[title="Switch news league"]')).toHaveText(["News", "MLB", "NFL"], LOAD);
});

test("scores column 3 Empty: news column 3 is Top news", async ({ page }) => {
  await seedPrefs(page, { thirdLeague: "empty" });
  await page.goto("/");
  await expect(page.locator('button[title="Switch news league"]')).toHaveText(["MLB", "NFL", "News"], LOAD);
});

test("signed in: a pick the account cleared does not come back from a stale device", async ({ page }) => {
  // This device still holds CFL from before; the account copy was reset to
  // Auto on another device, so the key is simply absent from it.
  await seedPrefs(page, { newsThirdLeague: "cfl", theme: "light" });
  const puts: Record<string, unknown>[] = [];
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: true, email: "t@example.com", uid: "u1", platforms: {} }),
  }));
  await page.route("**/api/prefs", (route) => {
    if (route.request().method() === "PUT") {
      puts.push(JSON.parse(route.request().postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ prefs: { ...BASE_PREFS, theme: "dark" } }),
    });
  });

  await page.goto("/");
  // The pull landed (theme is a synced key) …
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // … and CFL went with it.
  await expect(page.locator('button[title="Switch news league"]')).toHaveText(["MLB", "NFL", "WNBA"], LOAD);
  expect((await saved(page)).newsThirdLeague).toBeUndefined();
  await expect.poll(() => puts.length, { timeout: 5000 }).toBeGreaterThan(0);
  for (const body of puts) expect(body).not.toHaveProperty("newsThirdLeague");
});
