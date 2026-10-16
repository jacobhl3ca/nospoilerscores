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
// Blurred clips do not play (r6), so every spec that expects play shows Media.
const PLAY = { revealNewsMedia: true };
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
    // espn-videos items carry "ESPN Video", as the live feed does (10/10).
    section: name.startsWith("reddit-") ? `r/${name.slice(7)}` : name === "espn-videos" ? "ESPN Video" : "ESPN",
    // Every *-videos item is a clip; in a subreddit every 2nd post is one
    // (post 2, 4, 6), like a v.redd.it clip in a mostly-text feed.
    ...(name.endsWith("-videos") || (name.startsWith("reddit-") && i % 2 === 1)
      ? { playbackUrl: `https://clips.example.test/${name}-${i}.webm` } : {}),
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
// Next to the ESPN mark a header drops the word "ESPN" at every width (Jacob
// 10/10) and "Top" too (Jacob 10/13), so the ESPN cards read "Videos" and
// "Headlines".
const headersIn = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".news-source-sticky-top").allInnerTexts()
    .then((all) => all.map((t) => t.trim().toUpperCase()));
// One card's header bar, by its source label (the aria name keeps "ESPN").
const cardHeader = (page: Page, label: string) =>
  page.locator(".news-source-sticky-top").filter({ has: page.getByRole("button", { name: `Toggle media reveal: ${label}`, exact: true }) }).first();
// A subreddit card's own Posts switch (3 icons, Jacob 10/10).
const cardSwitch = (page: Page, label: string) => cardHeader(page, label).getByTestId("post-filter-switch");
const cardSegs = (page: Page, label: string) => cardSwitch(page, label).getByRole("button")
  .evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));

test("pill offers ESPN / Cards / Feed; ESPN = Videos + Headlines on top, one Reddit column per league", async ({ page }) => {
  await gotoNews(page);
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(pill(page, "Feed")).toBeVisible();
  // ESPN is the first pill (Jacob 10/10).
  await expect(toolbar(page).getByRole("button").nth(0)).toHaveText("ESPN");
  await expect(toolbar(page).getByRole("button").nth(1)).toHaveText("Cards");
  await expect(toolbar(page).getByRole("button").nth(2)).toHaveText("Feed");
  await pill(page, "ESPN").click();
  await expect(pill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
  await expect(layout(page)).toBeVisible();

  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["VIDEOS", "HEADLINES"]);
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

test("Hide seen, Headlines, Media and Posts all act on the ESPN layout", async ({ page }) => {
  const seenUrl = "https://example.com/espn-top/5";
  await gotoNews(page, { newsLayout: "espn" }, [seenUrl]);
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["VIDEOS", "HEADLINES"]);
  const seenRow = page.locator(`[data-news-key="${seenUrl}"]`);
  await expect(seenRow).toHaveCount(1);

  // 👁 Hide seen drops the seen post.
  await page.getByTestId("news-hide-seen").click();
  await expect(seenRow).toHaveCount(0);
  await page.getByTestId("news-hide-seen").click();
  await expect(seenRow).toHaveCount(1);

  // Posts (a subreddit card's own 3-icon switch, Jacob 10/10): on Videos
  // that card's headline-only posts go, its clips stay, the other cards keep
  // theirs.
  expect(await cardSegs(page, "r/baseball")).toEqual(["true", "false", "false"]);
  await cardSwitch(page, "r/baseball").getByRole("button", { name: "Posts: Videos" }).click();
  expect(await cardSegs(page, "r/baseball")).toEqual(["false", "false", "true"]);
  expect(await cardSegs(page, "r/nfl")).toEqual(["true", "false", "false"]);
  await expect(page.getByText("reddit-mlb post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("reddit-mlb post 2", { exact: true })).toHaveCount(1);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toHaveCount(1);
  await expect(page.getByText("espn-top post 1", { exact: true })).toHaveCount(1);
  expect((await saved(page)).newsCardPrefs?.["reddit-mlb"]?.videosOnly).toBe(true);
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
    .toEqual(["VIDEOS", "HEADLINES", "R/BASEBALL", "R/NFL", "R/HOCKEY"]);
});

test("an old blob with only newsFeedView: true still opens Feed", async ({ page }) => {
  await gotoNews(page, { newsFeedView: true });
  await expect(pill(page, "Feed")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(layout(page)).toHaveCount(0);
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
});

// ── Phase 2: Big ─────────────────────────────────────────────────────────
// Indexes of the ESPN clip cards whose video is playing.
const playing = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-inline-video]"))
    .map((card, i) => { const v = card.querySelector("video"); return v && !v.paused ? i : -1; })
    .filter((i) => i >= 0));
// data-news-key of every post/card whose autoplay video is playing, page-wide.
const playingKeys = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-autoplay-video]"))
    .filter((v) => !v.paused)
    .map((v) => v.closest("[data-news-key]")?.getAttribute("data-news-key") ?? "?"));
// Distance of the playing video's center from the viewport center.
const playingOffCenter = (page: Page) => page.evaluate(() => {
  const v = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-autoplay-video]")).find((x) => !x.paused);
  if (!v) return Infinity;
  const r = v.getBoundingClientRect();
  return Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
});

test("Big: a clip starts muted on screen, pauses off screen, only one plays", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.first()).toBeVisible(LOAD);
  // Every clip can autoplay; only the one in focus does.
  await expect(cards).toHaveCount(10);

  await cards.nth(2).evaluate((el) => el.scrollIntoView({ block: "center" }));
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
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.first()).toBeVisible(LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1500);
  expect(await playing(page)).toEqual([]);
});

// ── Round 2 (Jacob 10/8, after the first staging look) ──────────────────
const autoplayChip = (page: Page) => page.getByRole("button", { name: "Toggle news autoplay" });

test("Autoplay pill: off in 2 columns, on plays clips there, persists", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false", LOAD);
  await expect(page.locator('[data-inline-video="auto"]')).toHaveCount(0);
  await autoplayChip(page).click();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true");
  expect((await saved(page)).newsAutoplay).toBe(true);
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards).toHaveCount(10, LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  // 2-column clips are short, so a neighbour can be >= 60% visible too: the
  // rule is exactly one playing, near the centred card.
  await expect.poll(async () => {
    const p = await playing(page);
    return p.length === 1 && p[0] <= 2;
  }, { timeout: 1500 }).toBe(true);
  await page.reload();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true", LOAD);
});

test("Autoplay pill off in Big: big stills, nothing plays", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true, newsAutoplay: false });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false", LOAD);
  const stills = page.locator('[data-inline-video="still"]');
  await expect(stills).toHaveCount(10, LOAD);
  await stills.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1200);
  expect(await playing(page)).toEqual([]);
});

test("no column titles; headline rows hug their text; clips sit inside the card outline", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["VIDEOS", "HEADLINES"]);
  await expect(page.getByRole("heading", { name: "ESPN Videos", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Top Headlines", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "MLB", exact: true })).toHaveCount(0);

  // A one-line headline row is far under the 7rem (112px) Cards floor.
  const row = page.locator('[data-news-key="https://example.com/espn-top/0"]');
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeLessThan(80);

  // The clip button is inset from the card's edges, so the 1px outline shows.
  const clip = page.locator('[data-news-key="https://example.com/espn-videos/0"]');
  const card = clip.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const [c, k] = await Promise.all([clip.boundingBox(), card.boundingBox()]);
  expect(c!.x).toBeGreaterThanOrEqual(k!.x + 1);
  expect(c!.x + c!.width).toBeLessThanOrEqual(k!.x + k!.width - 1);
});

test("Big at 1280x800: the first clip starts within 200px of the toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoNews(page, { newsLayout: "espn", newsEspnBig: true });
  const first = page.locator("[data-inline-video]").first();
  await expect(first).toBeVisible(LOAD);
  const toolbar = await page.locator(".news-toolbar-sticky").boundingBox();
  const clip = await first.boundingBox();
  expect(clip!.y - (toolbar!.y + toolbar!.height)).toBeLessThan(200);
  // The first clip and its headline fit in the viewport.
  expect(clip!.y + clip!.height).toBeLessThanOrEqual(800);
});

// ── Round 3 (Jacob 8:41 PM): Autoplay in every layout ───────────────────
test("Feed: Autoplay off = no video layer; on, exactly one video post plays and scrolling moves play on", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true, newsAutoplay: false });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false", LOAD);
  const videoPosts = page.locator("article[data-news-key]:has(video[data-autoplay-video])");
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
  await expect(videoPosts).toHaveCount(0);

  await autoplayChip(page).click();
  await expect(videoPosts.nth(3)).toBeAttached(LOAD);
  await videoPosts.nth(1).evaluate((el) => el.querySelector("video")!.scrollIntoView({ block: "center" }));
  const first = await videoPosts.nth(1).getAttribute("data-news-key");
  await expect.poll(() => playingKeys(page), { timeout: 2000 }).toEqual([first]);
  expect(await playingOffCenter(page)).toBeLessThan(100);

  await videoPosts.nth(3).evaluate((el) => el.querySelector("video")!.scrollIntoView({ block: "center" }));
  const next = await videoPosts.nth(3).getAttribute("data-news-key");
  await expect.poll(() => playingKeys(page), { timeout: 2000 }).toEqual([next]);
});

test("Cards: Autoplay off = no video layer; on, exactly one clip plays and scrolling moves play on", async ({ page }) => {
  // Videos + Reddit in the funnel, so the league columns carry their video cards.
  await gotoNews(page, { ...PLAY, newsTypeFilters: ["reddit", "topvideos"], newsAutoplay: false });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false", LOAD);
  await expect(page.locator('button[aria-label="Play highlight"]').first()).toBeVisible(LOAD);
  await expect(page.locator("video[data-autoplay-video]")).toHaveCount(0);

  await autoplayChip(page).click();
  const clips = page.locator("video[data-autoplay-video]");
  await expect(clips.nth(4)).toBeAttached(LOAD);
  await clips.nth(1).scrollIntoViewIfNeeded();
  await clips.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  const before = (await playingKeys(page))[0];
  expect(await playingOffCenter(page)).toBeLessThan(100);

  await clips.last().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(async () => {
    const keys = await playingKeys(page);
    return keys.length === 1 && keys[0] !== before;
  }, { timeout: 2000 }).toBe(true);
  expect(await playingOffCenter(page)).toBeLessThan(100);
});

// r6: blurred clips do not play (Jacob 10/9 "doesnt autoplay if blurred out media").
test("Big, Media blurred: the centered clip does not play or load; Media on plays it", async ({ page }) => {
  const clipRequests: string[] = [];
  page.on("request", (r) => { if (r.url().startsWith("https://clips.example.test/")) clipRequests.push(r.url()); });
  await gotoNews(page, { newsLayout: "espn", newsEspnBig: true });
  await expect(page.locator("html")).toHaveClass(/blur-news-media/, LOAD);
  await page.locator("[data-inline-video]").nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(2000);
  expect(await playing(page)).toEqual([]);
  expect(clipRequests).toEqual([]);
  await page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" }).click();
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([1]);
});

test("Feed: global Media off = nothing plays; Media on = exactly one", async ({ page }) => {
  await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
  const videoPosts = page.locator("article[data-news-key]:has(video[data-autoplay-video])");
  await expect(videoPosts.nth(1)).toBeAttached(LOAD);
  await videoPosts.nth(1).evaluate((el) => el.querySelector("video")!.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(1500);
  expect(await playingKeys(page)).toEqual([]);
  await page.evaluate(() => window.scrollBy(0, -10)); // bring the toolbar back
  await pill(page, "Toggle media reveal").click();
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
});

// Subreddit cards in the ESPN layout show text rows, not clip cards, so the
// per-card rule is proven on ESPN Videos: its own Media off beats a global on.
test("ESPN 2 columns: global Media on, ESPN Videos card Media off = nothing plays; card Media on = one plays", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsCardPrefs: { "espn-videos": { revealMedia: false } } });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards).toHaveCount(10, LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(2000);
  expect(await playing(page)).toEqual([]);
  await page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" }).click();
  await expect.poll(async () => (await playing(page)).length, { timeout: 2000 }).toBe(1);
});

// ── Round 4 (Jacob 9:44 PM) ─────────────────────────────────────────────
const toolbar = (page: Page) => page.locator(".news-toolbar-sticky");
const chips = (page: Page) => toolbar(page).locator("button.news-chip");
const postSwitch = (page: Page) => toolbar(page).getByTestId("post-filter-switch");
// Toolbar bottom edge vs the app header's bottom edge (hidden = tucked under it).
const toolbarShown = (page: Page) => page.evaluate(() => {
  const t = document.querySelector(".news-toolbar-sticky")!.getBoundingClientRect();
  const h = document.querySelector("header")!.getBoundingClientRect();
  return t.bottom > h.bottom + 4;
});
const chrome = (page: Page) => page.evaluate(() => ({
  headerH: getComputedStyle(document.querySelector<HTMLElement>("[style*='--header-h']") ?? document.documentElement).getPropertyValue("--header-h"),
  spacer: document.querySelector(".header-flow-spacer")?.getBoundingClientRect().height,
}));

test("Autoplay is on by default in every layout; a saved off still wins", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(page.locator("video[data-autoplay-video]").first()).toBeAttached(LOAD);
  await pill(page, "Cards").click();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true");
  await pill(page, "ESPN").click();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true");
  await autoplayChip(page).click();
  await page.reload();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false", LOAD);
});

test("575px: the pill row is one row of icon-only pills, names kept; 1280px shows labels", async ({ page }) => {
  await page.setViewportSize({ width: 575, height: 900 });
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true });
  await expect(chips(page)).toHaveCount(4, LOAD);
  const ys = await chips(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  // The Posts switch sits on the same row, icon-only with names kept.
  const sw = (await postSwitch(page).boundingBox())!;
  expect(Math.abs(sw.y + sw.height / 2 - (ys[0] + 16))).toBeLessThan(12);
  await expect(postSwitch(page).getByRole("button", { name: "Posts: No text" })).toBeVisible();
  const seg = await pill(page, "Cards").boundingBox();
  expect(Math.abs(seg!.y + seg!.height / 2 - (ys[0] + 16))).toBeLessThan(12);
  await expect(toolbar(page).getByText("Autoplay", { exact: true })).toBeHidden();
  await expect(autoplayChip(page)).toHaveAttribute("title", /Play the video in focus/);
  expect((await toolbar(page).boundingBox())!.height).toBeLessThan(64);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toolbar(page).getByText("Autoplay", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 575, height: 900 });
  await expect(toolbar(page).getByText("Autoplay", { exact: true })).toBeHidden();
});

test("360px: still one row; the row scrolls sideways when icons do not fit", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
  await expect(chips(page)).toHaveCount(4, LOAD);
  const ys = await chips(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  const sc = await page.locator(".news-toolbar-scroll").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }));
  expect(sc.ox).toBe("auto");
  expect(sc.sw).toBeGreaterThan(sc.cw);
  // The last control (the Posts switch) can be scrolled to.
  await postSwitch(page).scrollIntoViewIfNeeded();
  await expect(postSwitch(page)).toBeInViewport();
});

for (const reduced of [false, true]) {
  test(`toolbar hides on scroll down, returns on scroll up and at the top${reduced ? " (reduced motion: no slide)" : ""}`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 575, height: 900 });
    await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
    await expect(page.locator("article[data-news-key]").nth(5)).toBeAttached(LOAD);
    const before = await chrome(page);
    expect(await toolbarShown(page)).toBe(true);
    expect(await toolbar(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(reduced ? "0s" : "0.2s");

    await page.mouse.move(280, 600);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => toolbarShown(page)).toBe(false);
    // The sticky source headers pin straight under the header while it is hidden.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("[style*='--news-toolbar-pin']") ?? document.body).getPropertyValue("--news-toolbar-pin").trim())).toBe("0px");
    expect(await chrome(page)).toEqual(before);

    await page.mouse.wheel(0, -40);
    await expect.poll(() => toolbarShown(page)).toBe(true);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => toolbarShown(page)).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => toolbarShown(page)).toBe(true);
    expect(await chrome(page)).toEqual(before);
  });
}

// The browser refuses muted autoplay (Jacob 10/9): every clip says "Tap to
// play" on itself, and a one-time popup sits over the refused clip.
const BLOCK_PLAY = () => {
  HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); };
};
const popup = (page: Page) => page.getByTestId("autoplay-blocked-popup");

test("browser blocks autoplay: Tap to play on the clips, a one-time popup over the clip", async ({ page }) => {
  await page.addInitScript(BLOCK_PLAY);
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  await expect(popup(page)).toBeVisible(LOAD);
  await expect(popup(page)).toContainText("Your browser blocks autoplay");
  await expect(popup(page)).toContainText("Tap a clip to play it with sound.");
  // The note under the toolbar is gone.
  await expect(page.getByTestId("autoplay-blocked-note")).toHaveCount(0);
  // Every clip says it, on the clip; nothing plays.
  await expect(page.locator("[data-inline-video] [data-tap-to-play]")).toHaveCount(10);
  await expect(page.locator("[data-inline-video] [data-tap-to-play]").first()).toHaveText("Tap to play");
  expect(await playing(page)).toEqual([]);
  // The popup sits over the refused clip.
  const box = await popup(page).boundingBox();
  const clip = await page.locator("[data-inline-video] .news-media-preview").first().boundingBox();
  const mid = box!.x + box!.width / 2;
  expect(Math.abs(mid - (clip!.x + clip!.width / 2))).toBeLessThan(2);
  expect(box!.y).toBeGreaterThanOrEqual(clip!.y - 1);

  await popup(page).getByRole("button", { name: "Got it" }).click();
  await expect(popup(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-inline-video] [data-tap-to-play]").first()).toBeVisible(LOAD);
  await page.waitForTimeout(1500);
  await expect(popup(page)).toHaveCount(0);
});

test("browser blocks autoplay in Feed: Tap to play on the video post", async ({ page }) => {
  await page.addInitScript(BLOCK_PLAY);
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true });
  const videoPost = page.locator("article[data-news-key]:has(video[data-autoplay-video])").nth(1);
  await expect(videoPost).toBeAttached(LOAD);
  await videoPost.evaluate((el) => el.querySelector("video")!.scrollIntoView({ block: "center" }));
  await expect(popup(page)).toBeVisible(LOAD);
  await expect(videoPost.locator("[data-tap-to-play]")).toBeVisible();
});

test("blocked-autoplay popup: Turn Autoplay off saves the pref and clears Tap to play", async ({ page }) => {
  await page.addInitScript(BLOCK_PLAY);
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  await popup(page).getByRole("button", { name: "Turn Autoplay off" }).click(LOAD);
  await expect(popup(page)).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).newsAutoplay).toBe(false);
  await expect(page.locator("[data-tap-to-play]")).toHaveCount(0);
  expect(await autoplayChip(page).locator("svg line[data-slash]").count()).toBe(1);
});

test("a clip that plays clears Tap to play everywhere", async ({ page }) => {
  // The first play() is refused, every later one plays.
  await page.addInitScript(() => {
    const real = HTMLMediaElement.prototype.play;
    let refused = false;
    HTMLMediaElement.prototype.play = function () {
      if (!refused) { refused = true; return Promise.reject(new DOMException("blocked", "NotAllowedError")); }
      return real.call(this);
    };
  });
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  await expect(page.locator("[data-tap-to-play]").first()).toBeVisible(LOAD);
  await popup(page).getByRole("button", { name: "Got it" }).click();
  await page.locator('[data-inline-video="auto"]').nth(2).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([2]);
  await expect(page.locator("[data-tap-to-play]")).toHaveCount(0);
});

test("switch Feed → ESPN with Autoplay on: the first in-view clip plays without a scroll", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true, newsAutoplay: true });
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
  await pill(page, "ESPN").click();
  await expect(page.locator('[data-inline-video="auto"]').first()).toBeVisible(LOAD);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
});

test("switch Cards → Feed with Autoplay on: the first in-view video plays without a scroll", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsAutoplay: true, newsTypeFilters: ["reddit", "topvideos"] });
  await expect(page.locator('button[aria-label="Play highlight"]').first()).toBeVisible(LOAD);
  await pill(page, "Feed").click();
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
});

test("a layout or Big switch from a scrolled page goes to the top and plays the first clip", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true });
  await expect(page.locator("article[data-news-key]").nth(5)).toBeAttached(LOAD);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => window.scrollBy(0, -10)); // bring the toolbar back
  await pill(page, "ESPN").click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // Small clips: several are in view, the one nearest the center plays.
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  expect(await playingOffCenter(page)).toBeLessThan(450);

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.evaluate(() => window.scrollBy(0, -10));
  await page.getByRole("button", { name: "Toggle big ESPN videos" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(async () => (await playingKeys(page))[0], { timeout: 2000 }).toBe("https://example.com/espn-videos/0");
});

// ── Round 5 (Jacob 11:20 PM): ESPN option buttons in each card's header ────
// The chips on screen (a narrowCol sub also holds the cycling Posts chip,
// hidden from the xl breakpoint up, where the 3-icon switch shows).
const headerButtons = (page: Page, label: string) =>
  cardHeader(page, label).locator("[data-card-chip]")
    .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => (e.getAttribute("aria-label") ?? "").replace(/:.*$/, "")));

test("ESPN: the toolbar keeps only the layout switch and Show all; each card header has exactly its buttons", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["VIDEOS", "HEADLINES"]);
  await expect(toolbar(page).getByRole("button")).toHaveText(["ESPN", "Cards", "Feed", "Show all"]);
  // r6 order: Autoplay first, Media before Headlines.
  expect(await headerButtons(page, "ESPN Videos")).toEqual(["Toggle news autoplay", "Toggle big ESPN videos", "Toggle media reveal", "Toggle headline reveal"]);
  expect(await headerButtons(page, "ESPN Top Headlines")).toEqual(["Toggle media reveal", "Toggle headline reveal"]);
  // Each sub: Media, Headlines, then the Posts switch with all 3 choices in
  // view (Jacob 10/10; it was one cycling chip).
  for (const sub of ["r/baseball", "r/nfl", "r/hockey"]) {
    expect(await headerButtons(page, sub)).toEqual(["Toggle media reveal", "Toggle headline reveal"]);
    await expect(cardSwitch(page, sub)).toHaveAttribute("aria-label", `Post filter: ${sub}`);
    expect(await cardSwitch(page, sub).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))))
      .toEqual(["Posts: All", "Posts: No text", "Posts: Videos"]);
    // The switch is the last control, and no taller than the 28px chips.
    const [chip, sw] = await Promise.all([
      page.getByRole("button", { name: `Toggle headline reveal: ${sub}`, exact: true }).boundingBox(),
      cardSwitch(page, sub).boundingBox(),
    ]);
    expect(sw!.x).toBeGreaterThan(chip!.x + chip!.width);
    expect(sw!.height).toBeLessThanOrEqual(28);
  }
  // 1280px: no cycling Posts chip on screen.
  await expect(page.getByRole("button", { name: /^Post filter:/ })).toHaveCount(0);
  // Every header button keeps a title and an aria-label.
  for (const b of await page.locator("[data-card-chip], [data-testid=card-header-controls] [data-post-filter]").all()) {
    expect(await b.getAttribute("title")).toBeTruthy();
    expect(await b.getAttribute("aria-label")).toBeTruthy();
  }
  // Big: the one video card carries the same 4.
  await page.getByRole("button", { name: "Toggle big ESPN videos" }).click();
  await expect(page.locator('[data-inline-video]').first()).toBeVisible(LOAD);
  expect(await headerButtons(page, "ESPN Videos")).toEqual(["Toggle news autoplay", "Toggle big ESPN videos", "Toggle media reveal", "Toggle headline reveal"]);
  await expect(page.getByRole("button", { name: "Toggle big ESPN videos" })).toHaveAttribute("aria-pressed", "true");
});

test("ESPN: Headlines on the ESPN Videos card reveals that card only", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  const blur = (key: string) => page.locator(`[data-news-key="${key}"] .news-title`).first().evaluate((el) => getComputedStyle(el).filter);
  const vid = "https://example.com/espn-videos/0", top = "https://example.com/espn-top/0", rd = "https://example.com/reddit-mlb/0";
  await expect(page.locator(`[data-news-key="${rd}"]`)).toHaveCount(1, LOAD);
  expect(await blur(vid)).toContain("blur");
  await page.getByRole("button", { name: "Toggle headline reveal: ESPN Videos" }).click();
  await expect.poll(() => blur(vid)).toBe("none");
  expect(await blur(top)).toContain("blur");
  expect(await blur(rd)).toContain("blur");
  // Media on ESPN Videos unblurs that card's previews only (global stays blurred).
  const media = (key: string) => page.locator(`[data-news-key="${key}"] .news-media-preview > *`).first().evaluate((el) => getComputedStyle(el).filter);
  expect(await media(vid)).toContain("blur");
  await page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" }).click();
  await expect.poll(() => media(vid)).toBe("none");
  await expect(page.locator("html")).toHaveClass(/blur-news-media/);
  expect((await saved(page)).newsCardPrefs?.["espn-videos"]?.revealTitles).toBe(true);
  expect((await saved(page)).revealNewsTitles).toBeFalsy();
});

test("Cards and Feed keep the full toolbar", async ({ page }) => {
  await gotoNews(page);
  await expect(chips(page)).toHaveCount(4, LOAD);
  await expect(postSwitch(page)).toHaveCount(1);
  // Cards view cards carry their own buttons too (10/10); Feed has no cards.
  await expect(page.locator("[data-card-chip]").first()).toBeVisible(LOAD);
  await pill(page, "Feed").click();
  await expect(chips(page)).toHaveCount(4);
  await expect(postSwitch(page)).toHaveCount(1);
  await expect(page.locator("[data-card-chip]")).toHaveCount(0);
});

test("360px phone: header buttons fit, the label gives way", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-layout"), LOAD).toContain("R/BASEBALL");
  const fit = await page.locator(".news-source-sticky-top").evaluateAll((hs) => hs.map((h) => {
    const bar = h.firstElementChild!.getBoundingClientRect();
    const sw = h.querySelector("[data-testid=post-filter-switch]")?.getBoundingClientRect();
    return (!sw || sw.right <= bar.right + 0.5) && Array.from(h.querySelectorAll("[data-card-chip]")).every((c) => {
      const r = c.getBoundingClientRect();
      return r.right <= bar.right + 0.5 && r.width >= 27;
    });
  }));
  expect(fit.every(Boolean)).toBe(true);
  // Each sub keeps its whole label beside Media, Headlines and the switch.
  await expect(page.getByTestId("news-espn-reddit").getByTestId("post-filter-switch")).toHaveCount(4);
  const cut = await page.getByTestId("news-espn-reddit").locator(".news-source-sticky-top span.truncate")
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.scrollWidth - e.clientWidth));
  expect(cut).toEqual([0, 0, 0]);
});

// ── Round 6 (Jacob 7:26 AM 10/9): icon order, Autoplay off icon, dim under blur ──
test("Cards/Feed toolbar order: Show all, Autoplay, Media, Headlines, Posts", async ({ page }) => {
  await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
  await expect(chips(page)).toHaveCount(4, LOAD);
  expect(await toolbar(page).locator("button.news-chip, [data-testid=post-filter-switch]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual([
    "Show or hide everything in every card", "Toggle news autoplay", "Toggle media reveal", "Toggle headline reveal", "Post filter",
  ]);
  await expect(postSwitch(page).getByRole("button")).toHaveText(["All", "No text", "Videos"]);
});

const slashed = (page: Page) => autoplayChip(page).locator("svg line[data-slash]").count();

test("Autoplay chip: slash when off; dimmed while Media is blurred, plain after Media on", async ({ page }) => {
  await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true", LOAD);
  expect(await slashed(page)).toBe(0);
  await expect(autoplayChip(page)).toHaveAttribute("aria-disabled", "true");
  await expect(autoplayChip(page)).toHaveAttribute("title", /Paused while Media is blurred/);
  await pill(page, "Toggle media reveal").click();
  await expect(autoplayChip(page)).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(autoplayChip(page)).toHaveAttribute("title", /Play the video in focus/);
  await autoplayChip(page).click();
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "false");
  expect(await slashed(page)).toBe(1);
  await autoplayChip(page).click();
  expect(await slashed(page)).toBe(0);
});

test("ESPN Videos header: Autoplay dims on that card's Media, not the global one; slash when off", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  await expect(autoplayChip(page)).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(autoplayChip(page)).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" }).click();
  await expect(autoplayChip(page)).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(page.locator("html")).toHaveClass(/blur-news-media/);
  await autoplayChip(page).click();
  expect(await slashed(page)).toBe(1);
  await expect(autoplayChip(page)).not.toHaveAttribute("aria-disabled", /.*/);
});

// ── Reddit bar + Posts switch (Jacob 10/9) ─────────────────────────────────
const bar = (page: Page) => page.getByTestId("news-reddit-bar");
const barSwitch = (page: Page) => bar(page).getByTestId("post-filter-switch");
const segPressed = (page: Page) => barSwitch(page).getByRole("button")
  .evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
// Every card's per-card class, e.g. "on" for news-card-media-on.
const cardStates = (page: Page, kind: string) => page.locator(`[class*="news-card-${kind}-"]`)
  .evaluateAll((els, k) => els.map((e) => (e.className.match(new RegExp(`news-card-${k}-(on|off)`)) ?? [])[1]), kind);
// Text-post rows in the Reddit section that are showing.
const shownTextPosts = (page: Page) => page.getByTestId("news-espn-reddit").locator(".news-textpost")
  .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);

test("1280: the Reddit bar pins under the header + toolbar; each sub header pins under the bar", async ({ page }) => {
  // Short window: the mocked subs are short, and the page must scroll past
  // the bar's pin point.
  await page.setViewportSize({ width: 1280, height: 420 });
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toEqual(["R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  await expect(bar(page).getByRole("heading", { name: "Your leagues on Reddit" })).toBeVisible();
  for (const name of ["Toggle media reveal: every card", "Toggle headline reveal: every card"]) {
    await expect(bar(page).getByRole("button", { name })).toBeVisible();
  }
  await expect(barSwitch(page).getByRole("button")).toHaveText(["All", "No text", "Videos"]);

  const sectionTop = await page.getByTestId("news-espn-reddit").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  for (const y of [sectionTop + 120, sectionTop + 60]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const r = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      const b = r("[data-testid=news-reddit-bar]");
      const subs = Array.from(document.querySelectorAll("[data-testid=news-espn-reddit] .news-source-sticky-top")).map((h) => h.getBoundingClientRect().top);
      return { barTop: b.top, barBottom: b.bottom, pinAt: Math.max(r("header").bottom, r(".news-toolbar-sticky").bottom), subs };
    });
    expect(Math.abs(m.barTop - m.pinAt)).toBeLessThanOrEqual(2);
    for (const t of m.subs) expect(t).toBeGreaterThanOrEqual(m.barBottom - 1);
  }
});

test("Reddit bar Media / Headlines set every card and clear the per-card values", async ({ page }) => {
  await gotoNews(page, {
    newsLayout: "espn",
    revealNewsMedia: true,
    newsCardPrefs: { "espn-videos": { revealMedia: false }, "reddit-mlb": { revealTitles: true } },
  });
  await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toEqual(["R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  const media = bar(page).getByRole("button", { name: "Toggle media reveal: every card" });
  const titles = bar(page).getByRole("button", { name: "Toggle headline reveal: every card" });
  // Mixed reads as off, so one tap turns every card on.
  await expect(media).toHaveAttribute("aria-pressed", "false");
  await expect(titles).toHaveAttribute("aria-pressed", "false");
  await media.click();
  await expect(media).toHaveAttribute("aria-pressed", "true");
  const m = await cardStates(page, "media");
  expect(m.length).toBeGreaterThanOrEqual(5);
  expect(m.every((v) => v === "on")).toBe(true);
  let p = await saved(page);
  expect(p.revealNewsMedia).toBe(true);
  expect(Object.values(p.newsCardPrefs ?? {}).some((c) => "revealMedia" in (c as object))).toBe(false);

  await titles.click();
  await expect(titles).toHaveAttribute("aria-pressed", "true");
  expect((await cardStates(page, "titles")).every((v) => v === "on")).toBe(true);
  p = await saved(page);
  expect(p.revealNewsTitles).toBe(true);
  expect(p.newsCardPrefs ?? {}).toEqual({});
  // A card's own button stays the exception.
  await page.getByRole("button", { name: "Toggle headline reveal: r/nfl" }).click();
  await expect(titles).toHaveAttribute("aria-pressed", "false");
});

test("Reddit bar Posts switch filters every sub; a sub's own switch filters that sub only", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toEqual(["R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  await expect.poll(() => shownTextPosts(page), LOAD).toBeGreaterThan(0);
  expect(await segPressed(page)).toEqual(["true", "false", "false"]);

  await barSwitch(page).getByRole("button", { name: "No text" }).click();
  expect(await segPressed(page)).toEqual(["false", "true", "false"]);
  await expect.poll(() => shownTextPosts(page)).toBe(0);
  await expect(page.getByText("reddit-mlb post 2", { exact: true })).toBeVisible();
  // ESPN Top Headlines is not a sub: its rows stay.
  await expect(page.getByText("espn-top post 1", { exact: true })).toBeVisible();

  await barSwitch(page).getByRole("button", { name: "Videos" }).click();
  expect(await segPressed(page)).toEqual(["false", "false", "true"]);
  for (const sub of ["mlb", "nfl", "nhl"]) {
    await expect(page.getByText(`reddit-${sub} post 1`, { exact: true })).toHaveCount(0);
    await expect(page.getByText(`reddit-${sub} post 2`, { exact: true })).toHaveCount(1);
  }
  let p = await saved(page);
  expect(p.newsVideosOnly).toBe(true);

  await barSwitch(page).getByRole("button", { name: "All" }).click();
  expect(await segPressed(page)).toEqual(["true", "false", "false"]);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeVisible();

  // r/nfl's own switch: No text on that sub only; the bar shows no segment.
  const nfl = cardSwitch(page, "r/nfl");
  expect(await cardSegs(page, "r/nfl")).toEqual(["true", "false", "false"]);
  await expect(nfl.getByRole("button", { name: "Posts: No text" })).toHaveAttribute("title", "Posts in r/nfl: No text");
  await nfl.getByRole("button", { name: "Posts: No text" }).click();
  expect(await cardSegs(page, "r/nfl")).toEqual(["false", "true", "false"]);
  expect(await nfl.getByRole("button", { name: "Posts: No text" }).locator("svg line[data-slash]").count()).toBe(1);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeHidden();
  await expect(page.getByText("reddit-mlb post 1", { exact: true })).toBeVisible();
  expect(await cardSegs(page, "r/baseball")).toEqual(["true", "false", "false"]);
  expect(await segPressed(page)).toEqual(["false", "false", "false"]);
  p = await saved(page);
  expect(p.newsCardPrefs?.["reddit-nfl"]).toEqual({ videosOnly: false, textPosts: false });
  await nfl.getByRole("button", { name: "Posts: Videos" }).click();
  expect(await cardSegs(page, "r/nfl")).toEqual(["false", "false", "true"]);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("reddit-nfl post 2", { exact: true })).toHaveCount(1);
  await nfl.getByRole("button", { name: "Posts: All" }).click();
  expect(await cardSegs(page, "r/nfl")).toEqual(["true", "false", "false"]);
  expect(await segPressed(page)).toEqual(["true", "false", "false"]);
});

for (const width of [575, 360]) {
  test(`${width}px: the Reddit bar sits over the first sub, one row, the label gives way`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoNews(page, { newsLayout: "espn" });
    await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toContain("R/BASEBALL");
    const m = await page.evaluate(() => {
      const b = document.querySelector("[data-testid=news-reddit-bar]")!;
      const br = b.getBoundingClientRect();
      const h2 = b.querySelector("h2")!;
      const first = document.querySelector("[data-testid=news-espn-reddit] .news-source-sticky-top")!.getBoundingClientRect();
      const ctrls = Array.from(b.querySelectorAll("button")).map((x) => x.getBoundingClientRect());
      return {
        h: br.height, barBottom: br.bottom, barLeft: br.left, barRight: br.right, firstTop: first.top,
        tops: [...new Set(ctrls.map((r) => Math.round(r.top + r.height / 2)))],
        inside: ctrls.every((r) => r.left >= br.left - 0.5 && r.right <= br.right + 0.5),
        label: { sw: h2.scrollWidth, cw: h2.clientWidth, w: h2.getBoundingClientRect().width },
      };
    });
    expect(m.h).toBeLessThanOrEqual(46);
    expect(m.firstTop).toBeGreaterThanOrEqual(m.barBottom - 1);
    // One row: every control centred on the same line, inside the bar.
    expect(Math.max(...m.tops) - Math.min(...m.tops)).toBeLessThanOrEqual(2);
    expect(m.inside).toBe(true);
    expect(m.label.w).toBeGreaterThan(20);
    if (width === 360) expect(m.label.sw).toBeGreaterThan(m.label.cw);
    // The ESPN cards sit above the bar.
    expect(await headersIn(page, "news-espn-layout")).toEqual(["VIDEOS", "HEADLINES", "R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  });
}

test("Cards toolbar Media tap clears a card's own Media: ESPN then follows the global value", async ({ page }) => {
  await gotoNews(page, { newsCardPrefs: { "espn-videos": { revealMedia: true, revealTitles: true } } });
  await expect(chips(page)).toHaveCount(4, LOAD);
  await pill(page, "Toggle media reveal").click();
  await pill(page, "Toggle media reveal").click();
  const p = await saved(page);
  expect(p.revealNewsMedia).toBe(false);
  expect(p.newsCardPrefs).toEqual({ "espn-videos": { revealTitles: true } });
  await pill(page, "ESPN").click();
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["VIDEOS", "HEADLINES"]);
  expect((await cardStates(page, "media")).every((v) => v === "off")).toBe(true);
  await expect(page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" })).toHaveAttribute("aria-pressed", "false");
});

// ── Jacob 10/9: gaps on the live ESPN tab ───────────────────────────────
test("ESPN 2 columns: Top Headlines rides beside the clips while you scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoNews(page, { newsLayout: "espn" });
  const pin = page.getByTestId("news-espn-headlines-pin");
  await expect(pin.locator(".news-source-sticky-top")).toBeVisible(LOAD);
  await expect(page.locator("[data-inline-video]")).toHaveCount(10, LOAD);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect.poll(async () => {
    const b = await pin.boundingBox();
    return b!.y >= 0 && b!.y < 200 && b!.y + b!.height <= 801;
  }).toBe(true);
});

test("ESPN 2 columns, short screen: Top Headlines scrolls to its end, then stays", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await gotoNews(page, { newsLayout: "espn" });
  const pin = page.getByTestId("news-espn-headlines-pin");
  await expect(pin.locator(".news-source-sticky-top")).toBeVisible(LOAD);
  await expect(page.locator("[data-inline-video]")).toHaveCount(10, LOAD);
  const height = (await pin.boundingBox())!.height;
  expect(height).toBeGreaterThan(300);
  await page.evaluate(() => window.scrollTo(0, 2000));
  // Its bottom edge sits 1rem above the screen bottom: every headline is reachable.
  await expect.poll(async () => { const b = await pin.boundingBox(); return Math.round(b!.y + b!.height); }).toBe(300 - 16);
});

test("390px phone at the page top: the first clip plays, not the one nearest the middle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoNews(page, { ...PLAY, newsLayout: "espn" });
  await expect(page.locator('[data-inline-video="auto"]').first()).toBeVisible(LOAD);
  await expect.poll(() => playing(page), { timeout: 3000 }).toEqual([0]);
  // Scrolled down, the clip nearest the middle plays again.
  await page.locator('[data-inline-video="auto"]').nth(3).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([3]);
});

test("Big: three subs sit in one row of three columns", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn", newsEspnBig: true });
  await expect.poll(() => headersIn(page, "news-espn-reddit"), LOAD).toEqual(["R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  const tops = await page.getByTestId("news-espn-reddit").locator(".news-source-sticky-top")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

// The modal renders outside the card, so it used to read only the global
// Headlines setting: global on + ESPN Videos card off showed the clip's
// headline in the clear, and a tap did nothing (Jacob 10/10). The modal now
// takes the setting of the card it opened from.
const footerTitle = (page: Page) => page.locator('[role="dialog"] p.news-title').first();
const titleFilter = (page: Page) => footerTitle(page).evaluate((el) => getComputedStyle(el).filter);
const openVideosClip = async (page: Page) => {
  await page.locator('button[aria-label="Play highlight"]', { hasText: "espn-videos post 1" }).first().click(LOAD);
  await expect(footerTitle(page)).toHaveText("espn-videos post 1", LOAD);
};

test("ESPN modal: global Headlines on + ESPN Videos card off = the clip's headline blurs; tap and H show and hide it", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true, newsCardPrefs: { "espn-videos": { revealTitles: false } } });
  await openVideosClip(page);
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
  await footerTitle(page).click();
  await expect.poll(() => titleFilter(page)).toBe("none");
  await footerTitle(page).click();
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
  await page.keyboard.press("h");
  await expect.poll(() => titleFilter(page)).toBe("none");
  // ⇧↓ to the next clip in the same card: blurred again, card setting kept.
  // (Plain ↓ on a clip is the volume.)
  await page.keyboard.press("Shift+ArrowDown");
  await expect(footerTitle(page)).toHaveText("espn-videos post 2");
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
});

test("ESPN modal: global Headlines off + ESPN Videos card on = the clip's headline shows", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, newsCardPrefs: { "espn-videos": { revealTitles: true } } });
  await openVideosClip(page);
  await expect.poll(() => titleFilter(page)).toBe("none");
});

// A reload (or a pasted link) reopens the modal from the URL, which carries the
// post but not the card. The URL now carries the post's section (?hn, or ?hl
// when they match) and the modal finds the card from it (Jacob 10/10: the
// headline showed after a reload).
const urlSection = (page: Page) => { const q = new URL(page.url()).searchParams; return q.get("hn") ?? q.get("hl"); };
test("ESPN modal after a reload: global Headlines on + ESPN Videos card off = the headline stays blurred", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true, newsCardPrefs: { "espn-videos": { revealTitles: false } } });
  await openVideosClip(page);
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
  await expect.poll(() => urlSection(page)).toBe("ESPN Video");
  await page.reload();
  await expect(footerTitle(page)).toHaveText("espn-videos post 1", LOAD);
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
});

test("ESPN modal after a reload: global Headlines on + r/nfl card off = the headline stays blurred", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true, newsCardPrefs: { "reddit-nfl": { revealTitles: false } } });
  await page.getByText("reddit-nfl post 2", { exact: true }).click(LOAD);
  await expect(footerTitle(page)).toHaveText("reddit-nfl post 2", LOAD);
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
  await expect.poll(() => urlSection(page)).toBe("r/nfl");
  await page.reload();
  await expect(footerTitle(page)).toHaveText("reddit-nfl post 2", LOAD);
  await expect.poll(() => titleFilter(page)).toBe("blur(7px)");
});

// A reload reopens the modal from the URL alone, which has no post list, so
// the ‹ › arrows went away (Jacob 10/10). Once the cards behind it load, the
// card that holds the open post gives the modal its list back.
const nextPost = (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Next post" });
const reloadThenStep = async (page: Page, from: string, to: string) => {
  await page.reload();
  await expect(footerTitle(page)).toHaveText(from, LOAD);
  await expect(nextPost(page)).toBeEnabled(LOAD);
  // ⇧↓ pages on every post type; plain ↓ on a clip is the volume.
  await page.keyboard.press("Shift+ArrowDown");
  // Post 3 of a sub is a text post, whose title is not in the clip footer.
  await expect(page.getByRole("dialog").getByText(to, { exact: true }).first()).toBeVisible();
};

test("ESPN modal after a reload: the arrows come back and ⇧↓ steps to post 2", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true });
  await openVideosClip(page);
  await reloadThenStep(page, "espn-videos post 1", "espn-videos post 2");
});

test("r/nfl modal after a reload: the arrows come back and ⇧↓ steps to the next post", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true });
  await page.getByText("reddit-nfl post 2", { exact: true }).click(LOAD);
  await expect(footerTitle(page)).toHaveText("reddit-nfl post 2", LOAD);
  await reloadThenStep(page, "reddit-nfl post 2", "reddit-nfl post 3");
});

test("Cards modal after a reload: the arrows come back and ⇧↓ steps to the next post", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsAutoplay: false, revealNewsTitles: true });
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await page.getByText("reddit-nfl post 2", { exact: true }).click(LOAD);
  await expect(footerTitle(page)).toHaveText("reddit-nfl post 2", LOAD);
  await reloadThenStep(page, "reddit-nfl post 2", "reddit-nfl post 3");
});

test("Hide seen on: the reloaded post stays in its card, so the arrows come back", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: false, revealNewsTitles: true, newsHideSeen: true });
  await openVideosClip(page);
  await reloadThenStep(page, "espn-videos post 1", "espn-videos post 2");
});

// ── News polish (Jacob 10/10): header text, Posts switch, Media slash,
//    Cards chips, pill order ─────────────────────────────────────────────
// The buttons on screen in one card's header, by aria-label (a hidden form of
// the Posts control is not counted).
const shownControls = (page: Page, label: string) => cardHeader(page, label).getByTestId("card-header-controls")
  .getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const cardOf = (page: Page, label: string) => cardHeader(page, label).locator("xpath=..");
const SUBS = ["r/baseball", "r/nfl", "r/hockey"];

test("Cards: each sub card has Media, Headlines and Posts in its header; a card's Media off beats the global on", async ({ page }) => {
  await gotoNews(page, { ...PLAY });
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  for (const sub of SUBS) {
    await expect(cardHeader(page, sub).getByTestId("card-header-controls")).toBeVisible(LOAD);
    // 1280px: a 280px column, so Posts is the 3-icon switch.
    expect(await shownControls(page, sub)).toEqual([
      `Toggle media reveal: ${sub}`, `Toggle headline reveal: ${sub}`, "Posts: All", "Posts: No text", "Posts: Videos",
    ]);
    await expect(cardOf(page, sub)).toHaveClass(/news-card-media-on/);
  }
  const toolbarMedia = pill(page, "Toggle media reveal");
  await expect(toolbarMedia).toHaveAttribute("aria-pressed", "true");

  // r/nfl's own Media off: that card blurs, the global pref stays on.
  await page.getByRole("button", { name: "Toggle media reveal: r/nfl" }).click();
  await expect(cardOf(page, "r/nfl")).toHaveClass(/news-card-media-off/);
  await expect(cardOf(page, "r/baseball")).toHaveClass(/news-card-media-on/);
  await expect(page.locator("html")).not.toHaveClass(/blur-news-media/);
  let p = await saved(page);
  expect(p.revealNewsMedia).toBe(true);
  expect(p.newsCardPrefs).toEqual({ "reddit-nfl": { revealMedia: false } });
  // The toolbar reads like the Reddit bar: mixed = off, one tap turns all on
  // and clears the card's own value.
  await expect(toolbarMedia).toHaveAttribute("aria-pressed", "false");
  await toolbarMedia.click();
  await expect(toolbarMedia).toHaveAttribute("aria-pressed", "true");
  await expect(cardOf(page, "r/nfl")).toHaveClass(/news-card-media-on/);
  p = await saved(page);
  expect(p.revealNewsMedia).toBe(true);
  expect(p.newsCardPrefs ?? {}).toEqual({});

  // Headlines: one card's own button shows that card only.
  const blur = (key: string) => page.locator(`[data-news-key="${key}"] .news-title`).first().evaluate((el) => getComputedStyle(el).filter);
  expect(await blur("https://example.com/reddit-mlb/0")).toContain("blur");
  await page.getByRole("button", { name: "Toggle headline reveal: r/baseball" }).click();
  await expect.poll(() => blur("https://example.com/reddit-mlb/0")).toBe("none");
  expect(await blur("https://example.com/reddit-nfl/0")).toContain("blur");
  await expect(pill(page, "Toggle headline reveal")).toHaveAttribute("aria-pressed", "false");
});

test("Cards: a sub's own Posts switch filters that sub only; the toolbar switch shows no segment while they differ", async ({ page }) => {
  await gotoNews(page);
  await expect(cardSwitch(page, "r/nfl")).toBeVisible(LOAD);
  const toolbarSegs = () => postSwitch(page).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
  expect(await toolbarSegs()).toEqual(["true", "false", "false"]);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeVisible(LOAD);

  await cardSwitch(page, "r/nfl").getByRole("button", { name: "Posts: Videos" }).click();
  expect(await cardSegs(page, "r/nfl")).toEqual(["false", "false", "true"]);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("reddit-nfl post 2", { exact: true })).toHaveCount(1);
  await expect(page.getByText("reddit-mlb post 1", { exact: true })).toBeVisible();
  expect(await toolbarSegs()).toEqual(["false", "false", "false"]);
  expect((await saved(page)).newsCardPrefs).toEqual({ "reddit-nfl": { videosOnly: true } });

  // The toolbar sets every card and clears the card's own value.
  await postSwitch(page).getByRole("button", { name: "No text" }).click();
  expect(await toolbarSegs()).toEqual(["false", "true", "false"]);
  for (const sub of SUBS) expect(await cardSegs(page, sub)).toEqual(["false", "true", "false"]);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeHidden();
  const p = await saved(page);
  expect(p.newsCardPrefs ?? {}).toEqual({});
  expect(p.showTextPosts).toBe(false);
});

test("Cards: a card emptied by its own Posts switch stays, so the switch can bring the posts back", async ({ page }) => {
  // No clips in r/nfl: every post is headline-only. The route goes on after
  // gotoNews' own mocks (the last route added answers first), so the page
  // loads here, not in gotoNews.
  await mockFeeds(page);
  await page.route("**/news/reddit-nfl.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items: itemsFor("reddit-nfl").map((i) => ({ ...i, playbackUrl: undefined })) }),
  }));
  await page.addInitScript((prefs) => localStorage.setItem("nss-preferences", JSON.stringify(prefs)), BASE_PREFS);
  await page.goto("/");
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeVisible(LOAD);
  await cardSwitch(page, "r/nfl").getByRole("button", { name: "Posts: Videos" }).click();
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toHaveCount(0);
  await expect(cardOf(page, "r/nfl").getByText("Nothing here with this card's filters.")).toBeVisible();
  await cardSwitch(page, "r/nfl").getByRole("button", { name: "Posts: All" }).click();
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeVisible();
});

test("Cards 1024px: a 225px column keeps the one cycling Posts chip; 1280px shows the switch", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await gotoNews(page);
  const header = cardHeader(page, "r/baseball");
  await expect(header.getByTestId("card-header-controls")).toBeVisible(LOAD);
  expect(await shownControls(page, "r/baseball")).toEqual(["Toggle media reveal: r/baseball", "Toggle headline reveal: r/baseball", "Post filter: All"]);
  await expect(cardSwitch(page, "r/baseball")).toBeHidden();
  // The chip cycles All → No text, and every control stays inside the header.
  await header.getByRole("button", { name: "Post filter: All" }).click();
  await expect(header.getByRole("button", { name: "Post filter: No text" })).toBeVisible();
  const inside = await header.evaluate((h) => {
    const bar = h.firstElementChild!.getBoundingClientRect();
    return Array.from(h.querySelectorAll("[data-testid=card-header-controls] button"))
      .map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0).every((r) => r.right <= bar.right + 0.5);
  });
  expect(inside).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(cardSwitch(page, "r/baseball")).toBeVisible();
  expect(await cardSegs(page, "r/baseball")).toEqual(["false", "true", "false"]);
  await expect(header.getByRole("button", { name: /^Post filter:/ })).toHaveCount(0);
});

test("Cards: a video card has Media and Headlines only, and still follows the toolbar's Posts switch", async ({ page }) => {
  // Videos + Reddit in the funnel: each league column = its video card, then its sub.
  await gotoNews(page, { newsTypeFilters: ["reddit", "topvideos"], newsAutoplay: false });
  const label = "MLB Most Popular";
  await expect(cardHeader(page, label).getByTestId("card-header-controls")).toBeVisible(LOAD);
  expect(await shownControls(page, label)).toEqual([`Toggle media reveal: ${label}`, `Toggle headline reveal: ${label}`]);
  await expect(cardHeader(page, label).getByTestId("post-filter-switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle news autoplay" })).toHaveCount(1); // the toolbar's
  await expect(page.getByRole("button", { name: "Toggle big ESPN videos" })).toHaveCount(0);
  // Its own Media button shows that card's previews only.
  await page.getByRole("button", { name: `Toggle media reveal: ${label}` }).click();
  await expect(cardOf(page, label)).toHaveClass(/news-card-media-on/);
  await expect(cardOf(page, "r/baseball")).toHaveClass(/news-card-media-off/);
  expect((await saved(page)).newsCardPrefs).toEqual({ "mlb-videos": { revealMedia: true } });
  // No text-posts class of its own: the toolbar's Posts value applies.
  await expect(cardOf(page, label)).not.toHaveClass(/news-card-textposts-/);
});

test("Media icon: a slash when off, none when on (toolbar, card headers, Reddit bar)", async ({ page }) => {
  await gotoNews(page);
  const icon = (name: string) => page.getByRole("button", { name, exact: true }).locator("svg[data-media-icon]");
  // Cards, Media off by default: the toolbar chip and every card chip are crossed out.
  await expect(icon("Toggle media reveal: r/baseball")).toHaveAttribute("data-media-icon", "off", LOAD);
  await expect(icon("Toggle media reveal")).toHaveAttribute("data-media-icon", "off");
  await expect(icon("Toggle media reveal").locator("line[data-slash]")).toHaveCount(1);
  await expect(icon("Toggle media reveal: r/baseball").locator("line[data-slash]")).toHaveCount(1);
  // One card on: that card's slash goes, the toolbar's stays (mixed = off).
  await page.getByRole("button", { name: "Toggle media reveal: r/baseball" }).click();
  await expect(icon("Toggle media reveal: r/baseball")).toHaveAttribute("data-media-icon", "on");
  await expect(icon("Toggle media reveal: r/baseball").locator("line[data-slash]")).toHaveCount(0);
  await expect(icon("Toggle media reveal")).toHaveAttribute("data-media-icon", "off");
  await pill(page, "Toggle media reveal").click();
  await expect(icon("Toggle media reveal")).toHaveAttribute("data-media-icon", "on");
  await expect(icon("Toggle media reveal").locator("line[data-slash]")).toHaveCount(0);
  await expect(icon("Toggle media reveal: r/nfl")).toHaveAttribute("data-media-icon", "on");

  // ESPN layout: the Reddit bar chip and each card chip.
  await pill(page, "ESPN").click();
  await expect(icon("Toggle media reveal: every card")).toHaveAttribute("data-media-icon", "on", LOAD);
  await page.getByRole("button", { name: "Toggle media reveal: ESPN Videos" }).click();
  await expect(icon("Toggle media reveal: ESPN Videos")).toHaveAttribute("data-media-icon", "off");
  await expect(icon("Toggle media reveal: ESPN Videos").locator("line[data-slash]")).toHaveCount(1);
  await expect(icon("Toggle media reveal: every card")).toHaveAttribute("data-media-icon", "off");
  await expect(icon("Toggle media reveal: ESPN Top Headlines")).toHaveAttribute("data-media-icon", "on");
});

test("a new visitor's News opens on ESPN; a stored blob with no layout stays on Cards", async ({ page, browser }) => {
  // No stored prefs at all. The first-run "Pick your leagues" sheet comes up
  // once the day's leagues load (often after the page is usable), and its
  // scrim swallows clicks: take Use defaults whenever it turns up, as
  // settings-shape.spec.ts does.
  await page.addLocatorHandler(page.getByRole("button", { name: "Use defaults" }), async (defaults) => {
    await defaults.evaluate((el) => (el as HTMLElement).click());
  });
  await mockFeeds(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^News/ }).first().click();
  await expect(pill(page, "ESPN")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(layout(page)).toBeVisible(LOAD);
  expect((await saved(page)).newsLayout).toBe("espn");
  await page.reload();
  await expect(pill(page, "ESPN")).toHaveAttribute("aria-pressed", "true", LOAD);

  // An old Cards user: a blob from before newsLayout existed.
  const ctx = await browser.newContext();
  const old = await ctx.newPage();
  await gotoNews(old, { newsFeedView: false });
  await expect(pill(old, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(layout(old)).toHaveCount(0);
  await expect(cardHeader(old, "r/baseball")).toBeVisible(LOAD);
  expect((await saved(old)).newsLayout).toBeUndefined();
  await ctx.close();
});

test("a settings link without a layout leaves an old Cards user on Cards", async ({ page }) => {
  await mockFeeds(page);
  await page.addInitScript((prefs) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
  }, BASE_PREFS);
  // th = theme: one of the params that applies a shared setup.
  await page.goto("/?th=d");
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(layout(page)).toHaveCount(0);
  expect((await saved(page)).newsLayout).toBeUndefined();
});

test("next to the ESPN mark the header drops the word ESPN at every width; the label itself is whole", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  for (const [label, text] of [["ESPN Videos", "VIDEOS"], ["ESPN Top Headlines", "HEADLINES"]]) {
    const header = cardHeader(page, label);
    await expect(header).toBeVisible(LOAD);
    expect((await header.innerText()).trim().toUpperCase()).toBe(text);
    await expect(header.locator('img[src*="misc_logos/500/espn.png"]')).toHaveCount(1);
    // aria names keep the whole label.
    await expect(page.getByRole("button", { name: `Toggle headline reveal: ${label}`, exact: true })).toHaveCount(1);
  }
  // A subreddit header (a league mark, not ESPN's) is untouched.
  expect((await cardHeader(page, "r/baseball").innerText()).trim().toUpperCase()).toBe("R/BASEBALL");
  // The modal's source label is the feed's, untouched.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await cardHeader(page, "ESPN Videos").innerText()).trim().toUpperCase()).toBe("VIDEOS");
});

test("Cards Top news column: ESPN Videos reads Videos; a bare ESPN label keeps its word", async ({ page }) => {
  // Top news in column 3 = r/sports, ESPN Videos, ESPN (GENERIC_CASCADE).
  await gotoNews(page, { newsTopNews: true, newsTypeFilters: ["reddit", "topvideos", "espn"], firstLeague: "empty", secondLeague: "empty", thirdLeague: "empty", newsAutoplay: false });
  await expect(pill(page, "Cards")).toHaveAttribute("aria-pressed", "true", LOAD);
  await expect(cardHeader(page, "ESPN Videos")).toBeVisible(LOAD);
  expect((await cardHeader(page, "ESPN Videos").innerText()).trim().toUpperCase()).toBe("VIDEOS");
  expect((await cardHeader(page, "ESPN").innerText()).trim().toUpperCase()).toBe("ESPN");
  expect(await shownControls(page, "ESPN Videos")).toEqual(["Toggle media reveal: ESPN Videos", "Toggle headline reveal: ESPN Videos"]);
});
