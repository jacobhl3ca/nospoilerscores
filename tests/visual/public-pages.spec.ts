import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Visual-regression snapshots of HideScore's 5 most important public pages.
 * Goal: catch silent AI rewrites (broken layout, missing sections, CSS
 * regressions) of pages that ship with little human review — NOT to assert
 * on live sports content, which changes constantly.
 *
 * Routes chosen (public, unauthenticated, highest-traffic):
 *  - /          the landing page AND the main score/hide product view
 *               (renders <HomeContent>, the core "hide scores" UI)
 *  - /today     primary product page — today's games, spoiler-free
 *  - /worldcup  the actively-promoted 2026 World Cup feature hub
 *  - /faq       marketing/informational page
 *  - /privacy   policy page (static, cheap to keep honest)
 *
 * Masking: /, /today, and /worldcup all render <HomeContent>, whose <main
 * id="main-content"> is entirely live sports data (scores, game status,
 * ratings, the news-feed toggle) — masked wholesale so real-world score/
 * schedule changes never cause a diff. The header's <DateNav> renders the
 * selected date via the page's own stable `.date-nav-btn` class — also
 * masked. /faq and /privacy are static (no live data) and need no masking.
 */

const DYNAMIC_MAIN = "main#main-content";
const DYNAMIC_DATE_NAV = ".date-nav-btn";

async function homeContentMasks(page: Page): Promise<Locator[]> {
  return [page.locator(DYNAMIC_MAIN), page.locator(DYNAMIC_DATE_NAV)];
}

async function snapshot(page: Page, name: string, masks: Locator[] = []) {
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    mask: masks,
  });
}

test.describe("public pages visual regression", () => {
  test("home / landing (main score/hide view)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await snapshot(page, "home.png", await homeContentMasks(page));
  });

  test("today (primary product page)", async ({ page }) => {
    await page.goto("/today", { waitUntil: "networkidle" });
    await snapshot(page, "today.png", await homeContentMasks(page));
  });

  test("worldcup (feature hub)", async ({ page }) => {
    await page.goto("/worldcup", { waitUntil: "networkidle" });
    await snapshot(page, "worldcup.png", await homeContentMasks(page));
  });

  test("faq", async ({ page }) => {
    await page.goto("/faq", { waitUntil: "networkidle" });
    await snapshot(page, "faq.png");
  });

  test("privacy", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "networkidle" });
    await snapshot(page, "privacy.png");
  });
});
