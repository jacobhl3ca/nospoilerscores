import { expect, test } from "@playwright/test";

test("Boxing yesterday keeps the recent major, matches MLB height, and resolves DAZN strictly", async ({ page }) => {
  let lookupUrl = "";
  await page.route("**/api/boxing", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/api/youtube?**", route => {
    lookupUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"iuofPvxZKtQ"}' });
  });
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["boxing", "mlb"], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: "boxing", secondLeague: "mlb", thirdLeague: "empty", fourthLeague: "empty",
    fifthLeague: "empty", defaultDateMode: "yesterday", defaultLandingView: "scores",
  })));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Boxing" })).toBeVisible();
  const title = page.getByText("Roach vs. Zepeda", { exact: true });
  await expect(title).toBeVisible();
  const card = title.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card).toContainText("DAZN");
  await expect(card).not.toContainText(/winner|won|defeats|decision|knockout/i);
  expect((await card.boundingBox())?.height).toBe(111);

  await page.getByRole("button", { name: "DAZN highlights" }).click();
  await expect.poll(() => lookupUrl).not.toBe("");
  const lookup = new URL(lookupUrl);
  expect(lookup.searchParams.get("channel")).toBe("DAZN Boxing");
  expect(lookup.searchParams.get("strict")).toBe("1");
  await expect(page.locator('iframe[src*="youtube.com/embed/iuofPvxZKtQ"]')).toBeVisible();
});
