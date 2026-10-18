import { expect, test, type Page, type Route } from "@playwright/test";

// Phone shell from the 9/29 FotMob review (Jacob): monkey tab icons, "Games"
// for tab 1, the date strip on its own row, a Live filter pill, and the
// wordmark in place of the "H" square. The bar is Games · Ratings · News ·
// Schedule (the Leagues tab left 10/14; old iOS builds that still draw it
// open Settings instead). Boards are mocked so the
// live game and the Sunday game are exact:
//   Tue 9/29  MLB  Dodgers at Giants (7:05 pm, scheduled)
//             NCAAF Oklahoma at Georgia (LIVE) · Texas at Tennessee (final)
//   Sun 9/27  MLB  Mets at Braves (final)

const NOW = new Date("2026-09-29T14:00:00-04:00"); // Tue 2 pm ET
const TODAY = "20260929";
const SUNDAY = "20260927";

type TeamSpec = { id: string; name: string; abbr: string };
type Status = "final" | "live" | "scheduled";

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, status: Status) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: status === "scheduled" ? "" : side === "home" ? "3" : "2",
    winner: status === "final" && side === "home",
    records: [{ summary: "3-0" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: status === "final"
      ? { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } }
      : status === "live"
        ? { displayClock: "8:12", period: 2, type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "8:12 - 2nd Quarter", shortDetail: "8:12 - 2nd", completed: false } }
        : { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Tue, September 29th at 7:05 PM EDT", shortDetail: "9/29 - 7:05 PM EDT", completed: false } },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });
const BOARDS: Record<string, Record<string, unknown[]>> = {
  [TODAY]: {
    "baseball/mlb": [event("m1", T("11", "Dodgers", "LAD"), T("12", "Giants", "SF"), "2026-09-29T23:05:00Z", "scheduled")],
    "football/college-football": [
      event("c1", T("1", "Texas", "TEX"), T("2", "Tennessee", "TENN"), "2026-09-29T16:00:00Z", "final"),
      event("c2", T("3", "Oklahoma", "OU"), T("4", "Georgia", "UGA"), "2026-09-29T17:30:00Z", "live"),
    ],
  },
  [SUNDAY]: {
    "baseball/mlb": [event("m9", T("15", "Mets", "NYM"), T("16", "Braves", "ATL"), "2026-09-27T17:05:00Z", "final")],
  },
};

async function seed(page: Page, theme: "light" | "dark") {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((theme) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme,
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "ncaaf",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    hiddenLeagues: ["best", "top"],
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })), theme);
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = BOARDS[url.searchParams.get("dates") ?? ""]?.[m[1]] ?? [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

const card = (page: Page, matchup: string) => page.getByRole("button", { name: `${matchup} — game details` });

async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`phone shell 390px (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page, theme);
      await page.goto("/");
      await expect(card(page, "Oklahoma at Georgia")).toBeVisible({ timeout: 30_000 });
    });

    test("bar = Games · Ratings · News · Schedule with the four emoji SVGs", async ({ page, browserName }) => {
      const bar = page.locator(".web-tab-bar nav");
      const tabs = bar.locator("button[data-tab]");
      await expect(tabs).toHaveCount(4);
      expect(await tabs.evaluateAll((els) => els.map((e) => e.textContent?.trim()))).toEqual(["Games", "Ratings", "News", "Schedule"]);
      expect(await tabs.locator("img").evaluateAll((els) => els.map((e) => new URL((e as HTMLImageElement).src).pathname)))
        .toEqual(["/monkey-see-no-evil.svg", "/monkey-hear-no-evil.svg", "/news-emoji.svg", "/calendar-emoji.svg"]);
      // Every icon actually loaded.
      expect(await tabs.locator("img").evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await expect(bar.locator('button[data-tab="scores-plain"]')).toHaveAttribute("title", "Games (no scores, no spoilers)");
      await shot(page, `bar-${browserName}-${theme}`);
    });

    test("header = wordmark · Live · gear, no H", async ({ page }) => {
      const header = page.locator("header").first();
      await expect(header.locator(".header-logo")).toHaveCount(0);
      await expect(header.getByRole("link", { name: "HideScore home" })).toHaveText("HideScore");
      await expect(header.getByRole("link", { name: "HideScore home" })).toBeVisible();
      const live = header.getByTestId("live-toggle");
      await expect(live).toBeVisible();
      await expect(live).toHaveAttribute("aria-pressed", "false");
      // One board game is live (OU at UGA): red dot + the count.
      await expect(live).toHaveAttribute("data-live-count", "1");
      await expect(live).toHaveText("Live 1");
      expect(await live.getByTestId("live-dot").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(220, 38, 38)");
      await expect(header.getByRole("button", { name: "Open settings" })).toBeVisible();
      // One row: wordmark, Live and gear share a middle band.
      const boxes = await Promise.all([
        header.getByRole("link", { name: "HideScore home" }).boundingBox(),
        live.boundingBox(),
        header.getByRole("button", { name: "Open settings" }).boundingBox(),
      ]);
      const mids = boxes.map((b) => b!.y + b!.height / 2);
      expect(Math.max(...mids) - Math.min(...mids)).toBeLessThan(4);
      // Nothing spills off a 390 px screen.
      for (const b of boxes) expect(b!.x + b!.width).toBeLessThanOrEqual(390);
    });

    test("date strip: scrollable, Today centred + underlined, Sun 9/27 loads that day", async ({ page, browserName }) => {
      const strip = page.getByTestId("date-strip");
      await expect(strip).toBeVisible();
      // The strip is inside the fixed header.
      expect(await strip.evaluate((el) => !!el.closest("header"))).toBe(true);
      expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      const today = strip.getByRole("button", { name: "Today" });
      await expect(today).toHaveAttribute("aria-current", "date");
      const centreGap = await today.evaluate((chip) => {
        const s = chip.parentElement!.getBoundingClientRect();
        const c = chip.getBoundingClientRect();
        return Math.abs((c.left + c.width / 2) - (s.left + s.width / 2));
      });
      expect(centreGap).toBeLessThan(6);
      expect(await today.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/);
      await shot(page, `strip-${browserName}-${theme}`);

      await strip.getByRole("button", { name: "Sun, Sep 27" }).click();
      await expect(strip.getByRole("button", { name: "Sun, Sep 27" })).toHaveAttribute("aria-current", "date");
      await expect(card(page, "Mets at Braves")).toBeVisible({ timeout: 15_000 });
      await expect(strip.getByRole("button", { name: "Today" })).not.toHaveAttribute("aria-current", "date");
      // Another day: the pill stays, grey, with no count.
      await expect(page.getByTestId("live-toggle")).toHaveAttribute("data-live-count", "0");
      await expect(page.getByTestId("live-toggle")).toHaveText("Live");
    });

    test("Live on → only live cards; off → full board", async ({ page, browserName }) => {
      const live = page.getByTestId("live-toggle");
      await live.click();
      await expect(live).toHaveAttribute("aria-pressed", "true");
      await expect(card(page, "Oklahoma at Georgia")).toBeVisible();
      await expect(card(page, "Texas at Tennessee")).toHaveCount(0);
      await expect(card(page, "Dodgers at Giants")).toHaveCount(0);
      await expect(page.locator('[data-league-column="mlb"]')).toContainText("No live games");
      await shot(page, `live-on-${browserName}-${theme}`);
      await live.click();
      await expect(live).toHaveAttribute("aria-pressed", "false");
      await expect(card(page, "Texas at Tennessee")).toBeVisible();
      await expect(card(page, "Dodgers at Giants")).toBeVisible();
    });

    test("News view hides the date row", async ({ page }) => {
      await expect(page.getByTestId("date-strip-row")).toBeVisible();
      await page.locator('.web-tab-bar button[data-tab="news"]').click();
      await expect(page.locator("html")).toHaveAttribute("data-view", "news");
      await expect(page.getByTestId("date-strip-row")).toHaveCount(0);
      await expect(page.getByTestId("live-toggle")).toHaveCount(0);
    });
  });
}

test("desktop 1280px: header keeps its layout, plus the Live pill", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, "light");
  await page.goto("/");
  await expect(card(page, "Oklahoma at Georgia")).toBeVisible({ timeout: 30_000 });
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "HideScore home" })).toHaveText("HideScore");
  await expect(header.locator(".header-logo")).toHaveCount(0);
  await expect(header.getByTestId("live-toggle")).toBeVisible();
  await expect(page.getByTestId("date-strip-row")).toBeHidden();
  // The ‹ Yesterday · Today · Tomorrow › row under the header is still there.
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go back one day" })).toBeVisible();
  // Header stays one row (same height class as before: ~61 px).
  const h = (await header.boundingBox())!.height;
  expect(h).toBeLessThan(70);
  await shot(page, `desktop-${browserName}`);
});

// Old iOS builds (TestFlight 15–16) still draw a native Leagues tab. Fake the
// shell's bridge: a "leagues" tap opens Settings and the view stays put; a
// "schedule" tap still switches views.
test("native bar: an old build's Leagues tap opens Settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, "light");
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __hsTabMsgs: unknown[] }).__hsTabMsgs = sent;
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { hsTabBar: { postMessage: (m: unknown) => sent.push(m) } } };
    // Init scripts can run before <html> exists; mark it as soon as it does.
    const mark = () => document.documentElement?.setAttribute("data-native-tabbar", "");
    if (document.documentElement) mark();
    else new MutationObserver((_, obs) => { if (document.documentElement) { mark(); obs.disconnect(); } }).observe(document, { childList: true });
  });
  await page.goto("/");
  await expect(card(page, "Oklahoma at Georgia")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".web-tab-bar")).toBeHidden();
  // The page connected to the bridge: it posted the selected tab.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hsTabMsgs: unknown[] }).__hsTabMsgs.length)).toBeGreaterThan(0);
  const tap = (v: string) => page.evaluate((v) => window.dispatchEvent(new CustomEvent("hs-native-tab", { detail: v })), v);

  await tap("leagues");
  // The Settings panel is a lazy chunk: the first open can be slow on a dev server.
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("data-view", "scores-plain");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);

  await tap("schedule");
  await expect(page.locator("html")).toHaveAttribute("data-view", "schedule");
  // The page told the bar which tab is on.
  await expect.poll(() => page.evaluate(() => {
    const m = (window as unknown as { __hsTabMsgs: { view: string }[] }).__hsTabMsgs;
    return m[m.length - 1]?.view;
  })).toBe("schedule");
});
