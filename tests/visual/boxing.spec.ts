import { expect, test, type Page } from "@playwright/test";

// The MLB column is only here as the height reference, so its slate is mocked:
// a live ESPN fetch for a past date is slow/flaky in CI and blocked in sandboxes,
// and a dead feed renders "Schedule unavailable" with no card to measure.
function finishedMlbGame(date: string) {
  const team = (id: string, name: string, abbr: string, score: string) => ({
    id, displayName: name, shortDisplayName: name, abbreviation: abbr, score, logo: "", color: "666666",
  });
  const home = team("nyy", "Yankees", "NYY", "5");
  const away = team("bos", "Red Sox", "BOS", "3");
  return JSON.stringify({
    events: [{
      id: "700101",
      date,
      name: `${away.displayName} at ${home.displayName}`,
      shortName: `${away.abbreviation} @ ${home.abbreviation}`,
      season: { type: 2 },
      status: { displayClock: "0:00", period: 9, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } },
      competitions: [{
        date,
        competitors: [
          { homeAway: "home", team: home, score: home.score, winner: true, records: [{ summary: "60-55" }] },
          { homeAway: "away", team: away, score: away.score, winner: false, records: [{ summary: "55-60" }] },
        ],
        broadcasts: [], headlines: [], notes: [],
      }],
    }],
  });
}

// The player is the YouTube IFrame API, which builds the embed iframe itself.
// Stub it (same shape as the modal specs) so the iframe does not depend on the
// real www.youtube.com script loading.
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
    getVideoData: function () { return { title: "Highlights" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

async function stubYouTubePlayer(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

test("Boxing yesterday keeps the recent major, matches MLB height, and resolves DAZN strictly", async ({ page }) => {
  let lookupUrl = "";
  await page.route("**/api/boxing", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/api/youtube?**", route => {
    lookupUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"iuofPvxZKtQ"}' });
  });
  await page.route("**/baseball/mlb/scoreboard**", route => route.fulfill({
    status: 200, contentType: "application/json", body: finishedMlbGame("2026-08-05T23:05:00Z"),
  }));
  await stubYouTubePlayer(page);
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["boxing", "mlb"], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: "boxing", secondLeague: "mlb", thirdLeague: "empty", fourthLeague: "empty",
    fifthLeague: "empty", defaultDateMode: "yesterday", defaultLandingView: "scores",
  })));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Boxing" })).toBeVisible();
  const title = page.getByText("Roach vs. Zepeda", { exact: true });
  await expect(title).toBeVisible();
  const card = title.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card).toContainText("DAZN");
  await expect(card).not.toContainText(/winner|won|defeats|decision|knockout/i);
  // Same height as an MLB card on the same board — measured, not a number:
  // the MLB card itself moved from 111 to 112px (9/26) and the old constant
  // failed while the two still matched.
  const mlbCard = page.locator('[data-league-column="mlb"] div.rounded-lg').filter({ has: page.locator(".team-name") }).first();
  await expect(mlbCard).toBeVisible();
  expect((await card.boundingBox())?.height).toBe((await mlbCard.boundingBox())?.height);
  await expect(card).not.toContainText("Final");

  await page.getByRole("button", { name: "DAZN highlights" }).click();
  await expect.poll(() => lookupUrl).not.toBe("");
  const lookup = new URL(lookupUrl);
  expect(lookup.searchParams.get("channel")).toBe("DAZN Boxing");
  expect(lookup.searchParams.get("strict")).toBe("1");
  await expect(page.locator('iframe[src*="youtube.com/embed/iuofPvxZKtQ"]')).toBeVisible();
});

test("Boxing Today keeps carried-forward replay compact and loads Reddit plus ESPN headlines", async ({ page }) => {
  await page.route("**/api/boxing", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/news/reddit-boxing.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [{
      id: "boxing-reddit-1",
      headline: "Daily boxing discussion",
      description: "",
      published: "2026-08-06T16:00:00Z",
      imageUrl: null,
      articleUrl: "https://www.reddit.com/r/Boxing/comments/test",
      byline: "",
      section: "r/Boxing",
      body: "Discussion",
    }] }),
  }));
  await page.route("https://www.espn.com/espn/rss/boxing/news", route => route.fulfill({
    status: 200,
    contentType: "text/xml",
    body: `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>ESPN boxing report</title><description>Report</description><dc:creator>ESPN</dc:creator><link>https://www.espn.com/boxing/story/_/id/1/test</link><pubDate>Thu, 6 Aug 2026 11:27:27 EST</pubDate><guid>boxing-1</guid></item></channel></rss>`,
  }));
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["boxing"], favoriteTeams: [], theme: "light", showRatings: false,
    showTextPosts: true, revealNewsTitles: true, newsTypeFilter: "all",
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: "boxing", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty",
    fifthLeague: "empty", defaultDateMode: "today", defaultLandingView: "scores",
  })));

  await page.goto("/today");
  const scoreCard = page.getByText("Roach vs. Zepeda", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(scoreCard).toBeVisible();
  await expect(scoreCard).not.toContainText("Final");
  // Compact = one game card tall (112px on 9/26, which the test above holds
  // equal to an MLB card). A carried-forward replay that grew a row would
  // add ~20px, so a 2px margin still catches it.
  expect((await scoreCard.boundingBox())?.height).toBeLessThanOrEqual(114);

  await page.getByRole("button", { name: "News" }).click();
  await expect(page.getByText("r/Boxing", { exact: true })).toBeVisible();
  await expect(page.getByText("Daily boxing discussion", { exact: true })).toBeAttached();
  await expect(page.getByText("ESPN BOXING", { exact: true })).toBeVisible();
  await expect(page.getByText("ESPN boxing report", { exact: true })).toBeAttached();
});

// A dead feed and a quiet day used to render identically ("No event"), so a
// 500 read as "boxing has nothing on". These two lock the split in place.
const BOXING_PREFS = {
  favoriteLeagues: ["boxing"], favoriteTeams: [], theme: "light", showRatings: false,
  skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
  firstLeague: "boxing", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty",
  fifthLeague: "empty", defaultDateMode: "today", defaultLandingView: "scores",
};

test("Boxing says the feed is down, not that the day is empty, when both sources fail", async ({ page }) => {
  await page.route("**/api/boxing", route => route.fulfill({ status: 500, body: "" }));
  await page.route("**/boxing-events.json", route => route.fulfill({ status: 500, body: "" }));
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript((prefs) => localStorage.setItem("nss-preferences", JSON.stringify(prefs)), BOXING_PREFS);

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Boxing" })).toBeVisible();
  await expect(page.getByText("Event info unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading Boxing" })).toBeVisible();
  await expect(page.getByText("No event scheduled", { exact: true })).toHaveCount(0);
});

test("Boxing still says No event when both feeds are healthy and simply empty", async ({ page }) => {
  await page.route("**/api/boxing", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/boxing-events.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"schemaVersion":1,"events":[]}',
  }));
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript((prefs) => localStorage.setItem("nss-preferences", JSON.stringify(prefs)), BOXING_PREFS);

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Boxing" })).toBeVisible();
  await expect(page.getByText("Event info unavailable")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry loading Boxing" })).toHaveCount(0);
  // Today's empty copy is emptyUpcomingLabel, not the past tab's "No event".
  await expect(page.getByText("No event scheduled", { exact: true })).toBeVisible();
});
