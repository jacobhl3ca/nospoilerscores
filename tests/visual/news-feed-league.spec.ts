import { expect, test, type Page } from "@playwright/test";

// News Feed view, 3 fixes (Jacob 10/8):
//   1. Every post says which league it is from (logo + label in its header).
//   2. League chips above the Feed (All · MLB · NFL) show one league; the
//      modal's ‹ prev / next › stays inside the chosen chip.
//   3. Pull-to-refresh keeps the list and the scroll position. Posts that
//      arrive while scrolled down wait behind an "N new posts ↑" pill; at the
//      top they merge with no pill.
// Every /news/*.json feed is mocked (Reddit-only is the default source type,
// so each column is one prebaked feed). Run against `localhost`.

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
  // Two news columns: MLB and NFL. An Empty scores col 3 gives no news col 3.
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "empty",
  fourthLeague: "empty",
  fifthLeague: "empty",
};

const NOW = Date.parse("2026-09-20T15:00:00-04:00");
const PER_FEED = 10;
const NEW_PER_FEED = 3;

async function gotoNews(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ prefs }) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
  }, { prefs: { ...BASE_PREFS, ...extra } });
  await page.goto("/");
}

// `state.refreshed` flips the mock to the post-refresh payload: the same posts
// plus NEW_PER_FEED newer ones per feed (`state.extra` more on top), answered
// after `state.delayMs`.
async function mockFeeds(page: Page, state: { refreshed: boolean; delayMs: number; extra?: number }) {
  await page.route("**/news/*.json", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    const refreshed = state.refreshed;
    if (refreshed && state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    // Interleave the two feeds by time (offset by name length) so a chip
    // filter and modal paging have something to skip over.
    const post = (i: number, fresh: boolean) => ({
      id: `${name}-${fresh ? "new" : "old"}-${i}`,
      headline: `${name} ${fresh ? "new" : "post"} ${i + 1} with a headline long enough to wrap onto a second line`,
      description: "",
      published: new Date(NOW - ((fresh ? -(i + 1) : i) * 30 + name.length) * 60_000).toISOString(),
      articleUrl: `https://example.com/${name}/${fresh ? "new" : "old"}/${i}`,
      byline: "",
      section: `r/${name}`,
    });
    const items = [
      ...(refreshed ? Array.from({ length: NEW_PER_FEED + (state.extra ?? 0) }, (_, i) => post(i, true)) : []),
      ...Array.from({ length: PER_FEED }, (_, i) => post(i, false)),
    ];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items }) });
  });
  await page.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/[^?]*\/news/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ articles: [] }) }));
}

const posts = (page: Page) => page.locator("article[data-news-key]");
const pill = (page: Page) => page.locator('[data-testid="feed-new-posts"]');
const chip = (page: Page, label: string) => page.locator("[data-feed-chip]").filter({ hasText: new RegExp(`^${label}$`) });

async function settle(page: Page) {
  let last = -1;
  await expect.poll(async () => {
    const n = await posts(page).count();
    const stable = n === last && n > 0;
    last = n;
    return stable;
  }, { timeout: 45_000, intervals: [700] }).toBe(true);
  return last;
}

// The app's pull-to-refresh listens for window touch events and only reads
// e.touches[0], so a plain Event with a `touches` list drives it in every
// engine (WebKit desktop has no Touch constructor).
async function pullToRefresh(page: Page) {
  await page.evaluate(() => {
    const fire = (type: string, y: number) => {
      const e = new Event(type, { bubbles: true });
      Object.defineProperty(e, "touches", { value: [{ clientX: 200, clientY: y }] });
      window.dispatchEvent(e);
    };
    fire("touchstart", 100);
    for (const y of [150, 220, 290, 360]) fire("touchmove", y);
    fire("touchend", 360);
  });
}

const groupsOf = (page: Page) => posts(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-feed-group")));
const seenStore = (page: Page) => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("hs.newsSeen.v1") || "{}")));

// The league tag's logo comes from ESPN's CDN, and a logo that fails to load
// drops its mark. Serve every off-site image a 1x1 PNG so the tag checks read
// our markup, not the CDN's uptime (and run offline).
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
      : route.fallback());
});

test("Feed: every post shows its league tag", async ({ page }) => {
  await mockFeeds(page, { refreshed: false, delayMs: 0 });
  await gotoNews(page);
  const total = await settle(page);
  expect(total).toBe(PER_FEED * 2);

  const tags = await posts(page).evaluateAll((els) => els.map((e) => ({
    group: e.getAttribute("data-feed-group"),
    label: e.querySelector("[data-feed-league]")?.textContent?.trim(),
    mark: !!e.querySelector("[data-feed-league] [data-league-mark]"),
    key: e.getAttribute("data-news-key"),
  })));
  for (const t of tags) {
    expect(t.group).toMatch(/^(mlb|nfl)-\d$/);
    expect(t.label).toBe(t.group!.startsWith("mlb") ? "MLB" : "NFL");
    expect(t.mark).toBe(true);
  }
  // Both leagues are in the merged list, and they interleave.
  const groups = tags.map((t) => t.group);
  expect(new Set(groups).size).toBe(2);
  expect(groups.slice(0, 4)).not.toEqual(Array(4).fill(groups[0]));
  // The section still shows next to the league (r/<feed>).
  await expect(posts(page).first()).toContainText(/r\/reddit-/i);
});

test("Feed: a league chip shows only that league, All brings all back, paging stays inside the chip", async ({ page }) => {
  await mockFeeds(page, { refreshed: false, delayMs: 0 });
  await gotoNews(page);
  const total = await settle(page);

  await expect(page.locator("[data-feed-chip]")).toHaveText(["All", "MLB", "NFL"]);
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");

  for (const league of ["MLB", "NFL"]) {
    await chip(page, league).click();
    await expect(chip(page, league)).toHaveAttribute("aria-pressed", "true");
    await expect(posts(page)).toHaveCount(PER_FEED);
    const groups = await groupsOf(page);
    expect(groups.every((g) => g!.startsWith(league.toLowerCase()))).toBe(true);
  }

  // NFL chip on: open the first post and page next twice. Every post the
  // modal lands on (each one is marked seen) is an NFL post.
  const nflKeys = await posts(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-news-key")!));
  await posts(page).first().getByRole("button", { name: "Open post" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seenStore(page).then((k) => k.length), { timeout: 3_000 }).toBe(2);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seenStore(page).then((k) => k.length), { timeout: 3_000 }).toBe(3);
  expect((await seenStore(page)).sort()).toEqual(nflKeys.slice(0, 3).sort());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await chip(page, "All").click();
  await expect(posts(page)).toHaveCount(total);
});

test("Feed: refresh while scrolled down keeps the place and shows the new-posts pill", async ({ page }) => {
  const state = { refreshed: false, delayMs: 0 };
  await mockFeeds(page, state);
  await gotoNews(page);
  const total = await settle(page);
  const firstKey = await posts(page).first().getAttribute("data-news-key");

  state.refreshed = true;
  state.delayMs = 1_500;
  await pullToRefresh(page);
  // Scroll down while the refresh is still in flight.
  await page.evaluate(() => window.scrollTo(0, 1200));
  const y0 = await page.evaluate(() => window.scrollY);
  expect(y0).toBeGreaterThan(600);

  await expect(pill(page)).toBeVisible({ timeout: 15_000 });
  await expect(pill(page)).toHaveText(`${NEW_PER_FEED * 2} new posts↑`);
  // Nothing moved: no "Loading feed…", same list, same scroll position.
  await expect(page.getByText("Loading feed…")).toHaveCount(0);
  await expect(posts(page)).toHaveCount(total);
  expect(await posts(page).first().getAttribute("data-news-key")).toBe(firstKey);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y0)).toBeLessThan(5);

  await pill(page).click();
  await expect(pill(page)).toHaveCount(0);
  await expect(posts(page)).toHaveCount(total + NEW_PER_FEED * 2);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBe(0);
  expect(await posts(page).first().getAttribute("data-news-key")).toContain("/new/");
});

// Jacob 10/9: the pill used to stay after a hand scroll back to the top and
// cover the first post's source line. Near the top the waiting posts merge,
// the pill goes, and nothing sits over the first post's header.
test("Feed: scrolling back to the top by hand merges the new posts and the pill goes", async ({ page }) => {
  const state = { refreshed: false, delayMs: 0, extra: 0 };
  await mockFeeds(page, state);
  await gotoNews(page);
  const total = await settle(page);

  state.refreshed = true;
  state.delayMs = 1_500;
  await pullToRefresh(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(pill(page)).toBeVisible({ timeout: 15_000 });

  await page.mouse.wheel(0, -5_000);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(5);
  await expect(pill(page)).toHaveCount(0);
  await expect(posts(page)).toHaveCount(total + NEW_PER_FEED * 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await posts(page).first().getAttribute("data-news-key")).toContain("/new/");
  // The first post's source line is on screen and nothing covers it.
  const covered = await posts(page).first().evaluate((article) => {
    const line = article.querySelector("[data-feed-league]")!.parentElement!;
    const r = line.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) return "off screen";
    const hits = [0.1, 0.5, 0.9].map((fx) => document.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2));
    return hits.every((h) => !!h && article.contains(h)) ? null : hits.map((h) => h?.outerHTML.slice(0, 80)).join(" | ");
  });
  expect(covered).toBeNull();

  // More posts arriving while scrolled down bring the pill back.
  state.extra = 1;
  await pullToRefresh(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(pill(page)).toBeVisible({ timeout: 15_000 });
  await expect(pill(page)).toHaveText("2 new posts↑");
});

test("Feed: refresh at the top merges the new posts with no pill", async ({ page }) => {
  const state = { refreshed: false, delayMs: 0 };
  await mockFeeds(page, state);
  await gotoNews(page);
  const total = await settle(page);
  // Record any pill that ever mounts during the refresh.
  await page.evaluate(() => {
    const w = window as unknown as { __pillSeen?: boolean };
    w.__pillSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="feed-new-posts"]')) w.__pillSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });

  state.refreshed = true;
  state.delayMs = 500;
  await pullToRefresh(page);
  await expect(posts(page)).toHaveCount(total + NEW_PER_FEED * 2, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __pillSeen?: boolean }).__pillSeen)).toBe(false);
  await expect(page.getByText("Loading feed…")).toHaveCount(0);
  expect(await posts(page).first().getAttribute("data-news-key")).toContain("/new/");
});

test("Feed: with Oldest first, a refresh while scrolled down appends at the bottom with no pill", async ({ page }) => {
  const state = { refreshed: false, delayMs: 0 };
  await mockFeeds(page, state);
  await gotoNews(page, { newsOldestFirst: true });
  const total = await settle(page);
  const firstKey = await posts(page).first().getAttribute("data-news-key");

  state.refreshed = true;
  state.delayMs = 1_000;
  await pullToRefresh(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  const y0 = await page.evaluate(() => window.scrollY);
  await expect(posts(page)).toHaveCount(total + NEW_PER_FEED * 2, { timeout: 15_000 });
  await expect(pill(page)).toHaveCount(0);
  expect(await posts(page).first().getAttribute("data-news-key")).toBe(firstKey);
  expect(await posts(page).last().getAttribute("data-news-key")).toContain("/new/");
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y0)).toBeLessThan(5);
});

// Screenshots for the review (phone + desktop). Set FEED_SHOTS_DIR to write them.
test("Feed: screenshots", async ({ page }) => {
  const dir = process.env.FEED_SHOTS_DIR;
  test.skip(!dir, "FEED_SHOTS_DIR not set");
  const state = { refreshed: false, delayMs: 0 };
  await mockFeeds(page, state);
  await gotoNews(page);
  await settle(page);
  await page.screenshot({ path: `${dir}/desktop-all.png` });
  await chip(page, "NFL").click();
  await page.screenshot({ path: `${dir}/desktop-nfl-chip.png` });
  await chip(page, "All").click();

  state.refreshed = true;
  state.delayMs = 1_000;
  await pullToRefresh(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(pill(page)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${dir}/desktop-new-posts-pill.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/phone-top.png` });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/phone-scrolled.png` });
});
