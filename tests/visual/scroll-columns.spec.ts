import { expect, test, type Page } from "@playwright/test";

// Settings → Scroll columns (Android user ask, 10/5): a phone or tablet can
// opt in to all 5 league columns at a readable width, with the DOCUMENT
// scrolling sideways. Pref off, nothing changes: 3 columns that fit the
// screen. Wide screens already show 5 and ignore the pref.
//
// The page scrolls, not the board, so .league-sticky-top keeps pinning under
// the header after a sideways scroll. An overflow-x box around the board
// would become the sticky's scroll container and silently stop the pin.

const FIVE = ["mlb", "nfl", "nhl", "nba", "mls"];

async function seed(page: Page, extra: Record<string, unknown>) {
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), {
    favoriteLeagues: FIVE,
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    firstLeague: FIVE[0],
    secondLeague: FIVE[1],
    thirdLeague: FIVE[2],
    fourthLeague: FIVE[3],
    fifthLeague: FIVE[4],
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  });
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"games":{}}',
  }));
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
}

async function open(page: Page, width: number, scrollColumns: boolean) {
  await page.setViewportSize({ width, height: 844 });
  await seed(page, { scrollColumns });
  await page.goto("/");
  await page.locator("[data-league-column]").first().waitFor({ timeout: 30_000 });
  // Let the extra leagues land (the 5-slot fetch replaces the first paint).
  await page.waitForTimeout(500);
}

const columns = (page: Page) => page.locator("[data-league-column]").evaluateAll((els) =>
  els.map((el) => {
    const r = el.getBoundingClientRect();
    return { sport: el.getAttribute("data-league-column"), x: Math.round(r.x), width: Math.round(r.width) };
  }));

const overflow = (page: Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
}));

for (const width of [360, 430]) {
  test(`${width}px, pref on: 5 readable columns and the page scrolls sideways`, async ({ page }) => {
    await open(page, width, true);
    await expect(page.locator("[data-league-column]")).toHaveCount(5);
    const cols = await columns(page);
    for (const c of cols) expect(c.width, c.sport!).toBeGreaterThanOrEqual(160);
    const o = await overflow(page);
    expect(o.scrollWidth).toBeGreaterThan(o.innerWidth);
    // The first column is not pushed off the left edge (no justify-center).
    expect(cols[0].x).toBeGreaterThanOrEqual(0);
    // The 5th column is reachable.
    await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0));
    const last = await page.locator("[data-league-column]").nth(4).evaluate((el) => el.getBoundingClientRect());
    expect(last.right).toBeLessThanOrEqual(width + 1);
    expect(last.left).toBeGreaterThanOrEqual(0);
  });
}

for (const width of [360, 430, 1280]) {
  test(`${width}px, pref off: no sideways scroll, ${width >= 1280 ? 5 : 3} columns`, async ({ page }) => {
    await open(page, width, false);
    await expect(page.locator("[data-league-column]")).toHaveCount(width >= 1280 ? 5 : 3);
    const o = await overflow(page);
    expect(o.scrollWidth).toBeLessThanOrEqual(o.innerWidth);
  });
}

test("1280px, pref on: same board as pref off", async ({ browser }) => {
  const boards: { cols: Awaited<ReturnType<typeof columns>>; o: Awaited<ReturnType<typeof overflow>> }[] = [];
  for (const on of [false, true]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await open(page, 1280, on);
    await expect(page.locator("[data-league-column]")).toHaveCount(5);
    boards.push({ cols: await columns(page), o: await overflow(page) });
    await ctx.close();
  }
  expect(boards[1]).toEqual(boards[0]);
});

test("One wide column wins over Scroll columns", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await seed(page, { scrollColumns: true, singleColumn: true });
  await page.goto("/");
  await page.locator("[data-league-column]").first().waitFor({ timeout: 30_000 });
  const o = await overflow(page);
  expect(o.scrollWidth).toBeLessThanOrEqual(o.innerWidth);
});

test("430px, pref on: the league title still pins under the header after a sideways scroll", async ({ page }) => {
  await open(page, 430, true);
  await page.locator(".league-sticky-top").first().waitFor({ timeout: 30_000 });
  // Make the page tall on purpose: a light slate leaves nothing to scroll and
  // the pin check would pass without testing anything.
  await page.evaluate(() => {
    const title = document.querySelectorAll(".league-sticky-top")[1];
    const probe = document.createElement("div");
    probe.style.cssText = "height:3000px";
    title!.parentElement!.appendChild(probe);
  });
  await page.evaluate(() => window.scrollTo(200, 0));
  await page.evaluate(() => window.scrollTo(200, 1200));
  const r = await page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll<HTMLElement>(".league-sticky-top"));
    const onScreen = titles.find((t) => {
      const b = t.getBoundingClientRect();
      return b.left >= 0 && b.right <= window.innerWidth;
    })!;
    // The pin offset: --header-h (+ the news toolbar, 0 on scores).
    const headerH = parseFloat(getComputedStyle(onScreen).top);
    return { scrollX: window.scrollX, scrollY: window.scrollY, top: onScreen.getBoundingClientRect().top, headerH };
  });
  expect(r.scrollX).toBeGreaterThan(0);
  expect(r.scrollY).toBeGreaterThan(0);
  expect(Math.abs(r.top - r.headerH)).toBeLessThanOrEqual(1);
});
