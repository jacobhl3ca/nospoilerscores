import { expect, test, type Page, type Route } from "@playwright/test";

// The "Last played" lookback slate (an empty day's column falls back to the
// league's most recent game day) in the Ratings view (Jacob 10/6, found with
// the ESPN front page one): it rendered the feed's order while the day's own
// finals sort best-first. The feed lists a 45-3 blowout before a 23-20 final;
// ratings on puts the close one first, ratings off keeps the feed's order.

const NOW = new Date("2026-08-07T15:00:00-04:00");

function final(id: string, away: [string, string, string], home: [string, string, string], iso: string) {
  const side = ([tid, name, score]: [string, string, string], homeAway: "home" | "away") => ({
    homeAway,
    team: { id: tid, abbreviation: name.slice(0, 3).toUpperCase(), displayName: name, shortDisplayName: name },
    score,
  });
  return {
    id,
    date: iso,
    name: `${away[1]} at ${home[1]}`,
    shortName: `${away[1]} @ ${home[1]}`,
    status: { period: 4, type: { state: "post", completed: true, shortDetail: "Final" } },
    competitions: [{ competitors: [side(away, "away"), side(home, "home")] }],
  };
}

async function seed(page: Page, showRatings: boolean) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/football/nfl/scoreboard?**", (route: Route) => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    // The lookback walks back one day per request (ESPN 400s some ranges).
    const events = dates.includes("-") || dates === "20260804" ? [
      final("blowout", ["1", "Bears", "3"], ["2", "Packers", "45"], "2026-08-04T23:00:00Z"),
      final("close", ["3", "Jets", "20"], ["4", "Bills", "23"], "2026-08-04T23:30:00Z"),
    ] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  await page.addInitScript((prefs) => localStorage.setItem("nss-preferences", JSON.stringify(prefs)), {
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "light",
    showRatings,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    defaultLandingView: "scores",
    defaultDateMode: "yesterday",
    firstLeague: "nfl",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
  });
}

for (const showRatings of [true, false]) {
  test(`ratings ${showRatings ? "on" : "off"}: the Last played slate ${showRatings ? "sorts by rating" : "keeps the feed's order"}`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seed(page, showRatings);
    await page.goto("/");
    await expect(page.getByText(/Last played/)).toBeVisible({ timeout: 30_000 });
    const names = page.locator('[data-league-column="nfl"]').getByRole("button", { name: / — game details$/ });
    await expect(names).toHaveCount(2);
    const order = await names.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/ — game details$/, "")));
    expect(order).toEqual(showRatings ? ["Jets at Bills", "Bears at Packers"] : ["Bears at Packers", "Jets at Bills"]);
  });
}
