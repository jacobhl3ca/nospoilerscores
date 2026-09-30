import { expect, test, type Locator, type Page } from "@playwright/test";

// Jacob 9/30: "can we add logos to league in settings to make easier to read
// thru? including soccer emoji for section too??". Each league chip in
// Settings → My leagues and each column pill carries the league's logo, and
// the catalog's section headings lead with an emoji. The cross-league chips
// (Best of yesterday, ESPN front page, Top news) stay text only.

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
};

async function seedPrefs(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    sessionStorage.setItem("seeded", "1");
  }, { base: BASE_PREFS, update: extra });
}

async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  await expect(catalog).toBeVisible();
  return { dialog, catalog };
}

const chip = (catalog: Locator, name: string) => catalog.getByRole("checkbox", { name, exact: true });
const mark = (scope: Locator) => scope.locator("[data-league-mark]");

// The logo has loaded, not only mounted (the images are lazy).
async function expectLoaded(markEl: Locator) {
  await markEl.scrollIntoViewIfNeeded();
  await expect.poll(
    () => markEl.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth),
    { timeout: 20_000 },
  ).toBeGreaterThan(0);
}

// MLB, NFL and WNBA are in season on 9/29; NBA is not.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
});

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("league chips carry a logo, the cross-league chips do not", async ({ page }) => {
      await seedPrefs(page);
      const { dialog, catalog } = await openSettings(page);

      await expect(mark(chip(catalog, "MLB"))).toHaveAttribute("data-league-mark", "mlb");
      await expectLoaded(mark(chip(catalog, "MLB")));
      // The name the chip announces is still the league alone.
      await expect(chip(catalog, "MLB")).toHaveText("MLB");
      await expect(mark(chip(catalog, "Top news"))).toHaveCount(0);

      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();
      await expect(mark(chip(catalog, "ESPN front page"))).toHaveCount(0);
      await expect(mark(chip(catalog, "Best of yesterday"))).toHaveCount(0);
      // Every league chip has one, in every section.
      const leagueChips = catalog.locator('[role="checkbox"]:not([aria-label="Best of yesterday"]):not([aria-label="ESPN front page"]):not([aria-label="Top news"])');
      const total = await leagueChips.count();
      expect(total).toBeGreaterThan(10);
      await expect(catalog.locator('[role="checkbox"] [data-league-mark]')).toHaveCount(total);

      // No chip is taller than the chips beside it, and nothing scrolls sideways.
      const heights = await catalog.locator('[role="checkbox"], button[aria-expanded]')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 2) / 2));
      expect(new Set(heights).size, `chip heights ${[...new Set(heights)].join(", ")}`).toBe(1);
      const scroller = dialog.locator(".overflow-y-auto").first();
      expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    });

    test("section headings lead with an emoji and keep their exact text", async ({ page }) => {
      await seedPrefs(page);
      const { catalog } = await openSettings(page);
      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();

      for (const [label, emoji] of [["US leagues", "🇺🇸"], ["Soccer", "⚽"], ["Racing, combat & more", "🏁"]]) {
        const heading = catalog.getByText(label, { exact: true });
        await expect(heading).toBeVisible();
        const before = heading.locator("xpath=preceding-sibling::*[1]");
        await expect(before).toHaveText(emoji);
        await expect(before).toHaveAttribute("aria-hidden", "true");
      }
      const across = catalog.getByText("Across leagues", { exact: true });
      await expect(across).toBeVisible();
      await expect(across.locator("xpath=preceding-sibling::*")).toHaveCount(0);
      // The column dropdown's group labels stay text.
      const groups = await page.locator('select[aria-label="Slot 1 league"] optgroup')
        .evaluateAll((els) => els.map((el) => (el as HTMLOptGroupElement).label));
      expect(groups).toContain("Soccer");
      expect(groups.join("")).not.toMatch(/⚽|🇺🇸|⛳|🏁/);
    });

    test("a blocked logo leaves the chip as text, with no white dot", async ({ page }) => {
      await page.route(/teamlogos\/leagues\/500\/mlb\.png/, (route) => route.abort());
      await seedPrefs(page);
      const { catalog } = await openSettings(page);

      await expect(chip(catalog, "MLB")).toHaveText("MLB");
      await expect(mark(chip(catalog, "MLB"))).toHaveCount(0);
      await expect(chip(catalog, "MLB").locator("img")).toHaveCount(0);
      await expectLoaded(mark(chip(catalog, "NFL")));
    });

    test("column pills carry the logo of their league, and a tap on it still opens the picker", async ({ page }) => {
      await seedPrefs(page);
      const { dialog } = await openSettings(page);
      const pill = (n: number) => dialog.locator(`select[aria-label="Slot ${n} league"]`).locator("xpath=..");
      await dialog.locator('select[aria-label="Slot 3 league"]').selectOption("");

      await expect(mark(pill(1))).toHaveAttribute("data-league-mark", "mlb");
      await expectLoaded(mark(pill(1)));
      // The invisible select lies over the mark, so the tap lands on it.
      const hit = await mark(pill(1)).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.tagName;
      });
      expect(hit).toBe("SELECT");

      // An Auto pill shows the league it resolves to.
      await expect(pill(3)).toContainText("Auto");
      const auto = (await pill(3).locator("span.truncate").textContent()) ?? "";
      if (!/Best of yesterday|ESPN front page/.test(auto) && auto.includes("·")) await expect(mark(pill(3))).toHaveCount(1);

      // The cross-league columns and a removed column have none.
      await dialog.locator('select[aria-label="Slot 1 league"]').selectOption("empty");
      await expect(mark(pill(1))).toHaveCount(0);
      await dialog.locator('select[aria-label="Slot 1 league"]').selectOption("nfl");
      await expect(mark(pill(1))).toHaveAttribute("data-league-mark", "nfl");

      // All the pills stay one height.
      const heights = await dialog.locator('select[aria-label^="Slot"]')
        .evaluateAll((els) => els.map((el) => Math.round(el.parentElement!.getBoundingClientRect().height * 2) / 2));
      expect(new Set(heights).size, `pill heights ${heights.join(", ")}`).toBe(1);
    });
  });
}
