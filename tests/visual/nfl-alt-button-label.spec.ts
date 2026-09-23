import { expect, test, type Page } from "@playwright/test";

// A2: both NFL highlight buttons pull from the SAME "NFL" YouTube channel
// (GameHighlights.tsx) — button 2 used to render as an icon with no text on
// every sport except FIFA, so it looked broken. It now always shows "Alt".
// The button height is fixed by CSS (`.highlight-btn { height: var(--hl-btn-h) }`,
// globals.css), so this asserts the two buttons still measure the same,
// confirming the new label didn't grow the card past the height floor
// (finished-card floor: reference_hidescore_card_height_floor).

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

function finishedNflGame() {
  return JSON.stringify({
    events: [{
      id: "401555555",
      date: "2026-09-14T17:00:00Z",
      name: "New York Giants at Dallas Cowboys",
      shortName: "NYG @ DAL",
      season: { type: 2 },
      status: {
        displayClock: "0:00",
        period: 4,
        type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
      },
      competitions: [{
        competitors: [
          { homeAway: "home", team: { id: "dal", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", abbreviation: "DAL", logo: "", color: "666666" }, score: "24", winner: true, records: [{ summary: "1-0" }] },
          { homeAway: "away", team: { id: "nyg", displayName: "New York Giants", shortDisplayName: "Giants", abbreviation: "NYG", logo: "", color: "666666" }, score: "17", winner: false, records: [{ summary: "0-1" }] },
        ],
        broadcasts: [],
        headlines: [],
        notes: [],
      }],
    }],
  });
}

for (const width of [390, 1180]) {
  test(`NFL finished card: NFL + Alt labels both visible at ${width}px, buttons stay the same height`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-04:00"));
    await setSingleLeague(page, "nfl");
    await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: finishedNflGame(),
    }));
    // Same channel for both slots (per A2's finding): the 2nd request excludes
    // the 1st's resolved id, so this fixture hands back two distinct clips
    // exactly the way the real "NFL" channel does.
    await page.route("**/api/youtube?**", route => {
      const url = new URL(route.request().url());
      const excluded = url.searchParams.get("exclude") ?? "";
      const id = excluded ? "nfl-alt" : "nfl-primary";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videoId: id }) });
    });

    await page.goto("/yesterday");
    const official = page.getByRole("button", { name: "NFL highlights" }).first();
    const alt = page.getByRole("button", { name: "Official alternate highlights" }).first();
    await expect(official).toBeVisible();
    await expect(alt).toBeVisible();
    await expect(official.getByText("NFL", { exact: true })).toBeVisible();
    await expect(alt.getByText("Alt", { exact: true })).toBeVisible();

    const officialBox = await official.boundingBox();
    const altBox = await alt.boundingBox();
    expect(officialBox).not.toBeNull();
    expect(altBox).not.toBeNull();
    expect(Math.round(altBox!.height)).toBe(Math.round(officialBox!.height));
  });
}

test("NFL finished card: identical resolved ids collapse to one button, not two", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T12:00:00-04:00"));
  await setSingleLeague(page, "nfl");
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: finishedNflGame(),
  }));
  // Every request — including the exclude retry — lands the same id, the
  // stuck case the render-time dedupe guard (isDuplicateHighlightId) exists for.
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"videoId":"nfl-only"}',
  }));

  await page.goto("/yesterday");
  const official = page.getByRole("button", { name: "NFL highlights" }).first();
  await expect(official).toBeVisible();
  await expect(page.getByRole("button", { name: "Official alternate highlights" })).toHaveCount(0);
});
