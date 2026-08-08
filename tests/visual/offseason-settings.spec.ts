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
    await expect(slot.locator('optgroup[label="In season"]')).toHaveCount(1);
    await expect(slot.locator('optgroup[label="Offseason"]')).toHaveCount(1);
    await expect(slot.locator('optgroup[label="Offseason"] option[value="nhl"]')).toHaveText("NHL · offseason");
    await expect(page.getByText(/Offseason · saved for its return/)).toBeVisible();

    const expectedSports = [...new Set(
      ALL_LEAGUES.filter((league) => !league.hidden).map((league) => league.sport),
    )].sort();
    const listedSports = (await slot.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter((value) => value && value !== "empty"),
    )).sort();
    expect(listedSports).toEqual(expectedSports);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
    expect(saved.firstLeague).toBe("nhl");

    const offseasonSection = page.getByText("Offseason", { exact: true }).last().locator("xpath=..");
    await expect(offseasonSection.getByText("NHL · offseason", { exact: true })).toBeVisible();
  });
}
