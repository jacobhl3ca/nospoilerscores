import { expect, test } from "@playwright/test";

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: false,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
};

async function seedPrefs(page: import("@playwright/test").Page, extra: Record<string, unknown>) {
  await page.addInitScript(({ base, update }) => {
    if (!localStorage.getItem("nss-preferences")) {
      localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    }
  }, { base: BASE_PREFS, update: extra });
}

test("news source types can be checked independently and persist", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await seedPrefs(page, {
    showNews: true,
    defaultLandingView: "news",
    defaultDateMode: "today",
    newsTypeFilter: "reddit",
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Filter news" }).click();
  const filter = page.getByRole("dialog", { name: "Filter news by source" });
  const reddit = filter.getByRole("checkbox", { name: "Reddit" });
  const espn = filter.getByRole("checkbox", { name: "ESPN" });
  await expect(reddit).toBeChecked();
  await expect(espn).not.toBeChecked();

  await espn.check();
  await reddit.uncheck();
  await expect(espn).toBeChecked();
  await expect(reddit).not.toBeChecked();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.newsTypeFilters).toEqual(["espn"]);

  await page.reload();
  await page.getByRole("button", { name: "Filter news" }).click();
  await expect(page.getByRole("dialog", { name: "Filter news by source" }).getByRole("checkbox", { name: "ESPN" })).toBeChecked();
  await expect(page.getByRole("dialog", { name: "Filter news by source" }).getByRole("checkbox", { name: "Reddit" })).not.toBeChecked();
});

test("choosing an already-shown league (full colour, labelled) creates a duplicate column", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"events":[]}',
  }));
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"events":[]}',
  }));
  await seedPrefs(page, {
    defaultLandingView: "scores",
    defaultDateMode: "today",
    firstLeague: "mlb",
    secondLeague: "nfl",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
  });
  await page.goto("/");

  await page.getByRole("button", { name: "MLB", exact: true }).click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  // Not exact: the button's accessible name now includes the "· col 2" label.
  const nfl = switcher.getByRole("button", { name: "NFL Preseason" });
  await expect(nfl).toHaveAttribute("title", /already shown in column 2.*pick to add a second/i);
  // Already-shown is no longer greyed — logged-out and logged-in alike see
  // every league in full colour, with "· col N" explaining where it lives
  // instead of looking disabled (Jacob 9/10).
  await expect(nfl).not.toHaveAttribute("style", /--text-muted/);
  await expect(nfl).toContainText("· col 2");
  await nfl.click();

  // Not "NFL Pre": that abbreviation never actually renders here — the
  // heading is the full label at this viewport/column count.
  await expect(page.getByRole("heading", { name: "NFL Preseason", exact: true })).toHaveCount(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.firstLeague).toBe("nfl");
  expect(saved.secondLeague).toBe("nfl");
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`${viewport.name}: column picker only greys the offseason league, not shown-elsewhere ones`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
    for (const path of ["**/baseball/mlb/scoreboard?**", "**/football/nfl/scoreboard?**", "**/soccer/usa.1/scoreboard?**"]) {
      await page.route(path, route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"events":[]}',
      }));
    }
    await seedPrefs(page, {
      defaultLandingView: "scores",
      defaultDateMode: "today",
      firstLeague: "mlb",
      secondLeague: "nfl",
      thirdLeague: "mls",
      fourthLeague: "empty",
      fifthLeague: "empty",
    });
    await page.goto("/");

    await page.getByRole("button", { name: "MLB", exact: true }).click();
    const switcher = page.getByRole("dialog", { name: "Switch league" });

    // Not exact: both now carry a "· col N" suffix in their accessible name.
    const nfl = switcher.getByRole("button", { name: "NFL Preseason" });
    const mls = switcher.getByRole("button", { name: "MLS" });
    const nba = switcher.getByRole("button", { name: "NBA · offseason", exact: true });

    for (const shownElsewhere of [nfl, mls]) {
      await expect(shownElsewhere).not.toHaveAttribute("style", /--text-muted/);
    }
    await expect(nfl).toContainText("· col 2");
    await expect(mls).toContainText("· col 3");
    // The one state that actually limits what picking it gets you stays grey.
    await expect(nba).toHaveAttribute("style", /--text-muted/);
  });
}

test("an empty Yesterday slate shows the league's last played games with highlights", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T15:00:00-04:00"));
  await page.route("**/football/nfl/scoreboard?**", route => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    const events = dates.includes("-") ? [{
      id: "past-game",
      date: "2026-08-04T23:10:00Z",
      name: "Away Club at Home Club",
      shortName: "AWY @ HOM",
      status: { period: 4, type: { state: "post", completed: true, shortDetail: "Final" } },
      competitions: [{
        competitors: [
          { homeAway: "away", team: { id: "1", abbreviation: "AWY", displayName: "Away Club", shortDisplayName: "Away" }, score: "2" },
          { homeAway: "home", team: { id: "2", abbreviation: "HOM", displayName: "Home Club", shortDisplayName: "Home" }, score: "3" },
        ],
      }],
    }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ games: { "nfl:past-game": {
      t: new Date("2026-08-07T15:00:00-04:00").getTime(),
      matchup: "away|home",
      official: "fixture-video",
      officialChannel: "NFL",
      sourcePolicy: "official-channel",
    } } }),
  }));
  await seedPrefs(page, {
    defaultLandingView: "scores",
    defaultDateMode: "yesterday",
    firstLeague: "nfl",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
  });
  await page.goto("/");

  await expect(page.getByText(/Last played/)).toBeVisible();
  await expect(page.getByRole("button", { name: "NFL highlights" })).toBeVisible();
});
