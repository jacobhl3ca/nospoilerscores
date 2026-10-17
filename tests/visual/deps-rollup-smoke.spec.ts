import { expect, test, type Page, type Route } from "@playwright/test";

// Smoke check for the Dependabot roll-up (Next 16.4, Playwright 1.64,
// Capacitor 8.5, @types/node 26). The board must still boot, hydrate without a
// client error, draw a mocked game card, open and close its details sheet, and
// keep the page inside the viewport — at a phone width (390) and a wide
// desktop (1440). Boards are mocked so the run never depends on live ESPN data.

const NOW = new Date("2026-09-29T14:00:00-04:00"); // Tue 2 pm ET
const TODAY = "20260929";

function event(id: string, away: string, home: string, iso: string) {
  const competitor = (name: string, abbr: string, teamId: string, side: "home" | "away") => ({
    homeAway: side,
    team: { id: teamId, displayName: name, shortDisplayName: name, abbreviation: abbr, logo: "", color: "666666" },
    score: "",
    winner: false,
    records: [{ summary: "3-0" }],
  });
  return {
    id,
    date: iso,
    name: `${away} at ${home}`,
    shortName: `${away.slice(0, 3).toUpperCase()} @ ${home.slice(0, 3).toUpperCase()}`,
    season: { type: 2, year: 2026 },
    status: { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Tue, September 29th at 7:05 PM EDT", shortDetail: "9/29 - 7:05 PM EDT", completed: false } },
    competitions: [{
      competitors: [competitor(home, "SF", "12", "home"), competitor(away, "LAD", "11", "away")],
      broadcasts: [], headlines: [], notes: [],
    }],
  };
}

const BOARDS: Record<string, Record<string, unknown[]>> = {
  [TODAY]: { "baseball/mlb": [event("m1", "Dodgers", "Giants", "2026-09-29T23:05:00Z")] },
};

async function seed(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [], favoriteTeams: [], theme: "dark",
    showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
    leaguesOnboarded: true, firstLeague: "mlb", secondLeague: "empty",
    thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
    hiddenLeagues: ["best", "top"], defaultDateMode: "today", defaultLandingView: "scores",
  })));
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = BOARDS[url.searchParams.get("dates") ?? ""]?.[m[1]] ?? [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

for (const width of [390, 1440]) {
  test(`board boots, hydrates and opens a game card at ${width}px`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    const hydration: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /hydrat/i.test(msg.text())) hydration.push(msg.text());
    });

    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto("/");

    const card = page.getByRole("button", { name: "Dodgers at Giants — game details" });
    await expect(card).toBeVisible({ timeout: 30_000 });

    // The details sheet takes focus on open and hands it back on Escape.
    await card.click();
    await expect.poll(() => card.evaluate((el) => document.activeElement !== el)).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => card.evaluate((el) => document.activeElement === el)).toBe(true);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(pageErrors, "uncaught client errors").toEqual([]);
    expect(hydration, "hydration errors").toEqual([]);
  });
}
