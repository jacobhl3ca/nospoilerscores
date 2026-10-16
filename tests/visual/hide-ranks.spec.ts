import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Settings' "Show team ranks and seeds" (Jacob 9/30: "hide rankings of teams
// like #8 phillies"). Off: no "#N" chip on any game card — the MLB standing
// and the NCAAF poll rank both — and the MLB bracket keeps its seed slots but
// drops the numbers. The choice is in the prefs blob, so it survives a reload
// and reaches the standalone bracket page too.
//
// ESPN is stubbed: one upcoming PHI-ATL game whose standings put the Phillies
// 8th, and one upcoming college game with a #5 poll rank. StatsAPI is stubbed
// with the 2025 field and the 2026 postseason as it stood on 9/23 (all TBD),
// the same fixture bracket-picks.spec uses.

const fx = (y: number) => readFileSync(join(__dirname, "..", "fixtures", `mlb-postseason-${y}.json`), "utf8");

type Row = [number, string, string, number, number, boolean?];
const DIVISIONS: Record<number, Row[]> = {
  201: [[141, "Toronto Blue Jays", "TOR", 94, 68, true], [147, "New York Yankees", "NYY", 94, 68], [111, "Boston Red Sox", "BOS", 89, 73]],
  202: [[114, "Cleveland Guardians", "CLE", 88, 74, true], [116, "Detroit Tigers", "DET", 87, 75]],
  200: [[136, "Seattle Mariners", "SEA", 90, 72, true]],
  205: [[158, "Milwaukee Brewers", "MIL", 97, 65, true], [112, "Chicago Cubs", "CHC", 92, 70], [113, "Cincinnati Reds", "CIN", 83, 79]],
  204: [[143, "Philadelphia Phillies", "PHI", 96, 66, true]],
  203: [[119, "Los Angeles Dodgers", "LAD", 93, 69, true], [135, "San Diego Padres", "SD", 90, 72]],
};
const statsApiStandings = {
  records: Object.entries(DIVISIONS).map(([id, rows]) => ({
    division: { id: Number(id) },
    lastUpdated: "2026-09-25T04:00:00Z",
    teamRecords: rows.map(([tid, name, abbreviation, wins, losses, leader]) => ({
      team: { id: tid, name, abbreviation },
      wins, losses,
      winningPercentage: (wins / (wins + losses)).toFixed(3).replace(/^0/, ""),
      divisionLeader: !!leader,
      clinched: true,
      eliminationNumber: "-",
      wildCardEliminationNumber: "-",
    })),
  })),
};

// One table with a rank stat on every row, so lib/standingsRank.ts takes the
// rank as given: PHI (ESPN id 22) is 8th, ATL (15) is 20th.
const espnMlbStandings = {
  standings: {
    entries: [
      { team: { id: "22" }, stats: [{ name: "rank", value: 8 }, { name: "gamesPlayed", value: 157 }] },
      { team: { id: "15" }, stats: [{ name: "rank", value: 20 }, { name: "gamesPlayed", value: 157 }] },
    ],
  },
};

type Side = { id: string; name: string; short: string; abbr: string; home: boolean; rank?: number };
function scoreboard(id: string, date: string, a: Side, b: Side) {
  const competitor = (t: Side) => ({
    homeAway: t.home ? "home" : "away",
    team: { id: t.id, displayName: t.name, shortDisplayName: t.short, abbreviation: t.abbr, logo: "", color: "333333" },
    score: "0",
    ...(t.rank != null ? { curatedRank: { current: t.rank } } : {}),
  });
  return {
    events: [{
      id,
      date,
      name: `${a.name} at ${b.name}`,
      shortName: `${a.abbr} @ ${b.abbr}`,
      season: { type: 2 },
      status: {
        displayClock: "0:00",
        period: 0,
        type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Scheduled", shortDetail: "Scheduled", completed: false },
      },
      competitions: [{ competitors: [competitor(a), competitor(b)], broadcasts: [], headlines: [], notes: [] }],
    }],
  };
}

const MLB = scoreboard("401999101", "2026-09-25T23:05:00Z",
  { id: "15", name: "Atlanta Braves", short: "Braves", abbr: "ATL", home: false },
  { id: "22", name: "Philadelphia Phillies", short: "Phillies", abbr: "PHI", home: true });
const NCAAF = scoreboard("401999102", "2026-09-25T23:30:00Z",
  { id: "251", name: "Texas Longhorns", short: "Texas", abbr: "TEX", home: false, rank: 5 },
  { id: "61", name: "Georgia Bulldogs", short: "Georgia", abbr: "UGA", home: true, rank: 99 });

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-25T12:00:00-04:00"));
  // Seed once per tab, so a reload reads back what the toggle wrote.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["mlb", "ncaaf"],
      favoriteTeams: [],
      theme: "light",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      switcherDefaultsVersion: 2,
      wideSlotsVersion: 1,
      firstLeague: "mlb",
      secondLeague: "ncaaf",
      thirdLeague: "empty",
      fourthLeague: "empty",
      fifthLeague: "empty",
      defaultDateMode: "today",
      defaultLandingView: "scores",
    }));
  });
  await page.route("**/news/highlights.json", (r) => r.fulfill({ json: { games: {} } }));
  await page.route("**/baseball/mlb/scoreboard?**", (r) => r.fulfill({ json: MLB }));
  await page.route("**/football/college-football/scoreboard?**", (r) => r.fulfill({ json: NCAAF }));
  await page.route("**/site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings**", (r) => r.fulfill({ json: espnMlbStandings }));
  await page.route("**/site.web.api.espn.com/apis/v2/sports/football/college-football/standings**", (r) => r.fulfill({ json: {} }));
  await page.route("**/statsapi.mlb.com/api/v1/standings**", (r) => r.fulfill({ json: statsApiStandings }));
  await page.route("**/statsapi.mlb.com/api/v1/schedule/postseason/series**", (r) =>
    r.fulfill({ body: fx(2026), contentType: "application/json" }));
  await page.route("**/api/picks**", (r) => r.fulfill({ json: { board: "mlb-2026", locked: false, count: 0, names: [] } }));
}

async function openBracket(page: Page) {
  await page.locator('[data-recap-playoffs-tab="bracket"]').first().click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "MLB playoff picture" });
  const reveal = dialog.getByRole("button", { name: /Show the playoff picture/ });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await expect(dialog.locator("[data-bracket-team]").first()).toBeVisible();
  return dialog;
}

// The first seed slot's offset and width inside its seat. A dropped slot would
// pull the logo and abbreviation left.
async function firstSeedSlot(dialog: Locator) {
  return dialog.locator("[data-bracket-seed]").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const seat = el.parentElement!.getBoundingClientRect();
    return { left: r.left - seat.left, width: r.width };
  });
}

async function seedTexts(scope: Locator) {
  return (await scope.locator("[data-bracket-seed]").allTextContents()).map((t) => t.trim());
}

for (const width of [390, 1440]) {
  test(`${width}px: the ranks toggle hides #N chips and bracket seeds, and survives a reload`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/");

    // Shown by default: the Phillies' standing and Texas' poll rank.
    const ranks = page.locator(".team-rank");
    await expect(ranks.filter({ hasText: "#8" }).first()).toBeAttached({ timeout: 20_000 });
    await expect(ranks.filter({ hasText: "#5" }).first()).toBeAttached({ timeout: 20_000 });
    await expect(page.locator(".team-rank", { hasText: "#99" })).toHaveCount(0);

    // The bracket shows seed numbers before the toggle.
    let dialog = await openBracket(page);
    const before = await seedTexts(dialog);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((t) => /^\d+$/.test(t))).toBe(true);
    const slot = await firstSeedSlot(dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Turn it off in Settings, next to the Records row.
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const toggle = settings.getByRole("checkbox", { name: /Show team ranks and seeds/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await settings.getByRole("button", { name: "Close settings" }).first().click();
    await expect(page.locator(".team-rank")).toHaveCount(0);

    // Reload: the choice stays.
    await page.reload();
    await expect(page.locator('[data-recap-playoffs-tab="bracket"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Phillies").first()).toBeVisible();
    await expect(page.getByText("Texas").first()).toBeVisible();
    await expect(page.locator(".team-rank")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").hideRanks)).toBe(true);

    // The bracket keeps a slot per seed, with no number in it.
    dialog = await openBracket(page);
    const after = await seedTexts(dialog);
    expect(after.length).toBe(before.length);
    expect(after.every((t) => t === "")).toBe(true);
    expect(await firstSeedSlot(dialog)).toEqual(slot);
    await page.screenshot({ path: `test-results/hide-ranks-bracket-${width}.png` });
    await page.keyboard.press("Escape");

    // The standalone bracket page reads the saved choice too.
    await page.goto("/mlb-playoff-bracket");
    const pageSeeds = page.locator("[data-bracket-seed]");
    await expect(pageSeeds.first()).toBeAttached({ timeout: 20_000 });
    expect((await seedTexts(page.locator("body"))).every((t) => t === "")).toBe(true);
  });
}
