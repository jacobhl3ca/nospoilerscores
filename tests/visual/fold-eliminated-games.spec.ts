import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// "Fold games with no playoff stakes" (Settings, Jacob 9/24, rule 10/9): an NFL
// game between two eliminated teams folds into one tap-to-open row at the end
// of the day. Fixture: a Week 16 Sunday with four games, two of them between
// teams ESPN's standings mark `e` (eliminated).

const ELIMINATED = new Set(["20", "10", "13", "19"]); // NYJ, TEN, LV, NYG

function standings(): string {
  const raw = JSON.parse(
    readFileSync(join(__dirname, "..", "fixtures", "espn-nfl-standings-level3-2026-10-07.json"), "utf8"),
  ) as { children: { children: { standings: { entries: { team: { id: string }; stats: unknown[] }[] } }[] }[] };
  for (const conf of raw.children) {
    for (const div of conf.children) {
      for (const e of div.standings.entries) {
        if (ELIMINATED.has(e.team.id)) e.stats.push({ name: "clincher", type: "clincher", displayValue: "e" });
      }
    }
  }
  return JSON.stringify(raw);
}

function prefs(): string {
  return JSON.stringify({
    favoriteLeagues: ["nfl"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    firstLeague: "nfl",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  });
}

type Side = [id: string, name: string, abbr: string];
function event(id: string, away: Side, home: Side) {
  const team = ([tid, name, abbr]: Side, homeAway: string) => ({
    homeAway,
    team: { id: tid, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
    score: "0",
    records: [{ summary: "5-10" }],
  });
  return {
    id,
    date: "2026-12-20T18:00:00Z",
    name: `${away[1]} at ${home[1]}`,
    shortName: `${away[2]} @ ${home[2]}`,
    season: { type: 2 },
    week: { number: 16 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "1:00 PM EST", shortDetail: "1:00 PM EST", completed: false },
    },
    competitions: [{ competitors: [team(home, "home"), team(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const SCOREBOARD = JSON.stringify({
  events: [
    event("401888101", ["2", "Buffalo Bills", "BUF"], ["15", "Miami Dolphins", "MIA"]),
    event("401888102", ["20", "New York Jets", "NYJ"], ["10", "Tennessee Titans", "TEN"]),
    event("401888103", ["12", "Kansas City Chiefs", "KC"], ["7", "Denver Broncos", "DEN"]),
    event("401888104", ["13", "Las Vegas Raiders", "LV"], ["19", "New York Giants", "NYG"]),
  ],
});

async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-12-20T11:00:00-05:00"));
  // Only on a fresh context: a reload must keep what the page saved.
  await page.addInitScript((blob) => {
    if (!sessionStorage.getItem("fold-seeded")) {
      localStorage.setItem("nss-preferences", blob);
      sessionStorage.setItem("fold-seeded", "1");
    }
  }, prefs());
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/football/nfl/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
  const body = standings();
  await page.route("**/football/nfl/standings**", (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
}

const column = (page: Page) => page.locator('[data-league-column="nfl"]');
const card = (page: Page, re: RegExp) => column(page).getByRole("button", { name: re });
const bills = (page: Page) => card(page, /Buffalo Bills at Miami Dolphins/);
const chiefs = (page: Page) => card(page, /Kansas City Chiefs at Denver Broncos/);
const jets = (page: Page) => card(page, /New York Jets at Tennessee Titans/);
const raiders = (page: Page) => card(page, /Las Vegas Raiders at New York Giants/);
const foldRow = (page: Page) => column(page).getByRole("button", { name: /2 games between eliminated teams/ });

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // A tap before hydration does nothing, so tap again until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

for (const width of [390, 1440]) {
  test(`fold games between eliminated teams at ${width}px`, async ({ page }) => {
    await setup(page, width);
    await page.goto("/");

    // Switch off: all four games, no fold row.
    for (const c of [bills, chiefs, jets, raiders]) await expect(c(page).first()).toBeVisible();
    await expect(foldRow(page)).toHaveCount(0);

    const dialog = await openSettings(page);
    const toggle = dialog.getByRole("checkbox", { name: /Fold games with no playoff stakes/ });
    await expect(toggle).not.toBeChecked();
    await expect(dialog.getByText("Games between two teams already out of the playoffs fold into one row.")).toBeVisible();
    await toggle.check();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Switch on: the two eliminated-vs-eliminated games leave the list for
    // one closed row at the end of the day.
    await expect(foldRow(page)).toBeVisible();
    await expect(foldRow(page)).toHaveText("▸ 2 games between eliminated teams");
    await expect(foldRow(page)).toHaveAttribute("aria-expanded", "false");
    await expect(jets(page)).toHaveCount(0);
    await expect(raiders(page)).toHaveCount(0);
    await expect(bills(page).first()).toBeVisible();
    await expect(chiefs(page).first()).toBeVisible();
    const rowBox = await foldRow(page).boundingBox();
    const lastCard = await chiefs(page).first().boundingBox();
    expect(rowBox!.y).toBeGreaterThan(lastCard!.y);

    // Tap: both appear under the row. Tap again: they fold.
    await foldRow(page).click();
    await expect(foldRow(page)).toHaveText("▾ 2 games between eliminated teams");
    await expect(foldRow(page)).toHaveAttribute("aria-expanded", "true");
    await expect(jets(page).first()).toBeVisible();
    await expect(raiders(page).first()).toBeVisible();
    await foldRow(page).click();
    await expect(jets(page)).toHaveCount(0);

    // The setting survives a reload; the open state does not.
    await page.reload();
    await expect(foldRow(page)).toBeVisible();
    await expect(foldRow(page)).toHaveAttribute("aria-expanded", "false");
    await expect(jets(page)).toHaveCount(0);
    await expect(raiders(page)).toHaveCount(0);
    await expect(bills(page).first()).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").foldEliminatedGames)).toBe(true);
  });
}
