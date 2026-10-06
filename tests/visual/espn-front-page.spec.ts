import { expect, test, type Page, type Route } from "@playwright/test";
import { SHOW_CARD_LEAGUE_CHIP } from "../../src/lib/leagueLabels";

// "ESPN front page" (Jacob 9/26): the cross-league column that shows the games
// espn.com is featuring in its scores strip, in ESPN's own order. The strip
// (site.web.api.espn.com/apis/v2/scoreboard/header) and today's boards are
// mocked so the pool is exact:
//   strip   NCAAF c1, c2 · golf (skipped, no game cards) · NHL h1 · MLB m1
//   boards  NCAAF c1 c2 c3 · MLB m1 m2 · NHL h1
// = 4 cards, laid out the way espn.com lays out its strip (Jacob 9/26): a
// block per league in strip order, each under a league label, and the live
// games first inside a block. So live c2 leads its final c1 (the feed lists
// finals first, like ESPN's does), and NHL h1 (7 pm) sits above MLB m1
// (4:05 pm). c3 + m2 — on ESPN's boards but not its front page — stay out.

const NOW = new Date("2026-09-26T14:00:00-04:00"); // Sat 2 pm ET
const TODAY = "20260926";

type TeamSpec = { id: string; name: string; abbr: string; score: string };
type Status = "final" | "live" | "scheduled";

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, status: Status = "scheduled", networks: string[] = []) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: t.score,
    winner: status === "final" && Number(t.score) > Number((side === "home" ? away : home).score),
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
        : { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sat, September 26th at 7:30 PM EDT", shortDetail: "9/26 - 7:30 PM EDT", completed: false } },
    competitions: [{
      competitors: [competitor(home, "home"), competitor(away, "away")],
      broadcasts: networks.map((n) => ({ names: [n] })),
      headlines: [],
      notes: [],
    }],
  };
}

// Scores picked to be unmistakable if any of them ever reached the page.
const T = (id: string, name: string, abbr: string, score = ""): TeamSpec => ({ id, name, abbr, score });
const BOARDS: Record<string, unknown[]> = {
  "football/college-football": [
    event("c1", T("1", "Texas", "TEX", "47"), T("2", "Tennessee", "TENN", "44"), "2026-09-26T16:00:00Z", "final"),
    event("c2", T("3", "Oklahoma", "OU", "17"), T("4", "Georgia", "UGA", "13"), "2026-09-26T17:30:00Z", "live", ["ESPN"]),
    event("c3", T("5", "Akron", "AKR"), T("6", "Toledo", "TOL"), "2026-09-26T19:00:00Z"),
  ],
  "baseball/mlb": [
    event("m1", T("11", "Dodgers", "LAD"), T("12", "Giants", "SF"), "2026-09-26T20:05:00Z", "scheduled", ["FOX"]),
    event("m2", T("13", "Rockies", "COL"), T("14", "White Sox", "CHW"), "2026-09-26T23:10:00Z"),
  ],
  "hockey/nhl": [
    event("h1", T("21", "Hurricanes", "CAR"), T("22", "Predators", "NSH"), "2026-09-26T23:00:00Z", "scheduled", ["ESPN+"]),
  ],
};
const STRIP = {
  sports: [
    { slug: "football", leagues: [{ slug: "college-football", events: [{ id: "c1", priority: 0 }, { id: "c2", priority: 1 }] }] },
    { slug: "golf", leagues: [{ slug: "pga", events: [{ id: "g1", priority: 2 }] }] },
    { slug: "hockey", leagues: [{ slug: "nhl", events: [{ id: "h1", priority: 3 }] }] },
    { slug: "baseball", leagues: [{ slug: "mlb", events: [{ id: "m1", priority: 4 }] }] },
  ],
};

// League blocks in strip order, live first inside a block.
const EXPECTED = ["Oklahoma at Georgia", "Texas at Tennessee", "Hurricanes at Predators", "Dodgers at Giants"];
const BLOCKS = ["ncaaf", "nhl", "mlb"];
const BLOCK_LABELS = ["NCAAF", "NHL", "MLB"];
const NEVER = ["Akron at Toledo", "Rockies at White Sox"];
const SCORES = ["47", "44", "17", "13"];

// ESPN's homepage body (the feed under the strip). Empty by default = no body
// signal, so the column is the strip's order; the "highlighted" test below
// serves a hero block and a scoreboard module instead.
const NO_BODY = { feed: [] };

async function seed(page: Page, extra: Record<string, unknown> = {}, body: unknown = NO_BODY) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/oneFeed/frontpage**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
  await page.addInitScript((extra) => localStorage.setItem("nss-preferences", JSON.stringify({
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
    ...extra,
  })), extra);
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STRIP) }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = url.searchParams.get("dates") === TODAY ? (BOARDS[m[1]] ?? []) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

const cards = (page: Page) => page.locator('[data-league-column="top"]').getByRole("button", { name: / — game details$/ });
// The league chip is off for now (SHOW_CARD_LEAGUE_CHIP): 4 chips when on, 0 when off.
const CHIPS = SHOW_CARD_LEAGUE_CHIP ? 4 : 0;

const cardNames = (page: Page) =>
  page.locator('[data-league-column="top"]').getByRole("button", { name: / — game details$/ })
    .evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/ — game details$/, "")));

for (const { name, width, height } of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1180, height: 820 },
]) {
  test(`ESPN front page shows ESPN's picks in ESPN's order (${name} ${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await seed(page);
    await page.goto("/");

    const col = page.locator('[data-league-column="top"]');
    await expect(col).toBeVisible({ timeout: 30_000 });
    const heading = col.getByRole("heading").first();
    await expect(heading).toHaveText(width < 640 ? "ESPN.com" : "ESPN front page");
    const headingBox = await heading.boundingBox();
    expect(headingBox!.height, "the column title wrapped onto a second line").toBeLessThan(32);

    await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(col.locator("[data-league-tag]")).toHaveCount(CHIPS);
    expect(await cardNames(page)).toEqual(EXPECTED);
    const blocks = col.locator("[data-espn-league]");
    expect(await blocks.evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league")))).toEqual(BLOCKS);
    // The first block's label rides up into the header's subtitle row (Jacob
    // 9/27), so it is the column's first "NCAAF" text; later labels stay inline.
    await expect(col.getByText(BLOCK_LABELS[0], { exact: true }).first()).toBeVisible();
    for (const [i, label] of BLOCK_LABELS.entries()) {
      if (i > 0) await expect(blocks.nth(i).locator("span").first()).toHaveText(label);
    }
    for (const matchup of NEVER) await expect(col.getByRole("button", { name: `${matchup} — game details` })).toHaveCount(0);

    // No score anywhere in the column's DOM, final and live games included.
    const dom = await col.evaluate((el) => el.outerHTML);
    for (const s of SCORES) expect(dom, `score ${s} leaked into the column`).not.toMatch(new RegExp(`>\\s*${s}\\s*<|\\b${s}\\s*[-–]\\s*\\d|\\d\\s*[-–]\\s*${s}\\b`));

    const shot = await page.screenshot({ fullPage: false });
    await testInfo.attach(`espn-front-page-${width}`, { body: shot, contentType: "image/png" });
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-front-page-${width}.png` });
  });
}

// Phone, ratings on (Jacob 9/26 screenshot, "doesn't look consistent"): the
// league chip + a live clock + the badge + the network needed more than one
// row of a 3-column board, so ESPN front page cards wrapped to two lines and
// stood taller than the MLB / NFL cards beside them. The chip now rides on the
// card's top border, and every row is one line, as tall as a single-league
// column's.
test("phone: ESPN front page cards keep one-line rows like the other columns (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, { showRatings: true });
  await page.goto("/");
  const col = page.locator('[data-league-column="top"]');
  await expect(cards(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(col.locator("[data-league-tab]")).toHaveCount(CHIPS);
  const refH = (await page.locator('[data-league-column="mlb"] .game-meta-row').first().boundingBox())!.height;
  const rows = col.locator(".game-meta-row");
  await expect(rows).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const h = (await rows.nth(i).boundingBox())!.height;
    expect(h, `card ${i}: the meta row wrapped (${h}px vs ${refH}px in the MLB column)`).toBeLessThanOrEqual(refH + 0.5);
  }
  await expect(col.locator("[data-league-tag]")).toHaveCount(CHIPS);
  if (SHOW_CARD_LEAGUE_CHIP) {
    for (let i = 0; i < 4; i++) await expect(col.locator("[data-league-tag]").nth(i)).toBeHidden();
    const tabs = await col.locator("[data-league-tab]").evaluateAll((els) => els.map((t) => {
      const tab = t.getBoundingClientRect();
      const card = t.parentElement!.getBoundingClientRect();
      const row = t.parentElement!.querySelector(".game-meta-row")!.getBoundingClientRect();
      return { text: t.textContent, top: tab.top, bottom: tab.bottom, cardTop: card.top, rowTop: row.top, shown: getComputedStyle(t).display !== "none" };
    }));
    expect(tabs.map((t) => t.text)).toEqual(["NCAAF", "NCAAF", "NHL", "MLB"]);
    for (const [i, t] of tabs.entries()) {
      expect(t.shown, `card ${i}: tab hidden`).toBe(true);
      expect(t.top < t.cardTop && t.bottom > t.cardTop, `card ${i}: tab is not on the card's top border`).toBe(true);
      expect(t.bottom, `card ${i}: tab overlaps the row below it`).toBeLessThanOrEqual(t.rowTop);
    }
  }
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-front-page-phone-ratings.png` });
});

// Jacob 9/26 ("ur not taking highlighted posts into consideration"): espn.com
// put a big Texas A&M–LSU block above its College Football Scoreboard, and
// the column still led with the strip's first game. The body now leads: its
// hero (m1) is the first card and its scoreboard module (h1, c1) sets the
// block order. Inside a block live still leads (Jacob 9/26: "shouldnt
// finished games be after live ones per league?"), so live c2 sits above the
// featured final c1 in the NCAAF block. A story module changes nothing.
test("ESPN's highlighted games lead the column, ahead of the strip's order", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, {}, {
    feed: [
      { data: { event: { id: "m1" }, now: [{ type: "Module", inlines: [{ type: "Module", headline: "Dodgers preview" }] }] } },
      { data: { now: [{ type: "Module", inlines: [{ type: "SportingEvent", eventId: "h1" }, { type: "SportingEvent", eventId: "c1" }] }] } },
    ],
  });
  await page.goto("/");
  await expect(cards(page)).toHaveCount(4, { timeout: 30_000 });
  expect(await cardNames(page)).toEqual(["Dodgers at Giants", "Hurricanes at Predators", "Oklahoma at Georgia", "Texas at Tennessee"]);
  expect(await page.locator('[data-league-column="top"] [data-espn-league]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league")))).toEqual(["mlb", "nhl", "ncaaf"]);
});

// Ratings view (Jacob 10/6: "espn frontpage league is not ordered by rating
// when in ratings tab"): inside a league block the finals sort by rating like
// every other column's. The strip lists a 56-3 blowout before a 47-44 final;
// ratings on puts the close one first, ratings off keeps the strip's order.
// Live still leads the block in both.
for (const showRatings of [true, false]) {
  test(`ratings ${showRatings ? "on" : "off"}: an ESPN front page block's finals ${showRatings ? "sort by rating" : "keep ESPN's order"}`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seed(page, { showRatings });
    const strip = { sports: [{ slug: "football", leagues: [{ slug: "college-football", events: [{ id: "c5", priority: 0 }, { id: "c1", priority: 1 }, { id: "c2", priority: 2 }] }] }] };
    await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(strip) }));
    await page.route("**/apis/site/v2/sports/football/college-football/scoreboard**", (route: Route) => {
      const events = new URL(route.request().url()).searchParams.get("dates") === TODAY ? [
        event("c5", T("7", "Rutgers", "RUTG", "3"), T("8", "Ohio State", "OSU", "56"), "2026-09-26T16:00:00Z", "final"),
        ...BOARDS["football/college-football"].slice(0, 2),
      ] : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
    });
    await page.goto("/");
    await expect(cards(page)).toHaveCount(3, { timeout: 30_000 });
    expect(await cardNames(page)).toEqual(showRatings
      ? ["Oklahoma at Georgia", "Texas at Tennessee", "Rutgers at Ohio State"]
      : ["Oklahoma at Georgia", "Rutgers at Ohio State", "Texas at Tennessee"]);
  });
}

// Opt-in while it is tested (Jacob 9/26: "default off for all"): no row
// until Settings turns it on or a column pins it. These seeds pin a real
// league in column 3: `thirdLeague: undefined` would vanish when the init
// script's argument is serialized, leaving the base "top" pin in place.
test("the column switcher has no ESPN front page row by default", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, { thirdLeague: "ncaaf", hiddenLeagues: [] });
  await page.goto("/");
  await expect(page.locator('[data-league-column="mlb"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('button[title="Switch league"]').first().click();
  const menu = page.getByRole("dialog", { name: "Switch league" }).first();
  await expect(menu.getByRole("button", { name: "Auto" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /ESPN front page/ })).toHaveCount(0);
});

test("turned on, the column switcher offers ESPN front page on today's board", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, { thirdLeague: "ncaaf", hiddenLeagues: [], shownLeagues: ["top"] });
  await page.goto("/");
  await expect(page.locator('[data-league-column="mlb"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('button[title="Switch league"]').first().click();
  const menu = page.getByRole("dialog", { name: "Switch league" }).first();
  const rows = await menu.getByRole("button").allTextContents();
  const best = rows.findIndex((r) => r.startsWith("Best of yesterday"));
  const front = rows.findIndex((r) => r.startsWith("ESPN front page"));
  expect(front, `no ESPN front page row in ${rows.join(" | ")}`).toBeGreaterThan(-1);
  // Best of yesterday still leads (Jacob 9/26); ESPN front page comes next.
  expect(front).toBe(best + 1);
});

// Past days (Jacob 9/29: "shouldn't the yesterday page have those same
// leagues? or a snapshot of the leagues that were on the frontpage
// yesterday"). The mini bakes what espn.com featured each day to
// /news/espn-front/<YYYYMMDD>.json, and the Yesterday board reads it:
//   snapshot  strip NHL yh1 · NCAAF y2, y1 · MLB ym1   body: y1 (the hero)
//   boards    NCAAF y1 y2 · MLB ym1 ym2 · NHL yh1   (all finals)
// = the hero's NCAAF block first with the hero on top, then NHL, then MLB.
// ym2 is on the board but was never on the front page, so it stays out.
const YESTERDAY = "20260925";
const YDAY_BOARDS: Record<string, unknown[]> = {
  "football/college-football": [
    event("y2", T("31", "Kansas", "KU", "30"), T("32", "Iowa", "IOWA", "27"), "2026-09-25T23:00:00Z", "final"),
    event("y1", T("33", "Miami", "MIA", "24"), T("34", "Florida State", "FSU", "21"), "2026-09-26T00:00:00Z", "final"),
  ],
  "baseball/mlb": [
    event("ym1", T("35", "Mets", "NYM", "5"), T("36", "Phillies", "PHI", "4"), "2026-09-25T23:05:00Z", "final"),
    event("ym2", T("37", "Royals", "KC", "3"), T("38", "Twins", "MIN", "2"), "2026-09-26T00:10:00Z", "final"),
  ],
  "hockey/nhl": [
    event("yh1", T("39", "Rangers", "NYR", "3"), T("40", "Devils", "NJ", "2"), "2026-09-25T23:00:00Z", "final"),
  ],
};
const SNAPSHOT = {
  date: YESTERDAY,
  fetchedAt: "2026-09-26T03:45:00Z",
  samples: 60,
  strip: {
    sports: [
      { slug: "hockey", leagues: [{ slug: "nhl", events: [{ id: "yh1" }] }] },
      { slug: "football", leagues: [{ slug: "college-football", events: [{ id: "y2" }, { id: "y1" }] }] },
      { slug: "golf", leagues: [{ slug: "pga", events: [{ id: "g0" }] }] },
      { slug: "baseball", leagues: [{ slug: "mlb", events: [{ id: "ym1" }] }] },
    ],
  },
  featured: ["y1", "c1"],
};

async function seedYesterday(page: Page, snapshot: unknown | null) {
  await seed(page);
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m || url.searchParams.get("dates") !== YESTERDAY) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: YDAY_BOARDS[m[1]] ?? [] }) });
  });
  await page.route(`**/news/espn-front/${YESTERDAY}.json`, (route: Route) => snapshot
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) })
    : route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
}

test("Yesterday: ESPN front page shows the day's snapshot, hero first", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seedYesterday(page, SNAPSHOT);
  await page.goto("/yesterday");
  const col = page.locator('[data-league-column="top"]');
  await expect(col).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-league-column]")).toHaveCount(3);
  await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
  expect(await cardNames(page)).toEqual(["Miami at Florida State", "Kansas at Iowa", "Rangers at Devils", "Mets at Phillies"]);
  expect(await col.locator("[data-espn-league]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league"))))
    .toEqual(["ncaaf", "nhl", "mlb"]);
  await expect(col.getByRole("button", { name: "Royals at Twins — game details" })).toHaveCount(0);
  await expect(col.locator("[data-espn-fallback-note]")).toHaveCount(0);
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-front-page-yesterday.png` });
});

test("Yesterday with no snapshot: today's strip leagues, every game, and a note", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seedYesterday(page, null);
  await page.goto("/yesterday");
  const col = page.locator('[data-league-column="top"]');
  await expect(col).toBeVisible({ timeout: 30_000 });
  // Live strip = NCAAF, NHL, MLB (golf has no game cards): every final of those.
  await expect(cards(page)).toHaveCount(5, { timeout: 15_000 });
  expect(await col.locator("[data-espn-league]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league"))))
    .toEqual(["ncaaf", "nhl", "mlb"]);
  await expect(col.locator("[data-espn-fallback-note]")).toHaveText("Today's front-page leagues · no snapshot for this day");
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/espn-front-page-yesterday-fallback.png` });
});

test("Yesterday: the column switcher offers ESPN front page too", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seedYesterday(page, SNAPSHOT);
  await page.goto("/yesterday");
  await expect(page.locator('[data-league-column="top"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('button[title="Switch league"]').first().click();
  const menu = page.getByRole("dialog", { name: "Switch league" }).first();
  await expect(menu.getByRole("button", { name: /ESPN front page/ })).toHaveCount(1);
});

test("Tomorrow has no front page yet: the slot shows its Auto league", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page);
  await page.goto("/tomorrow");
  await expect(page.locator('[data-league-column="mlb"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-league-column="top"]')).toHaveCount(0);
  await expect(page.locator("[data-league-column]")).toHaveCount(3);
});

// Turned off in Settings' switcher list: it leaves the switcher and a column
// pinned to it closes (Jacob 10/8), same as Best of yesterday.
test("ESPN front page turned off: the pinned column closes and the switcher drops it", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, { hiddenLeagues: ["best", "top"] });
  await page.goto("/");
  await expect(page.locator('[data-league-column="mlb"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-league-column="top"]')).toHaveCount(0);
  await expect(page.locator("[data-league-column]")).toHaveCount(2);
  await page.locator('button[title="Switch league"]').first().click();
  const menu = page.getByRole("dialog", { name: "Switch league" }).first();
  await expect(menu.getByRole("button", { name: "Auto" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /ESPN front page/ })).toHaveCount(0);
});

test("Settings: the Across leagues list turns ESPN front page off and on", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page);
  await page.goto("/");
  await expect(page.locator('[data-league-column="top"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[aria-label="Open settings"]').first().click();
  await page.getByRole("button", { name: "More leagues", exact: true }).click();
  const box = page.getByRole("checkbox", { name: "ESPN front page" });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}").hiddenLeagues))
    .toContain("top");
  await box.check();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}").hiddenLeagues ?? []))
    .not.toContain("top");
});

test("Settings: ESPN front page starts unticked, and ticking it adds it to the switcher", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page, { thirdLeague: "ncaaf" });
  await page.goto("/");
  await expect(page.locator('[data-league-column="mlb"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[aria-label="Open settings"]').first().click();
  await page.getByRole("button", { name: "More leagues", exact: true }).click();
  const box = page.getByRole("checkbox", { name: "ESPN front page" });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}").shownLeagues ?? []))
    .toContain("top");
  await box.uncheck();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}").shownLeagues ?? []))
    .not.toContain("top");
});

// One-tap add (Jacob 9/28): a league block's label opens "Add {league}". With a
// free column, "New column" starts picked, so it is two taps.
test("ESPN front page: a block label adds its league to a new column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.locator('[data-league-column="top"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add NHL to a column" }).click();
  const pop = page.getByRole("dialog", { name: "Add NHL" });
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("radio", { name: "New column" })).toBeChecked();
  await expect(pop.getByRole("radio")).toHaveCount(6);
  await pop.getByRole("button", { name: "Add", exact: true }).click();
  await expect(pop).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));
  expect(saved.fourthLeague).toBe("nhl");
  expect(saved.shownLeagues ?? []).toContain("nhl");
  await expect(page.locator('[data-league-column="nhl"]')).toBeVisible({ timeout: 30_000 });
});

test("ESPN front page: with no free column, a picked column takes the league", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, { catalogHiddenLeagues: ["nhl"] });
  await page.goto("/");
  await expect(page.locator('[data-league-column="top"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Add (NHL|Hockey) to a column$/ }).click();
  const pop = page.getByRole("dialog", { name: /^Add / });
  await expect(pop.getByRole("radio", { name: "New column" })).toHaveCount(0);
  const add = pop.getByRole("button", { name: "Add", exact: true });
  await expect(add).toBeDisabled();
  await pop.getByRole("radio", { name: /^Column 2 / }).check();
  await add.click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));
  expect(saved.secondLeague).toBe("nhl");
  expect(saved.shownLeagues ?? []).toContain("nhl");
  // Adding also lifts a catalog strike.
  expect(saved.catalogHiddenLeagues).toBeUndefined();
});

// Jacob 10/9: a league that already has a column on the board shows its plain
// label. "MLB +" next to the MLB column only opened a useless Add popover.
test("ESPN front page: a league that already has a column shows no +", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  const col = page.locator('[data-league-column="top"]');
  await expect(col).toBeVisible({ timeout: 30_000 });
  await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
  await expect(col.locator('[data-espn-league="mlb"]').getByText("MLB", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add MLB to a column" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add NHL to a column" })).toHaveCount(1);
});

// The lead block's label sits in the recap row when a sibling (here MLB's
// Playoffs pill) holds one, and that row label is the one that wore the "+".
test("ESPN front page: the lead label of a league with a column is not clickable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, { secondLeague: "ncaaf" });
  await page.goto("/");
  const col = page.locator('[data-league-column="top"]');
  await expect(col).toBeVisible({ timeout: 30_000 });
  await expect(cards(page)).toHaveCount(4, { timeout: 15_000 });
  const label = col.getByText("NCAAF", { exact: true }).first();
  await expect(label).toBeVisible();
  await expect(page.getByRole("button", { name: "Add NCAAF to a column" })).toHaveCount(0);
  await expect(col.getByRole("button", { name: /^NCAAF\b/ })).toHaveCount(0);
  await label.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add NHL to a column" })).toHaveCount(1);
});
