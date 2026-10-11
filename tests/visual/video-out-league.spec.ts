import { expect, test, type Page } from "@playwright/test";

// Traffic read 2026-10-06: NFL and F1 refuse embeds, so every one of their
// highlights ends on the "Watch on YouTube" card and `video-play` never fires.
// NFL read as 7 plays from 118 board taps. `video-out` now counts the hand-off,
// and both events carry the league. `source` was "unknown" on 55 of 100
// weekend plays: the YouTube opener passes no sourceLabel, so the channel from
// the fallback URL stands in.
//
// The league pages' "Open …" button lands on `/yesterday?lg=<sport>`: the board
// opens on that league's last finished day (NFL plays 3 days a week, so a fixed
// /yesterday was often empty) and the first-run picker starts with it chosen.

const FAKE_YT_API = `
(function () {
  function FakePlayer(el, config) {
    var mount = typeof el === "string" ? document.getElementById(el) : el;
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube.com/embed/" + config.videoId + "?fake=1";
    mount.replaceWith(iframe);
    this._iframe = iframe;
    var self = this;
    setTimeout(function () {
      config.events.onReady && config.events.onReady({ target: self });
      config.events.onStateChange && config.events.onStateChange({ target: self, data: 1 });
    }, 0);
  }
  var noop = function () {};
  FakePlayer.prototype = {
    playVideo: noop, pauseVideo: noop, mute: noop, unMute: noop, setPlaybackQuality: noop, setOption: noop, loadModule: noop,
    getIframe: function () { return this._iframe; }, getPlayerState: function () { return 1; },
    getDuration: function () { return 300; }, getCurrentTime: function () { return 1; },
    getAvailableQualityLevels: function () { return []; },
    getVideoData: function () { return { title: "Lynx vs. Dream Game Highlights", author: "WNBA" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

type Ev = [string, Record<string, string>];

async function stubTracker(page: Page) {
  // The real tracker would replace the stub; keep it out.
  await page.route("https://stats.hidescore.com/**", (r) => r.abort());
  await page.addInitScript(() => {
    const w = window as unknown as { __ev: unknown[]; umami: unknown; open: unknown };
    w.__ev = [];
    w.umami = { track: (n: string, d: unknown) => w.__ev.push([n, d]) };
    w.open = () => null; // the hand-off would open a youtube.com tab
  });
  await page.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
  await page.route("**/api/youtube?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":null}' }));
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __ev: Ev[] }).__ev);

async function seedSingleLeague(page: Page, sport: string) {
  await page.addInitScript((s) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [s], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: s, secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
    defaultDateMode: "yesterday", defaultLandingView: "scores",
  })), sport);
}

type Team = { id: string; displayName: string; shortDisplayName: string; abbreviation: string; score: string };
function finishedEvent(id: string, iso: string, away: Team, home: Team) {
  const competitor = (team: Team, homeAway: "home" | "away") => ({
    homeAway, team: { ...team, logo: "", color: "666666" }, score: team.score, winner: homeAway === "home", records: [{ summary: "1-0" }],
  });
  return {
    id, date: iso, name: `${away.displayName} at ${home.displayName}`, shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    season: { type: 2 },
    status: { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const GIANTS: Team = { id: "nyg", displayName: "New York Giants", shortDisplayName: "Giants", abbreviation: "NYG", score: "17" };
const COWBOYS: Team = { id: "dal", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", abbreviation: "DAL", score: "24" };
const NFL_ISO = "2026-09-14T17:00:00Z"; // Mon 9/14
const NFL_GAME = finishedEvent("401555555", NFL_ISO, GIANTS, COWBOYS);
const NFL_HL = JSON.stringify({
  fetchedAt: "2026-09-15T14:00:00Z",
  games: {
    "nfl:401555555": {
      t: new Date("2026-09-15T11:00:00-04:00").getTime(), teams: ["Giants", "Cowboys"], matchup: "cowboys|giants",
      eventDate: NFL_ISO, sourcePolicy: "official-channel", official: "nflOfficial1", officialChannel: "NFL", officialDurationSec: 965,
    },
  },
});

const METS: Team = { id: "nym", displayName: "New York Mets", shortDisplayName: "Mets", abbreviation: "NYM", score: "3" };
const BRAVES: Team = { id: "atl", displayName: "Atlanta Braves", shortDisplayName: "Braves", abbreviation: "ATL", score: "5" };
const MLB_ISO = "2026-09-14T23:10:00Z"; // Mon 9/14, 7:10 pm ET
const MLB_VIDEOS = JSON.stringify({
  games: [{
    date: MLB_ISO, away: "Mets", home: "Braves", condensed: null,
    recap: { url: "https://www.mlb.com/video/fixture-recap", playback: "https://mlb-cuts-diamond.mlb.com/fixture/recap.mp4", poster: null },
  }],
});

const LYNX: Team = { id: "min", displayName: "Minnesota Lynx", shortDisplayName: "Lynx", abbreviation: "MIN", score: "80" };
const DREAM: Team = { id: "atl", displayName: "Atlanta Dream", shortDisplayName: "Dream", abbreviation: "ATL", score: "90" };
const WNBA_ISO = "2026-09-15T00:00:00Z"; // Mon 9/14, 8 pm ET
const WNBA_HL = JSON.stringify({
  fetchedAt: "2026-09-15T14:00:00Z",
  games: {
    "wnba:401999901": {
      t: new Date("2026-09-15T11:00:00-04:00").getTime(), teams: ["Lynx", "Dream"], matchup: "dream|lynx",
      eventDate: WNBA_ISO, sourcePolicy: "official-channel", official: "wnbaOfficial1", officialChannel: "WNBA", officialDurationSec: 545,
    },
  },
});

for (const width of [390, 1280]) {
  test(`NFL clip (embed-blocked) fires video-out with league=nfl at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-04:00"));
    await stubTracker(page);
    await seedSingleLeague(page, "nfl");
    await page.route("**/news/highlights.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: NFL_HL }));
    await page.route("**/football/nfl/scoreboard?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [NFL_GAME] }) }));

    await page.goto("/yesterday");
    await page.getByRole("button", { name: "NFL highlights" }).first().click();
    const handOff = page.getByRole("button", { name: "Watch on YouTube" });
    await expect(handOff).toBeVisible({ timeout: 15_000 });
    await handOff.click();
    await expect.poll(async () => (await events(page)).filter(([n]) => n === "video-out"))
      .toEqual([["video-out", { source: "NFL", league: "nfl", via: "card" }]]);
    expect((await events(page)).some(([n]) => n === "video-play")).toBe(false);
  });

  test(`MLB.com recap fires video-play with league=mlb at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-04:00"));
    await stubTracker(page);
    await seedSingleLeague(page, "mlb");
    await page.route("**/news/highlights.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
    await page.route("**/baseball/mlb/scoreboard?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [finishedEvent("401666666", MLB_ISO, METS, BRAVES)] }) }));
    await page.route("**/api/mlb-videos?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: MLB_VIDEOS }));
    await page.route("https://mlb-cuts-diamond.mlb.com/**", (r) => r.abort());

    await page.goto("/yesterday");
    await page.getByRole("button", { name: "MLB.com game recap" }).first().click();
    // The fixture clip never loads; the native player's own "playing" event is
    // what trackVideoPlay listens to, so raise it on the element.
    const video = page.locator("video").first();
    await expect(video).toBeAttached({ timeout: 15_000 });
    await video.evaluate((v) => v.dispatchEvent(new Event("playing")));
    await expect.poll(async () => (await events(page)).filter(([n]) => n === "video-play"))
      .toEqual([["video-play", { player: "native", source: "MLB.com", league: "mlb", page: "yesterday" }]]);
  });

  test(`YouTube clip with no sourceLabel reports its channel as source at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-04:00"));
    await stubTracker(page);
    await seedSingleLeague(page, "wnba");
    await page.route("**/news/highlights.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: WNBA_HL }));
    await page.route("**/basketball/wnba/scoreboard?**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [finishedEvent("401999901", WNBA_ISO, LYNX, DREAM)] }) }));

    await page.goto("/yesterday");
    await page.getByRole("button", { name: "WNBA highlights" }).first().click();
    await expect.poll(async () => (await events(page)).filter(([n]) => n === "video-play"), { timeout: 15_000 })
      .toEqual([["video-play", { player: "youtube", source: "WNBA", league: "wnba", page: "yesterday" }]]);
  });
}

test("NFL page button: board opens on the last finished NFL day, picker starts on NFL", async ({ page }) => {
  // Thu 9/17 noon: /yesterday = Wed 9/16, no NFL. The last NFL game ran Mon 9/14.
  await page.clock.setFixedTime(new Date("2026-09-17T12:00:00-04:00"));
  await stubTracker(page);
  await page.route("**/news/highlights.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: NFL_HL }));
  await page.route("**/football/nfl/scoreboard?**", (r) => {
    const d = new URL(r.request().url()).searchParams.get("dates") ?? "";
    const events = d === "20260914" || d.startsWith("20260914-") ? [NFL_GAME] : [];
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });

  await page.goto("/nfl-highlights-without-spoilers");
  await page.getByRole("link", { name: "Open the NFL without spoilers" }).click();
  await expect(page).toHaveURL(/\/yesterday\?lg=nfl$/);

  // First visit: the league picker opens with NFL already chosen.
  const nflPill = page.getByRole("dialog").getByRole("button", { name: /^NFL\b/ }).first();
  await expect(nflPill).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: /^Show \d+ leagues?$/ }).click();

  await expect(page.getByRole("button", { name: "NFL highlights" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Mon, Sep 14" })).toBeVisible();
});
