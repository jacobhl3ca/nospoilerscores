import { expect, test } from "@playwright/test";

// News toolbar prefs that were honored on one surface and ignored on another
// (Jacob 9/14: "videos only toggle doesn't work properly").
//   1. Videos only wins over Text posts — Cards. Text posts has defaulted ON
//      since 8/9, and the 7/16 rule let it re-admit text rows under Videos only,
//      so for a default (Reddit-only) board the chip lit up and nothing changed.
//   2. Same rule in the Feed view, plus the Videos-only empty-state copy.
//   3. Oldest first flips the aligned video strip's cells, not just the columns.
//   4. Reset to defaults clears newsOldestFirst.
// Run against `localhost` (not 127.0.0.1) — the dev QA cookie/prefs path keys
// on the host name.

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
};

type Page = import("@playwright/test").Page;

async function gotoNews(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
  }, { base: BASE_PREFS, update: extra });
  await page.goto("/");
}

// Every source card fetches on its own, so wait for the row count to hold
// still before asserting over the set (same guard as news-headline-toggle).
async function settle(page: Page, locator: import("@playwright/test").Locator) {
  let last = -1;
  await expect.poll(async () => {
    const n = await locator.count();
    const stable = n === last;
    last = n;
    return stable;
  }, { timeout: 30_000, intervals: [600] }).toBe(true);
  return last;
}

// The play triangle every clip-bearing row draws (NewsColumn TextRow badge,
// NewsFeed media tile, AlignedVideoStrip cells) — the one visual cue that a row
// is a video and not an article/text post.
const PLAY_GLYPH = 'svg path[d="M8 5v14l11-7z"]';
// A Cards-view text-source row = the "Open post" button wrapping the headline
// (the thumbnail beside it is its own "Open post" button, and that's where the
// play glyph lives — so assert on the row's parent, not the headline button).
// Video-variant cards render "Play highlight" buttons, which say so in the name.
const CARD_HEADLINE = 'button[aria-label="Open post"]:has(.news-title)';

test("Cards: Videos only hides text posts even with Text posts on", async ({ page }) => {
  await gotoNews(page, { newsVideosOnly: true, showTextPosts: true });

  // The skeletons clear per source; wait for the first column to settle.
  await expect(page.locator('[role="status"]:has-text("Loading")').first()).toBeHidden({ timeout: 30_000 }).catch(() => {});
  const rows = page.locator(CARD_HEADLINE);
  const n = await settle(page, rows);

  // The regression: a Reddit-only default board is mostly text posts, and with
  // Text posts ON they all survived Videos only. Now none may render at all —
  // not merely be CSS-hidden (.show-text-posts is ON here, so the CSS rule
  // would have SHOWN them).
  await expect(page.locator(".news-textpost")).toHaveCount(0);

  const playCards = page.locator('button[aria-label^="Play highlight:"]');
  if (n === 0 && (await playCards.count()) === 0) {
    // A day with no Reddit clips: the column says why, rather than going blank.
    await expect(page.getByText("No videos here right now.").first()).toBeVisible();
    return;
  }
  for (let i = 0; i < n; i++) {
    await expect(rows.nth(i).locator("xpath=..").locator(PLAY_GLYPH)).toHaveCount(1);
  }
});

test("Feed: Videos only hides text posts, and says so when nothing is left", async ({ page }) => {
  await gotoNews(page, { newsVideosOnly: true, showTextPosts: true, newsFeedView: true });

  const status = page.getByRole("status").filter({ hasText: /Loading feed/ });
  await expect(status).toHaveCount(0, { timeout: 30_000 });

  const posts = page.locator("article");
  const n = await settle(page, posts);
  if (n === 0) {
    // Cards' empty-state copy, not the bare "No posts to show." — the user
    // needs to know it's the Videos only chip doing this.
    await expect(page.getByText("No videos here right now.")).toBeVisible();
    await expect(page.getByText("Turn off Videos only, or widen Source in the filter menu.")).toBeVisible();
    return;
  }
  for (let i = 0; i < n; i++) {
    await expect(posts.nth(i).locator('button[aria-label^="Play video:"]')).toHaveCount(1);
  }
});

// A 3-column board whose every column LEADS with a video source activates the
// aligned strip: pin two leagues with prebaked video feeds and narrow the
// funnel to Top videos so nothing else can lead.
const STRIP_PREFS = {
  firstLeague: "mlb",
  secondLeague: "mls",
  newsTypeFilters: ["topvideos"],
  newsTypeFilter: "topvideos",
};
const STRIP_CELL = 'button[aria-label^="Play highlight:"]';

// The strip is the first grid whose direct children are subgrid cards; its
// first column's cells, in DOM order.
async function firstStripColumnHeadlines(page: Page) {
  const col = page.locator('div[style*="subgrid"]').first();
  await expect(col).toBeVisible({ timeout: 30_000 });
  const cells = col.locator(STRIP_CELL);
  await expect(cells.first()).toBeVisible({ timeout: 30_000 });
  await settle(page, cells);
  return cells.allTextContents();
}

test("strip: Oldest first reverses the video cells with the columns", async ({ page }) => {
  await gotoNews(page, { ...STRIP_PREFS, newsOldestFirst: false });
  const newest = await firstStripColumnHeadlines(page);
  expect(newest.length).toBeGreaterThan(1);

  await gotoNews(page, { ...STRIP_PREFS, newsOldestFirst: true });
  const oldest = await firstStripColumnHeadlines(page);

  // Same feed, both loads: the first cell under Oldest first is the LAST cell
  // of the newest-first order. (The strip caps each column at the tallest
  // column's count; col 1's own feed is what fills it here, so no cap bites.)
  expect(oldest.length).toBe(newest.length);
  expect(oldest[0]).toBe(newest[newest.length - 1]);
  expect(oldest).toEqual([...newest].reverse());
});

test("Reset to defaults clears Oldest first", async ({ page }) => {
  await gotoNews(page, { newsOldestFirst: true });
  await expect(page.getByRole("button", { name: "Open settings", exact: true })).toBeVisible({ timeout: 30_000 });

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset to defaults" });
  await reset.scrollIntoViewIfNeeded();
  await reset.click();

  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("nss-preferences");
    return raw ? Object.prototype.hasOwnProperty.call(JSON.parse(raw), "newsOldestFirst") : "missing";
  }), { timeout: 5_000 }).toBe(false);
});
