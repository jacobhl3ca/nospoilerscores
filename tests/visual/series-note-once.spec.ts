import { expect, test, type Page, type Route } from "@playwright/test";

// Playoffs: a league column's subtitle already reads "NLWC · Game 3", so its
// pre-game cards leave out their own "Game 3" line (said once per column, not
// on every card). The ESPN front page column mixes leagues and has no playoff
// subtitle, so its cards keep the line. A column whose games carry different
// numbers (Game 2 + Game 3) drops the number from the subtitle, so its cards
// keep theirs too. Wild Card games only: a later round masks its teams until
// revealed (pairingMask), and a masked card has no game line at all. Two widths because the card line renders in two places:
// its own row below xl, inline in the status bar at xl and up (GameCard.tsx).

const NOW = new Date("2026-09-30T12:00:00-04:00");
const TODAY = "20260930";

type TeamSpec = { id: string; name: string; abbr: string };

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, headline: string) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: "0",
    records: [{ summary: "90-72" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 3, year: 2026 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Wed, September 30th at 7:08 PM EDT", shortDetail: "9/30 - 7:08 PM EDT", completed: false },
    },
    competitions: [{
      competitors: [competitor(home, "home"), competitor(away, "away")],
      series: { type: "playoff", summary: "Series tied 1-1", completed: false, totalCompetitions: 3 },
      broadcasts: [],
      headlines: [],
      notes: [{ type: "event", headline }],
    }],
  };
}

const NLWC_GAME_3 = event("m1", { id: "19", name: "Dodgers", abbr: "LAD" }, { id: "22", name: "Phillies", abbr: "PHI" }, "2026-09-30T23:08:00Z", "NLWC - Game 3");
const ALWC_GAME_2 = event("m2", { id: "2", name: "Red Sox", abbr: "BOS" }, { id: "10", name: "Yankees", abbr: "NYY" }, "2026-09-30T17:08:00Z", "ALWC - Game 2");
const NLWC_GAME_3_LATE = event("m3", { id: "21", name: "Mets", abbr: "NYM" }, { id: "15", name: "Braves", abbr: "ATL" }, "2026-09-30T21:08:00Z", "NLWC - Game 3");

async function seed(page: Page, column: "mlb" | "top", mlbEvents: unknown[]) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((column) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "light",
    showRatings: true,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: column,
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    hiddenLeagues: ["best"],
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })), column);
  await page.route("**/news/highlights.json", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/oneFeed/frontpage**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"feed":[]}' }));
  const strip = {
    sports: [{
      slug: "baseball",
      leagues: [{ slug: "mlb", events: mlbEvents.map((e, i) => ({ id: (e as { id: string }).id, priority: i })) }],
    }],
  };
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(strip) }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = m[1] === "baseball/mlb" && url.searchParams.get("dates") === TODAY ? mlbEvents : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route: Route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

const cardsIn = (page: Page, column: string) =>
  page.locator(`[data-league-column="${column}"]`).getByRole("button", { name: / — game details$/ });

// The visible "Game N" line inside one card (banner below xl, inline at xl).
const visibleGameLine = (card: ReturnType<typeof cardsIn>, n: number) =>
  card.getByText(`Game ${n}`, { exact: true }).locator("visible=true");

for (const width of [390, 1440]) {
  test(`MLB column at ${width}px: subtitle says "Game 3", the card does not`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, "mlb", [NLWC_GAME_3]);
    await page.goto("/");

    const col = page.locator('[data-league-column="mlb"]');
    const cards = cardsIn(page, "mlb");
    await expect(cards).toHaveCount(1, { timeout: 30_000 });
    await expect(col).toContainText(/Game 3|G3/);
    // Neither render spot mounts the line, visible or display:none.
    const cardHtml = await cards.first().evaluate((el) => el.outerHTML);
    expect(cardHtml).not.toMatch(/Game 3/);
    const header = (await col.innerText()).replace(await cards.first().innerText(), "");
    expect(header).toMatch(/Game 3|G3/);
  });

  test(`ESPN.com column at ${width}px: the same game keeps its "Game 3" line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, "top", [NLWC_GAME_3]);
    await page.goto("/");

    const cards = cardsIn(page, "top");
    await expect(cards).toHaveCount(1, { timeout: 30_000 });
    await expect(visibleGameLine(cards.first(), 3)).toHaveCount(1);
  });

  test(`MLB column at ${width}px with Game 2 + Game 3: each card keeps its line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, "mlb", [ALWC_GAME_2, NLWC_GAME_3_LATE]);
    await page.goto("/");

    const col = page.locator('[data-league-column="mlb"]');
    await expect(cardsIn(page, "mlb")).toHaveCount(2, { timeout: 30_000 });
    await expect(col).not.toContainText(/Wild Card · (Game|G)\d/);
    await expect(visibleGameLine(col.getByRole("button", { name: "Red Sox at Yankees — game details" }), 2)).toHaveCount(1);
    await expect(visibleGameLine(col.getByRole("button", { name: "Mets at Braves — game details" }), 3)).toHaveCount(1);
  });
}
