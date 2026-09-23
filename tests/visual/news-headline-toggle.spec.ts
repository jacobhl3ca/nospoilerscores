import { expect, test } from "@playwright/test";

// Two regressions Jacob hit together on 2026-08-10, both in the Cards news view:
//   1. The whole toolbar pill row (Headlines / Media / Videos only / Text posts)
//      was invisible — .sticky-seam-cover is a fixed opaque bar at z-35 whose
//      height spans the toolbar's band, and the toolbar sat at z-30 underneath.
//      A visibility assertion alone would NOT have caught this: the element was
//      laid out, sized, and "visible" to the DOM — it was painted over. So the
//      check here is a hit-test, which is the only thing that fails on z-order.
//   2. The list headline had been rebound to a show/hide spoiler toggle, which
//      swallowed the open: clicking a headline on the news homepage un-blurred
//      it instead of opening the article/video. Jacob's rule (8/10) is that
//      show/hide-in-place belongs to the MODAL only — in the list, a headline
//      click opens the post like any other link.

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

async function gotoNews(page: import("@playwright/test").Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
  }, { base: BASE_PREFS, update: extra });
  await page.goto("/");
}

test("news toolbar pills are on top of the sticky seam cover, not under it", async ({ page }) => {
  await gotoNews(page);

  // The chip's accessible name is its aria-label, not the visible "Headlines"
  // text (the label is display:none on phones, so the name is pinned).
  const headlinesChip = page.getByRole("button", { name: "Toggle headline reveal" }).first();
  await expect(headlinesChip).toBeVisible();

  // Hit-test the chip's own center: whatever the browser would deliver a click
  // to must be the chip (or a descendant of it). Under the seam cover this
  // resolves to .sticky-seam-cover instead.
  const topmost = await headlinesChip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      insideChip: !!hit && el.contains(hit),
      hitClass: hit ? (hit as HTMLElement).className : null,
    };
  });
  expect(topmost.hitClass).not.toContain("sticky-seam-cover");
  expect(topmost.insideChip).toBe(true);

  // Same after scrolling, where both the toolbar and the cover are pinned.
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);
  const afterScroll = await headlinesChip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  expect(afterScroll).toBe(true);
});

// The thumbnail, the headline, and the › chevron all say "Open post" now, so
// pin to the one that actually wraps the headline text.
const HEADLINE = 'button[aria-label="Open post"]:has(.news-title)';

// Each source card fetches on its own, so the column keeps growing for a second
// or two and a bare `.first()` silently re-points at whatever row landed on top
// in between — it will happily assert against a row it never clicked. Wait for
// the count to hold still, then pin the locator to that row's TEXT so it stays
// the same element for the rest of the test.
async function pinnedHeadline(page: import("@playwright/test").Page) {
  const all = page.locator(HEADLINE);
  await expect(all.first()).toBeVisible({ timeout: 30_000 });
  let last = -1;
  await expect.poll(async () => {
    const n = await all.count();
    const stable = n > 0 && n === last;
    last = n;
    return stable;
  }, { timeout: 20_000, intervals: [400] }).toBe(true);

  const text = (await all.first().locator(".news-title").textContent())?.trim() ?? "";
  expect(text.length).toBeGreaterThan(0);
  return page.locator(HEADLINE).filter({ hasText: text }).first();
}

// Assert the COMPUTED filter, not just the class, so a CSS specificity mistake
// in .peek can't pass silently. Poll rather than read once: .news-title animates
// filter over 150ms, so a bare read lands mid-transition on "blur(6.7px)", which
// is neither "none" nor a settled blur.
const expectBlurred = (title: import("@playwright/test").Locator) =>
  expect.poll(() => title.evaluate((el) => getComputedStyle(el).filter), { timeout: 3_000 })
    .toMatch(/blur\(([6-9]|\d\d)/);

test("a list headline click opens the post — it never un-blurs in place", async ({ page }) => {
  await gotoNews(page);

  const headline = await pinnedHeadline(page);
  const title = headline.locator(".news-title");

  await expectBlurred(title);

  await headline.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("a globally revealed headline still opens on click rather than re-blurring", async ({ page }) => {
  await gotoNews(page, { revealNewsTitles: true });

  const headline = await pinnedHeadline(page);

  // The regression this guards: reading html.reveal-news-titles at click time
  // and flipping the row back to blurred instead of opening it.
  await headline.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
