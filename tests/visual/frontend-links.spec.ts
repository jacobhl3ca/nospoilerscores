import { expect, test, type Page } from "@playwright/test";

// Settings → More settings → Links (9/28; in the fold since 10/4): with the user's own Redlib / Invidious set, every
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

test("Settings → More settings → Links saves, rejects a bare host, and clears", async ({ page }) => {
  await setup(page, { newsFeedView: undefined, showNews: false, defaultLandingView: "scores" });
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // Links moved into the More settings fold (Jacob 10/4): an h4 group at its
  // end, never a section of its own.
  await dialog.locator("summary", { hasText: "More settings" }).click();
  const fold = dialog.locator("details");
  await expect(fold.locator("h4", { hasText: /^Links$/ })).toBeVisible();
  await expect(dialog.locator("section > h3", { hasText: /^Links$/ })).toHaveCount(0);
  const reddit = fold.getByLabel("Reddit links open at");
  const youtube = fold.getByLabel("YouTube links open at");
  await reddit.scrollIntoViewIfNeeded();
  const top = (l: ReturnType<Page["locator"]>) => l.evaluate((el) => el.getBoundingClientRect().top);
  const tops = [
    await top(fold.getByText("Bring back a warning you dismissed")),
    await top(reddit),
    await top(youtube),
    await top(fold.getByLabel("Reminder link")),
    await top(fold.getByLabel("TV channel links")),
  ];
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  expect(new Set(tops).size).toBe(tops.length);
  // Neutral copy: no project names in the placeholders or hints (Jacob 10/1).
  await expect(reddit).toHaveAttribute("placeholder", "https://your-server.example");
  await expect(youtube).toHaveAttribute("placeholder", "https://your-server.example");
  const links = fold.locator("div", { has: page.locator("h4", { hasText: /^Links$/ }) }).last();
  expect(await links.textContent()).not.toMatch(/redlib|invidious|piped/i);

  await reddit.fill(`${RED}/`);
  await reddit.press("Enter");
  // One "Saved" mark in the Settings header (Jacob 10/1), none under the field.
  await expect(page.getByTestId("settings-saved")).toHaveText("Saved");
  await expect(reddit.locator("xpath=../..").getByRole("status")).toHaveCount(0);
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
