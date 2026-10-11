import { expect, test, type Page, type Route } from "@playwright/test";

// The News button on the ESPN front page column's league label rows (Jacob
// 10/10: "i just wanted that news thing on the espn frontpage one in that row
// … not added to mlb or nfl row"), and its day-aware "are you sure": the
// confirm shows ONLY while it is still early — before the Settings cutoff hour
// (smartCutoffHour, default 1 PM) and with no `nss-news-ok-day` record for
// today. 5 s of News, a highlight, or one "Open News" writes the record. See
// src/lib/newsOkDay.ts.
//
// The league recap / Playoff pills carry NO News button (#344 put one there;
// this spec keeps its file name from that).
//
// Same mocked today board as espn-front-page.spec.ts: MLB · NFL · ESPN front
// page, whose strip gives the column three league blocks: NCAAF, NHL, MLB.
// MLB's Playoff pill and an NFL weekly recap hold the pill row, so the
// column's first label (NCAAF) sits in that row.

test.use({ timezoneId: "America/New_York" });

const EARLY = new Date("2026-09-26T09:00:00-04:00"); // Sat 9 AM ET
const LATE = new Date("2026-09-26T15:00:00-04:00"); // Sat 3 PM, past the 1 PM cutoff
const TODAY = "20260926";

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "light",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: false,
  leaguesOnboarded: true,
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "top",
  fourthLeague: "empty",
  fifthLeague: "empty",
  hiddenLeagues: ["best"],
  defaultDateMode: "today",
  defaultLandingView: "scores",
};

type TeamSpec = { id: string; name: string; abbr: string };
function event(id: string, away: TeamSpec, home: TeamSpec, iso: string) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: "",
    winner: false,
    records: [{ summary: "3-0" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sat, September 26th at 7:30 PM EDT", shortDetail: "9/26 - 7:30 PM EDT", completed: false } },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}
const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });
const BOARDS: Record<string, unknown[]> = {
  "football/college-football": [
    event("c1", T("1", "Texas", "TEX"), T("2", "Tennessee", "TENN"), "2026-09-26T23:00:00Z"),
    event("c2", T("3", "Oklahoma", "OU"), T("4", "Georgia", "UGA"), "2026-09-26T23:30:00Z"),
  ],
  "baseball/mlb": [
    event("m1", T("11", "Dodgers", "LAD"), T("12", "Giants", "SF"), "2026-09-26T23:05:00Z"),
  ],
  "hockey/nhl": [
    event("h1", T("21", "Hurricanes", "CAR"), T("22", "Predators", "NSH"), "2026-09-26T23:00:00Z"),
  ],
};
const STRIP = {
  sports: [
    { slug: "football", leagues: [{ slug: "college-football", events: [{ id: "c1", priority: 0 }, { id: "c2", priority: 1 }] }] },
    { slug: "hockey", leagues: [{ slug: "nhl", events: [{ id: "h1", priority: 2 }] }] },
    { slug: "baseball", leagues: [{ slug: "mlb", events: [{ id: "m1", priority: 3 }] }] },
  ],
};
const BLOCKS = ["ncaaf", "nhl", "mlb"];
// An NFL weekly cut over today: a real recap pill, and a highlight to play.
const RECAPS = JSON.stringify({
  fetchedAt: "2026-09-26T12:00:00Z",
  recaps: {
    nfl: [
      { sport: "nfl", key: "top15", heading: "Week 3", label: "Top 15 plays", cadence: "weekly", coversWeek: 3, windowStart: "20260923", windowEnd: "20260930", videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 481, t: 1, sourcePolicy: "official-channel" },
    ],
  },
});
const NO_RECAPS = JSON.stringify({ fetchedAt: "2026-09-26T12:00:00Z", recaps: {} });

async function setUp(page: Page, now: Date, prefs: Record<string, unknown> = {}, okDay?: string, recaps = RECAPS) {
  await page.clock.setFixedTime(now);
  await page.addInitScript(({ p, ok }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(p));
    if (ok) localStorage.setItem("nss-news-ok-day", ok);
  }, { p: { ...BASE_PREFS, ...prefs }, ok: okDay ?? null });
  // Nothing off-site: no clip ever loads, the News feeds stay empty.
  await page.route("**/api/youtube?**", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  await page.route("**/oneFeed/frontpage**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"feed":[]}' }));
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STRIP) }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = url.searchParams.get("dates") === TODAY ? (BOARDS[m[1]] ?? []) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: recaps }));
  await page.goto("/");
  await expect(page.locator('[data-league-column="top"]').getByRole("button", { name: / — game details$/ })).toHaveCount(4, { timeout: 30_000 });
}

// The seam cover carries data-news in News view (news-tab-keeps-view.spec.ts).
async function view(page: Page) {
  return (await page.getByTestId("sticky-seam-cover").getAttribute("data-news")) === null ? "scores" : "news";
}
const storedPrefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const okDay = (page: Page) => page.evaluate(() => localStorage.getItem("nss-news-ok-day"));
const newsButton = (page: Page, sport = "nhl") => page.locator(`[data-league-column="top"] [data-espn-news="${sport}"]`);
const dialog = (page: Page) => page.getByRole("dialog", { name: "News shows scores" });
// The first game card's top in every column.
const firstCardTops = (page: Page) => page.evaluate(() => {
  const tops: number[] = [];
  for (const col of document.querySelectorAll<HTMLElement>("[data-league-column]")) {
    const card = col.querySelector<HTMLElement>('[aria-label$="game details"]');
    if (card) tops.push(Math.round(card.getBoundingClientRect().top));
  }
  return tops;
});

const DEVICES = [
  { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  { name: "phone", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("no pill has a News button; every ESPN front page label row has one at its right end", async ({ page }) => {
      await setUp(page, LATE);
      // MLB's Playoff pill and the NFL recap pill: back to their own buttons.
      const mlbPill = page.locator('[data-league-recap="mlb"]');
      const nflPill = page.locator('[data-league-recap="nfl"]');
      await expect(mlbPill).toBeVisible({ timeout: 15_000 });
      await expect(mlbPill).toHaveAttribute("data-recap-kind", "playoffs");
      await expect(nflPill).toBeVisible();
      await expect(nflPill.getByRole("button")).toHaveCount(1);
      await expect(page.locator("[data-recap-news]")).toHaveCount(0);
      await expect(mlbPill.getByRole("button", { name: /News/ })).toHaveCount(0);
      await expect(nflPill.getByRole("button", { name: /News/ })).toHaveCount(0);

      // One per league block, in block order. The first sits in the pill row.
      const col = page.locator('[data-league-column="top"]');
      const sports = await col.locator("[data-espn-news]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-news")));
      expect(sports).toEqual(BLOCKS);
      await expect(col.locator("[data-espn-lead-label] [data-espn-news]")).toHaveAttribute("data-espn-news", "ncaaf");
      await expect(newsButton(page, "ncaaf")).toHaveAccessibleName("Open News for NCAAF");
      await expect(newsButton(page, "ncaaf")).toHaveAttribute("title", "Open News");
      // Only that column: a league column of its own has no such button.
      await expect(page.locator("[data-espn-news]")).toHaveCount(3);

      // Right end of its row, after the hairline, and no taller than the row's
      // text line, so the row keeps its height.
      const rows = await col.locator("[data-espn-news]").evaluateAll((els) => els.map((el) => {
        const row = el.parentElement!.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const label = el.parentElement!.firstElementChild!.getBoundingClientRect();
        return {
          atRightEnd: Math.abs(b.right - row.right) <= 1,
          afterLabel: b.left > label.right,
          rowTallerThanLabel: Math.round(row.height - label.height),
          insideRow: b.top >= row.top - 0.5 && b.bottom <= row.bottom + 0.5,
        };
      }));
      for (const r of rows) expect(r).toEqual({ atRightEnd: true, afterLabel: true, rowTallerThanLabel: 0, insideRow: true });

      // The columns' first cards stay level.
      const tops = await firstCardTops(page);
      expect(tops.length).toBe(2); // MLB and ESPN front page; NFL has no game
      expect(Math.max(...tops) - Math.min(...tops), `first card tops ${tops}`).toBeLessThanOrEqual(1);
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-news-${device.name}.png`, animations: "disabled" });
    });

    test("9 AM, no record: the label's News asks first; Not yet stays, Open News opens that league and marks today", async ({ page }) => {
      await setUp(page, EARLY);
      await expect(newsButton(page)).toBeVisible();

      await newsButton(page).click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole("button", { name: "Not yet" })).toBeFocused();
      await dialog(page).getByRole("button", { name: "Not yet" }).click();
      await expect(dialog(page)).toHaveCount(0);
      expect(await view(page)).toBe("scores");
      expect(await okDay(page)).toBeNull();

      // Escape is Not yet too.
      await newsButton(page).click();
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);
      expect(await view(page)).toBe("scores");

      await newsButton(page).click();
      await dialog(page).getByRole("button", { name: "Open News" }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect.poll(() => view(page)).toBe("news");
      expect(await okDay(page)).toBe(TODAY);
      const prefs = await storedPrefs(page);
      expect(prefs.showNews).toBe(true);
      // NHL has no News column of its own (MLB · NFL · ESPN), so it takes column 3.
      expect(prefs.newsThirdLeague).toBe("nhl");
      // In News view the board (and its label rows) is gone.
      await expect(page.locator("[data-espn-news]")).toHaveCount(0);
    });

    test("a league that is a News column already: column 3 is left alone", async ({ page }) => {
      await setUp(page, LATE);
      await newsButton(page, "mlb").click();
      await expect.poll(() => view(page)).toBe("news");
      const prefs = await storedPrefs(page);
      expect(prefs.showNews).toBe(true);
      expect(prefs.newsThirdLeague).toBeUndefined();
    });

    test("3 PM: past the cutoff, the label's News opens straight away", async ({ page }) => {
      await setUp(page, LATE);
      await newsButton(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
    });

    test("9 AM with today's record: no confirm", async ({ page }) => {
      await setUp(page, EARLY, {}, TODAY);
      await newsButton(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
    });

    test("9 AM with yesterday's record: the confirm shows", async ({ page }) => {
      await setUp(page, EARLY, {}, "20260925");
      await newsButton(page).click();
      await expect(dialog(page)).toBeVisible();
    });

    test("9 AM: 5 s in News from the toolbar marks the day, so the label no longer asks", async ({ page }) => {
      await setUp(page, EARLY);
      await page.locator('[data-tab="news"]:visible').click();
      await expect.poll(() => view(page)).toBe("news");
      await page.waitForTimeout(5_600);
      expect(await okDay(page)).toBe(TODAY);
      await page.locator('[data-tab="scores-plain"]:visible').click();
      await expect.poll(() => view(page)).toBe("scores");
      await newsButton(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
    });

    test("under 5 s in News does not mark the day", async ({ page }) => {
      await setUp(page, EARLY);
      await page.locator('[data-tab="news"]:visible').click();
      await expect.poll(() => view(page)).toBe("news");
      await page.waitForTimeout(1_000);
      await page.locator('[data-tab="scores-plain"]:visible').click();
      await expect.poll(() => view(page)).toBe("scores");
      await page.waitForTimeout(4_600);
      expect(await okDay(page)).toBeNull();
    });

    test("9 AM: a highlight played marks the day", async ({ page }) => {
      await setUp(page, EARLY);
      await page.locator('[data-league-recap="nfl"] [data-recap-key="top15"]').click();
      await expect(page.locator('[role="dialog"]').first()).toBeVisible();
      await expect.poll(() => okDay(page)).toBe(TODAY);
    });

    test("no pill row on the board: the first label's News sits at the end of the header's italic line", async ({ page }) => {
      // No MLB column (no Playoff pill) and no recap: the row is not reserved,
      // so NCAAF's label is the italic line under "ESPN front page".
      await setUp(page, LATE, { firstLeague: "nfl", secondLeague: "wnba" }, undefined, NO_RECAPS);
      const col = page.locator('[data-league-column="top"]');
      await expect(col.locator("[data-espn-lead-label]")).toHaveCount(0);
      const sports = await col.locator("[data-espn-news]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-news")));
      expect(sports).toEqual(BLOCKS);
      const lead = newsButton(page, "ncaaf");
      await expect(lead).toBeVisible();
      // On the label's own line, right of it, inside the column.
      const m = await col.evaluate((el) => {
        const b = el.querySelector<HTMLElement>('[data-espn-news="ncaaf"]')!.getBoundingClientRect();
        const c = el.getBoundingClientRect();
        const label = [...el.querySelectorAll<HTMLElement>("span")].find((s) => s.textContent === "NCAAF" && s.getBoundingClientRect().bottom < b.bottom + 4)!.getBoundingClientRect();
        const card = el.querySelector<HTMLElement>('[aria-label$="game details"]')!.getBoundingClientRect();
        return {
          sameLine: Math.abs((b.top + b.bottom) / 2 - (label.top + label.bottom) / 2) <= 2,
          rightOfLabel: b.left >= label.left,
          insideColumn: b.right <= c.right + 0.5,
          aboveCard: b.bottom <= card.top,
        };
      });
      expect(m).toEqual({ sameLine: true, rightOfLabel: true, insideColumn: true, aboveCard: true });
      await lead.click();
      await expect.poll(() => view(page)).toBe("news");
      await expect.poll(async () => (await storedPrefs(page)).newsThirdLeague).toBe("ncaaf");
    });
  });
}
