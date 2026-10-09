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
    section: name.startsWith("reddit-") ? `r/${name.slice(7)}` : "ESPN",
    // Every *-videos item is a clip; in a subreddit every 2nd post is one
    // (post 2, 4, 6), like a v.redd.it clip in a mostly-text feed.
    ...(name.endsWith("-videos") || (name.startsWith("reddit-") && i % 2 === 1)
      ? { playbackUrl: `https://clips.example.test/${name}-${i}.webm` } : {}),
  }));
}

type Item = ReturnType<typeof itemsFor>[number] & Record<string, unknown>;
type FeedPatch = (name: string, items: Item[]) => Item[];

async function mockFeeds(page: Page, patch?: FeedPatch) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    const items = patch ? patch(name, itemsFor(name)) : itemsFor(name);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items }) });
  });
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
}

// Seed prefs ONCE per tab, so a reload keeps what the UI wrote.
async function gotoNews(page: Page, extra: Record<string, unknown> = {}, seen: string[] = [], patch?: FeedPatch) {
  await mockFeeds(page, patch);
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

test("Hide seen, Headlines, Media and Posts all act on the ESPN layout", async ({ page }) => {
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

  // Posts (a subreddit card's own chip, cycling All → No text → Videos,
  // Jacob 10/9): on Videos that card's headline-only posts go, its clips
  // stay, the other cards keep theirs.
  await page.getByRole("button", { name: "Post filter: All" }).first().click();
  await page.getByRole("button", { name: "Post filter: No text" }).click();
  await expect(page.getByRole("button", { name: "Post filter: Videos" })).toHaveCount(1);
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
    .toEqual(["VIDEOS", "TOP HEADLINES", "R/BASEBALL", "R/NFL", "R/HOCKEY"]);
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
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["ESPN VIDEOS", "ESPN TOP HEADLINES"]);
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
  await expect(page.locator('button[aria-label^="Play highlight:"]').first()).toBeVisible(LOAD);
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
  await expect(chips(page)).toHaveCount(3, LOAD);
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
  await expect(chips(page)).toHaveCount(3, LOAD);
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
  await expect(page.locator('button[aria-label^="Play highlight:"]').first()).toBeVisible(LOAD);
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
const headerButtons = (page: Page, label: string) =>
  page.locator(".news-source-sticky-top", { hasText: label }).first().locator("[data-card-chip]")
    .evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/:.*$/, "")));

test("ESPN: the toolbar keeps only the layout switch; each card header has exactly its buttons", async ({ page }) => {
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["ESPN VIDEOS", "ESPN TOP HEADLINES"]);
  await expect(toolbar(page).getByRole("button")).toHaveText(["Cards", "Feed", "ESPN"]);
  // r6 order: Autoplay first, Media before Headlines.
  expect(await headerButtons(page, "ESPN Videos")).toEqual(["Toggle news autoplay", "Toggle big ESPN videos", "Toggle media reveal", "Toggle headline reveal"]);
  expect(await headerButtons(page, "ESPN Top Headlines")).toEqual(["Toggle media reveal", "Toggle headline reveal"]);
  for (const sub of ["r/baseball", "r/nfl", "r/hockey"]) {
    expect(await headerButtons(page, sub)).toEqual(["Toggle media reveal", "Toggle headline reveal", "Post filter"]);
  }
  // Every header button keeps a title and an aria-label.
  for (const b of await page.locator("[data-card-chip]").all()) {
    expect(await b.getAttribute("title")).toBeTruthy();
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
  await expect(chips(page)).toHaveCount(3, LOAD);
  await expect(postSwitch(page)).toHaveCount(1);
  await expect(page.locator("[data-card-chip]")).toHaveCount(0);
  await pill(page, "Feed").click();
  await expect(chips(page)).toHaveCount(3);
  await expect(postSwitch(page)).toHaveCount(1);
  await expect(page.locator("[data-card-chip]")).toHaveCount(0);
});

test("360px phone: header buttons fit, the label gives way", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoNews(page, { newsLayout: "espn" });
  await expect.poll(() => headersIn(page, "news-espn-layout"), LOAD).toContain("R/BASEBALL");
  const fit = await page.locator(".news-source-sticky-top").evaluateAll((hs) => hs.map((h) => {
    const bar = h.firstElementChild!.getBoundingClientRect();
    return Array.from(h.querySelectorAll("[data-card-chip]")).every((c) => {
      const r = c.getBoundingClientRect();
      return r.right <= bar.right + 0.5 && r.width >= 27;
    });
  }));
  expect(fit.every(Boolean)).toBe(true);
});

// ── Round 6 (Jacob 7:26 AM 10/9): icon order, Autoplay off icon, dim under blur ──
test("Cards/Feed toolbar order: Autoplay, Media, Headlines, Posts", async ({ page }) => {
  await gotoNews(page, { newsLayout: "feed", newsFeedView: true });
  await expect(chips(page)).toHaveCount(3, LOAD);
  expect(await toolbar(page).locator("button.news-chip, [data-testid=post-filter-switch]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual([
    "Toggle news autoplay", "Toggle media reveal", "Toggle headline reveal", "Post filter",
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

test("Reddit bar Posts switch filters every sub; a sub's own chip filters that sub only", async ({ page }) => {
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

  // r/nfl's own chip: All → No text on that sub only; the bar shows no segment.
  const nflChip = page.locator(".news-source-sticky-top", { hasText: "r/nfl" }).getByRole("button", { name: /^Post filter:/ });
  await expect(nflChip).toHaveAttribute("aria-label", "Post filter: All");
  await expect(nflChip).toHaveAttribute("title", "Posts: All. Tap for No text.");
  await nflChip.click();
  await expect(nflChip).toHaveAttribute("aria-label", "Post filter: No text");
  expect(await nflChip.locator("svg line[data-slash]").count()).toBe(1);
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toBeHidden();
  await expect(page.getByText("reddit-mlb post 1", { exact: true })).toBeVisible();
  expect(await segPressed(page)).toEqual(["false", "false", "false"]);
  p = await saved(page);
  expect(p.newsCardPrefs?.["reddit-nfl"]).toEqual({ videosOnly: false, textPosts: false });
  await nflChip.click();
  await expect(nflChip).toHaveAttribute("aria-label", "Post filter: Videos");
  await expect(page.getByText("reddit-nfl post 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("reddit-nfl post 2", { exact: true })).toHaveCount(1);
  await nflChip.click();
  await expect(nflChip).toHaveAttribute("aria-label", "Post filter: All");
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
    expect(await headersIn(page, "news-espn-layout")).toEqual(["VIDEOS", "TOP HEADLINES", "R/BASEBALL", "R/NFL", "R/HOCKEY"]);
  });
}

test("Cards toolbar Media tap clears a card's own Media: ESPN then follows the global value", async ({ page }) => {
  await gotoNews(page, { newsCardPrefs: { "espn-videos": { revealMedia: true, revealTitles: true } } });
  await expect(chips(page)).toHaveCount(3, LOAD);
  await pill(page, "Toggle media reveal").click();
  await pill(page, "Toggle media reveal").click();
  const p = await saved(page);
  expect(p.revealNewsMedia).toBe(false);
  expect(p.newsCardPrefs).toEqual({ "espn-videos": { revealTitles: true } });
  await pill(page, "ESPN").click();
  await expect.poll(() => headersIn(page, "news-espn-row1"), LOAD).toEqual(["ESPN VIDEOS", "ESPN TOP HEADLINES"]);
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
  // 280 tall: the 6 headline rows (centered chevrons, Jacob 10/9) make a card
  // just under 300px, and this needs one taller than the screen.
  await page.setViewportSize({ width: 1280, height: 280 });
  await gotoNews(page, { newsLayout: "espn" });
  const pin = page.getByTestId("news-espn-headlines-pin");
  await expect(pin.locator(".news-source-sticky-top")).toBeVisible(LOAD);
  await expect(page.locator("[data-inline-video]")).toHaveCount(10, LOAD);
  const height = (await pin.boundingBox())!.height;
  expect(height).toBeGreaterThan(280);
  await page.evaluate(() => window.scrollTo(0, 2000));
  // Its bottom edge sits 1rem above the screen bottom: every headline is reachable.
  await expect.poll(async () => { const b = await pin.boundingBox(); return Math.round(b!.y + b!.height); }).toBe(280 - 16);
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

// ── Corner sound + space between clips (Jacob 10/9) ─────────────────────
// The playing clip's bottom-right speaker turns sound on in place; a tap
// anywhere else opens the modal. Sound stays on for the next clips.
const soundButton = (scope: ReturnType<Page["locator"]>) => scope.locator("[data-sound-button]");
const videoMuted = (scope: ReturnType<Page["locator"]>) =>
  scope.locator("video[data-autoplay-video]").evaluate((v: HTMLVideoElement) => v.muted);
const anyDialog = (page: Page) => page.locator('[role="dialog"]');

for (const width of [390, 1280]) {
  test(`${width}px: the corner speaker turns sound on and off in place, no modal`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
    // Clip 3: near the page top the first clip plays instead (TOP_ZONE).
    const card = page.locator('[data-inline-video="auto"]').nth(3);
    await expect(card).toBeAttached(LOAD);
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([3]);

    const btn = soundButton(card);
    await expect(btn).toHaveAttribute("aria-label", "Turn sound on");
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    // It sits in the media box's bottom-right 48 px.
    const [b, m] = await Promise.all([btn.boundingBox(), card.locator(".news-media-preview").boundingBox()]);
    expect(b!.x).toBeGreaterThanOrEqual(m!.x + m!.width - 48);
    expect(b!.y).toBeGreaterThanOrEqual(m!.y + m!.height - 48);
    expect(b!.x + b!.width).toBeLessThanOrEqual(m!.x + m!.width + 1);
    expect(b!.y + b!.height).toBeLessThanOrEqual(m!.y + m!.height + 1);
    expect(b!.width).toBeGreaterThanOrEqual(44);

    await btn.click();
    expect(await videoMuted(card)).toBe(false);
    await expect(btn).toHaveAttribute("aria-label", "Turn sound off");
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(300);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await playing(page)).toEqual([3]);

    await btn.click();
    expect(await videoMuted(card)).toBe(true);
    await expect(btn).toHaveAttribute("aria-label", "Turn sound on");
    await expect(anyDialog(page)).toHaveCount(0);
  });
}

test("sound stays on for the next clip in focus", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.nth(3)).toBeAttached(LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([1]);
  await soundButton(cards.nth(1)).click();
  expect(await videoMuted(cards.nth(1))).toBe(false);

  await cards.nth(3).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([3]);
  expect(await videoMuted(cards.nth(3))).toBe(false);
  await expect(soundButton(cards.nth(3))).toHaveAttribute("aria-label", "Turn sound off");
});

test("the browser refuses sound on the next clip: it plays muted, shows the muted icon, no popup", async ({ page }) => {
  // Muted play works; an unmuted play() outside a tap is refused (iPhone Safari).
  await page.addInitScript(() => {
    const real = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted) return Promise.reject(new DOMException("no sound", "NotAllowedError"));
      return real.call(this);
    };
  });
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  const cards = page.locator('[data-inline-video="auto"]');
  await expect(cards.nth(3)).toBeAttached(LOAD);
  await cards.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([1]);
  await soundButton(cards.nth(1)).click();
  expect(await videoMuted(cards.nth(1))).toBe(false);

  await cards.nth(3).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([3]);
  expect(await videoMuted(cards.nth(3))).toBe(true);
  await expect(soundButton(cards.nth(3))).toHaveAttribute("aria-label", "Turn sound on");
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator("[data-tap-to-play]")).toHaveCount(0);
});

test("a tap on the clip center opens the modal; nothing plays under it or in a hidden tab", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "espn", newsEspnBig: true });
  const card = page.locator('[data-inline-video="auto"]').nth(1);
  await expect(card).toBeAttached(LOAD);
  await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(() => playing(page), { timeout: 2000 }).toEqual([1]);

  // A real pointer tap at the center: the headline's stretched ::after takes it.
  const m = (await card.locator(".news-media-preview").boundingBox())!;
  await page.mouse.click(m.x + m.width / 2, m.y + m.height / 2);
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible(LOAD);
  await page.waitForTimeout(600);
  expect(await playingKeys(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(anyDialog(page)).toHaveCount(0);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);

  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setHidden(true);
  await expect.poll(() => playingKeys(page), { timeout: 2000 }).toEqual([]);
  await page.waitForTimeout(500);
  expect(await playingKeys(page)).toEqual([]);
  await setHidden(false);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
});

test("Feed: the corner speaker turns sound on with no modal and does not mark the post seen", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsLayout: "feed", newsFeedView: true, newsHideSeen: true });
  const post = page.locator("article[data-news-key]:has(video[data-autoplay-video])").nth(1);
  await expect(post).toBeAttached(LOAD);
  await post.evaluate((el) => el.querySelector("video")!.scrollIntoView({ block: "center" }));
  const key = (await post.getAttribute("data-news-key"))!;
  await expect.poll(() => playingKeys(page), { timeout: 2000 }).toEqual([key]);

  await soundButton(post).click();
  expect(await videoMuted(post)).toBe(false);
  await expect(soundButton(post)).toHaveAttribute("aria-label", "Turn sound off");
  await page.waitForTimeout(300);
  await expect(anyDialog(page)).toHaveCount(0);
  const seen = () => page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) || "{}")), SEEN_KEY);
  expect(await seen()).not.toContain(key);

  // Control: a tap on the media itself opens the post and marks it seen.
  await post.locator(".news-media-preview").click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible(LOAD);
  await expect.poll(seen).toContain(key);
});

test("Cards: the corner speaker turns sound on with no modal", async ({ page }) => {
  await gotoNews(page, { ...PLAY, newsTypeFilters: ["reddit", "topvideos"] });
  const clips = page.locator("video[data-autoplay-video]");
  await expect(clips.nth(4)).toBeAttached(LOAD);
  await clips.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  const scope = page.locator("[data-sound-scope]:has(video[data-autoplay-video])").filter({ has: page.locator("[data-sound-button]") });
  await expect(scope).toHaveCount(1);
  await soundButton(scope).click();
  expect(await videoMuted(scope)).toBe(false);
  await page.waitForTimeout(300);
  await expect(anyDialog(page)).toHaveCount(0);
});

test("no button inside a button or link on the News page, in every layout", async ({ page }) => {
  const nested = () => page.evaluate(() => document.querySelectorAll("button button, button a, a button").length);
  await gotoNews(page, { ...PLAY, newsTypeFilters: ["reddit", "topvideos"] });
  await expect(page.locator("video[data-autoplay-video]").nth(1)).toBeAttached(LOAD);
  await page.locator("video[data-autoplay-video]").nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  expect(await nested()).toBe(0);
  await pill(page, "Feed").click();
  await expect(page.locator("article[data-news-key]").first()).toBeVisible(LOAD);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  expect(await nested()).toBe(0);
  await pill(page, "ESPN").click();
  await expect(page.locator("[data-inline-video]").first()).toBeVisible(LOAD);
  await expect.poll(async () => (await playingKeys(page)).length, { timeout: 2000 }).toBe(1);
  expect(await nested()).toBe(0);
});

for (const autoplay of [true, false]) {
  test(`ESPN 390px: clips sit 12+ px apart with rounded corners (Autoplay ${autoplay ? "on" : "off"})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoNews(page, { ...PLAY, newsLayout: "espn", newsAutoplay: autoplay });
    const cards = page.locator("[data-inline-video]");
    await expect(cards).toHaveCount(10, LOAD);
    const boxes = await cards.evaluateAll((els) => els.slice(0, 4).map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    for (let i = 0; i + 1 < boxes.length; i++) expect(boxes[i + 1].top - boxes[i].bottom).toBeGreaterThanOrEqual(12);
    const radius = await cards.first().locator(".news-media-preview").evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeGreaterThan(0);
  });
}

// ── Headline rows: centered, one tap target, a shown article opens itself ──
// (Jacob 10/9.) espn-top posts 1–3 carry a thumb; 4–6 are headline-only rows
// with the chevron. Subreddit posts 2/4/6 are clips (a play tile).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const withThumbs: FeedPatch = (name, items) => name === "espn-top"
  ? items.map((it, i) => (i < 3 ? { ...it, imageUrl: `https://img.example.test/${name}-${i}.png` } : it))
  : items;
async function gotoRows(page: Page, extra: Record<string, unknown> = {}) {
  await page.context().route("https://img.example.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  // A plain article opens in a new tab; keep it off the network.
  await page.context().route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>article</title>" }));
  await gotoNews(page, extra, [], withThumbs);
}
const rowOf = (page: Page, url: string) => page.locator(`[data-news-key="${url}"]`);
const centerY = (b: { y: number; height: number } | null) => b!.y + b!.height / 2;
const headlinesChip = (page: Page) => page.getByRole("button", { name: "Toggle headline reveal: ESPN Top Headlines", exact: true });
const ESPN_TOP = (i: number) => `https://example.com/espn-top/${i}`;

for (const width of [1280, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("ESPN layout: the headline sits centered on the thumb; Cards rows stay top-aligned", async ({ page }) => {
      await gotoRows(page, { newsLayout: "espn" });
      const row = rowOf(page, ESPN_TOP(0));
      const thumb = row.locator(".news-media-preview");
      await expect(thumb.locator("img")).toBeVisible(LOAD);
      const title = row.locator(".news-title");
      expect(Math.abs(centerY(await title.boundingBox()) - centerY(await thumb.boundingBox()))).toBeLessThanOrEqual(2);
      // A headline-only row centers its chevron too.
      const plain = rowOf(page, ESPN_TOP(3));
      const chev = plain.locator('span[aria-hidden="true"]').last();
      expect(Math.abs(centerY(await chev.boundingBox()) - centerY(await plain.boundingBox()))).toBeLessThanOrEqual(2);

      // Cards: the clip tile and the headline share a top edge.
      await pill(page, "Cards").click();
      const clipRow = rowOf(page, "https://example.com/reddit-nfl/1");
      const tile = clipRow.locator(".news-media-preview");
      await expect(tile).toBeVisible(LOAD);
      const [t, b] = await Promise.all([tile.boundingBox(), clipRow.locator("[data-news-open]").boundingBox()]);
      expect(Math.abs(t!.y - b!.y)).toBeLessThanOrEqual(2);
      expect(centerY(t) - centerY(await clipRow.locator(".news-title").boundingBox())).toBeGreaterThan(4);
    });

    test("a row is one tap target: one opener per row, a tap on its empty corner opens the modal", async ({ page }) => {
      await gotoRows(page, { newsLayout: "espn" });
      await expect(rowOf(page, ESPN_TOP(5))).toBeVisible(LOAD);
      await expect(rowOf(page, "https://example.com/reddit-nfl/5")).toBeVisible(LOAD);
      const counts = await page.locator("[data-news-key]:has(.news-row-open)")
        .evaluateAll((rows) => rows.map((r) => r.querySelectorAll("[data-news-open]").length));
      expect(counts.length).toBeGreaterThanOrEqual(24);
      expect(new Set(counts)).toEqual(new Set([1]));
      // The thumb is no longer a button of its own.
      await expect(rowOf(page, ESPN_TOP(0)).locator("button")).toHaveCount(1);

      // Bottom-right corner of a headline-only row = row padding, not text.
      const row = rowOf(page, ESPN_TOP(4));
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      await page.mouse.click(box.x + box.width - 3, box.y + box.height - 3);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("[data-modal-headline]")).toHaveText("espn-top post 5");
    });

    test("Top Headlines: card Headlines off opens the modal; on opens the article; Reddit still opens the modal", async ({ page }) => {
      await gotoRows(page, { newsLayout: "espn" });
      const row = rowOf(page, ESPN_TOP(1));
      await expect(row).toBeVisible(LOAD);
      const opener = row.locator("[data-news-open]");
      await expect(opener).toHaveAttribute("title", "Open post");

      // Off: the modal.
      await opener.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // On: a new tab on the article, no modal.
      await headlinesChip(page).click();
      await expect(headlinesChip(page)).toHaveAttribute("aria-pressed", "true");
      await expect(opener).toHaveAttribute("title", "Open on example.com");
      const [tab] = await Promise.all([page.context().waitForEvent("page"), opener.click()]);
      await tab.waitForLoadState();
      expect(tab.url()).toBe(ESPN_TOP(1));
      await tab.close();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // A shown Reddit row (the Reddit bar's Headlines) still opens the modal.
      await page.getByTestId("news-reddit-bar").getByRole("button", { name: "Toggle headline reveal: every card" }).click();
      const reddit = rowOf(page, "https://example.com/reddit-nfl/0");
      await expect(reddit.locator(".news-title")).toHaveCSS("filter", "none");
      await reddit.locator("[data-news-open]").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator("[data-modal-headline]")).toHaveText("reddit-nfl post 1");
      await page.keyboard.press("Escape");

      // Cmd/Ctrl-click opens the article in a tab, Headlines off too.
      await headlinesChip(page).click();
      await expect(headlinesChip(page)).toHaveAttribute("aria-pressed", "false");
      const [tab2] = await Promise.all([
        page.context().waitForEvent("page"),
        rowOf(page, ESPN_TOP(2)).locator("[data-news-open]").click({ modifiers: ["ControlOrMeta"] }),
      ]);
      await tab2.waitForLoadState();
      expect(tab2.url()).toBe(ESPN_TOP(2));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("Hide seen: a row opened as an article is marked seen", async ({ page }) => {
      await gotoRows(page, { newsLayout: "espn", newsCardPrefs: { "espn-top": { revealTitles: true } } });
      const row = rowOf(page, ESPN_TOP(3));
      await expect(row).toBeVisible(LOAD);
      await page.getByTestId("news-hide-seen").click();
      const [tab] = await Promise.all([page.context().waitForEvent("page"), row.locator("[data-news-open]").click()]);
      await tab.close();
      await expect.poll(() => page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) || "{}")), SEEN_KEY))
        .toContain(ESPN_TOP(3));
    });
  });
}

test("Cards: with Headlines on, a plain article row opens the article", async ({ page }) => {
  // All sources, so the league-site cards (MLB.com, …) show beside Reddit.
  await gotoRows(page, { revealNewsTitles: true, newsTypeFilter: "all" });
  const rows = page.locator("[data-news-key]:has(.news-row-open)");
  await expect(rows.first()).toBeVisible(LOAD);
  await expect.poll(() => rows.evaluateAll((els) => els.filter((e) => !e.getAttribute("data-news-key")!.includes("/reddit-")).length), LOAD).toBeGreaterThan(0);
  const url = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-news-key")!).find((k) => !k.includes("/reddit-"))!);
  const row = page.locator(`[data-news-key="${url}"]`);
  await row.scrollIntoViewIfNeeded();
  const [tab] = await Promise.all([page.context().waitForEvent("page"), row.locator("[data-news-open]").click()]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe(url);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
