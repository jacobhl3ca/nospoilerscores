import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// A1, the case Jacob actually hit (reproduced 9/23 on hidescore.com in
// Chromium and WebKit): most news clips are ESPN/MLB direct streams that play
// in a native <video controls>, not a YouTube iframe. One click on that
// player focused the <video>, every key on a focused <video> was dropped as
// "text entry", and H / ↓ / ↑ stopped working until the modal closed.
//
// The clip is a real WebM, recorded at test time with Playwright's own
// recorder, so this needs no codec the test browser lacks and no network.

let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(3000);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "", section: "ESPN" };
const ITEMS = [
  { ...base, id: "v1", headline: "Clip one: a late winner", articleUrl: "https://www.espn.com/video/clip?id=1", playbackUrl: "https://clips.example.test/one.webm" },
  { ...base, id: "v2", headline: "Clip two: the save of the night", articleUrl: "https://www.espn.com/video/clip?id=2", playbackUrl: "https://clips.example.test/two.webm" },
];

async function openFirstClip(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
    showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", newsTypeFilter: "all",
  })));
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
  await page.goto("/");
  await page.locator('button[aria-label="Play highlight"], button[aria-label="Open post"]', { hasText: /Clip one/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible();
  await expect(page.locator('[role="dialog"] video')).toBeVisible();
}

const title = (page: Page) => page.locator('[role="dialog"] .news-title').first();

// What the <video> itself holds: the level a listener hears.
const sound = (page: Page) => page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => ({ muted: v.muted, volume: Math.round(v.volume * 100) }));

test("after a click on the native player, H peeks, ↑/↓ set the volume and ⇧↓/⇧↑ page", async ({ page }) => {
  await openFirstClip(page);
  await expect(title(page)).toHaveText(/Clip one/);
  await expect(title(page)).not.toHaveClass(/\bpeek\b/);

  // Click the player itself: the native controls take the click and focus
  // the <video>.
  await page.locator('[role="dialog"] video').click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("VIDEO");

  await page.keyboard.press("h");
  await expect(title(page)).toHaveClass(/\bpeek\b/);

  // Jacob 10/11: on a video ↑/↓ are the volume, 5 a step. The clip autoplays
  // muted; ↑ unmutes it, and ↓ down to 0 mutes it again.
  expect(await sound(page)).toEqual({ muted: true, volume: 100 });
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => sound(page)).toEqual({ muted: false, volume: 5 });
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => sound(page)).toEqual({ muted: false, volume: 10 });
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => sound(page)).toEqual({ muted: false, volume: 5 });
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => sound(page)).toEqual({ muted: true, volume: 0 });
  // The plain pair no longer pages.
  await expect(title(page)).toHaveText(/Clip one/);

  await page.keyboard.press("Shift+ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);
  await page.keyboard.press("Shift+ArrowUp");
  await expect(title(page)).toHaveText(/Clip one/);
});

test("with keyboard focus on the video, H and Esc still reach the modal", async ({ page }) => {
  await openFirstClip(page);
  // Keyboard focus on the player (Tab-style), which the pointer bounce leaves alone.
  await page.locator('[role="dialog"] video').focus();
  await page.keyboard.press("h");
  await expect(title(page)).toHaveClass(/\bpeek\b/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// Jacob 10/11: Shift+arrow stopped paging once the player had focus (after
// fullscreen, a Tab, or a drag released off the element), because a focused
// <video> kept every arrow, Shift or not.
test("with keyboard focus on the video, ⇧↓ pages and plain ↑ does not", async ({ page }) => {
  await openFirstClip(page);
  await page.locator('[role="dialog"] video').focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);

  // Tab focus stays on the player, and the plain arrows stay the player's own
  // there (Chromium and Firefox set the volume, WebKit does nothing).
  await page.locator('[role="dialog"] video').focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("VIDEO");
});

test("with keyboard focus on the video, ⇧→ and ⇧← page", async ({ page }) => {
  await openFirstClip(page);
  await page.locator('[role="dialog"] video').focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(title(page)).toHaveText(/Clip two/);
  await page.locator('[role="dialog"] video').focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(title(page)).toHaveText(/Clip one/);
});

const activeTag = (page: Page) => page.evaluate(() => document.activeElement?.tagName);

// A drag on the player's own volume slider that ends past the edge of the
// <video> sends the pointerup somewhere else, so the element's bounce never
// ran and the video kept focus. The release is sent to the page body here: a
// real mouse release off the clip also closes the post.
test("a drag that ends off the player hands the keys back to the modal", async ({ page }) => {
  await openFirstClip(page);
  await page.locator('[role="dialog"] video').focus();
  await expect.poll(() => activeTag(page)).toBe("VIDEO");
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
  await expect.poll(() => activeTag(page)).not.toBe("VIDEO");

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => sound(page)).toEqual({ muted: false, volume: 5 });
  await page.keyboard.press("Shift+ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);
});

// The player's own fullscreen button leaves focus on the <video> on the way out.
test("after fullscreen, ↑ is the volume and ⇧↓ pages", async ({ page }) => {
  await openFirstClip(page);
  const video = page.locator('[role="dialog"] video');
  await video.click();
  await expect.poll(() => activeTag(page)).not.toBe("VIDEO");
  await page.keyboard.press("f");
  const inFullscreen = () => page.evaluate(() => !!document.fullscreenElement);
  await expect.poll(inFullscreen).toBe(true);
  await video.focus();
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(inFullscreen).toBe(false);
  await expect.poll(() => activeTag(page)).not.toBe("VIDEO");

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => sound(page)).toEqual({ muted: false, volume: 5 });
  await page.keyboard.press("Shift+ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);
});
