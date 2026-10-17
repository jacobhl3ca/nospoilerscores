import { expect, test, type Page, type Route } from "@playwright/test";

// The view tab bar as real tabs (design check 2026-10-15, item 2):
// role="tablist" / role="tab" / aria-selected, roving tabindex, ←/→/Home/End
// move focus without switching view, Enter switches. Labels are 12 px.
// Theme is "system", and the device scheme is emulated, so the bar is checked
// in the theme the device asks for. Boards are empty: the bar does not depend
// on games.

const NOW = new Date("2026-10-14T14:00:00-04:00");
const ORDER = ["scores-plain", "scores-rated", "news", "schedule"];
const NAMES = ["Games", "Ratings", "News", "Schedule"];

async function seed(page: Page, scheme: "light" | "dark") {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    hiddenLeagues: ["best", "top"],
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })));
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}

async function checkBar(page: Page, scope: string) {
  const list = page.locator(scope).getByRole("tablist", { name: "Views" });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const tabs = list.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("data-tab")))).toEqual(ORDER);
  // Names start with the visible label (WCAG 2.5.3).
  for (const [i, name] of NAMES.entries()) await expect(tabs.nth(i)).toHaveAccessibleName(new RegExp(`^${name}\\b`));
  // No toggle-button state left on the tabs.
  expect(await tabs.evaluateAll((els) => els.filter((e) => e.hasAttribute("aria-pressed")).length)).toBe(0);
  // One selected tab, and it is the only one in the Tab order.
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  for (const i of [1, 2, 3]) await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "false");
  expect(await tabs.evaluateAll((els) => els.map((e) => (e as HTMLElement).tabIndex))).toEqual([0, -1, -1, -1]);
  // 12 px labels that fit inside their tab.
  const labels = await tabs.evaluateAll((els) => els.map((e) => {
    const span = e.querySelector("span:last-child") as HTMLElement;
    return { size: getComputedStyle(span).fontSize, fits: span.getBoundingClientRect().width <= e.getBoundingClientRect().width };
  }));
  for (const l of labels) expect(l).toEqual({ size: "12px", fits: true });
  return tabs;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tab bar 390px (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page, scheme);
      await page.goto("/");
    });

    test("tablist with four tabs, one selected, 12 px labels", async ({ page, browserName }) => {
      await checkBar(page, ".web-tab-bar");
      // The page follows the device theme.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r] = (bg.match(/\d+/g) ?? ["0"]).map(Number);
      if (scheme === "dark") expect(r).toBeLessThan(60); else expect(r).toBeGreaterThan(200);
      await shot(page, `tab-bar-${browserName}-${scheme}`);
    });

    test("arrows move focus only; Enter switches the view", async ({ page }) => {
      const tabs = await checkBar(page, ".web-tab-bar");
      await tabs.nth(0).focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toBeFocused();
      // Focus moved, the view did not.
      await expect(page.locator("html")).toHaveAttribute("data-view", "scores-plain");
      await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("End");
      await expect(tabs.nth(3)).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(0)).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(tabs.nth(3)).toBeFocused();
      await page.keyboard.press("Home");
      await expect(tabs.nth(0)).toBeFocused();

      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute("data-view", "scores-rated");
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
      await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
      expect(await tabs.evaluateAll((els) => els.map((e) => (e as HTMLElement).tabIndex))).toEqual([-1, 0, -1, -1]);
    });

    test("a tap selects the tab", async ({ page }) => {
      const tabs = await checkBar(page, ".web-tab-bar");
      await tabs.nth(3).click();
      await expect(page.locator("html")).toHaveAttribute("data-view", "schedule");
      await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
    });
  });
}

test("desktop 1440px: the inline header bar is the same tablist", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, "light");
  await page.goto("/");
  const tabs = await checkBar(page, "header");
  // The phone bar is hidden, so only one tablist is exposed.
  await expect(page.getByRole("tablist", { name: "Views" })).toHaveCount(1);
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(3)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view", "schedule");
  await shot(page, `tab-bar-desktop-${browserName}`);
});
