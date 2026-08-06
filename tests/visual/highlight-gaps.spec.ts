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
  const alternate = page.getByRole("button", { name: "Official alternate highlights" }).first();
  await expect(alternate).toBeVisible();
  expect(requestedChannels).toContain("National Women's Soccer League");
  expect(requestedChannels).toContain("CBS Sports W Golazo");

  await alternate.click();
  await expect(page.locator('iframe[src*="youtube.com/embed/ioAPLpvZwxk"]')).toBeVisible();
});
