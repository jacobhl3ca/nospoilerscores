import { expect, test } from "@playwright/test";

// Jacob 2026-09-08: "when i unhide and headlines are hidden by default … when i
// switch to next or previous news item all should be hidden. even when i go back
// to the previous one."
//
// The modal's per-item reveal (PeekBlur) is reset by RE-KEYING it on `postKey`.
// This spec is the audit probe: peek the headline, page next, page back, and
// assert the incoming headline is blurred — including on the frames right after
// the click, so a one-frame unblurred flash of the next spoiler also fails.

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

const HEADLINE = 'button[aria-label="Open post"]:has(.news-title)';

async function gotoNews(page: import("@playwright/test").Page) {
  await page.addInitScript((base) => {
    localStorage.setItem("nss-preferences", JSON.stringify(base));
  }, BASE_PREFS);
  await page.goto("/");
  const all = page.locator(HEADLINE);
  await expect(all.first()).toBeVisible({ timeout: 30_000 });
  let last = -1;
  await expect.poll(async () => {
    const n = await all.count();
    const stable = n > 0 && n === last;
    last = n;
    return stable;
  }, { timeout: 20_000, intervals: [400] }).toBe(true);
}

// Every .news-title inside the open dialog, with its settled blur + peek class.
async function modalTitles(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return [];
    return [...dlg.querySelectorAll(".news-title")].map((el) => ({
      text: (el.textContent || "").trim().slice(0, 60),
      peek: el.classList.contains("peek"),
      filter: getComputedStyle(el).filter,
    }));
  });
}

test("paging the news modal re-hides the headline (next, and back again)", async ({ page }) => {
  await gotoNews(page);

  // Open the first post whose modal exposes a Next pager.
  await page.locator(HEADLINE).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next post" }).first()).toBeEnabled();

  const before = await modalTitles(page);
  expect(before.length).toBeGreaterThan(0);
  const headlineA = before[0].text;
  expect(before.every((t) => !t.peek)).toBe(true);

  // Reveal it — the whole point of the per-item peek.
  await dialog.locator(".news-title").first().click();
  await expect.poll(async () => (await modalTitles(page))[0]?.peek, { timeout: 3_000 }).toBe(true);

  // Sample EVERY animation frame across the step, so a single unblurred frame
  // of the incoming headline is caught, not just the settled state.
  await page.evaluate(() => {
    (window as unknown as { __peekFrames: unknown[] }).__peekFrames = [];
    const tick = () => {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        for (const el of dlg.querySelectorAll(".news-title")) {
          (window as unknown as { __peekFrames: unknown[] }).__peekFrames.push({
            text: (el.textContent || "").trim().slice(0, 60),
            peek: el.classList.contains("peek"),
          });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.getByRole("button", { name: "Next post" }).first().click();
  await page.waitForTimeout(600);

  const afterNext = await modalTitles(page);
  const headlineB = afterNext[0]?.text ?? "";
  expect(headlineB).not.toBe(headlineA);

  const frames = await page.evaluate(() => (window as unknown as { __peekFrames: { text: string; peek: boolean }[] }).__peekFrames);
  const leaked = frames.filter((f) => f.text !== headlineA && f.peek);

  // 1. Settled state: post B is blurred.
  expect(afterNext.map((t) => t.peek)).toEqual(afterNext.map(() => false));
  expect(afterNext[0].filter).toMatch(/blur\(/);
  // 2. No frame ever showed post B's headline in the clear.
  expect(leaked.slice(0, 3)).toEqual([]);

  // 3. Going BACK to post A re-hides it too.
  await page.getByRole("button", { name: "Previous post" }).first().click();
  await page.waitForTimeout(600);
  const afterPrev = await modalTitles(page);
  expect(afterPrev[0].text).toBe(headlineA);
  expect(afterPrev[0].peek).toBe(false);
  expect(afterPrev[0].filter).toMatch(/blur\(/);
});
