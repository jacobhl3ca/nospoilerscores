import { expect, test } from "@playwright/test";

// A Reddit GIF post plays as Reddit's own mp4 of the GIF and loops like a GIF
// (Jacob 10/4, r/baseball 1wx909w opened as a still image). Uses the real
// preview.redd.it URL on purpose: the point is that the browser plays it.
const GIF_MP4 =
  "https://preview.redd.it/b96c7i43eeth1.gif?format=mp4&s=111a442522ef0ded9852c57e98f657bc91d4c589";

test("a Reddit GIF post plays and loops in the player", async ({ page }) => {
  const qs = new URLSearchParams({
    hs: GIF_MP4,
    hu: "https://www.reddit.com/r/baseball/comments/1wx909w/",
    hl: "r/baseball",
    ht: "GIF post",
  });
  await page.goto(`/?${qs}`);
  const video = page.locator("video").first();
  await expect(video).toBeAttached();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);
  await page.waitForTimeout(2000);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, t: v.currentTime > 0 })), { timeout: 15_000 })
    .toEqual({ paused: false, t: true });
});

test("a normal clip does not loop", async ({ page }) => {
  const qs = new URLSearchParams({
    hs: "https://v.redd.it/6p3dcdfvkdth1/HLSPlaylist.m3u8",
    hu: "https://www.reddit.com/r/baseball/",
    hl: "r/baseball",
    ht: "Video post",
  });
  await page.goto(`/?${qs}`);
  const video = page.locator("video").first();
  await expect(video).toBeAttached();
  expect(await video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
});
