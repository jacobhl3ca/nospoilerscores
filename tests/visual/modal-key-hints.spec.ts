import { expect, test } from "@playwright/test";

// The post modal's key legend, bottom-right (Jacob 9/8). The rows themselves are
// unit-tested (tests/modal-key-legend.test.ts); what can only be checked in a
// browser is the part that isn't pure — where the panel lands, that the ✕ hands
// the corner to an Undo, that the Undo expires and leaves the zone clear, that
// "?" brings it back, and that the dismissal survives the next post.

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

// Same pinning as news-headline-toggle.spec.ts: each source card fetches on its
// own, so the column keeps growing and a bare .first() re-points mid-test.
const HEADLINE = 'button[aria-label="Open post"]:has(.news-title)';

async function openAPost(page: import("@playwright/test").Page) {
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
  await page.locator(HEADLINE).filter({ hasText: text }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
}

const panel = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: "Keyboard shortcuts" });
const undo = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Undo" });

test("the legend sits in the bottom-right corner and names ? as the way back", async ({ page }) => {
  await gotoNews(page);
  await openAPost(page);

  await expect(panel(page)).toBeVisible();

  // Bottom-right quadrant of a 1280×800 viewport, and inside it.
  const box = (await panel(page).boundingBox())!;
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThan(640);
  expect(box.y).toBeGreaterThan(400);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThanOrEqual(800);

  // Esc and ? are the two rows that are live in every state, so they're the two
  // the panel must always print — ? is how you undo the ✕ a week later.
  await expect(panel(page).locator("kbd", { hasText: "Esc" })).toBeVisible();
  await expect(panel(page).locator("kbd").filter({ hasText: /^\?$/ })).toBeVisible();
  await expect(panel(page).getByText("Show / hide these")).toBeVisible();
});

test("the legend stands on the ‹ › ✕ cluster, and the page's Keys pill steps aside", async ({ page }) => {
  await gotoNews(page);
  // The page's own guide is up before a post opens …
  await expect(page.locator(".hs-controls-hint")).toBeVisible();
  await openAPost(page);
  // … and gone while the modal prints its own list.
  await expect(page.locator(".hs-controls-hint")).toHaveCount(0);

  const p = (await panel(page).boundingBox())!;
  const c = (await page.getByTestId("modal-controls").boundingBox())!;
  // Directly above: no overlap, a small gap, right edges flush.
  expect(p.y + p.height).toBeLessThanOrEqual(c.y);
  expect(c.y - (p.y + p.height)).toBeLessThanOrEqual(12);
  expect(Math.abs((p.x + p.width) - (c.x + c.width))).toBeLessThanOrEqual(1);

  // The Undo takes the same spot, so it clears the cluster too.
  await panel(page).getByRole("button", { name: "Hide keyboard shortcuts" }).click();
  const u = (await undo(page).boundingBox())!;
  expect(u.y + u.height).toBeLessThanOrEqual(c.y);
});

test("the legend is click-through — it can't swallow the video's own controls", async ({ page }) => {
  await gotoNews(page);
  await openAPost(page);

  // The corner lands ON the media in a desktop window, over the tail of the
  // scrubber. A hit-test is the only thing that catches a passive panel eating
  // those clicks — it is laid out and "visible" either way.
  const hit = await panel(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
    return { insidePanel: !!at && el.contains(at) };
  });
  expect(hit.insidePanel).toBe(false);

  // Its own ✕ is the exception, and it has to stay clickable.
  const x = panel(page).getByRole("button", { name: "Hide keyboard shortcuts" });
  const onX = await x.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && el.contains(at);
  });
  expect(onX).toBe(true);
});

test("✕ hands the corner to an Undo, and the Undo puts the panel back", async ({ page }) => {
  await gotoNews(page);
  await openAPost(page);

  await panel(page).getByRole("button", { name: "Hide keyboard shortcuts" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(undo(page)).toBeVisible();
  // Dismissal is written at the ✕, not at expiry — leaving mid-window counts.
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBe("1");

  await undo(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(undo(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBeNull();
});

test("an Undo nobody takes clears the corner off the video by itself", async ({ page }) => {
  await gotoNews(page);
  await openAPost(page);

  await panel(page).getByRole("button", { name: "Hide keyboard shortcuts" }).click();
  await expect(undo(page)).toBeVisible();

  // UNDO_MS is 6s; give it room and assert the zone ends up genuinely empty.
  await expect(undo(page)).toHaveCount(0, { timeout: 12_000 });
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("? shows and hides the legend, and reopens one dismissed in an earlier session", async ({ page }) => {
  await gotoNews(page);
  // A browser that said no last week: the panel starts gone.
  await page.evaluate(() => localStorage.setItem("hs.keyHintsOff", "1"));
  await openAPost(page);
  await expect(panel(page)).toHaveCount(0);

  await page.keyboard.press("?");
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBeNull();

  await page.keyboard.press("?");
  await expect(panel(page)).toHaveCount(0);
  // Hidden by ?, not by the ✕ — no Undo, and the choice is remembered.
  await expect(undo(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBe("1");
});

test("the modal's other keys still work with the legend up", async ({ page }) => {
  await gotoNews(page);
  await openAPost(page);
  await expect(panel(page)).toBeVisible();

  // Esc is one of the rows the panel prints; prove the row is true.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
