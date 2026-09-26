import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The two opt-in UEFA columns — the Nations League (added 2026-09-26) and the
// Conference League (2026-09-14) — reached through the real path a user takes:
// tick the league in Settings, then pick it from the column's league switcher.
//
// The fixtures are two real events each, read off ESPN on 2026-09-26 and
// trimmed: uefa.nations 2026-09-24 (FINAL, scores 1-1 and 3-2 in the payload)
// and uefa.europa.conf 2026-10-22 (scheduled; Kairat Almaty's 10:30 am ET home
// kickoff, Ajax–Atalanta at 3:00 pm ET, Paramount+ on both). The finished Nations League payload carries
// real scores on purpose: the card must render the matchup and never the score.

const NATIONS = readFileSync(join(__dirname, "..", "fixtures", "uefa-nations-20260924.json"), "utf8");
const CONFERENCE = readFileSync(join(__dirname, "..", "fixtures", "uefa-conference-20261022.json"), "utf8");
const EMPTY = '{"events":[]}';

async function mockScoreboard(page: Page, path: string, ymd: string, body: string) {
  // Only the fixture's own date gets the events; the column's next/previous
  // game-day lookahead sees an empty feed, so the assertions below are about
  // the slate we fed in and nothing else.
  await page.route(`**/soccer/${path}/scoreboard**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: route.request().url().includes(ymd) ? body : EMPTY }),
  );
}

async function switchColumnTo(page: Page, settingsLabel: string, switcherLabel: string) {
  // Share URL: skips onboarding, one MLB column, Today, Scores view.
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.locator("summary", { hasText: /leagues in the switcher · Edit/ }).click();
  const hide = page.getByRole("checkbox", { name: /Hide offseason/ });
  if (await hide.isChecked()) await hide.uncheck();
  const box = page.getByRole("checkbox", { name: new RegExp(`^${settingsLabel}`) });
  await box.check();
  await expect(box).toBeChecked();
  await page.getByRole("button", { name: "Close settings" }).click();

  // The column header carries title="Switch league". On the October date two
  // header buttons read "MLB"; the first is this column's.
  await page.locator('button[title="Switch league"]', { hasText: "MLB" }).first().click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await switcher.getByRole("button", { name: new RegExp(`^${switcherLabel}`) }).click();
  await expect(page.getByRole("heading", { name: switcherLabel, exact: true })).toBeVisible();
}

function cardFor(page: Page, team: string) {
  return page.getByText(team, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

test("Nations League: switch a column to it and the finished slate renders with no score", async ({ page }) => {
  await mockScoreboard(page, "uefa.nations", "20260924", NATIONS);
  await page.clock.setFixedTime(new Date("2026-09-24T20:00:00-04:00"));
  await switchColumnTo(page, "UEFA Nations League", "Nations League");

  const card = cardFor(page, "Norway");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Denmark");
  await expect(cardFor(page, "Netherlands")).toContainText("Germany");
  // No scoreline in either card, in any of the shapes a score takes.
  for (const team of ["Norway", "Netherlands"]) {
    const text = await cardFor(page, team).innerText();
    expect(text).not.toMatch(/\d+\s*[-–:]\s*\d+/);
    expect(text).not.toMatch(/(^|\n)\s*\d+\s*(\n|$)/);
  }
});

test("Conference League: switch a column to it and the scheduled slate shows ET kickoffs and Paramount+", async ({ page }) => {
  await mockScoreboard(page, "uefa.europa.conf", "20261022", CONFERENCE);
  await page.clock.setFixedTime(new Date("2026-10-22T08:00:00-04:00"));
  await switchColumnTo(page, "UEFA Conference League", "Conference League");

  const almaty = cardFor(page, "Kairat Almaty");
  await expect(almaty).toBeVisible();
  await expect(almaty).toContainText("Panathinaikos");
  await expect(almaty).toContainText("10:30");
  await expect(almaty).toContainText("Paramount");
  await expect(cardFor(page, "Ajax")).toContainText("3:00");
});
