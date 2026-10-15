import { expect, test, type Page } from "@playwright/test";

// "✓ Opened" morning reset (lib/newsSeen.ts morningCutoff): an open counts
// only after the most recent 4:00 AM on the device clock. The page clock is
// mocked (America/New_York, from playwright.config) and starts at 11:30 PM.
//   1. Open a post → marked. Jump past 4 AM with the tab left open → covered
//      again, no reload. Same when the clock moves while the tab sleeps and
//      the window gets focus back.
//   2. Settings → News "Hide opened headlines again each morning" off → the
//      post stays opened past 4 AM. The row is a phone-sized tap target.
// Every news feed is mocked, as in news-hide-seen.spec.ts.

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
  newsFeedView: true,
  showTextPosts: true,
};

// 11:30 PM in New York on Oct 14 2026.
const START = new Date("2026-10-15T03:30:00Z");
const MARKED = "main [data-news-seen]";

async function gotoNews(page: Page, extra: Record<string, unknown> = {}) {
  await page.clock.install({ time: START });
  await page.addInitScript(({ prefs }) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
  }, { prefs: { ...BASE_PREFS, ...extra } });
  await page.goto("/");
}

async function mockFeeds(page: Page) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `${name}-${i}`,
      headline: `${name} post ${i + 1} with a headline long enough to wrap`,
      description: "",
      published: new Date(START.getTime() - (i * 60 + name.length) * 60_000).toISOString(),
      articleUrl: `https://example.com/${name}/${i}`,
      byline: "",
      section: name,
    }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: START.toISOString(), items }) });
  });
  await page.route(/site\.api\.espn\.com|site\.web\.api\.espn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

const posts = (page: Page) => page.locator("article[data-news-key]");

async function openSecondPost(page: Page) {
  await expect(posts(page).nth(2)).toBeVisible({ timeout: 30_000 });
  const card = posts(page).nth(2);
  const key = await card.getAttribute("data-news-key");
  await card.getByRole("button", { name: "Open post" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toHaveAttribute("data-news-seen", "");
  return key!;
}

for (const width of [390, 1440]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("an opened post is covered again after 4 AM, tab left open", async ({ page }) => {
      await mockFeeds(page);
      await gotoNews(page);
      const key = await openSecondPost(page);
      await expect(page.locator(MARKED)).toHaveCount(1);

      // 3:59 AM: still opened.
      await page.clock.fastForward("04:29:00");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator(MARKED)).toHaveCount(1);

      // 4:01 AM: the timer fires and the card is covered again.
      await page.clock.fastForward("02:00");
      await expect(page.locator(MARKED)).toHaveCount(0);
      // The open time is kept for the account sync; only the reading changed.
      const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("hs.newsSeen.v1") || "{}")));
      expect(stored).toEqual([key]);

      // Opened again this morning: marked again.
      await openSecondPost(page);
      await expect(page.locator(MARKED)).toHaveCount(1);
    });

    test("a sleeping tab re-covers on focus", async ({ page }) => {
      await mockFeeds(page);
      await gotoNews(page);
      await openSecondPost(page);
      // The wall clock jumps (no timers run), then the window gets focus.
      await page.clock.setSystemTime(new Date("2026-10-15T09:00:00Z"));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator(MARKED)).toHaveCount(0);
    });

    test("with the setting off, the post stays opened past 4 AM", async ({ page }) => {
      await mockFeeds(page);
      await gotoNews(page);
      await openSecondPost(page);

      await page.getByRole("button", { name: "Open settings", exact: true }).click();
      const toggle = page.getByRole("checkbox", { name: /Hide opened headlines again each morning/ });
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toBeChecked();
      const row = page.locator("label").filter({ has: toggle });
      const box = await row.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").newsSeenMorningReset), { timeout: 5_000 }).toBe(false);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();

      await page.clock.fastForward("05:00:00");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator(MARKED)).toHaveCount(1);
    });
  });
}
