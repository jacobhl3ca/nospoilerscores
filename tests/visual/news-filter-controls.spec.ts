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

test("choosing a grey already-shown league creates a duplicate column", async ({ page }) => {
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
  const nfl = switcher.getByRole("button", { name: "NFL Preseason", exact: true });
  await expect(nfl).toHaveAttribute("title", /pick to add a second/i);
  await nfl.click();

  await expect(page.getByRole("heading", { name: "NFL Pre", exact: true })).toHaveCount(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.firstLeague).toBe("nfl");
  expect(saved.secondLeague).toBe("nfl");
});

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
