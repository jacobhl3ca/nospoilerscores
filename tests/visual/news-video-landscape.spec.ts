import { devices, expect, test, type Page } from "@playwright/test";
import { openFakeStreamClip, openFakeYouTubeClip } from "./fake-video";

// The landscape player (owner 10/9): a phone on its side gets the clip full
// screen, controls in a thin layer that fades after 3s and returns on a tap,
// every control at least 44px, the YouTube title cover still on, and a turn
// back to portrait keeps the same player at the same point.
//
// iPhone 15 Pro without defaultBrowserType, so the same spec runs in the
// Chromium project and in WebKit on the mini.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...IPHONE } = devices["iPhone 15 Pro"];
const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT = { width: 390, height: 844 };

async function expectFillsFrame(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  // object-fit: contain: the 16:9 frame meets the screen on one axis.
  expect(Math.max(box.width / LANDSCAPE.width, box.height / LANDSCAPE.height)).toBeGreaterThan(0.98);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(LANDSCAPE.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(LANDSCAPE.height + 0.5);
}

async function expectControlsAtLeast44(page: Page) {
  const controls = page.getByTestId("landscape-controls");
  const targets = controls.locator("button, [role=slider]");
  const n = await targets.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) {
    const b = (await targets.nth(i).boundingBox())!;
    const name = (await targets.nth(i).getAttribute("aria-label")) ?? "";
    expect(b.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(b.width, `${name} width`).toBeGreaterThanOrEqual(44);
  }
}

async function expectNoPageScroll(page: Page) {
  const scroll = await page.evaluate(() => {
    window.scrollTo(0, 400);
    return { y: window.scrollY, sh: document.documentElement.scrollHeight, ih: window.innerHeight };
  });
  expect(scroll.y).toBe(0);
  expect(scroll.sh).toBeLessThanOrEqual(scroll.ih + 1);
}

test.describe("phone landscape", () => {
  test.use({ ...IPHONE, viewport: LANDSCAPE });

  test("YouTube: fills the frame, 44px controls, fade and tap back, title stays covered", async ({ page }) => {
    const dialog = await openFakeYouTubeClip(page, { youtubeNativeControls: false, maskVideoTitle: true });
    const controls = page.getByTestId("landscape-controls");
    await expect(controls).toHaveAttribute("data-shown", "true");
    await expectFillsFrame(page, "iframe#yt-player");
    await expectControlsAtLeast44(page);
    for (const name of ["Back 5 seconds", "Pause", "Forward 5 seconds", "Close"]) {
      await expect(controls.getByRole("button", { name })).toBeVisible();
    }
    await expect(controls.getByRole("slider", { name: /Seek through the clip/ })).toBeVisible();
    await expectNoPageScroll(page);

    // Title cover: still drawn, along the top of the frame.
    const mask = (await dialog.getByTestId("yt-title-mask").boundingBox())!;
    const frame = (await page.locator("iframe#yt-player").boundingBox())!;
    expect(Math.abs(mask.y - frame.y)).toBeLessThan(1);
    expect(mask.width).toBeGreaterThanOrEqual(frame.width - 1);
    await page.screenshot({ path: test.info().outputPath("landscape-844x390-youtube.png") });

    // Fades after 3s, and takes no taps while faded.
    await expect(controls).toHaveAttribute("data-shown", "false", { timeout: 4500 });
    await expect.poll(() => controls.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await page.screenshot({ path: test.info().outputPath("landscape-844x390-youtube-faded.png") });

    // A tap on the picture brings it back, and does not pause the clip.
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await expect(controls).toHaveAttribute("data-shown", "true");
    await page.waitForTimeout(450);
    await expect(dialog).toHaveAttribute("data-player-state", "playing");

    // With the controls up, a tap is play/pause as before.
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await expect(dialog).toHaveAttribute("data-player-state", "paused");
  });

  test("YouTube's own controls: no second bar, buttons still 44px", async ({ page }) => {
    await openFakeYouTubeClip(page, { youtubeNativeControls: true });
    const controls = page.getByTestId("landscape-controls");
    await expect(controls).toBeVisible();
    await expect(controls.getByRole("slider")).toHaveCount(0);
    await expectFillsFrame(page, "iframe#yt-player");
    await expectControlsAtLeast44(page);
  });

  test("direct stream: fills the frame, 44px controls, fade and tap back", async ({ page }) => {
    await openFakeStreamClip(page);
    const controls = page.getByTestId("landscape-controls");
    await expect(controls).toHaveAttribute("data-shown", "true");
    await expectFillsFrame(page, "[role=dialog] video");
    await expectControlsAtLeast44(page);
    // Our layer replaces the browser's own controls here.
    expect(await page.locator("[role=dialog] video").evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
    await expect(controls.getByRole("button", { name: "Next post" })).toBeEnabled();
    await expectNoPageScroll(page);
    await page.screenshot({ path: test.info().outputPath("landscape-844x390-stream.png") });

    await expect(controls).toHaveAttribute("data-shown", "false", { timeout: 4500 });
    const v = (await page.locator("[role=dialog] video").boundingBox())!;
    await page.mouse.click(v.x + v.width / 2, v.y + v.height / 2);
    await expect(controls).toHaveAttribute("data-shown", "true");

    // Next post from the layer.
    await controls.getByRole("button", { name: "Next post" }).click();
    await expect(page.locator('[role="dialog"] .news-title').first()).toHaveText(/Clip two/);
  });
});

test.describe("turning the phone", () => {
  test.use({ ...IPHONE, viewport: PORTRAIT });

  test("portrait → landscape → portrait keeps the same player and position", async ({ page }) => {
    const dialog = await openFakeYouTubeClip(page, { youtubeNativeControls: false });
    await expect(page.getByTestId("landscape-controls")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("portrait-390x844-youtube.png") });
    await page.locator("iframe#yt-player").evaluate((el) => { el.setAttribute("data-same", "1"); });
    // Seek somewhere first, so "position" means something.
    await dialog.getByRole("button", { name: "Back 5 seconds" }).click();
    const seeksBefore = await page.evaluate(() => (window as unknown as { __seeks: unknown[] }).__seeks.length);

    await page.setViewportSize(LANDSCAPE);
    await expect(page.getByTestId("landscape-controls")).toBeVisible();
    await expectFillsFrame(page, "iframe#yt-player");

    await page.setViewportSize(PORTRAIT);
    await expect(page.getByTestId("landscape-controls")).toHaveCount(0);
    // Same iframe (never rebuilt), no seek sent by the turn.
    await expect(page.locator('iframe#yt-player[data-same="1"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __ytBuilt: number }).__ytBuilt)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __seeks: unknown[] }).__seeks.length)).toBe(seeksBefore);
    // The normal modal is back: the close cluster and the strip under the video.
    await expect(page.getByTestId("modal-controls")).toBeVisible();
    await expect(dialog.getByRole("slider", { name: /Seek through the clip/ })).toBeVisible();
  });

  test("direct stream keeps its <video> and position across the turn", async ({ page }) => {
    await openFakeStreamClip(page);
    await page.locator("[role=dialog] video").evaluate((el: HTMLVideoElement) => { el.setAttribute("data-same", "1"); el.currentTime = 42; });
    await page.screenshot({ path: test.info().outputPath("portrait-390x844-stream.png") });
    await page.setViewportSize(LANDSCAPE);
    await expect(page.getByTestId("landscape-controls")).toBeVisible();
    await page.setViewportSize(PORTRAIT);
    await expect(page.getByTestId("landscape-controls")).toHaveCount(0);
    const v = page.locator('[role=dialog] video[data-same="1"]');
    await expect(v).toHaveCount(1);
    expect(await v.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(42);
    expect(await v.evaluate((el: HTMLVideoElement) => el.controls)).toBe(true);
  });
});
