import { expect, test, type Page } from "@playwright/test";

// A column that mixes finished games WITH a highlight and finished games
// WITHOUT one used to render ragged: the ones that resolved nothing dropped the
// button row entirely and sat ~27px shorter, with nothing on screen to explain
// the gap (Jacob 8/9, an NWSL column where one of three finals had a video).
// GameHighlights now reserves the row for any finished card, so these assert the
// heights stay equal. They are DOM-measurement tests, not screenshots — a
// pixel baseline would churn on every unrelated style change.

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

// Two finished games on one slate. The highlight mock below resolves a video
// for the first and nothing for the second, which is the exact mixed column
// that used to go ragged.
function twoFinishedGames() {
  const team = (id: string, name: string, abbr: string, score: string) => ({
    id, displayName: name, shortDisplayName: name, abbreviation: abbr, score,
    logo: "", color: "666666",
  });
  const event = (id: string, away: ReturnType<typeof team>, home: ReturnType<typeof team>) => ({
    id,
    date: "2026-08-06T02:00:00Z",
    name: `${away.displayName} at ${home.displayName}`,
    shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 4,
      type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
    },
    competitions: [{
      competitors: [
        { homeAway: "home", team: home, score: home.score, winner: true, records: [{ summary: "1-0" }] },
        { homeAway: "away", team: away, score: away.score, winner: false, records: [{ summary: "0-1" }] },
      ],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  });
  return JSON.stringify({
    events: [
      event("900001", team("aa", "Aces", "AA", "80"), team("bb", "Lynx", "BB", "90")),
      event("900002", team("cc", "Fever", "CC", "70"), team("dd", "Sky", "DD", "75")),
    ],
  });
}

// The rendered height of each game card, identified by its away-team name.
// Walks up from the team-name span to the nearest rounded-lg box, which is the
// card root in GameCard — matching on the inline `var(--bg-card)` background
// instead would break the first time that moves to a class.
async function measuredCards(page: Page): Promise<{ name: string; height: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')].map((card) => ({
      name: (card.getAttribute("aria-label") ?? "").split(" at ")[0],
      height: Math.round(card.getBoundingClientRect().height),
    })),
  );
}

test("a finished card with no highlight is the same height as one with", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setSingleLeague(page, "wnba");
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(),
  }));
  // Resolve a video for the Aces game only. The Fever game gets nothing, so its
  // buttons never render and it falls back to the reserved empty row.
  await page.route("**/api/youtube?**", route => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    return q.includes("Aces")
      ? route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"GuBBEFjoDw8"}' })
      : route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' });
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  // One card resolved a button; the other must not have.
  await expect(page.getByRole("button", { name: "WNBA highlights" })).toHaveCount(1);

  await expect.poll(() => measuredCards(page), { timeout: 15_000 }).toEqual([
    { name: "Aces", height: expect.any(Number) },
    { name: "Fever", height: expect.any(Number) },
  ]);
  const [withVideo, without] = await measuredCards(page);
  expect(without.height).toBe(withVideo.height);
});

test("the reserved row is invisible to assistive tech", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setSingleLeague(page, "wnba");
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(),
  }));
  await page.route("**/api/youtube?**", route =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  // No highlight resolved anywhere, so nothing may announce itself as one.
  await expect(page.getByRole("button", { name: /highlights/i })).toHaveCount(0);
  // Both cards still stand at the same height on the reserved row alone.
  const cards = await measuredCards(page);
  expect(cards).toHaveLength(2);
  expect(cards[0].height).toBe(cards[1].height);
});
