import { expect, test } from "@playwright/test";

const CORE_SETTINGS_LEAGUES = ["MLB", "NFL", "MLS", "WNBA"];
const CORE_SWITCHER_LEAGUES = ["MLB", "NFL Preseason", "MLS", "WNBA"];
// "Esports" dropped 2026-08-09 — hidden in ALL_LEAGUES (only LEC has a trusted
// highlight source, so most of the column could never show video).
const OPT_IN_LEAGUES = ["Liga MX", "NWSL", "Libertadores", "F1", "NASCAR", "IndyCar", "UFC", "Boxing", "Chess"];

async function openSwitcherSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  // The catalog sits in a closed fold since 9/25; open it and show every row
  // (the fold starts with offseason rows hidden).
  await page.locator("summary", { hasText: /leagues in the switcher · Edit/ }).click();
  const hide = page.getByRole("checkbox", { name: /Hide offseason/ });
  if (await hide.isChecked()) await hide.uncheck();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
  // The share URL skips first-run onboarding while leaving switcher preferences
  // unset, which exercises the real fresh-install defaults.
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await openSwitcherSettings(page);
});

test("core leagues default on and expansion leagues default off", async ({ page }) => {
  await expect(page.getByRole("checkbox", { name: "NBA · offseason" })).toBeChecked();
  for (const league of CORE_SETTINGS_LEAGUES) {
    await expect(page.getByRole("checkbox", { name: league, exact: true })).toBeChecked();
  }
  for (const league of OPT_IN_LEAGUES) {
    await expect(page.getByRole("checkbox", { name: league, exact: true })).not.toBeChecked();
  }

  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "MLB", exact: true }).click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await expect(switcher.getByRole("button", { name: "NBA · offseason", exact: true })).toBeVisible();
  for (const league of CORE_SWITCHER_LEAGUES) {
    await expect(switcher.getByRole("button", { name: league, exact: true })).toBeVisible();
  }
  for (const league of OPT_IN_LEAGUES) {
    await expect(switcher.getByRole("button", { name: league, exact: true })).toHaveCount(0);
  }
});

test("clicking NFL Preseason opens NFL instead of falling through to MLS", async ({ page }) => {
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"events":[]}',
  }));
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "MLB", exact: true }).click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  await switcher.getByRole("button", { name: "NFL Preseason", exact: true }).click();

  // The narrow score column intentionally abbreviates this heading.
  await expect(page.getByRole("heading", { name: "NFL Pre", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MLS", exact: true })).toHaveCount(0);
});

test("manual opt-in and core-hide choices persist after reload", async ({ page }) => {
  const ligaMx = page.getByRole("checkbox", { name: "Liga MX", exact: true });
  const mlb = page.getByRole("checkbox", { name: "MLB", exact: true });
  await ligaMx.check();
  await mlb.uncheck();
  await expect(ligaMx).toBeChecked();
  await expect(mlb).not.toBeChecked();

  await page.reload();
  await openSwitcherSettings(page);
  await expect(page.getByRole("checkbox", { name: "Liga MX", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "MLB", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NWSL", exact: true })).not.toBeChecked();
});

test("a pinned expansion league is included unless manually hidden", async ({ page }) => {
  await page.goto("/?s=mx.0.0&dd=t&dv=s");
  await openSwitcherSettings(page);

  const ligaMx = page.getByRole("checkbox", { name: "Liga MX", exact: true });
  await expect(ligaMx).toBeChecked();
  await ligaMx.uncheck();
  await expect(ligaMx).not.toBeChecked();
});

test("legacy anonymous installs keep their old checked leagues", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [],
      favoriteTeams: [],
      theme: "system",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
    }));
  });
  await page.reload();
  await openSwitcherSettings(page);

  await expect(page.getByRole("checkbox", { name: "Liga MX", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NWSL", exact: true })).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.switcherDefaultsVersion).toBe(2);
  expect(saved.shownLeagues).toEqual(expect.arrayContaining(["ligamx", "nwsl"]));
});

test("legacy anonymous installs keep old unchecks too", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [],
      favoriteTeams: [],
      theme: "system",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      hiddenLeagues: ["mlb", "nwsl"],
    }));
  });
  await page.reload();
  await openSwitcherSettings(page);

  await expect(page.getByRole("checkbox", { name: "MLB", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NWSL", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Liga MX", exact: true })).toBeChecked();
});

test("legacy signed-in account prefs migrate and sync from a new device", async ({ page }) => {
  let uploaded: Record<string, unknown> | null = null;
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ signedIn: true, uid: "migration-test", platforms: { web: true } }),
  }));
  await page.route("**/api/prefs", async (route) => {
    if (route.request().method() === "PUT") {
      uploaded = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prefs: {
          favoriteLeagues: [],
          favoriteTeams: [],
          hiddenLeagues: ["nwsl"],
        },
      }),
    });
  });

  await page.reload();
  await openSwitcherSettings(page);
  await expect(page.getByRole("checkbox", { name: "Liga MX", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NWSL", exact: true })).not.toBeChecked();
  await expect.poll(() => uploaded?.switcherDefaultsVersion).toBe(2);
  // `uploaded` is only ever assigned inside the page.route closure above, so
  // same-scope control-flow analysis narrows this direct read back to its
  // `null` initializer — making `null?.shownLeagues` resolve to `never` (TS2339).
  // (Line 157 escapes this only because it reads inside an arrow callback, which
  // uses the declared type.) Cast back to the declared type; type-only, no
  // runtime change — the poll above already asserted the upload landed.
  expect((uploaded as Record<string, unknown> | null)?.shownLeagues).toEqual(expect.arrayContaining(["ligamx"]));
});

test("v2 account defaults clear device-only switcher overrides", async ({ page }) => {
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("nss-preferences") || "{}");
    localStorage.setItem("nss-preferences", JSON.stringify({
      ...current,
      hiddenLeagues: ["mlb"],
      shownLeagues: ["ligamx"],
      switcherDefaultsVersion: 2,
    }));
  });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ signedIn: true, uid: "v2-test", platforms: { web: true } }),
  }));
  await page.route("**/api/prefs", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      prefs: {
        favoriteLeagues: [],
        favoriteTeams: [],
        switcherDefaultsVersion: 2,
      },
    }),
  }));

  await page.reload();
  await openSwitcherSettings(page);
  await expect(page.getByRole("checkbox", { name: "MLB", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Liga MX", exact: true })).not.toBeChecked();
});
