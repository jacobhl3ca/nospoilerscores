import { expect, test, type Page } from "@playwright/test";

// News 👁 Hide seen (Jacob 10/6): a post that sat on screen for 1.5 s counts
// as seen (lib/newsSeen.ts), and the header toggle drops seen posts.
//   1. 2 s on screen → seen; 0.5 s → not seen.
//   2. Toggle on → the seen posts are gone, the rest stay.
//   3. Reload → still hidden. Toggle off → back.
//   4. Reset to defaults clears newsHideSeen.
// Every news feed is mocked so the run does not depend on the gitignored
// public/news/*.json files or the live ESPN API. Run against `localhost`.

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
  // One Feed column of <article data-news-key> rows: a stable order to scroll.
  newsFeedView: true,
  showTextPosts: true,
};

const SEEN_KEY = "hs.newsSeen.v1";
const TOGGLE = '[data-testid="news-hide-seen"]';

// Seed prefs ONCE per tab, so a reload keeps what the UI wrote.
async function gotoNews(page: Page, extra: Record<string, unknown> = {}) {
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
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `${name}-${i}`,
      headline: `${name} post ${i + 1} with a headline long enough to wrap`,
      description: "",
      published: new Date(Date.UTC(2026, 9, 6, 18, 0) - (i * 60 + name.length) * 60_000).toISOString(),
      articleUrl: `https://example.com/${name}/${i}`,
      byline: "",
      section: name,
    }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: "2026-10-06T18:00:00Z", items }) });
  });
  await page.route(/site\.api\.espn\.com|site\.web\.api\.espn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

const posts = (page: Page) => page.locator("article[data-news-key]");

async function settle(page: Page) {
  let last = -1;
  await expect.poll(async () => {
    const n = await posts(page).count();
    const stable = n === last && n > 0;
    last = n;
    return stable;
  }, { timeout: 30_000, intervals: [700] }).toBe(true);
  return last;
}

const seenStore = (page: Page) => page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) || "{}")), SEEN_KEY);
const renderedKeys = (page: Page) => posts(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-news-key")!));

test("Hide seen: 1.5 s on screen hides a post, 0.5 s does not; survives reload; toggle off restores", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  const total = await settle(page);
  expect(total).toBeGreaterThan(6);
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "false");

  // Top of the feed, held 2 s → the posts on screen are now seen.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2_000);
  const seenTop = await seenStore(page);
  expect(seenTop.length).toBeGreaterThan(0);
  const all = await renderedKeys(page);
  for (const k of seenTop) expect(all).toContain(k);

  // The last post on screen for only 0.5 s → not seen.
  const last = all[all.length - 1];
  expect(seenTop).not.toContain(last);
  await posts(page).last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  expect(await seenStore(page)).not.toContain(last);

  // Toggle on → the seen posts are gone, the 0.5 s post stays.
  const seenNow = await seenStore(page);
  await page.locator(TOGGLE).click();
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await renderedKeys(page)).filter((k) => seenNow.includes(k)).length, { timeout: 5_000 }).toBe(0);
  const afterOn = await renderedKeys(page);
  expect(afterOn).toContain(last);
  expect(afterOn.length).toBe(all.length - seenNow.filter((k) => all.includes(k)).length);
  await expect(page.locator(TOGGLE)).toHaveAttribute("title", new RegExp(`\\(${all.length - afterOn.length} hidden\\)`));

  // A post that turns seen while on screen stays until the next snapshot.
  await page.waitForTimeout(2_000);
  const seenWhileOn = (await seenStore(page)).filter((k) => !seenNow.includes(k));
  expect(seenWhileOn.length).toBeGreaterThan(0);
  const stillThere = await renderedKeys(page);
  for (const k of seenWhileOn) expect(stillThere).toContain(k);

  // Reload → the pref and the store survive; everything seen so far is hidden.
  const seenBeforeReload = await seenStore(page);
  await page.reload();
  await settle(page);
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "true");
  const afterReload = await renderedKeys(page);
  for (const k of seenBeforeReload) expect(afterReload).not.toContain(k);

  // Toggle off → all posts are back.
  await page.locator(TOGGLE).click();
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await renderedKeys(page)).length, { timeout: 5_000 }).toBe(all.length);
});

test("Hide seen: Cards view drops seen posts too", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page, { newsFeedView: false });
  const cards = page.locator("main [data-news-key]");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_500);
  const seen = await seenStore(page);
  expect(seen.length).toBeGreaterThan(0);
  await page.locator(TOGGLE).click();
  await expect.poll(async () => {
    const keys = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-news-key")!));
    return keys.filter((k) => seen.includes(k)).length;
  }, { timeout: 5_000 }).toBe(0);
});

test("Reset to defaults clears Hide seen", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page, { newsHideSeen: true });
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset to defaults" });
  await reset.scrollIntoViewIfNeeded();
  await reset.click();

  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("nss-preferences");
    return raw ? Object.prototype.hasOwnProperty.call(JSON.parse(raw), "newsHideSeen") : "missing";
  }), { timeout: 5_000 }).toBe(false);
});

for (const width of [390, 360]) {
  test(`Hide seen toggle fits the phone header at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockFeeds(page);
    await gotoNews(page);
    const toggle = page.locator(TOGGLE);
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("a post twice the viewport tall still counts as seen", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  await settle(page);
  const key = await posts(page).nth(3).evaluate((el) => {
    (el as HTMLElement).style.minHeight = `${window.innerHeight * 2}px`;
    return el.getAttribute("data-news-key")!;
  });
  await posts(page).nth(3).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + window.innerHeight * 0.5));
  await page.waitForTimeout(2_000);
  expect(await seenStore(page)).toContain(key);
});
