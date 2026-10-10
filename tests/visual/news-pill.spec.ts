import { expect, test, type Page } from "@playwright/test";

// The News button on a league's recap pill (Jacob 10/10), and its day-aware
// "are you sure": the confirm shows ONLY while it is still early — before the
// Settings cutoff hour (smartCutoffHour, default 1 PM) and with no
// `nss-news-ok-day` record for today. 5 s of News, a highlight, or one
// "Open News" writes the record. See src/lib/newsOkDay.ts.
//
// Same mocked /yesterday board as league-recap-card.spec.ts: NFL + MLB
// columns, a recap pill on each.

test.use({ timezoneId: "America/New_York" });

const EARLY = new Date("2026-09-14T09:00:00-04:00"); // Mon 9 AM ET → /yesterday = Sun 9/13
const LATE = new Date("2026-09-14T15:00:00-04:00"); // Mon 3 PM, past the 1 PM cutoff
const TODAY = "20260914";

const BASE_PREFS = {
  favoriteLeagues: ["nfl", "mlb"],
  favoriteTeams: [],
  theme: "light",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: false,
  leaguesOnboarded: true,
  firstLeague: "nfl",
  secondLeague: "mlb",
  thirdLeague: "empty",
  fourthLeague: "empty",
  fifthLeague: "empty",
  defaultDateMode: "yesterday",
  defaultLandingView: "scores",
};

type TeamSpec = { name: string; abbr: string; score: string };
function finishedEvent(id: string, away: TeamSpec, home: TeamSpec, iso: string, week?: number) {
  const team = (t: TeamSpec, suffix: string) => ({
    id: `${id}${suffix}`, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, score: t.score,
    logo: "", color: "666666",
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    ...(week ? { week: { number: week } } : {}),
    status: {
      displayClock: "0:00",
      period: week ? 4 : 9,
      type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
    },
    competitions: [{
      competitors: [
        { homeAway: "home", team: team(home, "h"), score: home.score, winner: true, records: [{ summary: "1-0" }] },
        { homeAway: "away", team: team(away, "a"), score: away.score, winner: false, records: [{ summary: "0-1" }] },
      ],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

const NFL_EVENTS = JSON.stringify({
  season: { type: 2, year: 2026 },
  week: { number: 1 },
  events: [
    finishedEvent("401872923", { name: "Saints", abbr: "NO", score: "17" }, { name: "Lions", abbr: "DET", score: "27" }, "2026-09-13T17:00:00Z", 1),
    finishedEvent("401872925", { name: "Buccaneers", abbr: "TB", score: "20" }, { name: "Bengals", abbr: "CIN", score: "23" }, "2026-09-13T17:00:00Z", 1),
  ],
});
const MLB_EVENTS = JSON.stringify({
  events: [
    finishedEvent("776001", { name: "Mets", abbr: "NYM", score: "4" }, { name: "Phillies", abbr: "PHI", score: "2" }, "2026-09-13T17:35:00Z"),
  ],
});
const RECAP_RECORDS = {
  fetchedAt: "2026-09-14T12:00:00Z",
  recaps: {
    nfl: [
      { sport: "nfl", key: "bestsunday", heading: "Week 1", label: "Sunday's best plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "AGzdTAjWr7U", pageUrl: "https://www.youtube.com/watch?v=AGzdTAjWr7U", channel: "NFL", durationSec: 1801, t: 1, sourcePolicy: "official-channel" },
      { sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 481, t: 1, sourcePolicy: "official-channel" },
    ],
  },
};
// NFL only, so the MLB column holds the invisible spacer row.
const RECAPS = JSON.stringify(RECAP_RECORDS);
const RECAPS_WITH_MLB = JSON.stringify({
  ...RECAP_RECORDS,
  recaps: {
    ...RECAP_RECORDS.recaps,
    mlb: [
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/fastcast.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-x8085", channel: "MLB.com", durationSec: 900, t: 1, sourcePolicy: "mlb.com" },
    ],
  },
});

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
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: recaps }));
  await page.goto("/yesterday");
  await expect(page.locator('[data-league-recap="nfl"]')).toBeVisible({ timeout: 30_000 });
}

// The seam cover carries data-news in News view (news-tab-keeps-view.spec.ts).
async function view(page: Page) {
  return (await page.getByTestId("sticky-seam-cover").getAttribute("data-news")) === null ? "scores" : "news";
}
const storedPrefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const okDay = (page: Page) => page.evaluate(() => localStorage.getItem("nss-news-ok-day"));
const newsButton = (page: Page, sport = "nfl") => page.locator(`[data-league-recap="${sport}"] [data-recap-news]`);
const dialog = (page: Page) => page.getByRole("dialog", { name: "News shows scores" });

const DEVICES = [
  { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  { name: "phone", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("9 AM, no record: the pill's News asks first; Not yet stays, Open News opens and marks today", async ({ page }) => {
      await setUp(page, EARLY);
      await expect(newsButton(page)).toBeVisible();
      await expect(newsButton(page)).toHaveAccessibleName("Open News for NFL");

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
      // NFL is news column 1 already, so column 3 is left alone.
      expect(prefs.newsThirdLeague).toBeUndefined();
      // In News view the board (and its pills) is gone.
      await expect(page.locator("[data-recap-news]")).toHaveCount(0);
    });

    test("3 PM: past the cutoff, the pill's News opens straight away", async ({ page }) => {
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
      await setUp(page, EARLY, {}, "20260913");
      await newsButton(page).click();
      await expect(dialog(page)).toBeVisible();
    });

    test("9 AM: 5 s in News from the toolbar marks the day, so the pill no longer asks", async ({ page }) => {
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

    test("a league that is not a News column goes into column 3", async ({ page }) => {
      // MLB is scores column 3, and news column 3 holds an explicit NHL pick,
      // so MLB has no News column.
      await page.route("**/soccer/**/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
      await setUp(page, LATE, {
        favoriteLeagues: ["nfl", "mls", "mlb"],
        secondLeague: "mls",
        thirdLeague: "mlb",
        newsThirdLeague: "nhl",
      }, undefined, RECAPS_WITH_MLB);
      await newsButton(page, "mlb").click();
      await expect.poll(() => view(page)).toBe("news");
      await expect.poll(async () => (await storedPrefs(page)).newsThirdLeague).toBe("mlb");
    });

    test("the columns' first game cards stay level with the News button in the pill", async ({ page }) => {
      await setUp(page, EARLY);
      await expect(newsButton(page, "mlb")).toHaveCount(0); // MLB has no recap here: spacer only
      const tops = await page.evaluate(() => {
        const cards = [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')];
        const byCol = new Map<number, number>();
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          const col = Math.round(r.left / 10);
          byCol.set(col, Math.min(byCol.get(col) ?? Infinity, Math.round(r.top)));
        }
        return [...byCol.values()];
      });
      expect(tops.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      // And nothing in the pill runs past its edge or clips.
      const m = await page.evaluate(() => {
        const pill = document.querySelector<HTMLElement>('[data-league-recap="nfl"]')!;
        const pr = pill.getBoundingClientRect();
        const buttons = [...pill.querySelectorAll<HTMLElement>("button")];
        return {
          overflow: pill.scrollWidth - pill.clientWidth,
          past: buttons.filter((b) => b.getBoundingClientRect().right > pr.right + 0.5).length,
          clipped: buttons.filter((b) => b.scrollWidth > b.clientWidth).length,
        };
      });
      expect(m).toEqual({ overflow: 0, past: 0, clipped: 0 });
    });
  });
}
