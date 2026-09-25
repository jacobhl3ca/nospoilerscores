import { expect, test, type Page } from "@playwright/test";

async function setSingleLeague(page: Page, sport: string) {
  await page.addInitScript((selectedSport) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [selectedSport],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: selectedSport,
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "yesterday",
    defaultLandingView: "scores",
  })), sport);
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"games":{}}',
  }));
}

function finishedScoreboard({
  id,
  date,
  away,
  home,
}: {
  id: string;
  date: string;
  away: { id: string; displayName: string; shortDisplayName: string; abbreviation: string; score: string };
  home: { id: string; displayName: string; shortDisplayName: string; abbreviation: string; score: string };
}) {
  const competitor = (team: typeof away, homeAway: "home" | "away") => ({
    homeAway,
    team: { ...team, logo: "", color: "666666" },
    score: team.score,
    winner: homeAway === "home",
    records: [{ summary: "1-0" }],
  });
  return JSON.stringify({
    events: [{
      id,
      date,
      name: `${away.displayName} at ${home.displayName}`,
      shortName: `${away.abbreviation} @ ${home.abbreviation}`,
      season: { type: 2 },
      status: {
        displayClock: "0:00",
        period: 4,
        type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
      },
      competitions: [{
        competitors: [competitor(home, "home"), competitor(away, "away")],
        broadcasts: [],
        headlines: [],
        notes: [],
      }],
    }],
  });
}

test("WNBA compact expansion names resolve with official full-name query", async ({ page }) => {
  let officialLookup = "";
  await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
  await setSingleLeague(page, "wnba");
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401857114",
      date: "2026-08-05T02:00:00Z",
      away: { id: "tor", displayName: "Toronto Tempo", shortDisplayName: "Tempo", abbreviation: "TOR", score: "81" },
      home: { id: "gs", displayName: "Golden State Valkyries", shortDisplayName: "Valkyries", abbreviation: "GS", score: "92" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("channel") === "WNBA") officialLookup = url.toString();
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"GuBBEFjoDw8"}' });
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "WNBA highlights" }).first()).toBeVisible();
  await expect.poll(() => officialLookup).not.toBe("");
  const lookup = new URL(officialLookup);
  expect(lookup.searchParams.get("q")).toContain("Toronto Tempo vs Golden State Valkyries highlights Aug 4, 2026");
  expect(lookup.searchParams.get("strict")).toBe("1");
});

test("NWSL uses CBS Sports W Golazo as its strict alternate", async ({ page }) => {
  const requestedChannels = new Set<string>();
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setSingleLeague(page, "nwsl");
  await page.route("**/soccer/usa.nwsl/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401854071",
      date: "2026-08-06T02:00:00Z",
      away: { id: "nc", displayName: "North Carolina Courage", shortDisplayName: "North Carolina", abbreviation: "NC", score: "2" },
      home: { id: "den", displayName: "Denver Summit FC", shortDisplayName: "Denver", abbreviation: "DEN", score: "0" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    const url = new URL(route.request().url());
    const channel = url.searchParams.get("channel") ?? "";
    requestedChannels.add(channel);
    if (channel === "CBS Sports W Golazo") {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"ioAPLpvZwxk"}' });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' });
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "NWSL" })).toBeVisible();
  // The NWSL slot missed, so the W Golazo clip is the only button. A lone 2nd
  // button takes the 1st button's rule: named for its channel, never "Alt".
  const alternate = page.getByRole("button", { name: "CBS Sports W Golazo highlights" }).first();
  await expect(alternate).toBeVisible();
  await expect(alternate).not.toHaveText(/Alt/);
  expect(requestedChannels).toContain("National Women's Soccer League");
  expect(requestedChannels).toContain("CBS Sports W Golazo");

  await alternate.click();
  await expect(page.locator('iframe[src*="youtube.com/embed/ioAPLpvZwxk"]')).toBeVisible();
});

// Retargeted 2026-09-04. This test used to drive the retry through the NFL, and
// had been failing since bf2d2ec6 (2026-08-10) — three and a half weeks — for a
// reason that is not a bug: that commit put "NFL" in EMBED_BLOCKED_CHANNELS, so
// VideoModal now short-circuits an NFL clip to the "Watch on YouTube" card on the
// first frame and never mounts a player at all. No player, no onError, no retry,
// no request to assert on. The invariant the test was written for — an embed
// failure must re-search the SAME approved channel, never fall back to an
// unscoped search — is still real for every league that DOES mount a player, so
// it moves to one of those. The NFL half is now asserted for what it actually
// does, below.
test("an embed failure retries within the same approved channel, never unscoped", async ({ page }) => {
  const requests: string[] = [];
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setSingleLeague(page, "wnba");
  await page.addInitScript(() => {
    const fakePlayer = function (_id: string, options: { events?: { onError?: () => void } }) {
      window.setTimeout(() => options.events?.onError?.(), 0);
      return {
        destroy() {},
        getPlayerState() { return -1; },
        getCurrentTime() { return 0; },
        getDuration() { return 0; },
        isMuted() { return true; },
      };
    };
    Object.assign(window, { YT: { Player: fakePlayer } });
  });
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401999998",
      date: "2026-08-06T00:00:00Z",
      away: { id: "min", displayName: "Minnesota Lynx", shortDisplayName: "Lynx", abbreviation: "MIN", score: "80" },
      home: { id: "atl", displayName: "Atlanta Dream", shortDisplayName: "Dream", abbreviation: "ATL", score: "90" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    const url = new URL(route.request().url());
    requests.push(url.toString());
    const excluded = url.searchParams.get("exclude") ?? "";
    const id = excluded.includes("wnba-primary") ? "wnba-alternate" : "wnba-primary";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videoId: id }) });
  });

  await page.goto("/yesterday");
  const official = page.getByRole("button", { name: "WNBA highlights" }).first();
  await expect(official).toBeVisible();
  requests.length = 0;
  await official.click();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request);
    expect(url.searchParams.get("channel")).toBe("WNBA");
    expect(url.searchParams.get("strict")).toBe("1");
  }
});

// The other half of the same behaviour: a channel that refuses embeds on every
// upload must not mount a player, walk a fallback chain and burn alternate ids
// before landing on a card it was always going to land on. See
// EMBED_BLOCKED_CHANNELS + leadChannelBlocksEmbeds. NFL is there because ESPN
// ships `highlights: []` on every NFL competition, so the league's own channel
// is the only place the clip exists and there is nothing to fall back TO.
test("an embed-blocked league goes straight to the YouTube card, no retry chain", async ({ page }) => {
  const requests: string[] = [];
  // The IFrame API script is only fetched when the effect is actually going to
  // build a player, so an empty list here is the strongest proof the
  // short-circuit fired — stronger than anything readable off the DOM.
  const playerApiLoads: string[] = [];
  page.on("request", (r) => { if (r.url().includes("youtube.com/iframe_api")) playerApiLoads.push(r.url()); });
  await page.clock.setFixedTime(new Date("2026-08-16T16:00:00-04:00"));
  await setSingleLeague(page, "nfl");
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401999999",
      date: "2026-08-16T00:00:00Z",
      away: { id: "nyg", displayName: "New York Giants", shortDisplayName: "Giants", abbreviation: "NYG", score: "17" },
      home: { id: "dal", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", abbreviation: "DAL", score: "24" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"nfl-primary"}' });
  });

  await page.goto("/yesterday");
  const official = page.getByRole("button", { name: "NFL highlights" }).first();
  await expect(official).toBeVisible();
  requests.length = 0;
  await official.click();
  // The card, not a player. Anything else means the short-circuit stopped firing.
  await expect(page.getByRole("link", { name: /watch on youtube/i }).first()).toBeVisible();
  // NOT `#yt-player` having count 0. That div is a mount POINT, rendered
  // unconditionally whenever the modal is in YouTube mode (VideoModal's video
  // region), so its presence never meant a player existed — asserting on it
  // failed this test from the day it was written while the app was doing
  // exactly the right thing. Measured on the same fixture 2026-09-04: the div
  // is there and EMPTY — 0 children, 0 iframes on the page, 0 YT.Player
  // constructions, 0 fetches of the IFrame API. So assert those instead.
  await expect(page.locator("#yt-player > *")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  // And no id-burning retry behind it.
  await page.waitForTimeout(1500);
  expect(playerApiLoads, "the IFrame API was fetched, so a player was being built").toEqual([]);
  expect(requests).toEqual([]);
});

// 2026-09-25: a FotMob official the uploader will not let play embedded
// (LALIGA EA SPORTS) is kept and handed off like the NFL's, straight to the
// card, with a line saying the YouTube title shows the score.
test("an embed-blocked FotMob clip opens straight on the YouTube card with the score note", async ({ page }) => {
  const playerApiLoads: string[] = [];
  page.on("request", (r) => { if (r.url().includes("youtube.com/iframe_api")) playerApiLoads.push(r.url()); });
  await page.clock.setFixedTime(new Date("2026-09-21T16:00:00-04:00"));
  await setSingleLeague(page, "laliga");
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ games: { "laliga:401882861": {
      t: Date.parse("2026-09-21T12:00:00Z"), teams: ["Málaga", "Getafe"], matchup: "getafe|malaga", eventDate: "2026-09-20T12:00Z",
      official: "VLO0aPib4SU", officialChannel: "LALIGA EA SPORTS", officialDurationSec: 170, sourcePolicy: "official-channel",
      src: "fotmob", officialEmbeddable: false, officialTitleScore: true,
    } } }),
  }));
  await page.route("**/soccer/esp.1/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401882861",
      date: "2026-09-20T12:00:00Z",
      away: { id: "mal", displayName: "Málaga", shortDisplayName: "Málaga", abbreviation: "MCF", score: "0" },
      home: { id: "get", displayName: "Getafe", shortDisplayName: "Getafe", abbreviation: "GET", score: "0" },
    }),
  }));
  await page.route("**/api/youtube?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":null}' }));

  await page.goto("/yesterday");
  const official = page.getByRole("button", { name: /highlights/i }).first();
  await expect(official).toBeVisible();
  await official.click();
  await expect(page.getByText("the league blocked embedded playback")).toBeVisible();
  await expect(page.getByText("YouTube shows the score in this video’s title")).toBeVisible();
  await expect(page.getByRole("button", { name: /watch on youtube/i }).first()).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(playerApiLoads, "the IFrame API was fetched, so a player was being built").toEqual([]);
});

// Lit 2026-09-19 against ESPN FC. The league is no longer dark, but the two
// properties that kept it dark are now carried by the request itself: every
// lookup must name the exact channel AND demand the competition in the title.
// ESPN FC cuts the FA Cup, the Copa del Rey and the Premier League between the
// same clubs, so a lookup missing either half is the wrong-match path reopened.
test("La Liga resolves only against ESPN FC and only with a LALIGA title", async ({ page }) => {
  const youtubeUrls: string[] = [];
  await page.clock.setFixedTime(new Date("2026-08-16T16:00:00-04:00"));
  await setSingleLeague(page, "laliga");
  await page.route("**/soccer/esp.1/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401888888",
      date: "2026-08-16T00:00:00Z",
      away: { id: "bar", displayName: "Barcelona", shortDisplayName: "Barcelona", abbreviation: "BAR", score: "2" },
      home: { id: "rma", displayName: "Real Madrid", shortDisplayName: "Real Madrid", abbreviation: "RMA", score: "1" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    youtubeUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"laliga-official"}' });
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "La Liga" })).toBeVisible();
  await expect(page.getByRole("button", { name: /highlights/i }).first()).toBeVisible();
  expect(youtubeUrls.length).toBeGreaterThan(0);
  for (const url of youtubeUrls) {
    expect(decodeURIComponent(url), "a La Liga lookup left the ESPN FC channel").toContain("channel=ESPN FC");
    expect(url, "a La Liga lookup dropped strict=1").toContain("strict=1");
    expect(decodeURIComponent(url), "a La Liga lookup dropped the competition gate").toContain("comp=laliga|la liga");
  }
});

test("Ligue 1 resolves only against beIN SPORTS USA and only with a Ligue 1 title", async ({ page }) => {
  const youtubeUrls: string[] = [];
  await page.clock.setFixedTime(new Date("2026-08-16T16:00:00-04:00"));
  await setSingleLeague(page, "ligue1");
  await page.route("**/soccer/fra.1/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedScoreboard({
      id: "401777777",
      date: "2026-08-16T00:00:00Z",
      away: { id: "psg", displayName: "Paris Saint-Germain", shortDisplayName: "PSG", abbreviation: "PSG", score: "2" },
      home: { id: "bre", displayName: "Stade Brest", shortDisplayName: "Brest", abbreviation: "BRE", score: "1" },
    }),
  }));
  await page.route("**/api/youtube?**", route => {
    youtubeUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"ligue1-official"}' });
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Ligue 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /highlights/i }).first()).toBeVisible();
  expect(youtubeUrls.length).toBeGreaterThan(0);
  for (const url of youtubeUrls) {
    expect(decodeURIComponent(url), "a Ligue 1 lookup left the beIN SPORTS USA channel").toContain("channel=beIN SPORTS USA");
    expect(url, "a Ligue 1 lookup dropped strict=1").toContain("strict=1");
    expect(decodeURIComponent(url), "a Ligue 1 lookup dropped the competition gate").toContain("comp=ligue 1");
  }
});
