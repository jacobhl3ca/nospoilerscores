import { expect, test, type Locator, type Page } from "@playwright/test";

// Jacob 10/8: "add a remove selections button too for removing stuff in the
// popup". The scores column switcher gets "Remove from list…": tap it, pick
// rows, then "Remove N" takes them all off the switcher in one save (the same
// save as unticking them in Settings). A league on the board can be picked
// too (Jacob 10/10): its row says which column closes, and that column closes.

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
  defaultLandingView: "scores",
  showNews: false,
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

const LOAD = { timeout: 30_000 };

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

const rowTexts = (switcher: Locator) =>
  switcher.getByRole("button").evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));

// Pick-mode rows carry aria-pressed.
const pickRows = (switcher: Locator) => switcher.locator("button[aria-pressed]");
// The rows of leagues that are not on the board.
const offBoardRows = (switcher: Locator) => pickRows(switcher).filter({ hasNotText: "· closes" });
const columnSports = (page: Page) =>
  page.locator("[data-league-column]").evaluateAll((els) => els.map((el) => el.getAttribute("data-league-column")));
const addButton = (page: Page) => page.getByRole("button", { name: "Add a league column" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
});

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("pick two rows, Remove 2, rows gone after a reload", async ({ page }) => {
      await seedPrefs(page);
      await page.goto("/");
      const header = page.getByRole("button", { name: "WNBA", exact: true });
      await expect(header).toBeVisible(LOAD);
      await header.click();
      const switcher = page.getByRole("dialog", { name: "Switch league" });
      await expect(switcher).toBeVisible();

      // 1. Pick mode: hint row, no Auto, footer = Remove + Cancel.
      await switcher.getByTestId("league-switcher-remove-from-list").click();
      await expect(switcher.getByText("Pick leagues to remove")).toBeVisible();
      expect(await rowTexts(switcher)).not.toContain("Auto");
      const confirm = switcher.getByTestId("league-switcher-remove-confirm");
      await expect(confirm).toBeDisabled();
      await expect(confirm).toHaveText("Remove");

      // 2. Board leagues are rows like the others, tagged with the column
      // that closes.
      await expect(pickRows(switcher).filter({ hasText: /^WNBA · closes this col$/ })).toHaveCount(1);
      await expect(pickRows(switcher).filter({ hasText: /^MLB · closes col 1$/ })).toHaveCount(1);
      await expect(pickRows(switcher).filter({ hasText: /^NFL · closes col 2$/ })).toHaveCount(1);

      // 3. Pick two off-board rows, unpick and re-pick one: the count follows.
      expect(await offBoardRows(switcher).count()).toBeGreaterThanOrEqual(2);
      const labels = (await offBoardRows(switcher).evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()))).slice(0, 2);
      const first = pickRows(switcher).filter({ hasText: labels[0] });
      const second = pickRows(switcher).filter({ hasText: labels[1] });
      await first.click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await expect(confirm).toHaveText("Remove 1");
      await second.click();
      await second.click();
      await expect(second).toHaveAttribute("aria-pressed", "false");
      await second.click();
      await expect(confirm).toHaveText("Remove 2");

      // 4. Remove 2: panel stays open in normal mode, both rows gone.
      const before = await saved(page);
      await confirm.click();
      await expect(switcher).toBeVisible();
      await expect(switcher.getByTestId("league-switcher-remove-from-list")).toBeVisible();
      const after = await rowTexts(switcher);
      for (const label of labels) expect(after).not.toContain(label);
      expect(after).toContain("Auto");
      const prefs = await saved(page);
      expect(prefs).not.toEqual(before);
      // The board's leagues stay put.
      expect([prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague]).toEqual(["mlb", "nfl", "wnba"]);

      // 5. The save holds through a reload.
      await page.reload();
      await expect(header).toBeVisible(LOAD);
      await header.click();
      const reloaded = await rowTexts(switcher);
      for (const label of labels) expect(reloaded).not.toContain(label);
    });
  });
}

test("Cancel, Escape and closing drop the picks", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  const header = page.getByRole("button", { name: "WNBA", exact: true });
  await expect(header).toBeVisible(LOAD);
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  const before = await rowTexts((await header.click(), switcher));
  const savedBefore = await saved(page);

  // Cancel: back to the full list, nothing saved.
  await switcher.getByTestId("league-switcher-remove-from-list").click();
  await pickRows(switcher).first().click();
  await switcher.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => rowTexts(switcher)).toEqual(before);

  // Escape closes the panel; the next open is a clean list.
  await switcher.getByTestId("league-switcher-remove-from-list").click();
  await pickRows(switcher).first().click();
  await page.keyboard.press("Escape");
  await expect(switcher).toHaveCount(0);
  await header.click();
  await expect.poll(() => rowTexts(switcher)).toEqual(before);
  expect(await saved(page)).toEqual(savedBefore);
});

test("a removed default league goes into hiddenLeagues, an opt-in only leaves shownLeagues", async ({ page }) => {
  // ESPN front page is opt-in (off by default): shownLeagues puts it in the
  // switcher, so removing it only takes it out of shownLeagues.
  await seedPrefs(page, { shownLeagues: ["top"] });
  await page.goto("/");
  const header = page.getByRole("button", { name: "WNBA", exact: true });
  await expect(header).toBeVisible(LOAD);
  await header.click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await switcher.getByTestId("league-switcher-remove-from-list").click();
  await pickRows(switcher).filter({ hasText: "ESPN front page" }).click();
  // A default row: any off-board row that is not the opt-in.
  const defaultRow = offBoardRows(switcher).filter({ hasNotText: "ESPN front page" }).first();
  await defaultRow.click();
  await switcher.getByTestId("league-switcher-remove-confirm").click();
  const prefs = await saved(page);
  expect(prefs.shownLeagues ?? []).not.toContain("top");
  expect(prefs.hiddenLeagues ?? []).not.toContain("top");
  expect((prefs.hiddenLeagues ?? []).length).toBe(1);
});

// Jacob 10/10: "WNBA · this col" was greyed out. The league a column shows is
// a row like the others now; removing it closes that column (no league takes
// its place) and the + button brings a column back.
for (const width of [390, 1280]) {
  test(`${width}px: tick the column's own league, Remove 1, the column closes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedPrefs(page);
    await page.goto("/");
    const header = page.getByRole("button", { name: "WNBA", exact: true });
    await expect(header).toBeVisible(LOAD);
    await expect.poll(() => columnSports(page), LOAD).toEqual(["mlb", "nfl", "wnba"]);
    await header.click();
    const switcher = page.getByRole("dialog", { name: "Switch league" });
    await switcher.getByTestId("league-switcher-remove-from-list").click();
    const own = pickRows(switcher).filter({ hasText: /^WNBA · closes this col$/ });
    await own.click();
    await expect(own).toHaveAttribute("aria-pressed", "true");
    const confirm = switcher.getByTestId("league-switcher-remove-confirm");
    await expect(confirm).toHaveText("Remove 1");
    if (process.env.HS_SHOTS) await page.screenshot({ path: `${process.env.HS_SHOTS}/remove-sheet-${width}.png` });
    await confirm.click();

    // The panel closes with its column; the other two columns stay.
    await expect(switcher).toHaveCount(0);
    await expect.poll(() => columnSports(page), LOAD).toEqual(["mlb", "nfl"]);
    await expect(addButton(page)).toBeVisible();
    const prefs = await saved(page);
    expect(prefs.hiddenLeagues).toEqual(["wnba"]);
    expect([prefs.firstLeague, prefs.secondLeague]).toEqual(["mlb", "nfl"]);
    // The slot keeps its pin, so turning WNBA back on reopens the column;
    // while WNBA is off the board reads it as closed (closeHiddenPins).
    expect(prefs.thirdLeague).toBe("wnba");
    if (process.env.HS_SHOTS) await page.screenshot({ path: `${process.env.HS_SHOTS}/board-after-remove-${width}.png` });

    // Holds through a reload: no league takes the column's place.
    await page.reload();
    await expect.poll(() => columnSports(page), LOAD).toEqual(["mlb", "nfl"]);
    await expect(addButton(page)).toBeVisible();
  });
}

test("a league in another column is a row too: removing it closes that column, this one stays", async ({ page }) => {
  await seedPrefs(page);
  await page.goto("/");
  const header = page.getByRole("button", { name: "WNBA", exact: true });
  await expect(header).toBeVisible(LOAD);
  await header.click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await switcher.getByTestId("league-switcher-remove-from-list").click();
  await pickRows(switcher).filter({ hasText: /^MLB · closes col 1$/ }).click();
  await switcher.getByTestId("league-switcher-remove-confirm").click();
  // The board re-lays out, so the panel closes; the next open has no MLB row.
  await expect(switcher).toHaveCount(0);
  await expect.poll(() => columnSports(page), LOAD).toEqual(["nfl", "wnba"]);
  expect((await saved(page)).hiddenLeagues).toEqual(["mlb"]);
  await header.click();
  await expect(switcher).toBeVisible();
  expect((await rowTexts(switcher)).filter((t) => /^MLB\b/.test(t))).toEqual([]);
});
