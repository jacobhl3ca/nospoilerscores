import { expect, test, type Page } from "@playwright/test";

// /watch: paste any YouTube link, play it with the title covered (2026-09-24).
// The parser itself is unit-tested (tests/youtube-link.test.ts); this checks
// the page — the landing, the deep link opening the player with the title
// cover up, and a non-YouTube link staying on the landing with an error.

// A stand-in YouTube API (same shape as modal-key-hints.spec.ts). The title it
// reports carries a score, so the title cover must stay up after onReady.
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
    getVideoData: function () { return { title: "Mets 5, Braves 3 | Game Highlights" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

async function setup(page: Page, opts: { returning?: boolean } = {}) {
  if (opts.returning) {
    await page.addInitScript(() => {
      localStorage.setItem("nss-preferences", JSON.stringify({
        favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
        skipExplainer: true, skipNewsExplainer: true, leaguesOnboarded: true,
        switcherDefaultsVersion: 2, maskVideoTitle: false,
      }));
    });
  }
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

test("/watch shows the paste box", async ({ page }) => {
  await setup(page);
  await page.goto("/watch");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Watch any highlight link without spoilers");
  await expect(page.getByLabel("YouTube link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
  await expect(page.locator("#yt-player")).toHaveCount(0);
});

test("/watch?url= opens the player with the title covered, even with the Settings toggle off", async ({ page }) => {
  await setup(page, { returning: true });
  await page.goto(`/watch?url=${encodeURIComponent("https://youtu.be/dQw4w9WgXcQ?si=share")}`);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
  await expect(page.locator("iframe#yt-player")).toHaveAttribute("src", /embed\/dQw4w9WgXcQ/);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(1);
  // The address bar is the clean /watch link, not the raw ?url=.
  await expect(page).toHaveURL(/\/watch\?v=dQw4w9WgXcQ$/);
});

test("share-sheet text opens the player for a first-time visitor", async ({ page }) => {
  await setup(page);
  await page.goto(`/watch?title=x&text=${encodeURIComponent("Mets vs. Braves Highlights https://youtu.be/dQw4w9WgXcQ")}`);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(1);
  await expect(page.getByTestId("modal-controls")).toBeVisible();
});

test("a Vimeo link shows the inline error and no player", async ({ page }) => {
  await setup(page);
  await page.goto("/watch");
  await page.getByLabel("YouTube link").fill("https://vimeo.com/76979871");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page.locator("#watch-link-error")).toContainText("not a YouTube video link");
  await expect(page).toHaveURL(/\/watch$/);
  await expect(page.locator("#yt-player")).toHaveCount(0);

  // The same link as a deep link lands on the landing with the error showing.
  await page.goto(`/watch?url=${encodeURIComponent("https://vimeo.com/76979871")}`);
  await expect(page.getByLabel("YouTube link")).toBeVisible();
  await expect(page.getByLabel("YouTube link")).toHaveValue("https://vimeo.com/76979871");
  await expect(page.locator("#watch-link-error")).toBeVisible();
  await expect(page.locator("#yt-player")).toHaveCount(0);
});

test("the paste box plays a pasted link", async ({ page }) => {
  await setup(page, { returning: true });
  await page.goto("/watch");
  await page.getByLabel("YouTube link").fill("https://www.youtube.com/shorts/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page).toHaveURL(/\/watch\?v=dQw4w9WgXcQ$/);
  await expect(page.locator("iframe#yt-player")).toHaveCount(1);
});
