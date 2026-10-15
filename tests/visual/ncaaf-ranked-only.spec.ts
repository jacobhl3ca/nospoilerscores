import { expect, test, type Page } from "@playwright/test";

// NCAAF "Ranked only" (Settings → Leagues): with the switch on, the college
// football column keeps only the games where at least one team carries a poll
// rank, and the choice survives a reload. A day with no ranked game shows one
// line instead of an empty column.
//
// ESPN is stubbed with upcoming games only (no score, no result): two with a
// ranked team (curatedRank 1..25) and two without (99 = unranked, and no
// curatedRank at all).

type Side = { id: string; name: string; short: string; abbr: string; rank?: number };
function event(id: string, away: Side, home: Side) {
  const competitor = (t: Side, homeAway: string) => ({
    homeAway,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.short, abbreviation: t.abbr, logo: "", color: "333333" },
    score: "0",
    ...(t.rank != null ? { curatedRank: { current: t.rank } } : {}),
  });
  return {
    id,
    date: "2026-10-17T19:30:00Z",
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Scheduled", shortDetail: "Scheduled", completed: false },
    },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const TEXAS = { id: "251", name: "Texas Longhorns", short: "Texas", abbr: "TEX", rank: 5 };
const GEORGIA = { id: "61", name: "Georgia Bulldogs", short: "Georgia", abbr: "UGA", rank: 99 };
const OREGON = { id: "2483", name: "Oregon Ducks", short: "Oregon", abbr: "ORE", rank: 3 };
const PENN_STATE = { id: "213", name: "Penn State Nittany Lions", short: "Penn State", abbr: "PSU", rank: 12 };
const KANSAS = { id: "2305", name: "Kansas Jayhawks", short: "Kansas", abbr: "KU", rank: 99 };
const BAYLOR = { id: "239", name: "Baylor Bears", short: "Baylor", abbr: "BAY" };
const RICE = { id: "242", name: "Rice Owls", short: "Rice", abbr: "RICE" };
const TULSA = { id: "202", name: "Tulsa Golden Hurricane", short: "Tulsa", abbr: "TLSA" };

const MIXED = {
  events: [
    event("401999201", TEXAS, GEORGIA),
    event("401999202", KANSAS, BAYLOR),
    event("401999203", PENN_STATE, OREGON),
    event("401999204", RICE, TULSA),
  ],
};
const NONE_RANKED = { events: [event("401999202", KANSAS, BAYLOR), event("401999204", RICE, TULSA)] };

async function setup(page: Page, width: number, scoreboard: object, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00-04:00"));
  // Seed once per tab, so a reload reads back what the switch wrote.
  await page.addInitScript((blob) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("nss-preferences", blob);
  }, JSON.stringify({
    favoriteLeagues: ["ncaaf"],
    favoriteTeams: [],
    // No theme pinned: the page follows the device.
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    wideSlotsVersion: 1,
    firstLeague: "ncaaf",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  }));
  await page.route("**/api/me", (r) => r.fulfill({
    json: { signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } },
  }));
  await page.route("**/news/highlights.json", (r) => r.fulfill({ json: { games: {} } }));
  await page.route("**/football/college-football/scoreboard?**", (r) => r.fulfill({ json: scoreboard }));
  await page.route("**/site.web.api.espn.com/apis/v2/sports/football/college-football/standings**", (r) => r.fulfill({ json: {} }));
}

const column = (page: Page) => page.locator('[data-league-column="ncaaf"]');
const card = (page: Page, home: string) => column(page).getByRole("button", { name: new RegExp(` at ${home}`) });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // A tap before hydration does nothing, so tap again until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

async function expectRankedOnly(page: Page) {
  await expect(card(page, "Georgia Bulldogs").first()).toBeVisible({ timeout: 20_000 });
  await expect(card(page, "Oregon Ducks").first()).toBeVisible();
  await expect(card(page, "Baylor Bears")).toHaveCount(0);
  await expect(card(page, "Tulsa Golden Hurricane")).toHaveCount(0);
}

for (const width of [390, 1440]) {
  test(`${width}px: Ranked only keeps the ranked NCAAF games and survives a reload`, async ({ page }) => {
    await setup(page, width, MIXED);
    await page.goto("/");

    // Off by default: every game shows.
    for (const home of ["Georgia Bulldogs", "Baylor Bears", "Oregon Ducks", "Tulsa Golden Hurricane"]) {
      await expect(card(page, home).first()).toBeVisible({ timeout: 20_000 });
    }

    const dialog = await openSettings(page);
    const toggle = dialog.getByRole("checkbox", { name: /Ranked only/ });
    await expect(toggle).not.toBeChecked();
    // The whole row is the tap target.
    const row = dialog.getByTestId("ncaaf-ranked-only");
    await row.scrollIntoViewIfNeeded();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.check();
    expect((await saved(page)).ncaafRankedOnly).toBe(true);
    await page.screenshot({ path: `test-results/ncaaf-ranked-only-settings-${width}.png` });
    await dialog.getByRole("button", { name: "Close settings" }).first().click();
    await expect(dialog).toBeHidden();

    await expectRankedOnly(page);

    await page.reload();
    await expectRankedOnly(page);
    expect((await saved(page)).ncaafRankedOnly).toBe(true);
    const again = await openSettings(page);
    await expect(again.getByRole("checkbox", { name: /Ranked only/ })).toBeChecked();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `test-results/ncaaf-ranked-only-board-${width}.png` });
  });

  test(`${width}px: Ranked only on a day with no ranked game shows one line`, async ({ page }) => {
    await setup(page, width, NONE_RANKED, { ncaafRankedOnly: true });
    await page.goto("/");
    const empty = column(page).locator("[data-ranked-only-empty]");
    await expect(empty).toBeVisible({ timeout: 20_000 });
    await expect(empty).toHaveText("No ranked games today");
    await expect(card(page, "Baylor Bears")).toHaveCount(0);
    await expect(card(page, "Tulsa Golden Hurricane")).toHaveCount(0);
  });
}
