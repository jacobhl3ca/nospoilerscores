import { expect, test, type Page, type Route } from "@playwright/test";

// Jacob 10/17: a Reddit picture post opened as an empty black modal for a few
// seconds. The first viewer of a picture waits on the image proxy's cold fetch,
// and the lightbox box had no size and no placeholder. Now a soft pulse box
// (the column skeleton's fill) shows at once, and the picture fades in on load.
// The phone Feed hero gets the same treatment.
//
// The proxy's big sizes (w=1400 lightbox, w=1200 Feed hero) are held behind a
// gate the test opens by hand, so "still loading" is a fixed state, not a race.

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, byline: "u/fixture", section: "r/baseball" };
const PICTURE = "https://i.redd.it/fixture-pitchclock.png";
const ITEMS = [
  { ...base, id: "p1", headline: "The pitch clock in MLB 1965", articleUrl: "https://www.reddit.com/r/baseball/comments/p1/", imageUrl: PICTURE, imageFullUrl: PICTURE },
  { ...base, id: "t1", headline: "Text post: what a finish", articleUrl: "https://www.reddit.com/r/baseball/comments/t1/", imageUrl: null, body: "Words." },
];

const PREFS = {
  favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "dark", showRatings: false,
  skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
  switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
};

async function setup(page: Page, prefs: Record<string, unknown> = {}) {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), { ...PREFS, ...prefs });
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  // Every other off-site picture (league logos, row thumbs) answers at once.
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
      : route.fallback());
  await page.route("https://images.weserv.nl/**", async (route: Route) => {
    if (/[?&]w=(1400|1200)\b/.test(route.request().url())) await gate;
    return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
  });
  return open;
}

test("lightbox: pulse box at once, picture fades in on load", async ({ page }) => {
  const release = await setup(page);
  await page.goto("/");
  await page.locator('button[aria-label="Open post"]', { hasText: "The pitch clock in MLB 1965" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Image viewer" });
  await expect(dialog).toBeVisible();
  const status = dialog.getByRole("status").filter({ hasText: "Loading picture…" });
  await expect(status).toBeAttached({ timeout: 300 });
  const pulse = dialog.locator(".animate-pulse").first();
  const box = (await pulse.boundingBox())!;
  expect(box.height).toBeGreaterThan(100);
  expect(box.width).toBeGreaterThan(100);
  const img = dialog.locator("img").first();
  await expect(img).toHaveClass(/opacity-0/);

  release();
  await expect(img).toHaveClass(/opacity-100/);
  await expect(status).toHaveCount(0);
  await expect(dialog.locator(".animate-pulse")).toHaveCount(0);
});

test("phone Feed hero: pulses while loading, picture fades in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const release = await setup(page, { newsFeedView: true, showTextPosts: true });
  await page.goto("/");

  const hero = page.locator("article[data-news-key]", { hasText: "The pitch clock in MLB 1965" }).first().locator(".news-media-preview");
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveClass(/animate-pulse/);
  expect((await hero.boundingBox())!.height).toBeGreaterThanOrEqual(190);
  const img = hero.locator("img");
  await expect(img).toHaveClass(/opacity-0/);

  release();
  await expect(img).toHaveClass(/opacity-100/);
  await expect(hero).not.toHaveClass(/animate-pulse/);
});
