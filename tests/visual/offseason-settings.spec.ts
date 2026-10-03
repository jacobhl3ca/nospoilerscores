import { expect, test } from "@playwright/test";
import { ALL_LEAGUES } from "../../src/lib/espn";

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`${viewport.name} Settings keeps saved offseason leagues visible and grouped`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
    await page.addInitScript(() => {
      localStorage.setItem("nss-preferences", JSON.stringify({
        favoriteLeagues: [],
        favoriteTeams: [],
        theme: "light",
        showRatings: false,
        skipExplainer: true,
        skipNewsExplainer: true,
        showNews: false,
        leaguesOnboarded: true,
        firstLeague: "nhl",
        secondLeague: "empty",
        thirdLeague: "empty",
        fourthLeague: "empty",
        fifthLeague: "empty",
        defaultDateMode: "today",
        defaultLandingView: "scores",
      }));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open settings" }).click();

    const slot = page.getByLabel("Slot 1 league");
    await expect(slot).toHaveValue("nhl");
    // The dropdown groups by KIND of sport since 8/11 (no more "In season" /
    // "Offseason" groups); the season rides on each row instead, and a saved
    // offseason league keeps its row.
    await expect(slot.locator('option[value="nhl"]')).toHaveText("NHL · offseason");
    await expect(page.getByText(/Offseason · saved for its return/)).toBeVisible();

    // Every visible league is offered, plus the two cross-league columns.
    const expectedSports = [...new Set(
      ALL_LEAGUES.filter((league) => !league.hidden).map((league) => league.sport),
    )].sort();
    const listedSports = (await slot.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value && value !== "empty" && value !== "best" && value !== "top"),
    )).sort();
    expect(listedSports).toEqual(expectedSports);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
    expect(saved.firstLeague).toBe("nhl");

    // The switcher catalog starts with offseason rows hidden (9/25), but a
    // pinned one stays listed so it can be un-pinned.
    await page.getByRole("button", { name: "More leagues", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /Hide offseason/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "NHL · offseason", exact: true })).toBeVisible();
  });
}
