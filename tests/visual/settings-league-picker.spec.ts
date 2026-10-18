import { expect, test, type Locator, type Page } from "@playwright/test";

// Jacob 10/17: Settings → Leagues works like Favorite teams. The My leagues row
// holds only the picks; "More leagues" (or 🔍 Find a league) opens one picker
// block under it: a "Fewer" link at the top, a search box, then each group
// heading on its own line with only the leagues NOT yet picked. A tap moves a
// league up into the row.

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultDateMode: "today",
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "wnba",
  fourthLeague: "empty",
  fifthLeague: "empty",
  // NBA off, so the picker offers it; Premier League on.
  hiddenLeagues: ["nba"],
  shownLeagues: ["epl"],
};

async function seedPrefs(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    sessionStorage.setItem("seeded", "1");
  }, { base: BASE_PREFS, update: extra });
}

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  await expect(catalog).toBeVisible();
  return { dialog, catalog };
}

// Screenshots for the before/after page, not baselines (this repo commits
// none outside public-pages).
const QA = process.env.LEAGUE_PICKER_QA_DIR ?? "test-results/league-picker-qa";

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));

// The logos come from ESPN's CDN: serve every off-site image a 1x1 PNG.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
      : route.fallback());
  // NFL, NBA and the Premier League all in season.
  await page.clock.setFixedTime(new Date("2026-11-10T15:00:00-05:00"));
});

// The top row is the group's first child; the picker block is the second.
const topRow = (catalog: Locator) => catalog.locator(":scope > div").first();
const picker = (catalog: Locator) => catalog.locator(":scope > div").nth(1);
const chip = (scope: Locator, name: string | RegExp) =>
  scope.getByRole("checkbox", { name, exact: typeof name === "string" });

test.describe("league picker", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("collapsed: picks, Find a league and More leagues only", async ({ page }) => {
    await seedPrefs(page);
    await page.goto("/");
    const { catalog } = await openSettings(page);
    await expect(chip(topRow(catalog), "NFL")).toHaveAttribute("aria-checked", "true");
    await expect(topRow(catalog).getByRole("button", { name: "Find a league" })).toBeVisible();
    await expect(topRow(catalog).getByRole("button", { name: "More leagues", exact: true })).toBeVisible();
    await expect(catalog.getByRole("searchbox", { name: "Search leagues" })).toHaveCount(0);
    await expect(catalog.getByRole("heading", { name: "US leagues" })).toHaveCount(0);
    await expect(catalog.getByRole("button", { name: "Request a league" })).toHaveCount(0);
    // Nothing unticked in the row.
    await expect(topRow(catalog).locator('[role="checkbox"][aria-checked="false"]')).toHaveCount(0);
  });

  test("open: headings on their own line, only unpicked leagues, a tap moves one up", async ({ page }) => {
    await seedPrefs(page);
    await page.goto("/");
    const { dialog, catalog } = await openSettings(page);
    await catalog.getByRole("button", { name: "More leagues", exact: true }).click();
    const block = picker(catalog);
    await expect(block.getByRole("searchbox", { name: "Search leagues" })).toBeVisible();
    await expect(block.getByRole("button", { name: "Fewer leagues", exact: true })).toBeVisible();

    for (const name of ["US leagues", "Soccer"]) {
      const heading = block.getByRole("heading", { name });
      await expect(heading).toBeVisible();
      const row = heading.locator("xpath=following-sibling::*[1]");
      const [h, r, first] = await Promise.all([
        heading.boundingBox(),
        row.boundingBox(),
        row.locator('[role="checkbox"]').first().boundingBox(),
      ]);
      expect(h!.y + h!.height).toBeLessThanOrEqual(first!.y + 0.5);
      expect(Math.abs(h!.x - r!.x)).toBeLessThan(1);
    }
    // Picked leagues live in the row only; every chip in the block is unticked.
    await expect(chip(block, "NFL")).toHaveCount(0);
    await expect(chip(block, "Premier League")).toHaveCount(0);
    await expect(block.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(0);
    await expect(chip(block, "NBA")).toHaveAttribute("aria-checked", "false");

    await chip(block, "NBA").click();
    await expect(chip(block, "NBA")).toHaveCount(0);
    await expect(chip(topRow(catalog), "NBA")).toHaveAttribute("aria-checked", "true");
    expect((await saved(page)).hiddenLeagues ?? []).not.toContain("nba");

    // The top "Fewer" rolls the block up without moving the scroll.
    // Scrolled so the link sits mid-screen; a DOM click, so the test itself
    // scrolls nothing.
    const scroller = dialog.locator(".overflow-y-auto").first();
    const fewer = block.getByRole("button", { name: "Fewer leagues", exact: true });
    await fewer.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    await fewer.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(catalog.getByRole("searchbox", { name: "Search leagues" })).toHaveCount(0);
    expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - before)).toBeLessThanOrEqual(2);

    await page.reload();
    const again = await openSettings(page);
    await expect(chip(topRow(again.catalog), "NBA")).toHaveAttribute("aria-checked", "true");
  });

  test("Find a league focuses the search; results, no match, Esc", async ({ page }) => {
    await seedPrefs(page);
    await page.goto("/");
    const { dialog, catalog } = await openSettings(page);
    await catalog.getByRole("button", { name: "Find a league" }).click();
    const box = catalog.getByRole("searchbox", { name: "Search leagues" });
    await expect(box).toBeFocused();
    const block = picker(catalog);

    await box.fill("prem");
    await expect(chip(topRow(catalog), "Premier League")).toHaveAttribute("aria-checked", "true");
    await expect(chip(block, "Premier League")).toHaveAttribute("aria-checked", "true");
    await expect(chip(block, /^Premiership Rugby/)).toHaveAttribute("aria-checked", "false");
    await expect(chip(block, "NBA")).toHaveCount(0);
    await expect(dialog.getByRole("status").filter({ hasText: /leagues? found/ })).toHaveText(/\d+ leagues? found/);

    await box.fill("college football");
    await expect(block.locator('[role="checkbox"]')).toHaveCount(1);
    await expect(chip(block, "NCAAF")).toBeVisible();

    await box.fill("zzz");
    await expect(block.getByText("No league matches “zzz”")).toBeVisible();
    await expect(block.getByRole("button", { name: "Request a league" })).toBeVisible();

    // Esc empties the box and leaves the drawer open.
    await box.press("Escape");
    await expect(box).toHaveValue("");
    await expect(dialog).toBeVisible();
  });

  test("a struck-off league found by search reads hidden; a tick brings it back", async ({ page }) => {
    await seedPrefs(page, { catalogHiddenLeagues: ["cfl"] });
    await page.goto("/");
    const { catalog } = await openSettings(page);
    await catalog.getByRole("button", { name: "Find a league" }).click();
    await catalog.getByRole("searchbox", { name: "Search leagues" }).fill("cfl");
    const cfl = chip(picker(catalog), "CFL · hidden");
    await expect(cfl).toHaveAttribute("aria-checked", "false");
    await cfl.click();
    await expect.poll(async () => (await saved(page)).catalogHiddenLeagues ?? []).not.toContain("cfl");
    await expect(chip(topRow(catalog), "CFL")).toHaveAttribute("aria-checked", "true");
  });

  test("team picker: More leagues puts each group heading on its own line", async ({ page }) => {
    await seedPrefs(page);
    await page.goto("/");
    const { dialog } = await openSettings(page);
    const teams = dialog.locator("section", { has: page.locator("h3", { hasText: "Favorite teams" }) });
    await expect(teams.getByRole("heading", { name: "Soccer" })).toHaveCount(0);
    await teams.getByRole("button", { name: "More leagues for teams" }).click();
    const heading = teams.getByRole("heading", { name: "Soccer" });
    await expect(heading).toBeVisible();
    const first = heading.locator("xpath=following-sibling::*[1]").locator("button").first();
    const [h, c] = await Promise.all([heading.boundingBox(), first.boundingBox()]);
    expect(h!.y + h!.height).toBeLessThanOrEqual(c!.y + 0.5);
    await expect(teams.getByRole("button", { name: "Fewer leagues for teams" })).toBeVisible();
  });
});

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`screenshot ${width}px ${theme}: collapsed and open`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "screenshots come from Chromium");
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await seedPrefs(page, { theme });
      await page.goto("/");
      const { catalog } = await openSettings(page);
      const section = page.locator("#settings-leagues");
      await section.scrollIntoViewIfNeeded();
      await catalog.screenshot({ path: `${QA}/collapsed-${width}-${theme}.png` });
      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();
      await expect(picker(catalog).getByRole("heading", { name: "US leagues" })).toBeVisible();
      await catalog.screenshot({ path: `${QA}/open-${width}-${theme}.png` });
    });
  }
}
