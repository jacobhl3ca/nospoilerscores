import { expect, test } from "@playwright/test";

// The news view used to paint "Top news" in column 3 with no leagues behind
// it, then jump to league columns once the board load landed ~1.5 s later
// (Jacob 10/2: a bug). It now holds the loading skeleton until that first
// load lands, so the first columns a reader sees are the settled ones.
test("news view holds the skeleton until the board lands, then paints NFL first", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-04T15:00:00-04:00"));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
    showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news",
    firstLeague: "nfl",
  })));
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : '{"items":[]}',
  }));
  // The first scoreboard wave answers ~2 s late, so the first board load is
  // still pending while the checks below run. Later calls (the empty-day
  // lookahead) answer at once, or each one would add another 2 s.
  let releaseAt = 0;
  await page.route("**/scoreboard?**", async (route) => {
    releaseAt ||= Date.now() + 2000;
    await new Promise((r) => setTimeout(r, Math.max(0, releaseAt - Date.now())));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"leagues":[],"events":[]}' });
  });
  await page.goto("/");

  const titles = page.locator('button[title="Switch news league"]');
  const skeleton = page.getByRole("status").filter({ hasText: "Loading news…" });
  await expect(skeleton).toHaveCount(1);
  await expect(titles).toHaveCount(0);

  // Poll through the delay: no column title shows until the leagues land,
  // and the first titles seen lead with NFL (never a Top news column alone).
  let first: string[] = [];
  for (let i = 0; i < 60 && first.length === 0; i++) {
    first = (await titles.allTextContents()).map((t) => t.trim());
    if (first.length === 0) await page.waitForTimeout(100);
  }
  expect(first[0]).toBe("NFL");
  await expect(skeleton).toHaveCount(0);
});
