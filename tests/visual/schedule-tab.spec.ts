import { expect, test, type Page, type Route } from "@playwright/test";

// The Schedule tab (Jacob 10/14): tab 4 of Games · Ratings · News · Schedule
// (Leagues left the bar the same day). One list of the day's games across the switcher's in-season
// leagues, grouped by league, one line per game, never a score. Boards are
// mocked so the slate is exact:
//   Wed 10/14  MLB   CLE at TB (8:08 pm, scheduled)
//              NCAAF OU at UGA (LIVE) · TEX at TENN (final)
//              NHL   7 games (no board column; the tab pulls it itself)

const NOW = new Date("2026-10-14T14:00:00-04:00"); // Wed 2 pm ET
const TODAY = "20261014";

type TeamSpec = { id: string; name: string; abbr: string };
type Status = "final" | "live" | "scheduled";

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, status: Status, clock = "7:00 PM") {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: status === "scheduled" ? "" : side === "home" ? "31" : "24",
    winner: status === "final" && side === "home",
    records: [{ summary: "3-0" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: status === "final"
      ? { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } }
      : status === "live"
        ? { displayClock: "8:12", period: 2, type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "8:12 - 2nd Quarter", shortDetail: "8:12 - 2nd", completed: false } }
        : { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: `Wed, October 14th at ${clock} EDT`, shortDetail: `10/14 - ${clock} EDT`, completed: false } },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [{ names: ["ESPN"] }], headlines: [], notes: [] }],
  };
}

const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });
const NHL_PAIRS: [string, string][] = [["NYR", "WSH"], ["BOS", "DET"], ["VAN", "SEA"], ["TOR", "MTL"], ["FLA", "BUF"], ["EDM", "CGY"], ["COL", "DAL"]];
const BOARDS: Record<string, Record<string, unknown[]>> = {
  [TODAY]: {
    "baseball/mlb": [event("m1", T("11", "Guardians", "CLE"), T("12", "Rays", "TB"), "2026-10-15T00:08:00Z", "scheduled", "8:08 PM")],
    "football/college-football": [
      event("c1", T("1", "Texas", "TEX"), T("2", "Tennessee", "TENN"), "2026-10-14T16:00:00Z", "final"),
      event("c2", T("3", "Oklahoma", "OU"), T("4", "Georgia", "UGA"), "2026-10-14T17:30:00Z", "live"),
    ],
    "hockey/nhl": NHL_PAIRS.map(([a, h], i) =>
      event(`h${i}`, T(`2${i}`, a, a), T(`3${i}`, h, h), `2026-10-14T2${3 - (i % 2)}:${String(i * 5).padStart(2, "0")}:00Z`, "scheduled", `${7 + (i % 2)}:${String(i * 5).padStart(2, "0")} PM`)),
  },
};

async function seed(page: Page, theme: "light" | "dark") {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((theme) => {
    // Seed once: the reload test must see what the page itself wrote.
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [],
      favoriteTeams: [],
      theme,
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      firstLeague: "mlb",
      secondLeague: "ncaaf",
      thirdLeague: "empty",
      fourthLeague: "empty",
      fifthLeague: "empty",
      hiddenLeagues: ["best", "top"],
      defaultDateMode: "today",
    }));
  }, theme);
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

const card = (page: Page, matchup: string) => page.getByRole("button", { name: `${matchup} — game details` });
// A score next to a team: "24-31", "24 - 31", "TB 3".
const SCORE = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b|\b(?:31|24)\b/;

async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`schedule tab 390px (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page, theme);
      await page.goto("/");
      await expect(card(page, "Oklahoma at Georgia")).toBeVisible({ timeout: 30_000 });
    });

    test("tab 4 opens one list: board leagues first, then the rest; no scores", async ({ page, browserName }) => {
      const tab = page.locator('.web-tab-bar button[data-tab="schedule"]');
      await expect(tab).toHaveText("Schedule");
      await tab.click();
      const view = page.getByTestId("schedule-view");
      await expect(view).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-view", "schedule");
      // The date strip stays; the Live pill (a board filter) does not.
      await expect(page.getByTestId("date-strip-row")).toBeVisible();
      await expect(page.getByTestId("live-toggle")).toHaveCount(0);
      await expect(view.locator('[data-schedule-league="nhl"]')).toBeVisible({ timeout: 20_000 });
      const order = await view.locator("[data-schedule-league]").evaluateAll((els) => els.map((e) => e.getAttribute("data-schedule-league")));
      expect(order.slice(0, 3)).toEqual(["mlb", "ncaaf", "nhl"]);

      const mlb = view.locator('[data-schedule-league="mlb"] [data-schedule-row]');
      await expect(mlb).toHaveCount(1);
      await expect(mlb.first()).toContainText("8:08 PM");
      await expect(mlb.first()).toContainText("CLE");
      await expect(mlb.first()).toContainText("TB");
      await expect(mlb.first()).toContainText("ESPN");
      const ncaaf = view.locator('[data-schedule-league="ncaaf"] [data-schedule-row]');
      await expect(ncaaf).toHaveCount(2);
      await expect(ncaaf.nth(0)).toContainText("LIVE");
      await expect(ncaaf.nth(1)).toContainText("Final");

      // `@` sits in one column: every row's @ has the same x.
      const ats = await view.locator("[data-schedule-row] > span:nth-child(3)").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      expect(new Set(ats).size).toBe(1);

      expect(await view.innerText()).not.toMatch(SCORE);
      await shot(page, `schedule-${browserName}-${theme}`);
    });

    test("6+ games: top 3 and Show N more; 5 or fewer: all", async ({ page }) => {
      await page.locator('.web-tab-bar button[data-tab="schedule"]').click();
      const nhl = page.locator('[data-schedule-league="nhl"]');
      await expect(nhl).toBeVisible({ timeout: 20_000 });
      await expect(nhl.locator("[data-schedule-row]")).toHaveCount(3);
      const more = nhl.getByRole("button", { name: "Show 4 more" });
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.click();
      await expect(nhl.locator("[data-schedule-row]")).toHaveCount(7);
      await expect(nhl.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator('[data-schedule-league="mlb"]').getByRole("button", { name: /^Show/ })).toHaveCount(0);
    });

    test("view survives a reload (nss-last-view); Games leaves it", async ({ page }) => {
      await page.locator('.web-tab-bar button[data-tab="schedule"]').click();
      await expect(page.getByTestId("schedule-view")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("nss-last-view"))).toBe("schedule");
      await page.reload();
      await expect(page.getByTestId("schedule-view")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute("data-view", "schedule");
      expect(await page.evaluate(() => localStorage.getItem("nss-last-view"))).toBe("schedule");
      // dispatchEvent: the dev build's Next.js button sits over the Games tab.
      await page.locator('.web-tab-bar button[data-tab="scores-plain"]').dispatchEvent("click");
      await expect(page.getByTestId("schedule-view")).toHaveCount(0);
      await expect(card(page, "Oklahoma at Georgia")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("nss-last-view"))).toBe("scores-plain");
    });

    test("a row tap opens the game's modal", async ({ page }) => {
      await page.locator('.web-tab-bar button[data-tab="schedule"]').click();
      await page.locator('[data-schedule-league="mlb"] [data-schedule-row]').first().click();
      await expect(page.locator('[aria-modal="true"]').first()).toBeVisible();
    });
  });
}

test("desktop 1280px: inline tab, list centred at 720 px max", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, "light");
  await page.goto("/");
  await expect(card(page, "Oklahoma at Georgia")).toBeVisible({ timeout: 30_000 });
  const tabs = page.locator("header button[data-tab]");
  await expect(tabs).toHaveCount(4);
  await page.locator('header button[data-tab="schedule"]').click();
  const view = page.getByTestId("schedule-view");
  await expect(view).toBeVisible();
  await expect(page.getByRole("button", { name: "Go back one day" })).toBeVisible();
  const box = (await view.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(720);
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(12);
  // All four tabs fit inside the header.
  for (const b of await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))) expect(b).toBeGreaterThan(40);
  await shot(page, `schedule-desktop-${browserName}`);
});
