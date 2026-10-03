import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The NRL Grand Final card names both preliminary-final winners, so it shows
// its round and a "Show teams" button until tapped (src/lib/pairingMask.ts).
// The feed is the saved prelim event moved to week 4 / Oct 4, the way ESPN
// files the real Grand Final (event 604845).
const prelim = JSON.parse(readFileSync("tests/fixtures/nrl-prelim-final-event.json", "utf8"));
const grandFinal = {
  ...prelim,
  id: "604845",
  date: "2026-10-04T08:30Z",
  week: { number: 4 },
  status: { ...prelim.status, clock: 0, displayClock: "0'", period: 0, type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail: "Sun, October 4th at 4:30 AM EDT", shortDetail: "10/4 - 4:30 AM EDT" } },
  competitions: [{
    ...prelim.competitions[0],
    id: "604845",
    date: "2026-10-04T08:30Z",
    status: { clock: 0, displayClock: "0'", period: 0, type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail: "Sun, October 4th at 4:30 AM EDT", shortDetail: "10/4 - 4:30 AM EDT" } },
    competitors: prelim.competitions[0].competitors.map((c: Record<string, unknown>) => ({ ...c, score: "0", linescores: [], winner: undefined })),
  }],
};
// The revealed card's own accessible name ("Knights at Panthers — game
// details"); names vs abbreviations on the rows depend on the column width.
const REVEALED = /Knights at Panthers/;

test.beforeEach(async ({ page }) => {
  await page.route("**/rugby-league/3/scoreboard**", (route) => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    const events = dates.includes("20261004") ? [grandFinal] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-04:00"));
  await page.goto("/?l=rl&s=rl.0.0&dd=t&dv=s");
});

test("the NRL Grand Final hides its teams until Show teams is tapped, then stays open", async ({ page }) => {
  const mask = page.locator('[data-pairing-mask="604845"]');
  // The other columns load from the live feeds; give the board time to paint.
  await expect(mask).toBeVisible({ timeout: 20_000 });
  await expect(mask).toContainText("Grand Final");
  await expect(page.getByRole("button", { name: REVEALED })).toHaveCount(0);
  await expect(page.getByText(/Panthers|Knights/)).toHaveCount(0);

  await mask.getByRole("button", { name: /Show teams for the Grand Final/ }).click();
  await expect(mask).toHaveCount(0);
  await expect(page.getByRole("button", { name: REVEALED })).toBeVisible();

  // Stays revealed after a reload (the matchup is remembered).
  await page.reload();
  await expect(page.getByRole("button", { name: REVEALED })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-pairing-mask="604845"]')).toHaveCount(0);
});

test("a new browser masks again", async ({ browser }) => {
  const page = await browser.newPage();
  await page.route("**/rugby-league/3/scoreboard**", (route) => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: dates.includes("20261004") ? [grandFinal] : [] }) });
  });
  await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-04:00"));
  await page.goto("/?l=rl&s=rl.0.0&dd=t&dv=s");
  await expect(page.locator('[data-pairing-mask="604845"]')).toBeVisible({ timeout: 20_000 });
  await page.close();
});
