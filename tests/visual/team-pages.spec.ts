import { expect, test } from "@playwright/test";

// /teams/<league>/<team> (2026-09-26). The schedule is fetched live from ESPN
// on the client, so this is a functional check against real data, not a
// screenshot: the title, at least one covered card, no score-shaped text in
// the schedule region, and the three JSON-LD nodes the page promises.

const PATH = "/teams/nfl/new-york-giants";
// "24-17", "3 – 1": a scoreline. Dates on the cards are "Sun, Sep 27"-style,
// times "1:00 PM", so neither can match.
const SCORE = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b/;

test("NFL team page: title, covered cards, no score, JSON-LD", async ({ page }) => {
  await page.goto(PATH);
  await expect(page).toHaveTitle("New York Giants Games Without Spoilers: Schedule, No Scores | HideScore");

  const region = page.locator("[data-team-schedule]");
  await expect(region.locator("[data-team-game]").first()).toBeVisible({ timeout: 30_000 });
  const cards = await region.locator("[data-team-game]").count();
  expect(cards).toBeGreaterThanOrEqual(1);
  expect(cards).toBeLessThanOrEqual(10);

  // Ratings on too, so a finished card renders everything it can.
  await region.getByRole("button", { name: "Show ratings" }).click();
  const text = await region.innerText();
  expect(text).not.toMatch(SCORE);
  expect(text).not.toMatch(/(^|\s)[WL](\s|$)/m);
  expect(text.toLowerCase()).not.toContain("record");

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = new Set<string>();
  for (const raw of blocks) {
    const data = JSON.parse(raw);
    for (const node of data["@graph"] ?? [data]) types.add(node["@type"]);
  }
  expect(types).toContain("SportsTeam");
  expect(types).toContain("FAQPage");
  expect(types).toContain("BreadcrumbList");
});
