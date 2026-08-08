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
  await expect(card).not.toContainText("Final");

  await page.getByRole("button", { name: "DAZN highlights" }).click();
  await expect.poll(() => lookupUrl).not.toBe("");
  const lookup = new URL(lookupUrl);
  expect(lookup.searchParams.get("channel")).toBe("DAZN Boxing");
  expect(lookup.searchParams.get("strict")).toBe("1");
  await expect(page.locator('iframe[src*="youtube.com/embed/iuofPvxZKtQ"]')).toBeVisible();
});

test("Boxing Today keeps carried-forward replay compact and loads Reddit plus ESPN headlines", async ({ page }) => {
  await page.route("**/api/boxing", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/news/reddit-boxing.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [{
      id: "boxing-reddit-1",
      headline: "Daily boxing discussion",
      description: "",
      published: "2026-08-06T16:00:00Z",
      imageUrl: null,
      articleUrl: "https://www.reddit.com/r/Boxing/comments/test",
      byline: "",
      section: "r/Boxing",
      body: "Discussion",
    }] }),
  }));
  await page.route("https://www.espn.com/espn/rss/boxing/news", route => route.fulfill({
    status: 200,
    contentType: "text/xml",
    body: `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>ESPN boxing report</title><description>Report</description><dc:creator>ESPN</dc:creator><link>https://www.espn.com/boxing/story/_/id/1/test</link><pubDate>Thu, 6 Aug 2026 11:27:27 EST</pubDate><guid>boxing-1</guid></item></channel></rss>`,
  }));
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["boxing"], favoriteTeams: [], theme: "light", showRatings: false,
    showTextPosts: true, revealNewsTitles: true, newsTypeFilter: "all",
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: "boxing", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty",
    fifthLeague: "empty", defaultDateMode: "today", defaultLandingView: "scores",
  })));

  await page.goto("/today");
  const scoreCard = page.getByText("Roach vs. Zepeda", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(scoreCard).toBeVisible();
  await expect(scoreCard).not.toContainText("Final");
  expect((await scoreCard.boundingBox())?.height).toBe(111);

  await page.getByRole("button", { name: "News" }).click();
  await expect(page.getByText("r/Boxing", { exact: true })).toBeVisible();
  await expect(page.getByText("Daily boxing discussion", { exact: true })).toBeAttached();
  await expect(page.getByText("ESPN BOXING", { exact: true })).toBeVisible();
  await expect(page.getByText("ESPN boxing report", { exact: true })).toBeAttached();
});
