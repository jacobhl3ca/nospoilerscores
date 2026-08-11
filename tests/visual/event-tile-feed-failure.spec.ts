import { expect, test } from "@playwright/test";

// The three event-tile columns (chess, boxing, poker) each read one feed and
// render one card. A dead feed and a genuinely quiet day used to be
// indistinguishable — both produced null, and the column said "No event" over a
// 500. See EventFetchResult. Boxing's own split is covered in boxing.spec.ts;
// these lock chess and poker to the same contract.
const prefs = (league: string) => ({
  favoriteLeagues: [league], favoriteTeams: [], theme: "light", showRatings: false,
  skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
  firstLeague: league, secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty",
  fifthLeague: "empty", defaultDateMode: "today", defaultLandingView: "scores",
});

const CASES = [
  { league: "chess", heading: "Chess", feed: "**/api/chess", empty: '{"events":[]}' },
  { league: "poker", heading: "Poker", feed: "**/poker-events.json", empty: '{"schemaVersion":1,"events":[]}' },
];

for (const { league, heading, feed, empty } of CASES) {
  test(`${heading} says the feed is down, not that the day is empty, when it 500s`, async ({ page }) => {
    await page.route(feed, route => route.fulfill({ status: 500, body: "" }));
    await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
    await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), prefs(league));

    await page.goto("/today");
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Event info unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: `Retry loading ${heading}` })).toBeVisible();
    await expect(page.getByText("No event scheduled", { exact: true })).toHaveCount(0);
  });

  test(`${heading} still says No event when the feed is healthy and simply empty`, async ({ page }) => {
    await page.route(feed, route => route.fulfill({ status: 200, contentType: "application/json", body: empty }));
    await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
    await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), prefs(league));

    await page.goto("/today");
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Event info unavailable")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Retry loading ${heading}` })).toHaveCount(0);
    await expect(page.getByText("No event scheduled", { exact: true })).toBeVisible();
  });
}
