import { expect, test, type Page, type Request } from "@playwright/test";

// "✓ Opened" follows the account (Jacob 10/12): Firefox, Safari and the app
// each kept their own opened list, so a post opened on one showed no marker on
// another. Signed in, lib/seenSync pulls /api/seen and posts new marks to it.
//   1. Signed in: a key the account holds marks that card on load.
//   2. Signed in: opening a post sends its key up.
//   3. Signed out: no /api/seen request at all.
// Feeds are mocked the same way as news-hide-seen.spec.ts.

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

// signedIn decides /api/me; `remote` is what GET /api/seen hands back. Every
// /api/seen request lands in `requests`.
async function mockAccount(page: Page, signedIn: boolean, remote: Record<string, number> = {}) {
  const requests: Request[] = [];
  await page.addInitScript(({ prefs }) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
  }, { prefs: BASE_PREFS });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(signedIn ? { signedIn: true, email: "t@example.com", uid: "u1", platforms: {} } : { signedIn: false, email: null }),
  }));
  await page.route("**/api/prefs", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().method() === "PUT" ? '{"ok":true}' : JSON.stringify({ prefs: null }),
  }));
  await page.route("**/api/seen", (route) => {
    requests.push(route.request());
    if (!signedIn) return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"unauthorized"}' });
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: route.request().method() === "POST" ? '{"ok":true,"count":1}' : JSON.stringify({ seen: remote }),
    });
  });
  return requests;
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

test("Seen sync: a post the account opened elsewhere shows ✓ Opened here", async ({ page }) => {
  await mockFeeds(page);
  const remote: Record<string, number> = {};
  await mockAccount(page, true, remote);
  await page.goto("/");
  await settle(page);
  await expect(page.locator("main [data-news-seen]")).toHaveCount(0);
  // Another device opens post 3; this one reloads.
  const key = (await posts(page).nth(2).getAttribute("data-news-key"))!;
  remote[key] = Date.now() - 60_000;
  await page.reload();
  await settle(page);
  await expect(page.locator(`main [data-news-key="${key}"]`).first()).toHaveAttribute("data-news-seen", "", { timeout: 10_000 });
  await expect(page.locator("main [data-news-seen]")).toHaveCount(1);
});

test("Seen sync: opening a post while signed in sends its key to the account", async ({ page }) => {
  await mockFeeds(page);
  const requests = await mockAccount(page, true);
  await page.goto("/");
  await settle(page);
  const key = (await posts(page).nth(1).getAttribute("data-news-key"))!;
  await posts(page).nth(1).getByRole("button", { name: "Open post" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => requests.filter((r) => r.method() === "POST").length, { timeout: 6_000 }).toBeGreaterThan(0);
  const added = requests.filter((r) => r.method() === "POST").flatMap((r) => Object.keys(JSON.parse(r.postData() || "{}").add || {}));
  expect(added).toContain(key);
});

test("Seen sync: signed out sends no /api/seen request", async ({ page }) => {
  await mockFeeds(page);
  const requests = await mockAccount(page, false);
  await page.goto("/");
  await settle(page);
  await posts(page).nth(1).getByRole("button", { name: "Open post" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3_000);
  expect(requests.length).toBe(0);
});
