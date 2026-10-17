import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

// Champions Cup + Challenge Cup highlights (lit 2026-10-15). Both cups post to
// one channel, and its titles lead with a verdict ("Champions!", "Historic
// Victory"), so the title bar stays covered for every user, even with "Cover
// video title" OFF. Real ESPN event: Bulls at Glasgow Warriors, round of 16,
// Apr 4 2026 (the channel's cut is "Battle in the wind! | Glasgow Warriors v
// Vodacom Bulls | Investec Champions Cup Extended Highlights").
const EVENT = JSON.parse(readFileSync("tests/fixtures/rugbychamp-2026-04-04-bulls-glasgow.json", "utf8"));
const CHANNEL = "Investec Champions Cup & EPCR Challenge Cup";
const VID = "u34HQf1uEGI";
const CLEAN_TITLE = "Glasgow Warriors v Vodacom Bulls | Investec Champions Cup Extended Highlights";
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

async function seed(page: Page, lookups: URL[]) {
  await page.clock.setFixedTime(new Date("2026-04-05T12:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [], favoriteTeams: [], theme: "dark", showRatings: false, skipExplainer: true, skipNewsExplainer: true,
    showNews: false, leaguesOnboarded: true, firstLeague: "rugbychamp", secondLeague: "empty", thirdLeague: "empty",
    fourthLeague: "empty", fifthLeague: "empty", hiddenLeagues: ["best", "top"], defaultDateMode: "yesterday",
    defaultLandingView: "scores", maskVideoTitle: false,
  })));
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    if (!/\/scoreboard$/.test(url.pathname)) return route.fallback();
    const events = url.pathname.includes("/rugby/271937/") ? [EVENT] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/news/highlights.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  // The live lookup answers only the request the app must send: the EPCR
  // channel, strict, the cup token and the home-first + 400 s gates.
  await page.route("**/api/youtube?**", (route) => {
    const url = new URL(route.request().url());
    lookups.push(url);
    const p = url.searchParams;
    const ok = p.get("channel") === CHANNEL && p.get("strict") === "1" && p.get("comp") === "champions cup" && p.get("order") === "home" && p.get("minsec") === "400";
    return route.fulfill({ status: ok ? 200 : 404, contentType: "application/json", body: ok ? JSON.stringify({ videoId: VID, lengthSec: 643 }) : '{"error":"No results"}' });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

test("a finished Champions Cup game shows its highlight button and a covered title with the setting OFF", async ({ page }) => {
  const lookups: URL[] = [];
  await seed(page, lookups);
  await page.goto("/yesterday");
  const col = page.locator('[data-league-column="rugbychamp"]');
  await expect(col).toBeVisible({ timeout: 30_000 });
  const btn = col.getByRole("button", { name: `${CHANNEL} highlights` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  expect(lookups.some((u) => /Bulls vs Glasgow Warriors highlights/.test(u.searchParams.get("q") ?? ""))).toBe(true);
  await btn.click();
  await expect(page.locator("iframe#yt-player")).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("yt-title-mask")).toHaveCount(1);
  await page.screenshot({ path: "test-results/epcr-highlights-modal.png" });
});
