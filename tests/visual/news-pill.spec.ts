import { expect, test, type Page, type Route } from "@playwright/test";

// The one italic "News" link under the ESPN front page column's header (Jacob
// 10/10: not the icon on the league rows, not a pill; one link in the line
// the subtitle normally has). A tap opens News on the ESPN layout: the reader
// is already looking at espn.com's front page. News column 3 is left alone.
//
// Its day-aware "are you sure": the confirm shows ONLY while it is still
// early — before the Settings cutoff hour (smartCutoffHour, default 1 PM) and
// with no `nss-news-ok-day` record for today. 5 s of News, a highlight, or one
// "Open News" writes the record. See src/lib/newsOkDay.ts.
//
// The league recap / Playoff pills and the column's league label rows carry NO
// News button (#344 put one on the pills, #345 on the rows; this spec keeps
// its file name from the first).
//
// Same mocked today board as espn-front-page.spec.ts: MLB · NFL · ESPN front
// page, whose strip gives the column three league blocks: NCAAF, NHL, MLB.
// MLB's Playoff pill and an NFL weekly recap hold the pill row, so the
// column's first label (NCAAF) sits in that row and the italic line reads
// just "News". On a board with no pill row the label is the italic line, and
// the link joins its end: "NCAAF · News".

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
// A board with no MLB column (no Playoff pill); with NO_RECAPS the pill row is
// not reserved, so NCAAF's label is the italic line under "ESPN front page".
const NO_PILL_ROW = { firstLeague: "nfl", secondLeague: "wnba" };

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

async function setUp(page: Page, now: Date, prefs: Record<string, unknown> = {}, okDay?: string, recaps = RECAPS, path = "/") {
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
  await page.goto(path);
  await expect(page.locator('[data-league-column="top"]').getByRole("button", { name: / — game details$/ })).toHaveCount(4, { timeout: 30_000 });
}

// The seam cover carries data-news in News view (news-tab-keeps-view.spec.ts).
async function view(page: Page) {
  return (await page.getByTestId("sticky-seam-cover").getAttribute("data-news")) === null ? "scores" : "news";
}
const storedPrefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const okDay = (page: Page) => page.evaluate(() => localStorage.getItem("nss-news-ok-day"));
const newsLink = (page: Page) => page.locator('[data-league-column="top"] [data-espn-news="top"]');
const dialog = (page: Page) => page.getByRole("dialog", { name: "News shows scores" });
// The News toolbar's Cards / Feed / ESPN pill.
const layoutPill = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).and(page.locator("[aria-pressed]"));
// The first game card's top in every column.
const firstCardTops = (page: Page) => page.evaluate(() => {
  const tops: number[] = [];
  for (const col of document.querySelectorAll<HTMLElement>("[data-league-column]")) {
    const card = col.querySelector<HTMLElement>('[aria-label$="game details"]');
    if (card) tops.push(Math.round(card.getBoundingClientRect().top));
  }
  return tops;
});
// Where the link sits: its line is the italic line under the column header
// (the line's whole text, its place between the title and the first card, and
// its centring in the column).
const linkPlace = (page: Page) => page.locator('[data-league-column="top"]').evaluate((col) => {
  const link = col.querySelector<HTMLElement>("[data-espn-news]")!;
  const line = link.parentElement!;
  const b = link.getBoundingClientRect();
  const l = line.getBoundingClientRect();
  const c = col.getBoundingClientRect();
  const title = col.querySelector("h2")!.getBoundingClientRect();
  const card = col.querySelector<HTMLElement>('[aria-label$="game details"]')!.getBoundingClientRect();
  const cs = getComputedStyle(link);
  const lineCs = getComputedStyle(line);
  // The text's own box: the line's content box (it has 2px of right padding).
  const textMid = (l.left + l.right - parseFloat(lineCs.paddingRight)) / 2;
  return {
    lineText: line.textContent,
    tag: link.tagName,
    italic: cs.fontStyle === "italic" && lineCs.fontStyle === "italic",
    sameColourAsLine: cs.color === lineCs.color,
    sameSizeAsLine: cs.fontSize === lineCs.fontSize,
    oneLine: Math.abs((b.top + b.bottom) / 2 - (l.top + l.bottom) / 2) <= 1 && l.height < 20,
    underTitle: l.top >= title.bottom - 0.5 && l.top - title.bottom <= 6,
    aboveCard: l.bottom <= card.top,
    insideColumn: l.left >= c.left - 0.5 && l.right <= c.right + 0.5 && b.right <= c.right + 0.5,
    offCentre: Math.round(Math.abs(textMid - (c.left + c.right) / 2) * 10) / 10,
    linkEndsLine: Math.abs(b.right - (l.right - parseFloat(lineCs.paddingRight))) <= 0.5,
  };
});
const PLACED = {
  tag: "BUTTON",
  italic: true,
  sameColourAsLine: true,
  sameSizeAsLine: true,
  oneLine: true,
  underTitle: true,
  aboveCard: true,
  insideColumn: true,
  linkEndsLine: true,
};

const DEVICES = [
  { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  { name: "phone", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("one italic News link, centred under the ESPN front page header; none on a pill or a league row", async ({ page }) => {
      await setUp(page, LATE);
      // MLB's Playoff pill and the NFL recap pill: their own buttons only.
      const mlbPill = page.locator('[data-league-recap="mlb"]');
      const nflPill = page.locator('[data-league-recap="nfl"]');
      await expect(mlbPill).toBeVisible({ timeout: 15_000 });
      await expect(mlbPill).toHaveAttribute("data-recap-kind", "playoffs");
      await expect(nflPill).toBeVisible();
      await expect(nflPill.getByRole("button")).toHaveCount(1);
      await expect(page.locator("[data-recap-news]")).toHaveCount(0);
      await expect(mlbPill.getByRole("button", { name: /News/ })).toHaveCount(0);
      await expect(nflPill.getByRole("button", { name: /News/ })).toHaveCount(0);

      // One link on the whole board, in the ESPN front page column.
      const col = page.locator('[data-league-column="top"]');
      await expect(page.locator("[data-espn-news]")).toHaveCount(1);
      await expect(newsLink(page)).toBeVisible();
      await expect(newsLink(page)).toHaveText("News");
      await expect(newsLink(page)).toHaveAccessibleName("Open News");

      // The league rows: all three blocks, labels in place, no button on any.
      expect(await col.locator("[data-espn-league]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league")))).toEqual(BLOCKS);
      await expect(col.locator("[data-espn-league] [data-espn-news]")).toHaveCount(0);
      await expect(col.locator("[data-espn-league]").getByRole("button", { name: /News/ })).toHaveCount(0);
      // The first label stays in the pill row, with its "+" (Add popover).
      const lead = col.locator("[data-espn-lead-label]");
      await expect(lead).toHaveCount(1);
      await expect(lead.getByRole("button", { name: "Add NCAAF to a column" })).toHaveText("NCAAF+");
      await expect(lead.locator("[data-espn-news]")).toHaveCount(0);
      await expect(lead.getByRole("button", { name: /News/ })).toHaveCount(0);

      // The italic line reads just "News", centred, between title and cards.
      const place = await linkPlace(page);
      expect(place).toMatchObject({ ...PLACED, lineText: "News" });
      expect(place.offCentre, `line is ${place.offCentre}px off the column's centre`).toBeLessThanOrEqual(1.5);

      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-news-link-${device.name}.png`, animations: "disabled" });

      // Underline on hover only.
      const underline = () => newsLink(page).evaluate((el) => getComputedStyle(el).textDecorationLine);
      expect(await underline()).toBe("none");
      if (device.name === "desktop") {
        await newsLink(page).hover();
        expect(await underline()).toBe("underline");
      }

      // The columns' first cards stay level.
      const tops = await firstCardTops(page);
      expect(tops.length).toBe(2); // MLB and ESPN front page; NFL has no game
      expect(Math.max(...tops) - Math.min(...tops), `first card tops ${tops}`).toBeLessThanOrEqual(1);
    });

    test("no pill row on the board: the first label keeps the italic line and News joins its end", async ({ page }) => {
      await setUp(page, LATE, NO_PILL_ROW, undefined, NO_RECAPS);
      const col = page.locator('[data-league-column="top"]');
      await expect(col.locator("[data-espn-lead-label]")).toHaveCount(0);
      await expect(page.locator("[data-espn-news]")).toHaveCount(1);
      await expect(col.locator("[data-espn-league] [data-espn-news]")).toHaveCount(0);
      const place = await linkPlace(page);
      expect(place).toMatchObject({ ...PLACED, lineText: "NCAAF · News" });
      expect(place.offCentre, `line is ${place.offCentre}px off the column's centre`).toBeLessThanOrEqual(1.5);
      // The later labels stay on their rows.
      await expect(col.locator('[data-espn-league="nhl"]').locator("span").first()).toHaveText("NHL");
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-news-link-no-pill-row-${device.name}.png`, animations: "disabled" });

      // Only the word "News" is the link: a tap on the label does not open News.
      await col.getByText("NCAAF", { exact: true }).first().click();
      expect(await view(page)).toBe("scores");
      await newsLink(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(layoutPill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
    });

    test("demo mode: no News link", async ({ page }) => {
      await setUp(page, LATE, {}, undefined, RECAPS, "/?demo=1");
      await expect(page.locator("[data-espn-news]")).toHaveCount(0);
      await expect(page.locator('[data-league-column="top"]').getByRole("button", { name: /News/ })).toHaveCount(0);
    });

    test("9 AM, no record: News asks first; Not yet stays, Open News lands on the ESPN layout and marks today", async ({ page }) => {
      await setUp(page, EARLY);
      await expect(newsLink(page)).toBeVisible();

      await newsLink(page).click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole("button", { name: "Not yet" })).toBeFocused();
      await dialog(page).getByRole("button", { name: "Not yet" }).click();
      await expect(dialog(page)).toHaveCount(0);
      expect(await view(page)).toBe("scores");
      expect(await okDay(page)).toBeNull();
      expect((await storedPrefs(page)).newsLayout).toBeUndefined();

      // Escape is Not yet too.
      await newsLink(page).click();
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);
      expect(await view(page)).toBe("scores");

      await newsLink(page).click();
      await dialog(page).getByRole("button", { name: "Open News" }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect.poll(() => view(page)).toBe("news");
      expect(await okDay(page)).toBe(TODAY);
      const prefs = await storedPrefs(page);
      expect(prefs.showNews).toBe(true);
      expect(prefs.newsLayout).toBe("espn");
      expect(prefs.newsFeedView).toBe(false);
      // News column 3 is not touched.
      expect(prefs.newsThirdLeague).toBeUndefined();
      await expect(layoutPill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
      // In News view the board (and its link) is gone.
      await expect(page.locator("[data-espn-news]")).toHaveCount(0);
    });

    test("a saved Feed layout and a column 3 pick: the tap moves the layout to ESPN, column 3 keeps its pick", async ({ page }) => {
      await setUp(page, LATE, { newsLayout: "feed", newsFeedView: true, newsThirdLeague: "nhl", newsTopNews: false, shownLeagues: ["mlb", "nfl", "nhl"] });
      await page.evaluate(() => window.scrollTo(0, 300));
      await newsLink(page).click();
      await expect.poll(() => view(page)).toBe("news");
      const prefs = await storedPrefs(page);
      expect(prefs.showNews).toBe(true);
      expect(prefs.newsLayout).toBe("espn");
      expect(prefs.newsFeedView).toBe(false);
      expect(prefs.newsThirdLeague).toBe("nhl");
      expect(prefs.newsTopNews).toBe(false);
      await expect(layoutPill(page, "ESPN")).toHaveAttribute("aria-pressed", "true");
      await expect(layoutPill(page, "Feed")).toHaveAttribute("aria-pressed", "false");
      // It lands at the top of News.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-news-link-landed-${device.name}.png`, animations: "disabled" });
    });

    test("3 PM: past the cutoff, News opens straight away", async ({ page }) => {
      await setUp(page, LATE);
      await newsLink(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
      expect((await storedPrefs(page)).newsLayout).toBe("espn");
    });

    test("9 AM with today's record: no confirm", async ({ page }) => {
      await setUp(page, EARLY, {}, TODAY);
      await newsLink(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
    });

    test("9 AM with yesterday's record: the confirm shows", async ({ page }) => {
      await setUp(page, EARLY, {}, "20260925");
      await newsLink(page).click();
      await expect(dialog(page)).toBeVisible();
    });

    test("9 AM: 5 s in News from the toolbar marks the day, so the link no longer asks", async ({ page }) => {
      await setUp(page, EARLY);
      await page.locator('[data-tab="news"]:visible').click();
      await expect.poll(() => view(page)).toBe("news");
      await page.waitForTimeout(5_600);
      expect(await okDay(page)).toBe(TODAY);
      // dispatchEvent, not click: with four tabs the Games tab sits under
      // `next dev`'s Dev Tools button in the bottom-left corner.
      await page.locator('[data-tab="scores-plain"]:visible').dispatchEvent("click");
      await expect.poll(() => view(page)).toBe("scores");
      await newsLink(page).click();
      await expect.poll(() => view(page)).toBe("news");
      await expect(dialog(page)).toHaveCount(0);
    });

    test("under 5 s in News does not mark the day", async ({ page }) => {
      await setUp(page, EARLY);
      await page.locator('[data-tab="news"]:visible').click();
      await expect.poll(() => view(page)).toBe("news");
      await page.waitForTimeout(1_000);
      // dispatchEvent, not click: with four tabs the Games tab sits under
      // `next dev`'s Dev Tools button in the bottom-left corner.
      await page.locator('[data-tab="scores-plain"]:visible').dispatchEvent("click");
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
  });
}
