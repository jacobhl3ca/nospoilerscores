import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// News "ESPN" layout (Jacob 10/8): ESPN Videos left, ESPN Top Headlines
// right, the scores-board leagues' subreddits below. "Big" = one wide column
// of large clips that play muted while on screen.
// Every news feed is mocked; the clips are a real WebM recorded at test time
// (no codec the test browser lacks, no network), as in
// modal-keys-news-native-video.spec.ts.

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
  thirdLeague: "nhl",
  fourthLeague: "empty",
  fifthLeague: "empty",
  showTextPosts: true,
};

const LOAD = { timeout: 30_000 };
const SEEN_KEY = "hs.newsSeen.v1";

let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(2500);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

const NOW = Date.now();
// Headline-only items (text posts) for every feed but espn-videos, whose items
// all carry a clip.
function itemsFor(name: string) {
  const n = name === "espn-videos" ? 10 : 6;
  return Array.from({ length: n }, (_, i) => ({
    id: `${name}-${i}`,
    headline: `${name} post ${i + 1}`,
    description: "",
    published: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    articleUrl: `https://example.com/${name}/${i}`,
    byline: "",
    section: name.startsWith("reddit-") ? `r/${name.slice(7)}` : "ESPN",
    ...(name === "espn-videos" ? { playbackUrl: `https://clips.example.test/${i}.webm` } : {}),
  }));
}

async function mockFeeds(page: Page) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items: itemsFor(name) }) });
  });
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
}

// Seed prefs ONCE per tab, so a reload keeps what the UI wrote.
async function gotoNews(page: Page, extra: Record<string, unknown> = {}, seen: string[] = []) {
  await mockFeeds(page);
  await page.addInitScript(({ prefs, seenKey, seenKeys }) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
    if (seenKeys.length) localStorage.setItem(seenKey, JSON.stringify(Object.fromEntries(seenKeys.map((k) => [k, Date.now()]))));
  }, { prefs: { ...BASE_PREFS, ...extra }, seenKey: SEEN_KEY, seenKeys: seen });
  await page.goto("/");
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const pill = (page: Page, name: string) => page.locator(".news-toolbar-sticky").getByRole("button", { name, exact: true });
const layout = (page: Page) => page.getByTestId("news-espn-layout");
const headersIn = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".news-source-sticky-top").allInnerTexts()
    .then((all) => all.map((t) => t.trim().toUpperCase()));

test("pill offers Cards / Feed / ESPN; ESPN = Videos + Headlines on top, one Reddit column per league", async ({ page }) => {
  await gotoNews(page);
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(pill(page, "Feed")).toBeVisible();
  await pill(page, "ESPN").click();
  await expect(pill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
  await expect(layout(page)).toBeVisible();

  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["ESPN VIDEOS", "ESPN TOP HEADLINES"]);
  // Two wide columns side by side.
  const cols = page.getByTestId("news-espn-row1").locator(":scope > div");
  await expect(cols).toHaveCount(2);
  const [a, b] = await Promise.all([cols.nth(0).boundingBox(), cols.nth(1).boundingBox()]);
  expect(a!.width).toBeGreaterThan(400);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);

  await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toEqual(["R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  const p = await saved(page);
  expect(p.newsLayout).toBe("espn");
  expect(p.newsFeedView).toBe(false);
});

test("Hide seen, Headlines, Media and Videos only all act on the ESPN layout", async ({ page }) => {
  const seenUrl = "https://example.com/espn-top/5";
  await gotoNews(page, { newsLayout: "espn" }, [seenUrl]);
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["ESPN VIDEOS", "ESPN TOP HEADLINES"]);
  const seenRow = page.locator(`[data-news-key="${seenUrl}"]`);
  await expect(seenRow).toHaveCount(1);

  // 👁 Hide seen drops the seen post.
  await page.getByTestId("news-hide-seen").click();
  await expect(seenRow).toHaveCount(0);
  await page.getByTestId("news-hide-seen").click();
  await expect(seenRow).toHaveCount(1);

  // Headlines + Media reveal toggles flip the page-wide classes.
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/reveal-news-titles/);
  await page.getByRole("button", { name: "Toggle headline reveal" }).click();
  await expect(html).toHaveClass(/reveal-news-titles/);
  await expect(html).toHaveClass(/blur-news-media/);
  await page.getByRole("button", { name: "Toggle media reveal" }).click();
  await expect(html).not.toHaveClass(/blur-news-media/);

  // Videos only: headline-only posts go, the clips stay.
  await page.getByRole("button", { name: "Toggle videos-only filter" }).click();
  await expect(page.getByText("espn-top post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("reddit-mlb post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("espn-videos post 1", { exact: true })).toHaveCount(1);
});

test("reload keeps the ESPN layout", async ({ page }) => {
  await gotoNews(page);
  await pill(page, "ESPN").click();
  await expect(layout(page)).toBeVisible(LOAD);
  await page.reload();
  await expect(layout(page)).toBeVisible(LOAD);
  await expect(pill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
});

test("390px phone: one column, Videos → Headlines → each sub", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-layout"), LOAD)
    // Phones drop the "ESPN " prefix from source headers (stripLeaguePrefixForMobile).
    .toEqual(["VIDEOS", "TOP HEADLINES", "R/BASEBALL", "R/NFL", "R/HOCKEY"]);
});

test("an old blob with only newsFeedView: true still opens Feed", async ({ page }) => {
  await gotoNews(page, { newsFeedView: true });
  await expect(pill(page, "Feed")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(layout(page)).toHaveCount(0);
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
});

// ── Phase 2: Big ─────────────────────────────────────────────────────────
const playing = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll<HTMLVideoElement>("[data-inline-video] video"))
    .map((v, i) => (!v.paused ? i : -1)).filter((i) => i >= 0));

test("Big: a clip starts muted on screen, pauses off screen, only one plays", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.first()).toBeVisible(LOAD);
  // First 8 autoplay, the rest are stills.
  await expect(cards).toHaveCount(8);
  await expect(page.locator('[data-inline-video="still"]')).toHaveCount(2);

  await cards.nth(2).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 0));
  await expect.poll(() => playing(page), { timeout: 1500 }).toEqual([2]);
  expect(await page.locator("[data-inline-video] video").nth(2).evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);

  // Scroll the next one fully in: it takes over, the old one pauses.
  await cards.nth(4).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 1500 }).toEqual([4]);

  // Scroll away from every clip: nothing plays.
  await page.getByTestId("news-espn-reddit").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect.poll(() => playing(page), { timeout: 1500 }).toEqual([]);
});

test("Big: reduced motion turns autoplay off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoNews(page, { newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.first()).toBeVisible(LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1500);
  expect(await playing(page)).toEqual([]);
});
