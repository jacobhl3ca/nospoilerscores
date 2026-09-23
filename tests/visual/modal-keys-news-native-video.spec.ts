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
  await page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: /Clip one/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible();
  await expect(page.locator('[role="dialog"] video')).toBeVisible();
}

const title = (page: Page) => page.locator('[role="dialog"] .news-title').first();

test("after a click on the native player, H peeks and ↓ pages", async ({ page }) => {
  await openFirstClip(page);
  await expect(title(page)).toHaveText(/Clip one/);
  await expect(title(page)).not.toHaveClass(/\bpeek\b/);

  // Click the player itself: the native controls take the click and focus
  // the <video>.
  await page.locator('[role="dialog"] video').click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("VIDEO");

  await page.keyboard.press("h");
  await expect(title(page)).toHaveClass(/\bpeek\b/);

  await page.keyboard.press("ArrowDown");
  await expect(title(page)).toHaveText(/Clip two/);
  await page.keyboard.press("ArrowUp");
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
