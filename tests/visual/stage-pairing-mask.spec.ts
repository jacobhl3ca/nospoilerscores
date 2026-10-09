import { expect, test, type Page } from "@playwright/test";

// MLS and Libertadores knockouts carry no playoff flag; the round comes off
// season.slug (src/lib/espn.ts deriveStage), and a later-round card names who
// won the round before, so it shows a "Show teams" cover until tapped
// (src/lib/pairingMask.ts). Slugs read 2026-10-03 off the 2025 playoffs; team
// names are placeholders.
const DAY = "20261122";
const START = "2026-11-22T20:00Z";

function event(id: string, slug: string, home: string, away: string) {
  const status = { clock: 0, displayClock: "0'", period: 0, type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail: "Sun, November 22nd at 3:00 PM EST", shortDetail: "11/22 - 3:00 PM EST" } };
  return {
    id, uid: `s:600~e:${id}`, date: START, name: `${away} at ${home}`, shortName: "AWY @ HOM",
    season: { year: 2026, type: 2, slug },
    status,
    competitions: [{
      id, date: START, status, notes: [], broadcasts: [],
      venue: { fullName: "Placeholder Stadium", address: { city: "Placeholder" } },
      competitors: [
        { id: `${id}1`, homeAway: "home", score: "0", team: { id: `${id}1`, abbreviation: "HOM", displayName: home, shortDisplayName: home } },
        { id: `${id}2`, homeAway: "away", score: "0", team: { id: `${id}2`, abbreviation: "AWY", displayName: away, shortDisplayName: away } },
      ],
    }],
  };
}

const MLS = event("401900201", "western-conference-playoffs---semifinals", "Harbor FC", "Canyon SC");
const LIB = event("401900202", "semifinals", "Club Norte", "Club Sur");

const prefs = {
  favoriteLeagues: ["mls", "libertadores"], favoriteTeams: [], theme: "dark", showRatings: true, defaultRatings: "on",
  skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
  firstLeague: "mls", secondLeague: "libertadores", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
  defaultDateMode: "today", defaultLandingView: "scores",
};

async function openBoard(page: Page) {
  for (const [path, ev] of [["usa.1", MLS], ["conmebol.libertadores", LIB]] as const) {
    await page.route(`**/soccer/${path}/scoreboard**`, (route) => {
      const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
      const body = JSON.stringify({ events: dates.startsWith(DAY) ? [ev] : [] });
      return route.fulfill({ status: 200, contentType: "application/json", body });
    });
  }
  await page.route(/gc\.zgo\.at|stats\.hidescore\.com|goatcounter|sentry\.io/, (r) => r.abort());
  await page.clock.setFixedTime(new Date("2026-11-22T12:00:00-05:00"));
  await page.addInitScript((p) => { if (!localStorage.getItem("nss-preferences")) localStorage.setItem("nss-preferences", JSON.stringify(p)); }, prefs);
  await page.goto("/");
}

const CASES = [
  { league: "MLS", ev: MLS, round: "West Semifinal", matchup: /Canyon SC at Harbor FC/ },
  { league: "Libertadores", ev: LIB, round: "Semifinals", matchup: /Club Sur at Club Norte/ },
];

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const c of CASES) {
      test(`${c.league}: a later round is covered until Show teams, then the modal names the round`, async ({ page }) => {
        await openBoard(page);
        const mask = page.locator(`[data-pairing-mask="${c.ev.id}"]`);
        await mask.scrollIntoViewIfNeeded({ timeout: 20_000 });
        await expect(mask).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("button", { name: c.matchup })).toHaveCount(0);

        await mask.getByRole("button", { name: /^Show teams for the / }).click();
        await expect(mask).toHaveCount(0);
        const card = page.getByRole("button", { name: c.matchup }).first();
        await expect(card).toBeVisible();

        await card.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(c.round, { exact: true })).toBeVisible();
      });
    }
  });
}
