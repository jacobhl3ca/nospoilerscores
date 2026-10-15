import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The three axe rules the 2026-10-15 scan (WCAG 2.1 AA) flagged as serious on
// the board and the doc pages: text contrast, a name that drops the visible
// words (WCAG 2.5.3), and controls nested inside a card that was itself a
// button. Each page in both colour schemes, at phone and desktop width.
const RULES = ["color-contrast", "label-content-name-mismatch", "nested-interactive"];
const PAGES = ["/", "/about", "/today"];

// A board with game cards on it, so nested-interactive has cards to check.
async function seedBoard(page: Page) {
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["poker", "mlb"], favoriteTeams: [],
      skipExplainer: true, skipNewsExplainer: true, showNews: false,
      leaguesOnboarded: true, firstLeague: "poker", secondLeague: "mlb",
      thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
      defaultDateMode: "today", defaultLandingView: "scores",
    }));
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test.describe(`${colorScheme} at ${width}px`, () => {
      test.use({ colorScheme, viewport: { width, height: 844 } });
      for (const path of PAGES) {
        test(`${path}: no serious or critical ${RULES.join(", ")} results`, async ({ page }) => {
          await seedBoard(page);
          await page.goto(path);
          if (colorScheme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
          if (path !== "/about") await expect(page.locator(".ns-card-focus").first()).toBeVisible({ timeout: 30_000 });
          // Let the fade-in and the theme's colour transition settle, or axe
          // reads a half-faded colour.
          await page.waitForTimeout(800);
          const { violations } = await new AxeBuilder({ page }).withRules(RULES).analyze();
          const serious = violations
            .filter(v => v.impact === "serious" || v.impact === "critical")
            .map(v => `${v.id}: ${v.nodes.map(n => `${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join(" ")}`).join("\n  ")}`);
          expect(serious, serious.join("\n")).toEqual([]);
        });
      }
    });
  }
}
