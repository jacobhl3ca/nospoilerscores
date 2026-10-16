import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// GitHub #290: the iOS app stopped in WebKit's player layer on AVKit's
// picture-in-picture path. Chromium cannot reproduce that crash. This spec
// checks the web half of the guard (src/lib/nativeCrashGuards.ts): inside the
// iOS app the clip player has picture-in-picture off and the shell gets a fixed
// breadcrumb; in a browser nothing changes. "The iOS app" is emulated the way
// the shell looks to the page: Capacitor's bridge plus the hsBreadcrumb
// message handler.

let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(2000);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "", section: "ESPN" };
const ITEMS = [
  { ...base, id: "v1", headline: "Clip one", articleUrl: "https://www.espn.com/video/clip?id=1", playbackUrl: "https://clips.example.test/one.webm" },
  { ...base, id: "v2", headline: "Clip two", articleUrl: "https://www.espn.com/video/clip?id=2", playbackUrl: "https://clips.example.test/two.webm" },
];

async function openFirstClip(page: Page, asIosApp: boolean) {
  await page.addInitScript((app) => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
      showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", newsTypeFilter: "all",
    }));
    const w = window as unknown as Record<string, unknown>;
    w.__crumbs = [];
    w.webkit = { messageHandlers: { hsBreadcrumb: { postMessage: (m: unknown) => (w.__crumbs as unknown[]).push(m) } } };
    if (app) w.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: {} };
  }, asIosApp);
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

const pip = (page: Page) => page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => ({
  property: v.disablePictureInPicture,
  attribute: v.hasAttribute("disablepictureinpicture"),
}));
const crumbs = (page: Page) => page.evaluate(() => (window as unknown as { __crumbs: unknown[] }).__crumbs);

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("in the iOS app the clip player has picture-in-picture off and the shell gets a fixed breadcrumb", async ({ page }) => {
      await openFirstClip(page, true);
      await expect.poll(() => pip(page)).toEqual({ property: true, attribute: true });
      await expect.poll(() => crumbs(page)).toContainEqual({ category: "video", message: "player started" });
      // Only the fixed strings: nothing from the post reaches the shell.
      for (const c of await crumbs(page)) expect(JSON.stringify(c)).not.toMatch(/Clip|espn|example/i);
    });

    test("in a browser the clip player keeps picture-in-picture and posts nothing", async ({ page }) => {
      await openFirstClip(page, false);
      await expect.poll(() => page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
      expect(await pip(page)).toEqual({ property: false, attribute: false });
      expect(await crumbs(page)).toEqual([]);
    });
  });
}
