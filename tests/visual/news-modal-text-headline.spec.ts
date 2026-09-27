import { expect, test, type Page } from "@playwright/test";

// Jacob 2026-09-27: "show headlines when in news modal mode even if show
// headlines is off. cuz for text posts it doesnt make sense." A text post is
// only its headline, so a blurred one in the modal is an empty card. With the
// Headlines toggle OFF (the default):
//   • the list row still blurs the headline,
//   • the open text post shows it in the clear, with no H peek,
//   • a clip still blurs its headline under the player, H peeks it.

// Same stand-in YouTube API as modal-key-hints.spec: a plain iframe, no network.
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
    getAvailableQualityLevels: function () { return []; }, getVideoData: function () { return { title: "x" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const TEXT = "Text post: they blew it in the fourth";
const VIDEO = "Video post: all the highlights";
const ITEMS = [
  { ...base, id: "t1", headline: TEXT, articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph one." },
  { ...base, id: "y1", headline: VIDEO, articleUrl: "https://www.youtube.com/watch?v=fixtureY1", youtubeVideoId: "fixtureY1" },
];

async function setup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
      showTextPosts: true, revealNewsTitles: false,
    }));
  });
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
  await page.goto("/");
}

const row = (page: Page, headline: string) => page.locator('button[aria-label="Open post"]', { hasText: headline }).first();
// Poll: .news-title animates its filter over 150ms.
const filterOf = (el: import("@playwright/test").Locator) =>
  expect.poll(() => el.evaluate((n) => getComputedStyle(n).filter), { timeout: 3_000 });
const legend = (page: Page) => page.getByRole("group", { name: "Keyboard shortcuts" });
const keysBtn = (page: Page) => page.getByTestId("modal-controls").getByRole("button", { name: "Keys", exact: true });

test("Headlines off: a text post's headline shows in the modal, the list row stays blurred", async ({ page }) => {
  await setup(page);
  await expect(page.locator("html")).not.toHaveClass(/reveal-news-titles/);

  await filterOf(row(page, TEXT).locator(".news-title")).toMatch(/blur\(/);

  await row(page, TEXT).click();
  const dialog = page.getByRole("dialog");
  const h = dialog.locator("[data-modal-headline]");
  await expect(h).toHaveText(TEXT);
  await filterOf(h).toBe("none");
  await expect(h).not.toHaveAttribute("role", "button");

  // Nothing to peek, so H is not a key here and the legend has no H row.
  await page.keyboard.press("h");
  await filterOf(h).toBe("none");
  await keysBtn(page).click();
  await expect(legend(page)).toBeVisible();
  await expect(legend(page).getByText("Peek headline")).toHaveCount(0);

  await page.screenshot({ path: "test-results/modal-text-headline-off.png" });
});

test("Headlines off: a clip's headline still blurs in the modal, and H peeks it", async ({ page }) => {
  await setup(page);
  await row(page, VIDEO).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("iframe").first()).toBeVisible();
  await expect(dialog.locator("[data-modal-headline]")).toHaveCount(0);

  const title = dialog.locator(".news-title", { hasText: VIDEO });
  await filterOf(title).toMatch(/blur\(/);

  await keysBtn(page).click();
  await expect(legend(page).getByText("Peek headline")).toBeVisible();

  await page.keyboard.press("h");
  await filterOf(title).toBe("none");
});
