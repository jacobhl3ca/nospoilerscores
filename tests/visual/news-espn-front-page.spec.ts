import { expect, test, type Page } from "@playwright/test";

// Jacob 9/26: "separate espn card where i just see front page". The news
// switcher's "ESPN front page" row turns a column into espn.com's own front
// page: its Top Headlines first, then its homepage clips, no Reddit. The
// source funnel defaults to Reddit only, and it must not blank this column.
// The same column is what the news board shows under an ESPN front page
// scores column.

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

const HEADLINES = [
  "Front page headline one",
  "Front page headline two",
  "Front page headline three",
];
const CLIP = "Front page clip one";

async function mockEspnFeeds(page: Page) {
  const item = (id: string, headline: string, extra: Record<string, unknown> = {}) => ({
    id, headline, description: "", published: "2026-09-26T18:00:00Z",
    imageUrl: "https://a.espncdn.com/photo/2026/0926/x.jpg",
    articleUrl: `https://www.espn.com/story/_/id/${id}`, byline: "", section: "ESPN", ...extra,
  });
  await page.route("**/news/espn-top.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fetchedAt: "2026-09-26T19:00:00Z", items: HEADLINES.map((h, i) => item(`h${i}`, h)) }),
  }));
  await page.route("**/news/espn-videos.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fetchedAt: "2026-09-26T19:00:00Z", items: [item("v1", CLIP, { articleUrl: "https://www.espn.com/video/clip?id=1" })] }),
  }));
}

const LOAD = { timeout: 30_000 };
const titles = (page: Page) => page.locator('button[title="Switch news league"]');
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

// The source-card headers of news column `idx` (0-based), in order.
async function sourceHeaders(page: Page, idx: number): Promise<string[]> {
  return page.locator('button[title="Switch news league"]').nth(idx)
    .locator("xpath=ancestor::div[contains(@class,'min-h-[60vh]')][1]")
    .locator(".news-source-sticky-top")
    .allInnerTexts()
    .then((all) => all.map((t) => t.trim().toUpperCase()));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-26T15:00:00-04:00"));
  await mockEspnFeeds(page);
});

test("ESPN front page from column 3: headlines then clips, no Reddit, past the Reddit-only funnel", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);

  await titles(page).nth(2).click();
  const menu = page.getByRole("dialog", { name: "Switch news league" });
  const rows = await menu.getByRole("button").allTextContents();
  // Auto, Top news, then ESPN front page.
  expect(rows[1]).toMatch(/^Top news \(ESPN\)/);
  expect(rows[2]).toBe("ESPN front page");
  await menu.getByRole("button", { name: "ESPN front page" }).click();

  await expect(titles(page).nth(2)).toHaveText("ESPN front page");
  await expect.poll(() => sourceHeaders(page, 2), LOAD).toEqual(["ESPN TOP HEADLINES", "ESPN VIDEOS"]);
  for (const h of HEADLINES) await expect(page.getByText(h)).toHaveCount(1);
  await expect(page.getByText(CLIP)).toHaveCount(1);
  const prefs = await saved(page);
  expect(prefs.newsFrontPage).toBe(true);
  expect(prefs.newsGenericSlot).toBe(2);
});

test("ESPN front page picked from column 1 lands there, and Auto hands the column back", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);
  await titles(page).nth(0).click();
  await page.getByRole("dialog", { name: "Switch news league" }).getByRole("button", { name: "ESPN front page" }).click();
  await expect(titles(page).nth(0)).toHaveText("ESPN front page");
  await expect(titles(page).nth(1)).toHaveText("MLB");

  await titles(page).nth(0).click();
  const menu = page.getByRole("dialog", { name: "Switch news league" });
  await expect(menu.getByRole("button", { name: "ESPN front page" })).toHaveAttribute("aria-current", "true");
  await menu.getByRole("button", { name: "Auto" }).click();
  await expect(titles(page).nth(2)).toHaveText("WNBA");
  expect((await saved(page)).newsFrontPage).toBe(false);
});

test("under an ESPN front page scores column, the news column is ESPN front page on Auto", async ({ page }) => {
  await seedPrefs(page, { thirdLeague: "top" });
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);
  await expect(titles(page).nth(2)).toHaveText("ESPN front page");
  await expect.poll(() => sourceHeaders(page, 2), LOAD).toEqual(["ESPN TOP HEADLINES", "ESPN VIDEOS"]);
  expect((await saved(page)).newsFrontPage).toBeUndefined();
});

test("phone: ESPN front page leads the merged feed with the headlines", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPrefs(page, { newsFrontPage: true });
  await page.goto("/");
  const first = page.locator(".news-source-sticky-top").first();
  await expect(first).toHaveText(/Top Headlines/i, LOAD);
  await expect(page.getByText(HEADLINES[0])).toHaveCount(1);
});
