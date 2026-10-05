import { devices, expect, test, type Page } from "@playwright/test";

// Mom's iPhone, 2026-10-05 (App Store 1.0.8, Low Power Mode on).
//  • Shot 4: the "Tap to play" pill named a setting iOS does not have and sat on
//    YouTube's own red play button.
//  • Shot 5: a mid-clip pause put a black block over the bottom half of the
//    frame: the 96px minimum of the paused strip on a ~205px-tall player.
//
// The first two tests fake the YouTube IFrame API (no network), so they run in
// the default suite. The last one needs the real YouTube embed, so it runs only
// against a real server: PLAYWRIGHT_BASE_URL set (pw-webkit-mini.sh, a prod
// read-back) or LIVE_YT=1.

// iPhone 15 Pro without defaultBrowserType, so the same spec runs in the
// Chromium project and in WebKit on the mini.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...IPHONE } = devices["iPhone 15 Pro"];

// The strip's phone height (globals.css .hs-yt-pause-strip): YouTube's "More
// videos" row top, measured 54px off the bottom of a phone embed, plus 4.
const PHONE_STRIP_MAX = 58;

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

// A player that never starts and reports the autoplay refusal at once, the way
// iOS Low Power Mode refuses even a muted autoplay.
const BLOCKED_YT_API = `
(function () {
  function FakePlayer(el, config) {
    var mount = typeof el === "string" ? document.getElementById(el) : el;
    var iframe = document.createElement("iframe");
    iframe.id = "yt-player";
    iframe.src = "https://www.youtube.com/embed/" + config.videoId + "?fake=1";
    mount.replaceWith(iframe);
    this._iframe = iframe;
    setTimeout(function () {
      config.events.onReady && config.events.onReady({ target: this });
      config.events.onAutoplayBlocked && config.events.onAutoplayBlocked({ target: this });
    }.bind(this), 0);
  }
  var noop = function () {};
  FakePlayer.prototype.playVideo = noop;
  FakePlayer.prototype.pauseVideo = noop;
  FakePlayer.prototype.getIframe = function () { return this._iframe; };
  FakePlayer.prototype.getPlayerState = function () { return 5; };
  FakePlayer.prototype.getDuration = function () { return 30; };
  FakePlayer.prototype.getCurrentTime = function () { return 0; };
  FakePlayer.prototype.getAvailableQualityLevels = function () { return []; };
  FakePlayer.prototype.setPlaybackQuality = noop;
  FakePlayer.prototype.getVideoData = function () { return { title: "Fake Highlight" }; };
  FakePlayer.prototype.mute = noop;
  FakePlayer.prototype.unMute = noop;
  FakePlayer.prototype.destroy = function () { this._iframe && this._iframe.remove(); };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

async function openClip(page: Page, videoId: string, fake: boolean, prefs: Record<string, unknown> = {}) {
  if (fake) {
    await page.route("https://www.youtube.com/iframe_api", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: BLOCKED_YT_API }));
    await page.route("https://www.youtube.com/embed/**", (r) =>
      r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#222'></body>" }));
  }
  await page.addInitScript((base) => localStorage.setItem("nss-preferences", JSON.stringify(base)), { ...BASE_PREFS, ...prefs });
  await page.goto(`/?v=${videoId}&hu=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&hl=NFL&ht=${encodeURIComponent("Highlights")}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  return dialog;
}

test.describe("iPhone", () => {
  test.use(IPHONE);

  test("autoplay pill names Low Power Mode and stays off YouTube's play button", async ({ page }) => {
    const dialog = await openClip(page, "fake123", true);
    const pill = dialog.getByTestId("autoplay-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Tap to play");
    await expect(pill).toContainText("Low Power Mode pauses autoplay");
    await expect(pill).not.toContainText("enable autoplay");

    // YouTube's centre button is 56-68px across, centred in the frame. The pill
    // must end above it (with the frame's top title band to spare).
    const frame = await dialog.locator("iframe#yt-player").boundingBox();
    const box = await pill.boundingBox();
    expect(frame && box).toBeTruthy();
    const centreTop = frame!.y + frame!.height / 2 - 34;
    expect(box!.y + box!.height).toBeLessThanOrEqual(centreTop);
    expect(box!.y).toBeGreaterThanOrEqual(frame!.y);
    await page.screenshot({ path: test.info().outputPath("autoplay-pill-phone.png") });
  });
});

test("desktop keeps the autoplay-setting line", async ({ page }) => {
  const dialog = await openClip(page, "fake123", true);
  const pill = dialog.getByTestId("autoplay-pill");
  await expect(pill).toHaveText("Tap to play — enable autoplay for HideScore to skip this");
});

test.describe("iPhone, real YouTube", () => {
  test.use(IPHONE);
  test.skip(!process.env.PLAYWRIGHT_BASE_URL && !process.env.LIVE_YT, "needs the real YouTube embed: set LIVE_YT=1 or PLAYWRIGHT_BASE_URL");

  // Both player modes: YouTube's own controls (the default since 8/9, and
  // Mom's) and the spoiler-safe controls:0 player.
  for (const native of [true, false]) {
  test(`mid-clip pause strip covers only the More videos row (${native ? "YouTube controls" : "spoiler-safe"})`, async ({ page }, info) => {
    test.setTimeout(90_000);
    // PSY: an embeddable clip that shows the "More videos" row on pause.
    const dialog = await openClip(page, "9bZkp7q19f0", false, { youtubeNativeControls: native });
    const player = dialog.locator("iframe#yt-player");
    await expect(player).toBeVisible({ timeout: 30_000 });

    // Muted autoplay starts it in both engines; if it does not, YouTube's own
    // play button (centre of the frame) is the only legal start.
    try {
      await expect(dialog).toHaveAttribute("data-player-state", "playing", { timeout: 15_000 });
    } catch {
      const f = (await player.boundingBox())!;
      await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
      await expect(dialog).toHaveAttribute("data-player-state", "playing", { timeout: 15_000 });
    }
    await page.waitForTimeout(3000);

    // One tap on the click-catcher pauses (single-tap waits 300ms for a pair).
    const f = (await player.boundingBox())!;
    await page.mouse.click(f.x + f.width / 2, f.y + f.height / 2);
    await expect(dialog).toHaveAttribute("data-player-state", "paused", { timeout: 10_000 });
    await page.waitForTimeout(2500);

    const strip = dialog.getByTestId("yt-pause-strip");
    await expect(strip).toBeVisible();
    const s = (await strip.boundingBox())!;
    expect(s.height).toBeLessThanOrEqual(PHONE_STRIP_MAX + 0.5);
    expect(s.height / f.height).toBeLessThan(0.3);

    // Every visible "More videos" element inside the embed starts at or below
    // the strip's top edge, so none of it shows above the strip.
    const yt = page.frames().find((fr) => fr.url().includes("youtube.com/embed"));
    expect(yt, "YouTube embed frame").toBeTruthy();
    const shelfTops = await yt!.evaluate(() => {
      const out: number[] = [];
      for (const el of document.querySelectorAll("*")) {
        const cls = typeof el.className === "string" ? el.className : "";
        if (!/RelatedVideosEntryPoint|watch-next-entrypoint|pause-overlay/.test(cls)) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
        out.push(r.top);
      }
      return out;
    });
    const shot = info.outputPath(`paused-phone-${native ? "native" : "safe"}.png`);
    await page.screenshot({ path: shot });
    await info.attach("paused-phone.png", { path: shot, contentType: "image/png" });
    info.annotations.push({ type: "shelf", description: shelfTops.length ? `top ${Math.min(...shelfTops)} in frame, strip top ${s.y - f.y}` : "no shelf rendered this run" });
    for (const top of shelfTops) expect(f.y + top).toBeGreaterThanOrEqual(s.y - 0.5);

    // The strip does not cut the paused badge.
    const badge = dialog.getByTestId("yt-pause-badge").locator("span").first();
    const b = (await badge.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + 0.5);
  });
  }
});
