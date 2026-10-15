import { expect, test, type Page } from "@playwright/test";

// Jacob 10/15: "main goal need to avoid any spoilers for first visitors".
// A brand-new visitor (no stored prefs) gets the ESPN front page in column 3
// instead of NCAAF, and the first-time Ratings / News bars close when you
// leave the tab they explain (the Ratings bar stayed up on Games and News).

const LOAD = { timeout: 30_000 };
const columns = (page: Page) => page.locator("[data-league-column]");
const columnSports = (page: Page) =>
  columns(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-league-column")));
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const tab = (page: Page, mode: string) => page.locator(`button[data-tab="${mode}"]:visible`).first();
const ratingsBar = (page: Page) => page.getByRole("status").filter({ hasText: "Ratings are on." });
const newsBar = (page: Page) => page.getByRole("status").filter({ hasText: "News is full of spoilers." });

// The first-run league picker opens for a new visitor in a production build.
// `next dev` runs the mount effect twice (React Strict Mode), and the second
// run finds the blob the first one saved, so dev skips the picker. `required`
// = the test is about the picker itself.
async function dismissPicker(page: Page, button: "Use defaults" | "Done", required = false) {
  const sheet = page.getByRole("dialog", { name: /Pick your leagues/ });
  const shown = await sheet.waitFor({ state: "visible", timeout: required ? LOAD.timeout : 8_000 }).then(() => true, () => false);
  if (!shown) {
    if (required) throw new Error("first-run league picker never opened");
    return;
  }
  await sheet.getByRole("button", { name: button, exact: true }).click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // Mid-October: Auto would put MLB · NFL · NCAAF on a phone board.
  await page.clock.setFixedTime(new Date("2026-10-15T15:00:00-04:00"));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
});

for (const { width, height, count } of [{ width: 390, height: 844, count: 3 }, { width: 1440, height: 900, count: 5 }]) {
  test(`a new visitor at ${width} px gets the ESPN front page in column 3, no NCAAF`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await dismissPicker(page, "Use defaults");
    await expect(columns(page)).toHaveCount(count, LOAD);
    const sports = await columnSports(page);
    expect(sports[2]).toBe("top");
    expect(sports).not.toContain("ncaaf");
    expect((await saved(page)).thirdLeague).toBe("top");
    // The column's own switcher marks it as the current pick (the header
    // reads "ESPN.com" in the phone short form).
    await columns(page).nth(2).locator('button[aria-haspopup="dialog"][aria-expanded]').first().click();
    const switcher = page.getByRole("dialog", { name: "Switch league" });
    await expect(switcher.locator('[aria-current="true"]')).toContainText(/ESPN/);
  });
}

test("Done with no leagues chosen keeps the ESPN front page", async ({ page }) => {
  test.skip(!process.env.HS_PROD_BUILD, "needs a production build, HS_PROD_BUILD=1 (see dismissPicker)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissPicker(page, "Done", true);
  await expect(columns(page)).toHaveCount(3, LOAD);
  expect((await columnSports(page))[2]).toBe("top");
});

test("the first-time Ratings and News bars close when you leave their tab", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await dismissPicker(page, "Use defaults");
  await expect(columns(page).first()).toBeVisible(LOAD);

  await tab(page, "scores-rated").click();
  await expect(ratingsBar(page)).toBeVisible();
  await tab(page, "scores-plain").click();
  await expect(ratingsBar(page)).toHaveCount(0);

  await tab(page, "news").click();
  await expect(newsBar(page)).toBeVisible();
  await tab(page, "scores-plain").click();
  await expect(newsBar(page)).toHaveCount(0);

  // Still first-time only: coming back does not bring either bar again.
  await tab(page, "scores-rated").click();
  await tab(page, "news").click();
  await expect(ratingsBar(page)).toHaveCount(0);
  await expect(newsBar(page)).toHaveCount(0);
});

test("Ratings → News closes the Ratings bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissPicker(page, "Use defaults");
  await tab(page, "scores-rated").click();
  await expect(ratingsBar(page)).toBeVisible();
  await tab(page, "news").click();
  await expect(ratingsBar(page)).toHaveCount(0);
});
