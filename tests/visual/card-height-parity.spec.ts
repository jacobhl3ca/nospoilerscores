import { expect, test, type Page } from "@playwright/test";

// The card grows for a highlight it actually has, and not before.
//
// f2deaf2d went the other way: every finished card reserved the button row so a
// mixed column lined up. On a slate where nothing resolves — a whole MLB column
// before the recaps land, or a league whose official-channel string is dead —
// that put a permanently blank 27px band under every card and read as fat
// ("bigger box not until it has actual highlight", Jacob 8/10). So these assert
// the opposite of what they used to: a card with no highlight is SHORTER by
// exactly one button row, and carries no empty trailing row at all.
//
// DOM-measurement tests, not screenshots — a pixel baseline would churn on
// every unrelated style change.

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

// Height of each game card plus its trailing element, identified by away team.
// Walks up from the team-name span to the nearest rounded-lg box, which is the
// card root in GameCard — matching on the inline `var(--bg-card)` background
// instead would break the first time that moves to a class. `lastRowText` is
// what catches a re-reserved row: an invisible stand-in renders as a real child
// with no text, which is indistinguishable from a real button by height alone.
async function measuredCards(page: Page): Promise<{ name: string; height: number; rows: number; lastRowText: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')].map((card) => {
      const last = card.lastElementChild as HTMLElement | null;
      return {
        name: (card.getAttribute("aria-label") ?? "").split(" at ")[0],
        height: Math.round(card.getBoundingClientRect().height),
        rows: card.children.length,
        lastRowText: (last?.innerText ?? "").trim(),
      };
    }),
  );
}

test("a finished card with no highlight is shorter than one with — no reserved row", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setSingleLeague(page, "wnba");
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(),
  }));
  // Resolve a video for the Aces game only. The Fever game gets nothing, so its
  // buttons never render and it must collapse to its natural height.
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

  await expect.poll(async () => {
    const [withVideo, without] = await measuredCards(page);
    return withVideo && without ? without.height < withVideo.height : null;
  }, { timeout: 15_000 }).toBe(true);

  const [withVideo, without] = await measuredCards(page);
  // The card that earned the row is exactly one button row taller.
  expect(withVideo.rows).toBe(without.rows + 1);
  expect(withVideo.lastRowText).toBe("WNBA");
  // And the short one ends on its team rows, not on a blank band.
  expect(without.lastRowText).not.toBe("");
});

test("a slate where nothing resolves renders no highlight row anywhere", async ({ page }) => {
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

  const cards = await measuredCards(page);
  expect(cards).toHaveLength(2);
  // Equal heights again — but because BOTH collapsed, not because both padded.
  expect(cards[0].height).toBe(cards[1].height);
  for (const card of cards) expect(card.lastRowText).not.toBe("");
});
