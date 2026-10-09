import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The MLB bracket covers each round's series winners until the reader taps for
// that round, on the board and on /mlb-playoff-bracket alike. The postseason
// feed is 2025's, cut to the Wild Card and Division Series rounds, so the field
// has WC and DS results and nothing later. Standings put the 2025 field in its
// real seeds (the same table bracket-picks.spec uses); ESPN odds are empty.

type Row = [number, string, string, number, number, boolean?];
const DIVISIONS: Record<number, Row[]> = {
  201: [[141, "Toronto Blue Jays", "TOR", 94, 68, true], [147, "New York Yankees", "NYY", 94, 68], [111, "Boston Red Sox", "BOS", 89, 73]],
  202: [[114, "Cleveland Guardians", "CLE", 88, 74, true], [116, "Detroit Tigers", "DET", 87, 75]],
  200: [[136, "Seattle Mariners", "SEA", 90, 72, true]],
  205: [[158, "Milwaukee Brewers", "MIL", 97, 65, true], [112, "Chicago Cubs", "CHC", 92, 70], [113, "Cincinnati Reds", "CIN", 83, 79]],
  204: [[143, "Philadelphia Phillies", "PHI", 96, 66, true]],
  203: [[119, "Los Angeles Dodgers", "LAD", 93, 69, true], [135, "San Diego Padres", "SD", 90, 72]],
};
const standings = {
  records: Object.entries(DIVISIONS).map(([id, rows]) => ({
    division: { id: Number(id) },
    lastUpdated: "2026-10-05T04:00:00Z",
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

// Wild Card ("F") and Division Series ("D") games only.
const full = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "mlb-postseason-2025.json"), "utf8")) as {
  series: { games: { gameType: string }[] }[];
};
const feed = { series: full.series.filter((s) => ["F", "D"].includes(s.games[0]?.gameType)) };

async function stub(page: Page) {
  await page.route("**/statsapi.mlb.com/api/v1/standings**", (r) => r.fulfill({ json: standings }));
  await page.route("**/statsapi.mlb.com/api/v1/schedule/postseason/series**", (r) => r.fulfill({ json: feed }));
  await page.route("**/site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/picks**", (r) => r.fulfill({ status: 503, json: { disabled: true } }));
}

// Advanced seats: a club a series result moved into a later round.
const advanced = (scope: Locator, round: string) => scope.locator(`[data-bracket-round="${round}"] [data-bracket-advanced]`);

async function openBoard(page: Page, coverLifted = false) {
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await page.getByRole("button", { name: "Today", exact: true }).click({ timeout: 20_000 });
  await page.locator('[data-recap-playoffs-tab="bracket"], [data-recap-bracket]').first().click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "MLB playoff picture" });
  await expect(dialog.getByRole("tab", { name: "Bracket" })).toBeVisible();
  await dialog.getByRole("tab", { name: "Bracket" }).click();
  if (!coverLifted) {
    await expect(dialog.locator("[data-picture-body]")).toHaveAttribute("aria-hidden", "true");
    await dialog.getByRole("button", { name: /Show the playoff picture/ }).click();
  }
  await expect(dialog.locator("[data-picture-body]")).not.toHaveAttribute("aria-hidden", "true");
  await expect(dialog.locator("[data-bracket-team]")).toHaveCount(12);
  return dialog;
}

async function openPage(page: Page) {
  await page.goto("/mlb-playoff-bracket");
  const region = page.getByRole("region", { name: "MLB playoff picture" });
  await expect(region.locator("[data-bracket-team]")).toHaveCount(12, { timeout: 20_000 });
  return region;
}

for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(vp.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.clock.setFixedTime(new Date("2026-10-08T12:00:00-04:00"));
      await stub(page);
    });

    test("board: one cover per round, and the Wild Card tap survives a reload", async ({ page }) => {
      const dialog = await openBoard(page);
      const toggle = dialog.locator("[data-bracket-results-toggle]");
      await expect(toggle).toHaveText("Show Wild Card results");
      // Nothing moved up: no DS winner in an LCS seat, no WC winner in a DS seat.
      await expect(advanced(dialog, "championship")).toHaveCount(0);
      await expect(advanced(dialog, "divisionSeries")).toHaveCount(0);
      await expect(dialog.locator("[data-bracket-outcome]")).toHaveCount(0);
      await page.screenshot({ path: `test-results/round-covers-board-${vp.name}-covered.png` });

      await toggle.click();
      await expect(advanced(dialog, "divisionSeries")).toHaveCount(4);
      await expect(advanced(dialog, "championship")).toHaveCount(0);
      await expect(toggle).toHaveText("Show Division Series results");
      await expect(dialog.locator("[data-bracket-results-always]")).toHaveCount(0);
      await page.screenshot({ path: `test-results/round-covers-board-${vp.name}-wc.png` });

      const again = await openBoard(page, true);
      await expect(advanced(again, "divisionSeries")).toHaveCount(4);
      await expect(advanced(again, "championship")).toHaveCount(0);
      await expect(again.locator("[data-bracket-results-toggle]")).toHaveText("Show Division Series results");
    });

    test("search page: the same per-round tap", async ({ page }) => {
      const region = await openPage(page);
      const toggle = region.locator("[data-bracket-results-toggle]");
      await expect(toggle).toHaveText("Show Wild Card results");
      await expect(advanced(region, "divisionSeries")).toHaveCount(0);
      await toggle.click();
      await expect(advanced(region, "divisionSeries")).toHaveCount(4);
      await expect(advanced(region, "championship")).toHaveCount(0);
      await expect(toggle).toHaveText("Show Division Series results");
      await page.screenshot({ path: `test-results/round-covers-page-${vp.name}-wc.png` });

      // The tap is stored per round, not per visit.
      const again = await openPage(page);
      await expect(advanced(again, "divisionSeries")).toHaveCount(4);
      await expect(again.locator("[data-bracket-results-toggle]")).toHaveText("Show Division Series results");

      // The Division Series tap moves its winners into the LCS seats.
      await again.locator("[data-bracket-results-toggle]").click();
      await expect(advanced(again, "championship")).toHaveCount(4);
      await expect(again.locator("[data-bracket-results-toggle]")).toHaveCount(0);
    });

    test("Always show results shows every round and survives a reload", async ({ page }) => {
      const dialog = await openBoard(page);
      await dialog.locator("[data-bracket-results-always]").click();
      await expect(advanced(dialog, "divisionSeries")).toHaveCount(4);
      await expect(advanced(dialog, "championship")).toHaveCount(4);
      await expect(dialog.locator("[data-bracket-results-toggle]")).toHaveCount(0);

      const again = await openBoard(page, true);
      await expect(advanced(again, "championship")).toHaveCount(4);
      await expect(again.locator("[data-bracket-results-toggle]")).toHaveCount(0);

      const region = await openPage(page);
      await expect(advanced(region, "championship")).toHaveCount(4);
      await expect(region.locator("[data-bracket-results-toggle]")).toHaveCount(0);

      // Settings → "Cover MLB bracket results" turns the covers back on.
      await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
      await page.getByRole("button", { name: "Open settings" }).first().click();
      await page.getByText("More settings", { exact: true }).click();
      const row = page.getByText("Cover MLB bracket results");
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await expect.poll(() => page.evaluate(() => localStorage.getItem("mlb-bracket-results-always"))).toBeNull();
      await expect(row).toHaveCount(0);
      const covered = await openPage(page);
      await expect(covered.locator("[data-bracket-results-toggle]")).toHaveText("Show Wild Card results");
      await expect(advanced(covered, "divisionSeries")).toHaveCount(0);
    });
  });
}
