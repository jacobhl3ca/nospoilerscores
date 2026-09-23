import { expect, test, type Page } from "@playwright/test";

// A9: today's upcoming playoff card used to print ESPN's series score
// ("NYY leads 2-1") in ratings mode — it tells someone catching up how the
// earlier games went. Jacob 9/23: hide it. The slot now shows the neutral game
// number from the notes headline. Two widths because the line renders in two
// places: its own row above the status bar below xl, inline in the status bar
// at xl and up (GameCard.tsx).

async function setMlbRatings(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"],
    favoriteTeams: [],
    theme: "light",
    showRatings: true,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })));
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"games":{}}',
  }));
}

function upcomingPlayoffGame(summary: string) {
  return JSON.stringify({
    events: [{
      id: "401999001",
      date: "2026-09-30T23:08:00Z",
      name: "Boston Red Sox at New York Yankees",
      shortName: "BOS @ NYY",
      season: { type: 3 },
      status: {
        displayClock: "0:00",
        period: 0,
        type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Tue, September 30th at 7:08 PM EDT", shortDetail: "9/30 - 7:08 PM EDT", completed: false },
      },
      competitions: [{
        competitors: [
          { homeAway: "home", team: { id: "10", displayName: "New York Yankees", shortDisplayName: "Yankees", abbreviation: "NYY", logo: "", color: "132448" }, score: "0", records: [{ summary: "94-68" }] },
          { homeAway: "away", team: { id: "2", displayName: "Boston Red Sox", shortDisplayName: "Red Sox", abbreviation: "BOS", logo: "", color: "BD3039" }, score: "0", records: [{ summary: "89-73" }] },
        ],
        series: { type: "playoff", summary, completed: false, totalCompetitions: 3 },
        broadcasts: [],
        headlines: [],
        notes: [{ type: "event", headline: "AL Wild Card Series - Game 2" }],
      }],
    }],
  });
}

for (const width of [390, 1440]) {
  for (const summary of ["NYY leads series 1-0", "Series tied 1-1"]) {
    test(`upcoming playoff card at ${width}px: "${summary}" stays off the page, the game number shows`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-09-30T12:00:00-04:00"));
      await setMlbRatings(page);
      await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: upcomingPlayoffGame(summary),
      }));

      await page.goto("/");
      await expect(page.getByText("Game 2", { exact: true }).locator("visible=true").first()).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/\bleads\b/i);
      expect(body).not.toMatch(/\btied\s+\d/i);
      // Not in hidden markup either: the below-xl row and the xl inline cell
      // both mount, one of them display:none.
      const html = await page.content();
      expect(html).not.toMatch(/leads (series )?\d-\d/i);
      expect(html).not.toMatch(/tied \d-\d/i);
    });
  }
}
