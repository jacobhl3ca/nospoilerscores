import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The year-round Tennis column (Jacob 10/11): the ATP Masters 1000s, the WTA
// 1000s and the two tour Finals in one opt-in column, men and women merged.
// The feeds are ESPN's own ATP + WTA scoreboards from Oct 11 2026 (trimmed):
// Shanghai (men), Wuhan (women), the China Open (women's draw counts, the
// men's is a 500) and four lower-level WTA events that must stay off.

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/tennis-tour-2026-10-11.json"), "utf8"),
) as { atp: unknown; wta: unknown };
const FIXED = "2026-10-11T12:00:00-04:00";
const LOAD = { timeout: 30_000 };

const PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "light",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultDateMode: "today",
  showNews: false,
  defaultLandingView: "scores",
};

async function open(page: Page, slots: Record<string, string>) {
  await page.clock.setFixedTime(new Date(FIXED));
  await page.addInitScript((prefs) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
    sessionStorage.setItem("seeded", "1");
  }, { ...PREFS, ...slots });
  await page.route("**/tennis/atp/scoreboard**", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE.atp),
  }));
  await page.route("**/tennis/wta/scoreboard**", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE.wta),
  }));
  await page.goto("/");
}

const TENNIS_FIRST = { firstLeague: "tennis", secondLeague: "mlb", thirdLeague: "nfl", fourthLeague: "empty", fifthLeague: "empty" };

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("the Tennis column shows the 1000s and nothing below them", async ({ page }) => {
      await open(page, TENNIS_FIRST);
      const column = page.locator('[data-league-column="tennis"]');
      await expect(column).toBeVisible(LOAD);
      await expect(column.locator('button[title="Switch league"]')).toContainText("Tennis");
      const chips = column.locator("[data-format-tag]");
      await expect(chips.first()).toBeVisible(LOAD);

      const tags = await chips.evaluateAll(els => els.map(el => el.getAttribute("data-format-tag") ?? ""));
      const cities = [...new Set(tags.map(t => t.split(" · ")[0]))].sort();
      expect(cities).toEqual(["Beijing", "Shanghai", "Wuhan"]);
      expect(tags.filter(t => t.startsWith("Shanghai")).length).toBe(8);
      expect(tags.filter(t => t.startsWith("Wuhan")).length).toBe(3);
      // Every card in the column carries a tournament chip: a card with none
      // would be a match the gate let through from a lower-level event.
      await expect(column.locator('[aria-label$="game details"]')).toHaveCount(tags.length);

      // No audio row covers a 1000, so no card offers Listen.
      await expect(column.getByText("Listen", { exact: true })).toHaveCount(0);

      // The chip stays inside its card on a 3-column phone board.
      const overflow = await column.locator("[data-format-tag]").evaluateAll(els => els.filter(el => {
        const card = el.closest('[aria-label$="game details"]');
        if (!card) return true;
        return el.getBoundingClientRect().right > card.getBoundingClientRect().right + 0.5;
      }).length);
      expect(overflow).toBe(0);
    });
  });
}

test("a board with no saved columns gets no Tennis column", async ({ page }) => {
  await open(page, {});
  const columns = page.locator("[data-league-column]");
  await expect(columns.first()).toBeVisible(LOAD);
  await expect(page.locator('[data-league-column="tennis"]')).toHaveCount(0);
});

test("Add more… lists Tennis, off until picked", async ({ page }) => {
  await open(page, { firstLeague: "mlb", secondLeague: "nfl", thirdLeague: "wnba", fourthLeague: "empty", fifthLeague: "empty" });
  const header = page.locator('[data-league-column="mlb"] button[title="Switch league"]');
  await expect(header).toBeVisible(LOAD);
  await header.click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole("button", { name: /^Tennis/ })).toHaveCount(0);
  await page.getByTestId("league-switcher-add-more").click();
  const sheet = page.getByRole("dialog", { name: "More leagues" });
  await expect(sheet).toBeVisible();
  const pill = sheet.getByTestId("league-picker-grid").getByRole("button", { name: /^Tennis/ });
  await expect(pill).toHaveAttribute("aria-pressed", "false");
  await pill.click();
  await sheet.getByTestId("league-picker-add").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-league-column="tennis"]')).toBeVisible(LOAD);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(prefs.firstLeague).toBe("tennis");
});
