import { expect, test, type Page } from "@playwright/test";

// Settings → Links (9/28): with the user's own Redlib / Invidious set, every
// Reddit / YouTube link on the news board points there — the href (middle-click,
// copy link) AND the plain click. Feeds are mocked so the check needs no bake.

const RED = "http://redlib.test:8380";
const INV = "http://inv.test:3030";
const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const ITEMS = [
  { ...base, id: "t1", headline: "Text post one", articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph." },
  { ...base, id: "t2", headline: "Text post two", articleUrl: "https://old.reddit.com/r/nfl/comments/t2/", body: "Paragraph." },
];

const PREFS = {
  favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
  skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
  switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
  showTextPosts: true, newsFeedView: true,
};

async function setup(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(({ prefs }) => {
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
    // Record plain-click opens instead of opening tabs.
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((u?: string | URL) => { w.__opened.push(String(u)); return null; }) as typeof window.open;
  }, { prefs: { ...PREFS, ...extra } });
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.goto("/");
}

const openLinks = (page: Page) => page.locator("article a[href]", { hasText: /^Open/ });

test("Reddit links point at the user's Redlib: href and plain click", async ({ page }) => {
  await setup(page, { redditFrontend: RED, youtubeFrontend: INV });
  const links = openLinks(page);
  await expect(links.first()).toBeVisible({ timeout: 30_000 });
  const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  expect(hrefs).toContain(`${RED}/r/nfl/comments/t1/`);
  expect(hrefs).toContain(`${RED}/r/nfl/comments/t2/`);
  expect(hrefs.filter((h) => h && /reddit\.com/.test(h))).toEqual([]);

  await links.first().click();
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened.length).toBe(1);
  expect(opened[0].startsWith(RED)).toBe(true);
});

test("No frontend set: links stay on reddit.com", async ({ page }) => {
  await setup(page);
  const links = openLinks(page);
  await expect(links.first()).toBeVisible({ timeout: 30_000 });
  const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  expect(hrefs).toContain("https://www.reddit.com/r/nfl/comments/t1/");
});

test("Settings → Links saves, rejects a bare host, and clears", async ({ page }) => {
  await setup(page, { newsFeedView: undefined, showNews: false, defaultLandingView: "scores" });
  await page.getByRole("button", { name: "Open settings" }).click();
  const reddit = page.getByLabel("Reddit links open at");
  const youtube = page.getByLabel("YouTube links open at");
  await reddit.scrollIntoViewIfNeeded();

  await reddit.fill(`${RED}/`);
  await reddit.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(reddit).toHaveValue(RED);

  await youtube.fill("inv.test");
  await youtube.blur();
  await expect(page.getByRole("status").filter({ hasText: "Needs https://" })).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.redditFrontend).toBe(RED);
  expect(saved.youtubeFrontend).toBeUndefined();

  await reddit.fill("");
  await reddit.press("Enter");
  const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(cleared.redditFrontend).toBeUndefined();

  await page.screenshot({ path: "test-results/frontend-links-settings.png" });
});
