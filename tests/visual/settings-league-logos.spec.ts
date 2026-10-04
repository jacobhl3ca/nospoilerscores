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
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // A tap before hydration does nothing (seen on WebKit over the mini tunnel),
  // so tap again until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
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
      // Both copies: a ticked chip asks for the dark one first.
      await page.route(/teamlogos\/leagues\/500(-dark)?\/mlb\.png/, (route) => route.abort());
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

// Jacob 9/30 follow-up: ~45 white discs read as dots. The logo now sits on the
// chip itself: ESPN's dark-theme copy in dark mode and on a ticked (accent)
// chip, a sport emoji for a league with no mark of its own. Since 10/1 the
// signup / Add more… picker draws the same chip, with no plate either.
const imgSrc = (markEl: Locator) => markEl.locator("img").getAttribute("src");

async function setTicked(catalog: Locator, name: string, on: boolean) {
  const c = chip(catalog, name);
  if ((await c.getAttribute("aria-checked")) !== String(on)) await c.click();
  await expect(c).toHaveAttribute("aria-checked", String(on));
}

for (const width of [390, 1280]) {
  test.describe(`no plate, ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("dark theme: dark-set logos, no white plate, one chip height", async ({ page }) => {
      await seedPrefs(page, { theme: "dark" });
      const { dialog, catalog } = await openSettings(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      // Open first: an unticked league lives under More leagues.
      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();

      for (const on of [true, false]) {
        await setTicked(catalog, "MLB", on);
        await expectLoaded(mark(chip(catalog, "MLB")));
        expect(await imgSrc(mark(chip(catalog, "MLB")))).toContain("/500-dark/mlb.png");
      }

      await expect(catalog.locator("[data-league-plate]")).toHaveCount(0);
      const whiteBacked = await catalog.locator("[data-league-mark]").evaluateAll((els) =>
        els.filter((el) => getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)").length);
      expect(whiteBacked).toBe(0);

      const heights = await catalog.locator('[role="checkbox"], button[aria-expanded]')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 2) / 2));
      expect(new Set(heights).size, `chip heights ${[...new Set(heights)].join(", ")}`).toBe(1);
      const scroller = dialog.locator(".overflow-y-auto").first();
      expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    });

    test("light theme: normal logos, but a ticked chip takes the dark copy", async ({ page }) => {
      await seedPrefs(page, { theme: "light" });
      const { catalog } = await openSettings(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();

      await setTicked(catalog, "MLB", false);
      await expectLoaded(mark(chip(catalog, "MLB")));
      expect(await imgSrc(mark(chip(catalog, "MLB")))).toContain("/500/mlb.png");

      await setTicked(catalog, "MLB", true);
      await expectLoaded(mark(chip(catalog, "MLB")));
      expect(await imgSrc(mark(chip(catalog, "MLB")))).toContain("/500-dark/mlb.png");
    });

    test("a league with no mark of its own shows its sport emoji", async ({ page }) => {
      await seedPrefs(page, { theme: "dark" });
      const { catalog } = await openSettings(page);
      await catalog.getByRole("button", { name: "More leagues", exact: true }).click();

      const ncaaf = catalog.locator('[data-league-mark="ncaaf"]');
      await expect(ncaaf).toHaveCount(1);
      await expect(ncaaf).toHaveText("🏈");
      await expect(ncaaf).toHaveAttribute("aria-hidden", "true");
      await expect(ncaaf.locator("img")).toHaveCount(0);
      // Every rugby union competition too: no shared ball icon left.
      await expect(catalog.locator('[data-league-mark="sixnations"] img')).toHaveCount(0);
    });

    test("a blocked dark copy falls back to the normal logo", async ({ page }) => {
      await page.route(/teamlogos\/leagues\/500-dark\/mlb\.png/, (route) => route.abort());
      await seedPrefs(page, { theme: "dark" });
      const { catalog } = await openSettings(page);

      await expectLoaded(mark(chip(catalog, "MLB")));
      const src = await imgSrc(mark(chip(catalog, "MLB")));
      expect(src).toContain("/500/mlb.png");
      expect(src).not.toContain("500-dark");
    });
  });
}

test("the league picker draws the Settings chip: no plate, square corners, uppercase", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPrefs(page, { theme: "dark", secondLeague: "nfl", thirdLeague: "wnba" });
  await page.goto("/");
  await page.locator('button[title="Switch league"]').first().click({ timeout: 45_000 });
  await page.getByRole("dialog", { name: "Switch league" }).getByRole("button", { name: "Add more…" }).click();
  const sheet = page.locator('[role="dialog"][aria-labelledby="league-add-more-title"]');
  await expect(sheet).toBeVisible();
  expect(await sheet.locator("[data-league-mark]").count()).toBeGreaterThan(5);
  await expect(sheet.locator("[data-league-plate]")).toHaveCount(0);
  const nfl = sheet.getByRole("button", { name: /^NFL/ });
  const style = await nfl.evaluate((el) => {
    const cs = getComputedStyle(el);
    const label = el.querySelector("span.uppercase");
    return { radius: cs.borderTopLeftRadius, size: cs.fontSize, upper: label ? getComputedStyle(label).textTransform : "" };
  });
  expect(style).toEqual({ radius: "6px", size: "11px", upper: "uppercase" });
  // Dark theme: the dark-set logo, no white disc behind it.
  await expectLoaded(mark(nfl));
  expect(await imgSrc(mark(nfl))).toContain("500-dark");
});

// Jacob 10/4: the sign-up popup lists the default leagues only; "More
// leagues" adds the opt-in rest after them. No white plate either.
async function openFirstRun(page: Page, at: string) {
  await page.clock.setFixedTime(new Date(at));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "Pick your leagues" });
  await expect(sheet).toBeVisible({ timeout: 45_000 });
  return { sheet, pills: sheet.locator("button[aria-pressed]") };
}

test("sign-up popup: short first screen, More leagues adds the rest, a pick stays after Fewer", async ({ page }) => {
  const { sheet, pills } = await openFirstRun(page, "2026-10-04T15:00:00-04:00");
  await expect(sheet.locator("[data-league-plate]")).toHaveCount(0);
  const count = await pills.count();
  expect(count).toBeGreaterThanOrEqual(8);
  expect(count).toBeLessThanOrEqual(12);
  await expect(pills.filter({ hasText: /^MLB/ })).toHaveCount(1);
  await expect(pills.filter({ hasText: /^NFL/ })).toHaveCount(1);
  await expect(pills.filter({ hasText: /La Liga/i })).toHaveCount(0);
  await expect(pills.filter({ hasText: /NCAAW/ })).toHaveCount(0);

  // Where each first-screen pill sits, relative to the first pill: the sheet
  // is centred, so it moves as a whole when it grows. The last first-screen
  // row may take new pills and re-centre; every full row above it holds.
  const boxes = () => pills.evaluateAll((els, n) => {
    const o = els[0].getBoundingClientRect();
    const rows = els.slice(0, n).map((el) => Math.round(el.getBoundingClientRect().top - o.top));
    const lastRow = Math.max(...rows);
    return els.slice(0, n).map((el, i) => {
      const r = el.getBoundingClientRect();
      return rows[i] === lastRow ? `${el.textContent}` : `${el.textContent}@${Math.round(r.left - o.left)},${rows[i]}`;
    });
  }, count);
  const first = await boxes();

  const more = sheet.getByTestId("league-picker-more");
  await expect(more).toHaveText("More leagues");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveText("Fewer");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(pills.filter({ hasText: /La Liga/i })).toHaveCount(1);
  expect(await boxes()).toEqual(first);

  // A picked league takes the dark-set logo on the accent fill.
  const mlb = pills.filter({ hasText: /^\d?MLB/ });
  await mlb.click();
  await expect(mlb).toHaveAttribute("aria-pressed", "true");
  await expectLoaded(mark(mlb));
  expect(await imgSrc(mark(mlb))).toContain("500-dark");

  const laliga = pills.filter({ hasText: /La Liga/i });
  await laliga.click();
  await expect(laliga).toHaveAttribute("aria-pressed", "true");
  await more.click();
  await expect(more).toHaveText("More leagues");
  await expect(laliga).toBeVisible();
  await expect(pills).toHaveCount(count + 1);
});

for (const at of ["2026-10-04T15:00:00-04:00", "2026-10-18T15:00:00-04:00", "2027-01-15T15:00:00-05:00"]) {
  test(`sign-up popup first screen holds at most 12 pills on ${at.slice(0, 10)}`, async ({ page }) => {
    const { pills } = await openFirstRun(page, at);
    expect(await pills.count()).toBeLessThanOrEqual(12);
  });
}
