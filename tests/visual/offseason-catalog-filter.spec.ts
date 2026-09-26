import { expect, test } from "@playwright/test";

// Settings → switcher catalog → "Hide offseason" (Jacob 8/22): a view filter
// over the catalog only. Since 9/4 it hides every offseason row that is not
// pinned to a slot, checked or not. Since 9/25 the catalog sits in a fold and
// the filter starts ON when the pref was never set — as a view default, with
// nothing written until the checkbox is tapped.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.locator("summary", { hasText: /leagues in the switcher · Edit/ }).click();
});

test("hide offseason starts on without a write, untick shows the rows, tick persists", async ({ page }) => {
  const filter = page.getByRole("checkbox", { name: /Hide offseason/ });
  const nhl = page.getByRole("checkbox", { name: "NHL · offseason", exact: true });
  const mlb = page.getByRole("checkbox", { name: "MLB", exact: true });

  await expect(filter).toBeChecked();
  await expect(nhl).toHaveCount(0);
  await expect(mlb).toBeVisible();
  await expect(page.getByText(/Hide offseason · \d+ hidden/)).toBeVisible();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hideOffseasonInCatalog).toBeUndefined();

  await filter.uncheck();
  await expect(nhl).toBeVisible();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hideOffseasonInCatalog).toBeUndefined();

  await filter.check();
  await expect(nhl).toHaveCount(0);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hideOffseasonInCatalog).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.locator("summary", { hasText: /leagues in the switcher · Edit/ }).click();
  await expect(page.getByRole("checkbox", { name: /Hide offseason/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NHL · offseason", exact: true })).toHaveCount(0);
});
