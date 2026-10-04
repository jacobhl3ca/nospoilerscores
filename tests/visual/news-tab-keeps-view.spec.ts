import { expect, test, type Page } from "@playwright/test";

// A tab that was on News stays on News after a reload, any day, whatever
// another tab or device saved since (Jacob 10/4). A NEW tab on a new day
// still opens on Scores (Jacob 6/19). See src/lib/tabView.ts.

const NOW = new Date("2026-08-07T15:00:00-04:00");
const TODAY = "20260807";
const YESTERDAY = "20260806";

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: false,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultLandingView: "remember",
};

async function seedPrefs(page: Page, extra: Record<string, unknown>) {
  await page.addInitScript(({ base, update }) => {
    if (!localStorage.getItem("nss-preferences")) {
      localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    }
  }, { base: BASE_PREFS, update: extra });
}

// The tab-view writer runs only once stored prefs are in state, so waiting on
// it also waits out the server-rendered Scores frame.
async function hydratedView(page: Page) {
  await page.waitForFunction(() => sessionStorage.getItem("hs-tab-view") !== null);
  const cover = page.getByTestId("sticky-seam-cover");
  return (await cover.getAttribute("data-news")) === null ? "scores" : "news";
}

async function expectView(page: Page, view: "news" | "scores") {
  await expect.poll(() => hydratedView(page)).toBe(view);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("hs-tab-view"))).toBe(view);
}

async function patchStoredPrefs(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const cur = JSON.parse(localStorage.getItem("nss-preferences") || "{}");
    localStorage.setItem("nss-preferences", JSON.stringify({ ...cur, ...p }));
  }, patch);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("a new tab on a new day opens on Scores (6/19 rule)", async ({ page }) => {
  await seedPrefs(page, { showNews: true, lastOpenDay: YESTERDAY });
  await page.goto("/");
  // Dev only: Strict Mode runs the mount effect twice, and the first run
  // stamps today's lastOpenDay before the second reads it, so dev always
  // restores News here. Production mounts once; run this against a build.
  await page.waitForFunction(() => sessionStorage.getItem("hs-tab-view") !== null);
  test.skip(await page.locator("nextjs-portal").count() > 0, "dev Strict Mode double mount");
  await expectView(page, "scores");
});

test("a tab on News stays on News after a reload across a day boundary", async ({ page }) => {
  await seedPrefs(page, { lastOpenDay: TODAY });
  await page.goto("/");
  await expectView(page, "scores");
  await page.getByRole("button", { name: "News" }).click();
  await expectView(page, "news");
  await patchStoredPrefs(page, { lastOpenDay: "20200101" });
  await page.reload();
  await expectView(page, "news");
});

test("another tab saving Scores does not move this News tab", async ({ page }) => {
  await seedPrefs(page, { lastOpenDay: TODAY });
  await page.goto("/");
  await page.getByRole("button", { name: "News" }).click();
  await expectView(page, "news");
  await patchStoredPrefs(page, { showNews: false });
  await page.reload();
  await expectView(page, "news");
});

test("another tab saving News does not move this Scores tab", async ({ page }) => {
  await seedPrefs(page, { lastOpenDay: TODAY });
  await page.goto("/");
  await expectView(page, "scores");
  await patchStoredPrefs(page, { showNews: true, lastOpenDay: TODAY });
  await page.reload();
  await expectView(page, "scores");
});

test("an explicit Scores landing wins over this tab's News memory", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      sessionStorage.setItem("hs-tab-view", "news");
    }
  });
  await seedPrefs(page, { lastOpenDay: TODAY, showNews: true, defaultLandingView: "scores" });
  await page.goto("/");
  await expectView(page, "scores");
});
