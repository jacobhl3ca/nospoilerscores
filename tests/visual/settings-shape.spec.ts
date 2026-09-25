import { expect, test, type Page } from "@playwright/test";

// Settings shape pass (Jacob 9/25): search-first teams, 3 slots on phones,
// the switcher catalog and the records picker folded, the email form behind a
// link, Time zone in More settings. Same prefs throughout — these tests pin
// the layout and that nothing new is written just by opening the panel.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const SIGNED_OUT = {
  signedIn: false, email: null, linkedProviders: [],
  providers: { apple: true, google: true, email: true },
};

async function mockSignedOut(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(SIGNED_OUT),
  }));
}

async function openSettings(page: Page) {
  const defaults = page.getByRole("button", { name: "Use defaults" });
  if (await defaults.isVisible().catch(() => false)) await defaults.click();
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

async function start(page: Page, viewport: { width: number; height: number }) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(viewport);
  await mockSignedOut(page);
  await page.goto("/");
  await openSettings(page);
  return errors;
}

test("phone: section order, search first, 3 slots, folds closed, short panel", async ({ page }) => {
  const errors = await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });

  await expect(dialog.locator("section > h3")).toHaveText([
    "Account", "Favorite teams", "Theme", "Default view", "League columns",
    "News", "Highlight video player", "Share & reset",
  ]);
  await expect(dialog.locator("summary", { hasText: "More settings" })).toBeVisible();

  const teams = dialog.locator("section", { has: page.locator("h3", { hasText: "Favorite teams" }) });
  await expect(teams.locator("input, select, button").first()).toHaveAttribute("type", "search");

  await expect(dialog.locator('select[aria-label^="Slot"]')).toHaveCount(3);

  await expect(dialog.getByText("Currently rendering")).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "Theme" }).getByRole("button").first()).toContainText("now");

  const tz = dialog.getByLabel("Time zone", { exact: true });
  await expect(tz).toBeHidden();
  expect(await tz.evaluate((el) => !!el.closest("details"))).toBe(true);
  await dialog.locator("summary", { hasText: "More settings" }).click();
  await expect(tz).toBeVisible();
  await dialog.locator("summary", { hasText: "More settings" }).click();

  const height = await dialog.locator(".overflow-y-auto").first().evaluate((el) => el.scrollHeight);
  expect(height).toBeLessThan(2600);
  expect(errors).toEqual([]);
});

test("desktop: 5 slots and the landing view on one row", async ({ page }) => {
  const errors = await start(page, DESKTOP);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.locator('select[aria-label^="Slot"]')).toHaveCount(5);

  const landing = dialog.getByRole("group", { name: "Landing view" }).getByRole("button");
  await expect(landing).toHaveCount(4);
  const tops = await landing.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(errors).toEqual([]);
});

test("signed out: the email form waits behind Use email instead", async ({ page }) => {
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.locator('input[type="email"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Use email instead" }).click();
  await expect(dialog.locator('input[type="email"]')).toBeVisible();
});

test("switcher catalog: closed fold, offseason hidden by default, a tick persists", async ({ page }) => {
  await start(page, DESKTOP);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const summary = dialog.locator("summary", { hasText: /\d+ leagues in the switcher · Edit/ });
  await expect(summary).toBeVisible();
  const fold = dialog.locator("details", { has: page.locator("summary", { hasText: /leagues in the switcher/ }) });
  await expect(fold).not.toHaveAttribute("open", "");
  await summary.click();

  const filter = fold.getByRole("checkbox", { name: /Hide offseason/ });
  await expect(filter).toBeChecked();
  await expect(fold.getByRole("checkbox", { name: /· offseason$/ })).toHaveCount(0);
  // The default is a view, not a write.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hideOffseasonInCatalog).toBeUndefined();

  // The Hide offseason filter is checked, so this finds a league row.
  const target = fold.locator('input[type="checkbox"]:not(:checked)').first();
  const name = await target.evaluate((el) => el.closest("label")?.textContent?.trim() ?? "");
  expect(name).not.toBe("");
  await target.check();

  await page.reload();
  await openSettings(page);
  await dialog.locator("summary", { hasText: /leagues in the switcher/ }).click();
  await expect(dialog.getByRole("checkbox", { name, exact: true })).toBeChecked();
});

test("records: summary names the leagues, Change opens the chips, a pick persists", async ({ page }) => {
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByText("NFL, NCAAF, CFL, UFL", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Records on upcoming games" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Change" }).click();
  const picker = dialog.getByRole("group", { name: "Records on upcoming games" });
  await picker.getByRole("button", { name: "MLB", exact: true }).click();
  await expect(dialog.getByText("NFL, NCAAF, CFL, UFL, MLB", { exact: true })).toBeVisible();

  await page.reload();
  await openSettings(page);
  await expect(dialog.getByText("NFL, NCAAF, CFL, UFL, MLB", { exact: true })).toBeVisible();
});

test("legacy blob: hideCrashNews alone reads ON and opening writes nothing", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("nss-preferences", JSON.stringify({ hideCrashNews: true }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.setViewportSize(PHONE);
  await mockSignedOut(page);
  await page.goto("/");
  const defaults = page.getByRole("button", { name: "Use defaults" });
  if (await defaults.isVisible().catch(() => false)) await defaults.click();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("nss-preferences") || "{}")).sort());

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Hide upsetting news/ })).toBeChecked();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("nss-preferences") || "{}")).sort());
  expect(after).toEqual(before);
});
