import { expect, test } from "@playwright/test";

test("Poker yesterday renders the Aug 5 WSOP final table without a result", async ({ page }) => {
  let lookupUrl = "";
  let openedSearch = false;
  page.on("popup", () => { openedSearch = true; });
  await page.route("**/api/youtube?**", async (route) => {
    lookupUrl = route.request().url();
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No results" }) });
  });
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["poker"],
      favoriteTeams: [],
      theme: "light",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      firstLeague: "poker",
      secondLeague: "empty",
      thirdLeague: "empty",
      fourthLeague: "empty",
      fifthLeague: "empty",
      defaultDateMode: "yesterday",
      defaultLandingView: "scores",
    }));
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  const title = page.getByText("WSOP Main Event Final Table · Day 3", { exact: true });
  await expect(title).toBeVisible();
  const card = title.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card.getByText("Final", { exact: true })).toHaveCount(0);
  const replay = page.getByRole("button", { name: "WSOP highlights" });
  await expect(replay).toBeVisible();

  // The curated record carries no winner, payout, chip count, or result field;
  // this catches an accidental future leak into the visible tile.
  await expect(card).not.toContainText(/winner|champion|1st place|payout/i);

  // A miss is fail-closed: strict exact-channel request, then no button and no
  // external YouTube results page (whose titles would reveal the winner).
  await replay.click();
  await expect.poll(() => lookupUrl).not.toBe("");
  const lookup = new URL(lookupUrl);
  expect(lookup.searchParams.get("channel")).toBe("World Series of Poker");
  expect(lookup.searchParams.get("strict")).toBe("1");
  await expect(replay).toHaveCount(0);
  expect(openedSearch).toBe(false);
});
