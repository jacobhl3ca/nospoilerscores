import { expect, test, type Page } from "@playwright/test";

// Jacob 9/26: "separate espn card where i just see front page", then "just
// have this espn news thing as a league itself thats selectable from league
// switcher? default off for all". ESPN front page is a league on both boards:
// its news column is espn.com's own front page (Top Headlines, then homepage
// clips, no Reddit), it follows its scores column like any league, and it
// sits in no switcher until Settings turns it on or a column pins it. The
// source funnel defaults to Reddit only, and it must not blank this column.

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

const rowsOf = async (page: Page, idx: number) => {
  await titles(page).nth(idx).click();
  const menu = page.getByRole("dialog", { name: "Switch news league" });
  return { menu, rows: await menu.getByRole("button").allTextContents() };
};

test("off by default: no ESPN front page row in a news switcher", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);
  const { rows } = await rowsOf(page, 2);
  expect(rows.some((r) => r.startsWith("ESPN front page")), rows.join(" | ")).toBe(false);
});

test("turned on: ESPN front page is a league row in news column 3, headlines then clips past the Reddit-only funnel", async ({ page }) => {
  await seedPrefs(page, { shownLeagues: ["top"] });
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);

  const { menu, rows } = await rowsOf(page, 2);
  // Auto, Top news, then ESPN front page as the first league.
  expect(rows[1]).toMatch(/^Top news \(ESPN\)/);
  expect(rows[2]).toBe("ESPN front page");
  await menu.getByRole("button", { name: "ESPN front page" }).click();

  await expect(titles(page).nth(2)).toHaveText("ESPN front page");
  await expect.poll(() => sourceHeaders(page, 2), LOAD).toEqual(["ESPN TOP HEADLINES", "ESPN VIDEOS"]);
  for (const h of HEADLINES) await expect(page.getByText(h)).toHaveCount(1);
  await expect(page.getByText(CLIP)).toHaveCount(1);
  const prefs = await saved(page);
  // A news column 3 league pick, the same pref any league pick writes.
  expect(prefs.newsThirdLeague).toBe("top");
  expect(prefs.newsTopNews).toBe(false);
  expect(prefs.thirdLeague).toBe("wnba");
});

test("picked in news column 1, it is scores column 1 too, and Auto hands both back", async ({ page }) => {
  await seedPrefs(page, { shownLeagues: ["top"] });
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);
  const first = await rowsOf(page, 0);
  await first.menu.getByRole("button", { name: "ESPN front page" }).click();
  await expect(titles(page).nth(0)).toHaveText("ESPN front page");
  await expect(titles(page).nth(1)).toHaveText("NFL");
  expect((await saved(page)).firstLeague).toBe("top");

  const again = await rowsOf(page, 0);
  await expect(again.menu.getByRole("button", { name: /^ESPN front page/ })).toHaveAttribute("aria-current", "true");
  await again.menu.getByRole("button", { name: "Auto" }).click();
  await expect(titles(page).nth(0)).not.toHaveText("ESPN front page");
  expect((await saved(page)).firstLeague).toBeUndefined();
});

test("under an ESPN front page scores column 3, news column 3 is ESPN front page on Auto", async ({ page }) => {
  // Pinned but never turned on in Settings: the pin alone puts it on the board.
  await seedPrefs(page, { thirdLeague: "top" });
  await page.goto("/");
  await expect(titles(page)).toHaveCount(3, LOAD);
  await expect(titles(page).nth(2)).toHaveText("ESPN front page");
  await expect.poll(() => sourceHeaders(page, 2), LOAD).toEqual(["ESPN TOP HEADLINES", "ESPN VIDEOS"]);
  const { rows } = await rowsOf(page, 2);
  expect(rows.find((r) => r.startsWith("ESPN front page"))).toBe("ESPN front page");
  expect((await saved(page)).newsThirdLeague).toBeUndefined();
});

test("phone: an ESPN front page scores column 3 leads the merged feed with the headlines", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPrefs(page, { thirdLeague: "top" });
  await page.goto("/");
  const first = page.locator(".news-source-sticky-top").first();
  await expect(first).toHaveText(/Top Headlines/i, LOAD);
  await expect(page.getByText(HEADLINES[0])).toHaveCount(1);
});

test("phone: without it, the feed does not lead with the front page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPrefs(page);
  await page.goto("/");
  const first = page.locator(".news-source-sticky-top").first();
  await expect(first).toBeVisible(LOAD);
  await expect(first).not.toHaveText(/Top Headlines/i);
});
