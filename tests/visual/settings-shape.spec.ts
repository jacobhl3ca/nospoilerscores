import { expect, test, type Page } from "@playwright/test";

// Settings shape pass (Jacob 9/25, reordered 9/28): search-first teams, 3
// slots on phones, the switcher catalog folded, the records chips open the
// picker in place, the email form behind a link, no Time zone. Same prefs
// throughout — these tests pin the layout and that nothing new is written just
// by opening the panel.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const SIGNED_OUT = {
  signedIn: false, email: null, linkedProviders: [],
  providers: { apple: true, google: true, email: true },
};

const SIGNED_IN = {
  signedIn: true, email: "abc123@privaterelay.appleid.com", uid: "u1", provider: "apple",
  linkedProviders: ["apple"], providers: { apple: true, google: true, email: true }, platforms: {},
};

async function mockSignedOut(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(SIGNED_OUT),
  }));
}

// A signed-in account whose server copy is whatever this device last pushed.
async function mockSignedIn(page: Page) {
  let server: Record<string, unknown> | null = null;
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(SIGNED_IN),
  }));
  await page.route("**/api/prefs", (route) => {
    if (route.request().method() === "PUT") {
      server = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ prefs: server }) });
  });
}

async function openSettings(page: Page) {
  const defaults = page.getByRole("button", { name: "Use defaults" });
  if (await defaults.isVisible().catch(() => false)) await defaults.click();
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

async function start(page: Page, viewport: { width: number; height: number }, signedIn = false) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(viewport);
  await (signedIn ? mockSignedIn(page) : mockSignedOut(page));
  await page.goto("/");
  await openSettings(page);
  return errors;
}

const SIGNED_IN_ORDER = [
  "Theme", "Leagues", "Favorite teams", "Default view", "News",
  "Highlight video player", "Account", "Share & reset",
];

test("phone: section order, search first, 3 slots, folds closed, short panel", async ({ page }) => {
  const errors = await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });

  // Signed out: Account first, then the signed-in order.
  await expect(dialog.locator("section > h3")).toHaveText([
    "Account", ...SIGNED_IN_ORDER.filter((t) => t !== "Account"),
  ]);
  await expect(dialog.locator("summary", { hasText: "More settings" })).toBeVisible();

  const teams = dialog.locator("section", { has: page.locator("h3", { hasText: "Favorite teams" }) });
  await expect(teams.locator("input, select, button").first()).toHaveAttribute("type", "search");

  await expect(dialog.locator('select[aria-label^="Slot"]')).toHaveCount(3);

  await expect(dialog.getByRole("group", { name: "Theme" }).getByRole("button")).toHaveText(["🖥️ System", "☀️ Light", "🌙 Dark"]);
  const themeTops = await dialog.getByRole("group", { name: "Theme" }).getByRole("button")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(themeTops).size).toBe(1);

  // Time zone and its ZIP helper are gone, folded or not.
  await dialog.locator("summary", { hasText: "More settings" }).click();
  await expect(dialog.getByLabel("Time zone", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("US ZIP code for time zone")).toHaveCount(0);
  await expect(dialog.getByRole("radiogroup").or(dialog.getByRole("group", { name: "Header league switcher" }))).toBeVisible();
  await dialog.locator("summary", { hasText: "More settings" }).click();

  // The 9/25 pass left the phone panel at 2,171 px; this one may not grow it.
  const height = await dialog.locator(".overflow-y-auto").first().evaluate((el) => el.scrollHeight);
  expect(height).toBeLessThanOrEqual(2171);
  expect(errors).toEqual([]);
});

for (const viewport of [PHONE, DESKTOP]) {
  test(`signed in ${viewport.width}: order, one Account line with no email, three bottom links`, async ({ page }) => {
    const errors = await start(page, viewport, true);
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog.locator("section > h3")).toHaveText(SIGNED_IN_ORDER);

    const account = dialog.locator("section", { has: page.locator("h3", { hasText: "Account" }) });
    await expect(account.locator("p")).toHaveCount(1);
    await expect(account).toContainText("🍎Signed in with Apple · synced");
    expect(await dialog.evaluate((el) => el.textContent ?? "")).not.toContain("privaterelay");
    await expect(account.getByRole("button")).toHaveCount(0);

    const links = dialog.locator("div.text-center", { has: page.getByRole("button", { name: "Delete account" }) }).getByRole("button");
    await expect(links).toHaveText(["Sign out", "Link another way to sign in", "Delete account"]);
    await expect(dialog.getByText("Removes your synced data")).toHaveCount(0);
    // Linking opens in place under the row.
    await dialog.getByRole("button", { name: "Link another way to sign in" }).click();
    await expect(dialog.getByRole("button", { name: "Link Google" })).toBeVisible();
    await expect(dialog.locator('input[type="email"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

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

test("records: the leagues are chips, a tap opens the picker in place, a pick persists", async ({ page }) => {
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const summary = dialog.getByLabel("Records on upcoming games: NFL, NCAAF, CFL, UFL", { exact: true });
  await expect(summary.getByRole("button")).toHaveText(["NFL", "NCAAF", "CFL", "UFL"]);
  await expect(dialog.getByText("Each team's record, in italics, on upcoming and live games")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Change" })).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "Records on upcoming games" })).toHaveCount(0);

  await summary.getByRole("button", { name: "CFL" }).click();
  const picker = dialog.getByRole("group", { name: "Records on upcoming games" });
  await picker.getByRole("button", { name: "MLB", exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog.getByLabel("Records on upcoming games: NFL, NCAAF, CFL, UFL, MLB", { exact: true })).toBeVisible();

  await page.reload();
  await openSettings(page);
  await expect(dialog.getByLabel("Records on upcoming games: NFL, NCAAF, CFL, UFL, MLB", { exact: true })).toBeVisible();
});

test("default view: the switch hour sits inline under Automatic; Auto's rule is visible", async ({ page }) => {
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByText("Auto = off in the morning, last state after noon ET")).toBeVisible();
  await expect(dialog.getByLabel("Automatic switch time")).toHaveCount(0);
  await dialog.getByRole("group", { name: "Landing date" }).getByRole("button", { name: /^Automatic/ }).click();
  const hour = dialog.getByLabel("Automatic switch time");
  await expect(hour).toBeVisible();
  await expect(hour.locator("xpath=..")).toContainText("switches to today at");
  await hour.selectOption("10");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.smartCutoffHour).toBe(10);
  expect(saved.defaultDateMode).toBe("smart");
});

test("reset: confirm, then Settings reset · Undo puts the favorites back", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("nss-preferences", JSON.stringify({ favoriteTeams: ["mlb-10"], theme: "dark", maskVideoTitle: true, switcherDefaultsVersion: 2 }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  const before = await read();
  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "Reset to defaults" }).click();
  const toast = dialog.getByRole("status").filter({ hasText: "Settings reset" });
  await expect(toast).toBeVisible();
  const cleared = await read();
  expect(cleared.favoriteTeams).toEqual([]);
  expect(cleared.theme).toBe("system");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toHaveCount(0);
  const after = await read();
  expect(after.favoriteTeams).toEqual(["mlb-10"]);
  expect(after.theme).toBe("dark");
  expect(after.maskVideoTitle).toBe(true);
  expect(after).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
});

test("reset: the undo toast leaves after 15 s", async ({ page }) => {
  await page.clock.install();
  await start(page, PHONE);
  const dialog = page.getByRole("dialog", { name: "Settings" });
  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "Reset to defaults" }).click();
  const toast = dialog.getByRole("status").filter({ hasText: "Settings reset" });
  await expect(toast).toBeVisible();
  await page.clock.runFor(14_000);
  await expect(toast).toBeVisible();
  await page.clock.runFor(1_500);
  await expect(toast).toHaveCount(0);
});

test("settings link carries the whole setup to a fresh browser", async ({ page, browser }) => {
  const setup = {
    favoriteTeams: ["mlb-10"], theme: "light", switcherDefaultsVersion: 2,
    hideSensitiveNews: true, hideCrashNews: true, maskVideoTitle: true, youtubeNativeControls: false,
    singleColumn: true, hideTeamStars: true, hiddenLeagues: ["nhl"], shownLeagues: ["ufl", "poker"],
    upcomingRecordLeagues: ["nfl", "soccer"],
  };
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("nss-preferences", JSON.stringify(p));
      sessionStorage.setItem("seeded", "1");
    }
  }, setup);
  await start(page, DESKTOP);
  const href = await page.getByRole("dialog", { name: "Settings" }).locator("a", { hasText: /Drag to Bookmarks Bar|HideScore/ }).getAttribute("href");
  expect(href).toBeTruthy();
  const url = new URL(href!);
  for (const k of ["hn", "mt", "yp", "sc", "ts", "xl", "ol", "rl"]) expect(url.searchParams.has(k), k).toBe(true);

  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await mockSignedOut(fresh);
  await fresh.goto(href!);
  await fresh.waitForFunction(() => !!localStorage.getItem("nss-preferences"));
  const got = await fresh.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  for (const [k, v] of Object.entries(setup)) {
    if (k === "switcherDefaultsVersion") continue;
    expect(got[k], k).toEqual(v);
  }
  await ctx.close();
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
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Hide upsetting news/ })).toBeChecked();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  // Every value, not just the key list: opening the panel writes nothing.
  expect(after).toEqual(before);
});
