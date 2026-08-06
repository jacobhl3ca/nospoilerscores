import { expect, test } from "@playwright/test";

const CORE_SETTINGS_LEAGUES = ["MLB", "NFL", "MLS", "WNBA"];
const CORE_SWITCHER_LEAGUES = ["MLB", "NFL Preseason", "MLS", "WNBA"];
const OPT_IN_LEAGUES = ["Liga MX", "NWSL", "Libertadores", "F1", "NASCAR", "IndyCar", "UFC", "Boxing", "Chess", "Esports"];

async function openSwitcherSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByText("Leagues in the switcher", { exact: true })).toBeVisible();
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
