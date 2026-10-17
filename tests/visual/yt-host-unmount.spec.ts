import { expect, test, type Page } from "@playwright/test";

// GitHub #54 / #56 (Sentry: `NotFoundError: The object can not be found here.`,
// iPhone, 8/18 and 8/24). The YouTube IFrame API REPLACES the node it is given
// with its <iframe>. When that node was a <div> React rendered, a pager step
// from a YouTube post to a post of another type unmounted the player branch,
// and React called removeChild on the detached div. WebKit names that
// NotFoundError "The object can not be found here."; Chromium names it
// "Failed to execute 'removeChild' on 'Node'".
//
// This spec drives that exact path in the real page: open a YouTube post, step
// to a text post, step back, close. The stand-in API below replaces its mount
// node the way the real one does, so the old React-owned host fails here.
// tests/youtube-host.test.ts guards the same fix at source level.

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
    loadModule: noop, unloadModule: noop, setVolume: noop,
    getIframe: function () { return this._iframe; }, getPlayerState: function () { return -1; },
    getDuration: function () { return 30; }, getCurrentTime: function () { return 0; },
    getAvailableQualityLevels: function () { return []; }, getVideoData: function () { return { title: "x" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

const base = { description: "", imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const CLIP = "Clip post: fixture clip";
const TEXT = "Text post: fixture discussion thread";
// The clip is newer, so it sits above the text post and Next steps onto it.
const ITEMS = [
  { ...base, id: "y1", headline: CLIP, published: new Date(Date.now() - 60_000).toISOString(), articleUrl: "https://www.youtube.com/watch?v=fixtureY1", youtubeVideoId: "fixtureY1" },
  { ...base, id: "t1", headline: TEXT, published: new Date(Date.now() - 3_600_000).toISOString(), articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph one." },
];

const DOM_FAULT = /NotFoundError|removeChild|not a child of this node|object can not be found/i;

async function setup(page: Page) {
  const faults: string[] = [];
  page.on("pageerror", (e) => faults.push(`${e.name}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const line = m.text().split("\n").find((l) => DOM_FAULT.test(l));
    if (line) faults.push(line.trim());
  });
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "system", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
      showTextPosts: true,
    }));
  });
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
  await page.goto("/");
  return faults;
}

const row = (page: Page, headline: string) => page.locator('button[aria-label="Open post"]', { hasText: headline }).first();
const pager = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first();

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`YouTube post → text post → back → close leaves the DOM intact at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const faults = await setup(page);

    await expect(row(page, CLIP)).toBeVisible({ timeout: 30_000 });
    await row(page, CLIP).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog.locator("iframe#yt-player")).toHaveCount(1);

    // The step that unmounts the whole YouTube branch.
    await pager(page, "Next post").click();
    await expect(page.locator("iframe#yt-player")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(faults).toEqual([]);
    // The route error boundary (error.tsx) shows this card on a commit fault.
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(dialog.getByText("Paragraph one.")).toBeVisible();

    // Back onto a YouTube post: a fresh player is built in a clean host.
    await pager(page, "Previous post").click();
    await expect(dialog.locator("iframe#yt-player")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    expect(faults).toEqual([]);
  });
}
