import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

// Champions Cup from round 1 (2026-10-14, a feedback-form league request). The
// column opened on 12-05, so on Oct 14 it read "offseason" and Settings, which
// hides offseason rows by default, never listed it. Real ESPN events for round
// 1 in tests/fixtures (read 2026-10-14): Fri Oct 16 one game, Sat Oct 17 eight,
// Sun Oct 18 three, all scheduled.
const ROUND1: { date: string; name: string }[] = JSON.parse(readFileSync("tests/fixtures/rugbychamp-2026-10-round1.json", "utf8"));
const QA = process.env.CC_QA_DIR ?? "test-results/champions-cup-qa";
mkdirSync(QA, { recursive: true });

const etDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso)).replace(/-/g, "");
const SAT = ROUND1.filter((e) => etDay(e.date) === "20261017");

async function seed(page: Page, theme: "light" | "dark", now: string) {
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript((theme) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [], favoriteTeams: [], theme, showRatings: false, skipExplainer: true, skipNewsExplainer: true,
    showNews: false, leaguesOnboarded: true, firstLeague: "mlb", secondLeague: "empty", thirdLeague: "empty",
    fourthLeague: "empty", fifthLeague: "empty", hiddenLeagues: ["best", "top"], defaultDateMode: "today", defaultLandingView: "scores",
  })), theme);
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    if (!/\/scoreboard$/.test(url.pathname)) return route.fallback();
    const dates = url.searchParams.get("dates") ?? "";
    const events = url.pathname.includes("/rugby/271937/")
      ? ROUND1.filter((e) => dates === etDay(e.date) || dates === etDay(e.date).slice(0, 6) || (dates.includes("-") && dates.split("-")[0] <= etDay(e.date) && etDay(e.date) <= dates.split("-")[1]))
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

// A score a card could leak: two numbers joined by a dash.
const SCORE = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b/;

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`Oct 14, ${width}px ${theme}: Settings lists Champions Cup with Hide offseason on`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await seed(page, theme, "2026-10-14T12:00:00-04:00");
      await page.goto("/");
      const open = page.getByRole("button", { name: "Open settings", exact: true }).first();
      await expect(open).toBeVisible({ timeout: 30_000 });
      await open.click();
      const dialog = page.getByRole("dialog", { name: "Settings" });
      const more = dialog.getByRole("group", { name: "Leagues in the header switcher" }).getByRole("button", { name: "More leagues", exact: true });
      const hide = dialog.getByRole("checkbox", { name: /Hide offseason/ });
      await expect(more.or(hide).first()).toBeVisible({ timeout: 15_000 });
      if (await more.isVisible()) await more.click();
      await expect(hide).toBeChecked();
      // "Champions Cup · starts 10/16", never "· offseason".
      const row = dialog.getByRole("checkbox", { name: /^Champions Cup · starts 10\/16$/ });
      await expect(row).toBeVisible();
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${QA}/settings-${width}-${theme}-${browserName}.png` });
    });

    test(`Sat Oct 17, ${width}px ${theme}: the column shows every round 1 game that day and no score`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await seed(page, theme, "2026-10-17T07:00:00-04:00");
      await page.goto("/?l=rc&s=rc.0.0&dd=t&dv=s");
      const col = page.locator('[data-league-column="rugbychamp"]');
      await expect(col).toBeVisible({ timeout: 30_000 });
      // Today's eight, then Sunday's three under a "Tomorrow" tag (the column's
      // look-ahead), so the eight are the cards without the tag.
      const cards = col.getByRole("button", { name: / — game details$/ });
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      await expect(cards.filter({ hasNotText: "Tomorrow" })).toHaveCount(SAT.length);
      await expect(cards.filter({ hasText: "Tomorrow" })).toHaveCount(ROUND1.length - SAT.length - 1);
      await expect(col.getByRole("button", { name: /Glasgow Warriors at Sale Sharks — game details/ })).toHaveCount(1);
      await expect(col.getByRole("button", { name: /Stade Francais Paris at Bulls — game details/ })).toHaveCount(1);
      await expect(col).not.toContainText(SCORE);
      await expect(col).not.toContainText(/offseason/i);
      await page.screenshot({ path: `${QA}/board-oct17-${width}-${theme}-${browserName}.png` });
    });
  }

  test(`phone shell 390px ${theme}: the Leagues tab lists Champions Cup`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, theme, "2026-10-14T12:00:00-04:00");
    await page.goto("/");
    const tab = page.locator('.web-tab-bar button[data-tab="leagues"]');
    await expect(tab).toBeVisible({ timeout: 30_000 });
    await tab.click();
    const view = page.getByTestId("leagues-view");
    await expect(view).toBeVisible();
    const row = view.locator('button[data-league="rugbychamp"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText("Champions Cup");
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${QA}/leagues-tab-${theme}-${browserName}.png` });
  });
}

// Card face (2026-10-17): ESPN lists no TV for rugby and its short rugby name
// is the full club name, so the cards had no chip and read MON/BAT/RAC. Now the
// chip names the broadcaster for the device's country (lib/rightsHolders.ts),
// the desktop column fits words, and the phone codes never repeat.
const CHIP: [string, string, RegExp][] = [
  ["America/New_York", "FloRugby", /florugby\.com/],
  ["Europe/Warsaw", "DAZN", /dazn\.com/],
];
for (const [zone, label, href] of CHIP) {
  test.describe(`viewer in ${zone}`, () => {
    test.use({ timezoneId: zone });
    test(`Sat Oct 17, 1280px: club names in words and a ${label} chip`, async ({ page, browserName }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await seed(page, "light", "2026-10-17T07:00:00-04:00");
      await page.goto("/?l=rc&s=rc.0.0&dd=t&dv=s");
      const col = page.locator('[data-league-column="rugbychamp"]');
      const card = col.getByRole("button", { name: /Glasgow Warriors at Sale Sharks — game details/ });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const names = card.locator(".team-name-container");
      await expect(names).toHaveCount(2);
      await expect(names.nth(0)).toHaveText("Glasgow");
      await expect(names.nth(1)).toHaveText("Sale Sharks");
      for (const t of await col.locator(".team-name-container").allInnerTexts()) {
        expect(t.trim(), "a code, not a name").not.toMatch(/^[A-Z]{2,4}$/);
      }
      const chip = card.getByRole("link", { name: label, exact: true });
      await expect(chip).toBeVisible();
      await expect(chip).toHaveAttribute("href", href);
      await expect(chip).toHaveAttribute("target", "_blank");
      await page.screenshot({ path: `${QA}/chip-${label}-1280-${browserName}.png` });
    });
  });
}

test("Sat Oct 17, 390px: no club code repeats on the board", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, "light", "2026-10-17T07:00:00-04:00");
  await page.goto("/?l=rc&s=rc.0.0&dd=t&dv=s");
  const col = page.locator('[data-league-column="rugbychamp"]');
  await expect(col.getByRole("button", { name: / — game details$/ }).first()).toBeVisible({ timeout: 30_000 });
  const texts = (await col.locator(".team-name-container").allInnerTexts()).map((t) => t.trim());
  expect(texts.length).toBeGreaterThan(10);
  expect(new Set(texts).size, texts.join(" ")).toBe(texts.length);
  await page.screenshot({ path: `${QA}/codes-390-${browserName}.png` });
});
