import { expect, test, type Page } from "@playwright/test";
import { lastYtSeek, openFakeStreamClip, openFakeYouTubeClip } from "./fake-video";

// Owner report 10/9: in the News video player, going BACK in a clip (tap or
// drag on the bar, or ⟲5) jumped the video about 45s AHEAD.
//
// Cause: the YouTube IFrame API's getCurrentTime() is a cached copy of what
// the iframe last posted, and it keeps the OLD position until a seek has
// finished buffering. Tap the bar back from 0:60 to 0:09, then tap ⟲5: ⟲5 read
// 0:60 and sent seekTo(55). The fake player (fake-video.ts) reproduces that lag (its
// reported time trails a seek by 1.5s), and every test asserts the LAST seek
// the player received, which is where the clip ends up.

async function tapBarAt(page: Page, frac: number) {
  const bar = page.getByRole("slider", { name: /Seek through the clip/ });
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + box.width * frac, box.y + box.height / 2);
}

test.describe("YouTube player (spoiler-safe controls)", () => {
  test("bar tap back, then ⟲5, lands 5s before the chosen point", async ({ page }) => {
    const dialog = await openFakeYouTubeClip(page, { youtubeNativeControls: false });
    await tapBarAt(page, 0.1);
    await expect.poll(async () => (await lastYtSeek(page))?.t).toBeCloseTo(9, 0);

    // The player still reports 0:60 here (it has not caught up with the seek).
    await dialog.getByRole("button", { name: "Back 5 seconds" }).click();
    const last = await lastYtSeek(page);
    expect(last!.t, "⟲5 read the stale 0:60 and jumped ahead").toBeLessThan(9);
    expect(last!.t).toBeGreaterThanOrEqual(3);
    expect(last!.t).toBeLessThanOrEqual(5);
  });

  test("a drag back commits the release point as the final seek", async ({ page }) => {
    await openFakeYouTubeClip(page, { youtubeNativeControls: false });
    const bar = page.getByRole("slider", { name: /Seek through the clip/ });
    const box = (await bar.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    for (const f of [0.45, 0.35, 0.25, 0.2]) await page.mouse.move(box.x + box.width * f, y);
    await page.mouse.up();
    const seeks = await page.evaluate(() => (window as unknown as { __seeks: { t: number; ahead: boolean }[] }).__seeks);
    const last = seeks[seeks.length - 1];
    expect(last.t).toBeCloseTo(18, 0);
    expect(last.ahead).toBe(true);
    // The moves of the drag do not each ask YouTube to fetch.
    expect(seeks.slice(0, -1).every((s) => s.ahead === false)).toBe(true);
  });

  test("← right after a bar seek steps back from the new point", async ({ page }) => {
    await openFakeYouTubeClip(page, { youtubeNativeControls: false });
    await tapBarAt(page, 0.3);
    await expect.poll(async () => (await lastYtSeek(page))?.t).toBeCloseTo(27, 0);
    await page.getByRole("dialog").focus();
    await page.keyboard.press("ArrowLeft");
    const last = await lastYtSeek(page);
    expect(last!.t).toBeGreaterThanOrEqual(21);
    expect(last!.t).toBeLessThanOrEqual(24);
  });

  test("90% cap holds on the bar", async ({ page }) => {
    await openFakeYouTubeClip(page, { youtubeNativeControls: false });
    await tapBarAt(page, 0.99);
    await expect.poll(async () => (await lastYtSeek(page))?.t).toBeCloseTo(81, 0);
  });
});

test.describe("direct-stream <video> player", () => {
  test("bar tap back, then ⟲5, in the landscape player", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFakeStreamClip(page);
    await page.setViewportSize({ width: 844, height: 390 });
    const controls = page.getByTestId("landscape-controls");
    await expect(controls).toBeVisible();
    await tapBarAt(page, 0.1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vseeks: number[] }).__vseeks.at(-1))).toBeCloseTo(9, 0);
    await controls.getByRole("button", { name: "Back 5 seconds" }).click();
    expect(await page.evaluate(() => (window as unknown as { __vseeks: number[] }).__vseeks.at(-1))).toBeCloseTo(4, 0);
  });

  test("← steps back from where the clip is, not ahead", async ({ page }) => {
    await openFakeStreamClip(page);
    await page.getByRole("dialog").focus();
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => (window as unknown as { __vseeks: number[] }).__vseeks.at(-1))).toBeCloseTo(55, 0);
    await page.keyboard.press("2");
    expect(await page.evaluate(() => (window as unknown as { __vseeks: number[] }).__vseeks.at(-1))).toBeCloseTo(18, 0);
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => (window as unknown as { __vseeks: number[] }).__vseeks.at(-1))).toBeCloseTo(13, 0);
  });
});
