import { expect, test, type Page } from "@playwright/test";

// The offseason "2026 in review" pill on TODAY's MLB column (LeagueRecapCard
// onShowReview) and the dialog it opens (MlbSeasonReviewModal), fed by a
// mocked /news/mlb-review.json in the shape bakeMlbSeasonReview writes.
// DOM assertions plus one attached screenshot per width — no pixel baseline.

// ⚠️ MLB's board window ends 11-01 (ALL_LEAGUES in src/lib/espn.ts): from
// Nov 2 the MLB column leaves today's board, and the pill has no column to sit
// on. So this runs on Nov 1, the one day both exist, with the World Series cut
// dated that morning.
const NOW = new Date("2026-11-01T16:00:00-05:00");

const rec = (slug: string, durationSec: number, extra: Record<string, unknown> = {}) => ({
  slug, pageUrl: `https://www.mlb.com/video/${slug}`, playbackUrl: `https://example.invalid/${slug}.m3u8`,
  poster: null, durationSec, published: "2026-11-02T12:00:00Z", sourcePolicy: "mlb.com", channel: "MLB.com", ...extra,
});
const team = (slug: string, subject: string, espnTeamIds: string[]) =>
  rec(slug, 90, { subject, mlbTeamIds: ["0"], espnTeamIds });

const REVIEW = JSON.stringify({
  fetchedAt: "2026-11-05T12:00:00Z",
  season: 2026,
  seasonOver: true,
  seasonOverSince: "20261101",
  months: [
    { label: "March/April", order: 4, top25: rec("top-25-march-april", 960), oddities: rec("oddities-april", 240) },
    { label: "August", order: 8, top25: rec("top-25-august", 880), oddities: null },
  ],
  postseasonTop25: rec("top-25-postseason", 900),
  rounds: [
    { key: "wildcard", label: "Wild Card", top10: rec("top-10-wc", 360), oddities: rec("odd-wc", 60) },
    { key: "division", label: "Division Series", top10: rec("top-10-ds", 360), oddities: rec("odd-ds", 60) },
    { key: "championship", label: "Championship Series", top10: rec("top-10-cs", 360), oddities: rec("odd-cs", 60) },
    { key: "worldseries", label: "World Series", top10: rec("top-10-ws", 360), oddities: rec("odd-ws", 60) },
  ],
  yearEnd: [
    rec("top-bat-flips-of-2026", 240, { title: "Top Bat Flips of 2026" }),
    rec("top-games-of-2026", 300, { title: "Top Games of 2026" }),
  ],
  teams: [
    team("so-angels", "Angels", ["3"]),
    team("so-royals", "Royals", ["7"]),
    team("so-cal-raleigh", "Cal Raleigh", ["12"]),
  ],
});

async function seed(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb", "nfl"],
    favoriteTeams: ["mlb-12"],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "nfl",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })));
  await page.route("**/api/youtube?**", route =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"fetchedAt":"2026-11-05T12:00:00Z","recaps":{}}' }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/news/mlb-review.json", route => route.fulfill({ status: 200, contentType: "application/json", body: REVIEW }));
}

async function pillMetrics(page: Page) {
  return page.evaluate(() => {
    const pill = document.querySelector<HTMLElement>('[data-league-recap="mlb"]')!;
    const pr = pill.getBoundingClientRect();
    const heading = pill.querySelector<HTMLElement>("[data-recap-heading]")!;
    const buttons = [...pill.querySelectorAll<HTMLElement>("button")];
    return {
      kind: pill.dataset.recapKind,
      layout: pill.dataset.recapLayout,
      overflow: pill.scrollWidth - pill.clientWidth,
      headingText: heading.textContent?.trim(),
      headingHidden: heading.classList.contains("invisible"),
      headingClipped: heading.scrollWidth > heading.clientWidth,
      buttonsPastEdge: buttons.filter((b) => b.getBoundingClientRect().right > pr.right + 0.5).length,
      buttonsClipped: buttons.filter((b) => b.scrollWidth > b.clientWidth).length,
      buttonTexts: buttons.map((b) => b.textContent?.trim()),
    };
  });
}

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`${vp.width}px: "2026 in review" pill on today's MLB column, three buttons, nothing clipped`, async ({ page }, testInfo) => {
    await page.setViewportSize(vp);
    await page.clock.setFixedTime(NOW);
    await seed(page);
    await page.goto("/");
    const pill = page.locator('[data-league-recap="mlb"]');
    await expect(pill).toBeVisible({ timeout: 20_000 });
    await expect(pill).toHaveAttribute("data-recap-kind", "review");
    await expect(pill.getByRole("button")).toHaveCount(3);
    const m = await pillMetrics(page);
    expect(m.buttonTexts).toEqual(["Months", "Playoffs", "Teams"]);
    expect(m.overflow).toBe(0);
    expect(m.buttonsPastEdge).toBe(0);
    expect(m.buttonsClipped).toBe(0);
    expect(m.headingHidden).toBe(false);
    expect(m.headingClipped).toBe(false);
    expect(["2026 in review", "’26 review"]).toContain(m.headingText);
    // No Playoffs pill once the review is due.
    await expect(page.locator("[data-recap-playoffs-tab]")).toHaveCount(0);
    const shot = await page.locator("main").screenshot();
    await testInfo.attach(`review-pill-${vp.width}`, { body: shot, contentType: "image/png" });
  });
}

test("Teams opens the dialog with the favorite team's cut first; a month Top 25 plays in the native HLS player", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await page.goto("/");
  const pill = page.locator('[data-league-recap="mlb"]');
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await pill.locator('[data-recap-review-section="teams"]').click();

  const dialog = page.getByRole("dialog", { name: "MLB 2026 in review" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /2026 season in review/ })).toBeVisible();
  await expect(dialog.getByText("Your teams")).toBeVisible();
  await expect(dialog.getByText("Everyone else")).toBeVisible();
  const teamOrder = await dialog.locator('[data-review-section="teams"] button[data-review-play^="so-"]').evaluateAll((bs) => bs.map((b) => b.getAttribute("data-review-play")));
  expect(teamOrder[0]).toBe("so-cal-raleigh");
  expect(teamOrder).toEqual(["so-cal-raleigh", "so-angels", "so-royals"]);
  // Year-end shows keep their own title; August has no Oddities cut → a dash.
  await expect(dialog.getByRole("button", { name: "Top Bat Flips of 2026 (4m)" })).toBeVisible();
  await expect(dialog.locator('[aria-label="Not posted"]')).toHaveCount(1);
  await testInfo.attach("review-dialog", { body: await dialog.screenshot(), contentType: "image/png" });

  await dialog.locator('[data-review-play="top-25-march-april"]').click();
  await expect(page.getByRole("dialog", { name: "MLB 2026 in review" })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(1, { timeout: 10_000 });

  // Closing the video brings the review back.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "MLB 2026 in review" })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "MLB 2026 in review" })).toHaveCount(0);
});
