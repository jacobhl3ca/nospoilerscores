import { expect, test, type Page } from "@playwright/test";

// News 👁 Hide seen (Jacob 10/6, 10/8): a post counts as seen when he OPENS it
// (lib/newsSeen.ts), not when it scrolls past. The header toggle drops seen
// posts on the next snapshot.
//   1. Scroll the whole feed, wait → nothing seen, toggle on hides nothing.
//   2. Open a post (headline → modal → Esc) → toggle on → that post gone.
//   3. ‹ prev / next › paging inside the modal marks each post it lands on.
//   4. Cmd-click in Cards view (new tab) counts; survives reload.
//   5. The comments toggle does not count.
//   6. Reset to defaults clears newsHideSeen; the toggle fits a phone header.
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
      // Post 1 of each feed is a Reddit post with top comments (test 5).
      section: i === 0 ? "r/nba" : name,
      ...(i === 0 ? { comments: ["first comment", "second comment"] } : {}),
    }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: "2026-10-06T18:00:00Z", items }) });
  });
  await page.route(/site\.api\.espn\.com|site\.web\.api\.espn\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  // Cmd-click opens the source in a new tab: answer it locally.
  await page.context().route(/example\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>source</p>" }));
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

const hiddenTitle = (n: number) => new RegExp(`\\(${n} hidden\\)`);

test("Hide seen: scrolling past posts does not count", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  const total = await settle(page);
  expect(total).toBeGreaterThan(6);
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "false");

  // Every post on screen, top to bottom, then hold 3 s.
  for (let i = 0; i < total; i++) {
    await posts(page).nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(3_000);
  expect(await seenStore(page)).toEqual([]);

  await page.locator(TOGGLE).click();
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(TOGGLE)).toHaveAttribute("title", hiddenTitle(0));
  expect((await renderedKeys(page)).length).toBe(total);
});

test("Hide seen: opening a post hides it on the next snapshot; toggle off restores", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  const total = await settle(page);
  const all = await renderedKeys(page);
  const key = all[2];

  await posts(page).nth(2).getByRole("button", { name: "Open post" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await seenStore(page)).toEqual([key]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Still on screen until the snapshot: opening must not yank it.
  expect(await renderedKeys(page)).toContain(key);

  await page.locator(TOGGLE).click();
  await expect.poll(async () => (await renderedKeys(page)).includes(key), { timeout: 5_000 }).toBe(false);
  expect((await renderedKeys(page)).length).toBe(total - 1);
  await expect(page.locator(TOGGLE)).toHaveAttribute("title", hiddenTitle(1));

  await page.locator(TOGGLE).click();
  await expect.poll(async () => (await renderedKeys(page)).length, { timeout: 5_000 }).toBe(total);
});

test("Hide seen: paging next inside the modal marks each post it lands on", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  const total = await settle(page);
  const all = await renderedKeys(page);

  await posts(page).nth(1).getByRole("button", { name: "Open post" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seenStore(page).then((k) => k.length), { timeout: 3_000 }).toBe(2);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seenStore(page).then((k) => k.length), { timeout: 3_000 }).toBe(3);
  expect((await seenStore(page)).sort()).toEqual(all.slice(1, 4).sort());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.locator(TOGGLE).click();
  await expect.poll(async () => (await renderedKeys(page)).length, { timeout: 5_000 }).toBe(total - 3);
  await expect(page.locator(TOGGLE)).toHaveAttribute("title", hiddenTitle(3));
});

test("Hide seen: cmd-click in Cards view counts and survives reload", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page, { newsFeedView: false });
  const opener = page.locator("main [data-news-key] [data-news-open], main [data-news-open][data-news-key], main [data-news-key] a[href], main a[href][data-news-key]").first();
  await expect(opener).toBeVisible({ timeout: 30_000 });
  const key = await opener.evaluate((el) => el.closest("[data-news-key]")!.getAttribute("data-news-key")!);

  const popup = page.waitForEvent("popup");
  await opener.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await (await popup).close();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await seenStore(page)).toEqual([key]);

  const cardKeys = () => page.locator("main [data-news-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-news-key")!));
  await page.locator(TOGGLE).click();
  await expect.poll(async () => (await cardKeys()).includes(key), { timeout: 5_000 }).toBe(false);

  await page.reload();
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(page.locator("main [data-news-key]").first()).toBeVisible({ timeout: 30_000 });
  expect(await cardKeys()).not.toContain(key);
});

test("Hide seen: the comments toggle does not count", async ({ page }) => {
  await mockFeeds(page);
  await gotoNews(page);
  await settle(page);
  const toggle = page.getByRole("button", { name: /top comments/ }).first();
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(500);
  expect(await seenStore(page)).toEqual([]);
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
