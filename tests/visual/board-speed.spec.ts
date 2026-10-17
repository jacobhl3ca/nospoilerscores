import { expect, test } from "@playwright/test";

// Speed quick wins (Jacob 10/15: "is speed as fast as possible?").
// 1. A wide screen pulled every scoreboard twice: isWide flipped false → true
//    in the same commit as the first date pull, and the prefs effect pulled
//    again (lastPullKeyRef in HomeContent).
// 2. The board slid sideways at hydration, 3 → 5 columns and max-w-6xl →
//    max-w-7xl (CLS 0.16 at 1440): html.hs-wide-board, set pre-paint.
// 3. ESPN team logos loaded at 500 px; they now come through the combiner at
//    the drawn size (sizedTeamLogo).
//
// Production build only (HS_PROD_BUILD=1, e.g. `npx serve out` or a Pages
// preview): `next dev` runs every mount effect twice (React Strict Mode), so
// it pulls twice by design.

test.skip(!process.env.HS_PROD_BUILD, "needs a production build, HS_PROD_BUILD=1");

const SCOREBOARD = /\/scoreboard\?|statsapi\.mlb\.com\/api\/v1\/schedule/;

test("1440 px: each scoreboard is pulled once, the board does not shift, ESPN logos are sized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const pulls: string[] = [];
  const logos: string[] = [];
  page.on("request", (r) => {
    if (SCOREBOARD.test(r.url())) pulls.push(r.url());
    if (r.url().includes("/i/teamlogos/")) logos.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("[data-league-column]")).toHaveCount(5, { timeout: 30_000 });
  // Let the late pulls (NFL / EPL look-back days) land.
  await page.waitForTimeout(6_000);

  expect(pulls.length).toBeGreaterThan(0);
  const twice = pulls.filter((u, i) => pulls.indexOf(u) !== i);
  expect(twice, "scoreboard URLs requested more than once").toEqual([]);

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);

  expect(logos.length).toBeGreaterThan(0);
  expect(logos.filter((u) => !u.includes("/combiner/")), "ESPN logos at full size").toEqual([]);
});
