import { expect, test } from "@playwright/test";

// Settings → "Leagues in the switcher" → "Hide offseason" (Jacob 8/22): a
// view filter over the catalog only. The two rules worth pinning: an UNCHECKED
// offseason league disappears, a CHECKED one (NBA in August) does not — hiding
// a ticked row would leave no way to untick it — and the choice persists.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByText("Leagues in the switcher", { exact: true })).toBeVisible();
});

test("hide offseason drops unchecked offseason rows, keeps checked ones, and persists", async ({ page }) => {
  const nhl = page.getByRole("checkbox", { name: "NHL · offseason", exact: true });
  const nba = page.getByRole("checkbox", { name: "NBA · offseason", exact: true });
  const mlb = page.getByRole("checkbox", { name: "MLB", exact: true });
  await expect(nhl).toBeVisible();
  // NHL ships checked; untick it so the row is the case the filter targets —
  // offseason AND not in the switcher.
  await nhl.uncheck();
  await expect(nba).toBeChecked();

  const filter = page.getByRole("checkbox", { name: /Hide offseason/ });
  await filter.check();

  await expect(nhl).toHaveCount(0);
  await expect(nba).toBeVisible();
  await expect(mlb).toBeVisible();
  await expect(page.getByText(/Hide offseason · \d+ hidden/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Hide offseason/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "NHL · offseason", exact: true })).toHaveCount(0);

  await page.getByRole("checkbox", { name: /Hide offseason/ }).uncheck();
  await expect(page.getByRole("checkbox", { name: "NHL · offseason", exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.hideOffseasonInCatalog).toBeUndefined();
});
