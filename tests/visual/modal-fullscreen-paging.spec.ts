import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// ↑/↓ inside a FULLSCREEN direct-stream clip (Jacob 10/11: "plays something on
// a full black screen"). f used to fullscreen the bare <video> on a Reddit or
// ESPN clip. ↓ unmounts that <video>, and the browsers disagree on what comes
// next: Chromium moves fullscreen to the modal root, Firefox refuses (a
// fullscreen request cannot go UP to an ancestor) and drops out, Safari keeps
// its native video layer up, black, while the next clip plays under it.
// f now fullscreens the modal ROOT for every post type, so the element that
// holds fullscreen never unmounts while you page.
//
// The clip is a real WebM, recorded at test time with Playwright's own
// recorder (same as modal-keys-news-native-video.spec.ts), so the third post
// really plays.

let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(6000);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

const NOW = Date.now();
const post = (i: number, headline: string, extra: Record<string, unknown>) => ({
  id: `fs-${i}`, headline, description: "", imageUrl: null, byline: "u/fixture", section: "r/nfl",
  published: new Date(NOW - i * 60_000).toISOString(),
  articleUrl: `https://www.reddit.com/r/nfl/comments/fs${i}/`, ...extra,
});
// Clip, text, clip: each ↓ swaps the player branch under the modal root.
const ITEMS = [
  post(1, "Paging one: a clip", { playbackUrl: "https://clips.example.test/one.webm" }),
  post(2, "Paging two: a text post", { body: "Body text." }),
  post(3, "Paging three: another clip", { playbackUrl: "https://clips.example.test/three.webm" }),
];

async function openFirstClip(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
    showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", newsTypeFilter: "all",
    showTextPosts: true,
  })));
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
  await page.goto("/");
  await page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: /Paging one/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible();
  await expect(page.locator('[role="dialog"] video')).toBeVisible();
}

// A clip's headline is a .news-title, a text post's is a heading, so match on
// the text.
const headline = (page: Page, text: RegExp) => page.locator('[role="dialog"]').getByText(text).first();

// What holds fullscreen, and whether it is the modal root (the ancestor of
// the dialog that every post type mounts under).
const fsState = (page: Page) => page.evaluate(() => {
  const fs = document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement || null;
  const dialog = document.querySelector('[role="dialog"]');
  return { tag: fs?.tagName ?? null, isRoot: !!fs && !!dialog && fs !== dialog && fs.contains(dialog) };
});
const ROOT = { tag: "DIV", isRoot: true };

test("f on a direct-stream clip fullscreens the modal root, and ↓ ↓ ↑ keep it", async ({ page }) => {
  await openFirstClip(page);
  await expect(headline(page, /Paging one/)).toBeVisible();

  await page.keyboard.press("f");
  await expect.poll(() => fsState(page)).toEqual(ROOT);

  // Clip → text post: the <video> unmounts, fullscreen stays on the root.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("dialog", { name: "Post" })).toBeVisible();
  await expect(headline(page, /Paging two/)).toBeVisible();
  await expect.poll(() => fsState(page)).toEqual(ROOT);

  // Text post → clip: the new <video> is on screen and playing, not under a
  // black layer.
  await page.keyboard.press("ArrowDown");
  await expect(headline(page, /Paging three/)).toBeVisible();
  const video = page.locator('[role="dialog"] video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect.poll(() => fsState(page)).toEqual(ROOT);
  const box = await video.evaluate((v) => {
    const r = v.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
  });
  expect(box.right - box.left).toBeGreaterThan(100);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.w + 1);
  expect(box.bottom).toBeLessThanOrEqual(box.h + 1);

  await page.keyboard.press("ArrowUp");
  await expect(headline(page, /Paging two/)).toBeVisible();
  await expect.poll(() => fsState(page)).toEqual(ROOT);
});

// A click on the clip in root fullscreen focuses the native <video>. Focus
// must go back to the dialog, or the video keeps ↓ for itself.
test("after a click on the clip in fullscreen, ↓ still pages", async ({ page }) => {
  await openFirstClip(page);
  await page.keyboard.press("f");
  await expect.poll(() => fsState(page)).toEqual(ROOT);

  await page.locator('[role="dialog"] video').click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("VIDEO");

  await page.keyboard.press("ArrowDown");
  await expect(headline(page, /Paging two/)).toBeVisible();
  await expect.poll(() => fsState(page)).toEqual(ROOT);
});

// The browser's own fullscreen button on the native controls puts the <video>
// itself in fullscreen. Paging from there must end on the root or out of
// fullscreen, never on an element that has left the page.
test("paging from the video's own fullscreen never leaves a detached fullscreen element", async ({ page, browserName }) => {
  // WebKit hands ↓ to a fullscreen <video> itself (the keydown target is the
  // VIDEO whatever has focus), and a native player keeps its own arrow keys
  // (nativeVideoOwnsKey), so nothing pages there.
  test.skip(browserName === "webkit", "WebKit sends the arrow keys to a fullscreen <video>, so ↓ does not page");
  await openFirstClip(page);
  // The native button cannot be clicked from a test; a trusted key press
  // carries the same user activation.
  await page.evaluate(() => {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "F9") return;
      const v = document.querySelector('[role="dialog"] video') as (HTMLVideoElement & { webkitRequestFullscreen?: () => void }) | null;
      if (v?.requestFullscreen) void v.requestFullscreen(); else v?.webkitRequestFullscreen?.();
    }, { once: true });
  });
  await page.keyboard.press("F9");
  await expect.poll(async () => (await fsState(page)).tag).toBe("VIDEO");

  await page.keyboard.press("ArrowDown");
  await expect(headline(page, /Paging two/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Post" })).toBeVisible();
  // Chromium moves fullscreen to the root. Firefox refuses, and then the
  // modal leaves fullscreen. Both show the next post.
  await expect.poll(async () => {
    const s = await fsState(page);
    return s.tag === null || s.isRoot;
  }).toBe(true);
});
