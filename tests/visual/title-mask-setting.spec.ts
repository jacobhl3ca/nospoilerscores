import { expect, test, type Page } from "@playwright/test";

// "Cover video title" ON covers every title (Jacob 9/28). Until then the cover
// lifted as soon as the clip's title read clean, so the toggle hid almost
// nothing. The automatic covers (/watch links, the combat channels) still lift
// for a clean title. Same stand-in YouTube API as watch-any-link.spec.ts, with
// a title that carries no score.
const CLEAN_TITLE = "Mets vs. Braves | Game Highlights";
const FAKE_YT_API = `
(function () {
  function FakePlayer(el, config) {
    var mount = typeof el === "string" ? document.getElementById(el) : el;
    var iframe = document.createElement("iframe");
    iframe.id = "yt-player";
    iframe.src = "https://www.youtube.com/embed/" + config.videoId + "?fake=1";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    mount.replaceWith(iframe);
    this._iframe = iframe;
    setTimeout(function () { config.events.onReady && config.events.onReady({ target: this }); }.bind(this), 0);
  }
  var noop = function () {};
  FakePlayer.prototype = {
    playVideo: noop, pauseVideo: noop, mute: noop, unMute: noop, setPlaybackQuality: noop,
    getIframe: function () { return this._iframe; }, getPlayerState: function () { return -1; },
    getDuration: function () { return 30; }, getCurrentTime: function () { return 0; },
    getAvailableQualityLevels: function () { return []; },
    getVideoData: function () { return { title: ${JSON.stringify(CLEAN_TITLE)} }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

async function setup(page: Page, maskVideoTitle: boolean) {
  await page.addInitScript((mask) => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, maskVideoTitle: mask,
    }));
  }, maskVideoTitle);
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

const VID = "dQw4w9WgXcQ";
const board = `/?v=${VID}&hu=${encodeURIComponent(`https://www.youtube.com/watch?v=${VID}`)}`;

test("toggle ON: a clean title stays covered after the player reads it", async ({ page }) => {
  await setup(page, true);
  await page.goto(board);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(1);
});

test("toggle OFF: a clean title is not covered", async ({ page }) => {
  await setup(page, false);
  await page.goto(board);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(0);
});

test("/watch with the toggle OFF: the automatic cover still lifts for a clean title", async ({ page }) => {
  await setup(page, false);
  await page.goto(`/watch?v=${VID}`);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(0);
});

test("the × on the Keys tag turns the hint off for good", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("nss-preferences", JSON.stringify({
        favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true,
        skipNewsExplainer: true, leaguesOnboarded: true, switcherDefaultsVersion: 2,
      }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  const keys = page.getByRole("button", { name: "Keyboard shortcuts", exact: true });
  await expect(keys).toBeVisible();
  await page.getByRole("button", { name: "Hide the keyboard shortcuts hint" }).click();
  await expect(keys).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").hideControlsHint)).toBe(true);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.getByRole("button", { name: "Keyboard shortcuts", exact: true })).toHaveCount(0);
});
