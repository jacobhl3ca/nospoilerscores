import { expect, test, type Page, type Route } from "@playwright/test";

// The Live pill is always on the board tabs (Jacob 10/14: "dont see live
// button on app?"), and with Live on, live games from leagues with no board
// column list under the board as "Also live" (the FotMob pattern: yours
// first, then everything else live). Boards are mocked so the slate is exact:
//   Wed 10/14  MLB   CLE at TB (8:08 pm, scheduled)      ← board
//              NCAAF TEX at TENN (final)                ← board
//              NHL   NYR at WSH (LIVE) · BOS at DET (7:00 pm)   ← no column

const NOW = new Date("2026-10-14T14:00:00-04:00"); // Wed 2 pm ET
const TODAY = "20261014";

type TeamSpec = { id: string; name: string; abbr: string };
type Status = "final" | "live" | "scheduled";

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, status: Status, clock = "7:00 PM", score: [string, string] = ["24", "31"], period = 2) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: status === "scheduled" ? "" : side === "home" ? score[1] : score[0],
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
      ? { displayClock: "0:00", period: 3, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } }
      : status === "live"
        ? { displayClock: "8:12", period, type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "8:12 - In Progress", shortDetail: "8:12", completed: false } }
        : { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: `Wed, October 14th at ${clock} EDT`, shortDetail: `10/14 - ${clock} EDT`, completed: false } },
    competitions: [{ competitors: [competitor(home, "home"), competitor(away, "away")], broadcasts: [{ names: ["ESPN"] }], headlines: [], notes: [] }],
  };
}

const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });
const BOARD = {
  "baseball/mlb": [event("m1", T("11", "Guardians", "CLE"), T("12", "Rays", "TB"), "2026-10-15T00:08:00Z", "scheduled", "8:08 PM")],
  "football/college-football": [event("c1", T("1", "Texas", "TEX"), T("2", "Tennessee", "TENN"), "2026-10-14T16:00:00Z", "final")],
};
const NHL_LIVE = event("h1", T("21", "Rangers", "NYR"), T("31", "Capitals", "WSH"), "2026-10-14T17:00:00Z", "live");
const NHL_LATER = event("h2", T("22", "Bruins", "BOS"), T("32", "Red Wings", "DET"), "2026-10-14T23:00:00Z", "scheduled", "7:00 PM");

// The mockup slate (10/17, Jacob's screenshot): an MLB game live on the board,
// an empty NFL column, and three NCAAF games live with no column, scored so
// the ratings land on three tiers (88 GREAT, 80 GOOD, SKIP).
const NCAAF_LIVE = [
  event("c11", T("41", "Oklahoma State", "OKST"), T("42", "Iowa", "IOWA"), "2026-10-14T16:00:00Z", "live", undefined, ["20", "24"], 4),
  event("c12", T("43", "Texas", "TEX"), T("44", "Tennessee", "TENN"), "2026-10-14T16:30:00Z", "live", undefined, ["17", "24"], 3),
  event("c13", T("45", "FIU", "FIU"), T("46", "Jacksonville State", "JXST"), "2026-10-14T17:00:00Z", "live", undefined, ["10", "38"], 3),
];
const MLB_LIVE = event("m2", T("13", "Mariners", "SEA"), T("14", "Blue Jays", "TOR"), "2026-10-14T17:08:00Z", "live", undefined, ["3", "2"], 6);
const RATED_SCORE = /\b(?:20|17|10|38|31|24)\b/;

type SeedOpts = { showRatings?: boolean; second?: string; slots?: string[]; board?: Record<string, unknown[]>; extra?: Record<string, unknown[]> };

async function seed(page: Page, theme: "light" | "dark", nhl: unknown[], opts: SeedOpts = {}) {
  await page.clock.setFixedTime(NOW);
  // Seeded once per tab, so a reload keeps what the test changed.
  await page.addInitScript(({ theme, showRatings, second, slots }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme,
    showRatings,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: second,
    thirdLeague: slots[0],
    fourthLeague: slots[1],
    fifthLeague: slots[2],
    hiddenLeagues: ["best", "top"],
    defaultDateMode: "today",
    defaultLandingView: "scores",
  }));
  }, { theme, showRatings: !!opts.showRatings, second: opts.second ?? "ncaaf", slots: opts.slots ?? ["empty", "empty", "empty"] });
  const boards: Record<string, Record<string, unknown[]>> = { [TODAY]: { ...(opts.board ?? BOARD), "hockey/nhl": nhl, ...opts.extra } };
  await page.route("**/apis/v2/scoreboard/header**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"sports":[]}' }));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = boards[url.searchParams.get("dates") ?? ""]?.[m[1]] ?? [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

const card = (page: Page, matchup: string) => page.getByRole("button", { name: `${matchup} — game details` });
// A score next to a team: "24-31", "24 - 31", or the mocked 24 / 31 alone.
const SCORE = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b|\b(?:31|24)\b/;

async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`Live pill + Also live 390px (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
    });

    test("0 live on the board: grey Live pill; on → Also live lists the NHL game, no score", async ({ page, browserName }) => {
      await seed(page, theme, [NHL_LIVE, NHL_LATER]);
      await page.goto("/");
      await expect(card(page, "Texas at Tennessee")).toBeVisible({ timeout: 30_000 });
      const live = page.locator("header").first().getByTestId("live-toggle");
      await expect(live).toBeVisible();
      await expect(live).toHaveAttribute("data-live-count", "0");
      await expect(live).toHaveText("Live");
      await expect(live).toHaveAttribute("aria-pressed", "false");
      // Grey dot, not the live red.
      expect(await live.getByTestId("live-dot").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(220, 38, 38)");
      await expect(page.getByTestId("also-live")).toHaveCount(0);
      await shot(page, `live-grey-${browserName}-${theme}`);

      await live.click();
      await expect(live).toHaveAttribute("aria-pressed", "true");
      const also = page.locator('section[data-testid="also-live"]');
      await expect(also).toBeVisible({ timeout: 20_000 });
      await expect(also.getByRole("heading", { name: "Also live" })).toBeVisible();
      const rows = also.locator('[data-schedule-league="nhl"] [data-schedule-row]');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("LIVE");
      await expect(rows.first()).toContainText("NYR");
      await expect(rows.first()).toContainText("WSH");
      // Only live games: the 7 pm game is not listed.
      await expect(also).not.toContainText("BOS");
      expect(await also.innerText()).not.toMatch(SCORE);
      // Full width under the board columns.
      const board = await page.locator('[data-league-column="mlb"]').boundingBox();
      const sec = await also.boundingBox();
      expect(sec!.y).toBeGreaterThan(board!.y);
      await shot(page, `also-live-${browserName}-${theme}`);

      // A row tap does what a Schedule row tap does: the game's modal.
      await rows.first().click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");

      await live.click();
      await expect(live).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("also-live")).toHaveCount(0);
    });

    test("nothing live anywhere: one line naming the next start", async ({ page, browserName }) => {
      await seed(page, theme, [NHL_LATER]);
      await page.goto("/");
      await expect(card(page, "Texas at Tennessee")).toBeVisible({ timeout: 30_000 });
      const live = page.getByTestId("live-toggle");
      await live.click();
      const line = page.locator('[data-testid="also-live"][data-empty]');
      await expect(line).toBeVisible({ timeout: 20_000 });
      await expect(line).toHaveText("Nothing live right now · next: NHL 7:00 PM");
      await shot(page, `nothing-live-${browserName}-${theme}`);
    });
  });
}

test("desktop 1280px: Also live sits under the columns", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, "light", [NHL_LIVE]);
  await page.goto("/");
  await expect(card(page, "Texas at Tennessee")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("live-toggle").click();
  const also = page.locator('section[data-testid="also-live"]');
  await expect(also.locator('[data-schedule-league="nhl"] [data-schedule-row]')).toHaveCount(1, { timeout: 20_000 });
  expect(await also.innerText()).not.toMatch(SCORE);
  await shot(page, `also-live-desktop-${browserName}`);
});

test("360px: the always-on pill keeps the header on one row, nothing off screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seed(page, "light", [NHL_LIVE]);
  await page.goto("/");
  await expect(card(page, "Texas at Tennessee")).toBeVisible({ timeout: 30_000 });
  const header = page.locator("header").first();
  const boxes = await Promise.all([
    header.getByRole("link", { name: "HideScore home" }).boundingBox(),
    header.getByTestId("live-toggle").boundingBox(),
    header.getByRole("button", { name: "Open settings" }).boundingBox(),
  ]);
  for (const b of boxes) expect(b!.x + b!.width).toBeLessThanOrEqual(360);
  const mids = boxes.map((b) => b!.y + b!.height / 2);
  expect(Math.max(...mids) - Math.min(...mids)).toBeLessThan(4);
});

// Decision 1 (Jacob 10/17): with the Ratings tab on, a live line carries the
// card's GREAT/GOOD/MEH/SKIP badge in the network slot; off, the network.
// Never a score either way. These shots are the before/after mockup page.
for (const theme of ["light", "dark"] as const) {
  for (const width of [1120, 390]) {
    test(`Ratings on, ${width}px ${theme}: Also live lines carry the badge, no score`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
      await seed(page, theme, [NHL_LIVE, NHL_LATER], {
        showRatings: true,
        second: "nfl",
        board: { "baseball/mlb": [MLB_LIVE], "football/nfl": [] },
        extra: { "football/college-football": NCAAF_LIVE },
      });
      await page.goto("/");
      await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
      const live = page.locator("header").first().getByTestId("live-toggle");
      await expect(live).toHaveText("Live 1");
      expect(await live.getByTestId("live-dot").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(220, 38, 38)");
      await shot(page, `mockup-before-${width}-${browserName}-${theme}`);
      await live.click();
      const also = page.locator('section[data-testid="also-live"]');
      const ncaaf = also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]');
      await expect(ncaaf).toHaveCount(3, { timeout: 20_000 });
      await expect(also.locator('[data-schedule-league="nhl"] [data-schedule-row]')).toHaveCount(1);
      const badges = also.getByTestId("schedule-rating");
      await expect(badges).toHaveCount(4);
      await expect(ncaaf.filter({ hasText: "OKST" })).toContainText("GREAT");
      await expect(ncaaf.filter({ hasText: "TEX" })).toContainText("GOOD");
      await expect(ncaaf.filter({ hasText: "FIU" })).toContainText("SKIP");
      await expect(ncaaf.filter({ hasText: "OKST" })).toHaveAttribute("aria-label", /rated great/);
      expect(await also.innerText()).not.toMatch(RATED_SCORE);
      // The fan-out settles (10 s cap per league): the "Checking" line goes.
      await expect(also.getByText("Checking more leagues…")).toHaveCount(0, { timeout: 15_000 });
      await shot(page, `mockup-after-${width}-${browserName}-${theme}`);
    });
  }
}

test("Ratings off: Also live lines show the network, no badge, no score", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, "light", [NHL_LIVE], {
    second: "nfl",
    board: { "baseball/mlb": [MLB_LIVE], "football/nfl": [] },
    extra: { "football/college-football": NCAAF_LIVE },
  });
  await page.goto("/");
  await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("live-toggle").click();
  const also = page.locator('section[data-testid="also-live"]');
  await expect(also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]')).toHaveCount(3, { timeout: 20_000 });
  await expect(also.getByTestId("schedule-rating")).toHaveCount(0);
  await expect(also).not.toContainText(/GREAT|GOOD|MEH|SKIP/);
  await expect(also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]').first()).toContainText("ESPN");
  expect(await also.innerText()).not.toMatch(RATED_SCORE);
});

// Jacob 10/17 on the mockup: "Also live" is as wide as the open columns (its
// left edge on the first column's, its right edge on the + tile's or the last
// column's) at every width, and starts ~20px under the tallest column (the
// 60vh column floor drops while it shows lines).
async function expectEdges(page: Page) {
  const also = page.locator('section[data-testid="also-live"]');
  await expect.poll(async () => {
    const boxes = await page.locator("main [data-league-column], main [data-add-column]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const cols = await page.locator("main [data-league-column]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const sec = (await also.boundingBox())!;
    const left = Math.min(...boxes.map((b) => b.left));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...cols.map((b) => b.bottom));
    const head = (await also.getByTestId("also-live-toggle").boundingBox())!;
    return {
      left: Math.abs(sec.x - left) <= 2,
      right: Math.abs(sec.x + sec.width - right) <= 2,
      gap: head.y - bottom >= 12 && head.y - bottom <= 32,
    };
  }, { timeout: 10_000 }).toEqual({ left: true, right: true, gap: true });
}

for (const [cols, width, slots] of [
  [2, 390, ["empty", "empty", "empty"]],
  [2, 1120, ["empty", "empty", "empty"]],
  [3, 1120, ["nba", "empty", "empty"]],
  [5, 1440, ["nba", "epl", "mls"]],
] as const) {
  test(`${cols} columns at ${width}px: Also live edges sit on the column row's edges, ~20px under the tallest`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, "dark", [NHL_LIVE], {
      showRatings: true,
      second: "nfl",
      slots: [...slots],
      board: { "baseball/mlb": [MLB_LIVE], "football/nfl": [] },
      extra: { "football/college-football": NCAAF_LIVE },
    });
    await page.goto("/");
    await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("live-toggle").click();
    const also = page.locator('section[data-testid="also-live"]');
    // NCAAF answers first; the mocked fan-out can hold NHL past the wait.
    await expect(also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]')).toHaveCount(3, { timeout: 20_000 });
    await expect(page.locator("main [data-league-column]")).toHaveCount(cols);
    await expectEdges(page);
  });
}

// Jacob 10/17 round 3: a chevron rolls the list up (remembered, count kept),
// "Don't show again" hides it, and Settings brings it back.
test("chevron rolls Also live up, shows the count, and stays rolled up after a reload", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, "dark", [NHL_LIVE], {
    showRatings: true,
    second: "nfl",
    board: { "baseball/mlb": [MLB_LIVE], "football/nfl": [] },
    extra: { "football/college-football": NCAAF_LIVE },
  });
  await page.goto("/");
  await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
  const live = page.getByTestId("live-toggle");
  await live.click();
  const also = page.locator('section[data-testid="also-live"]');
  await expect(also.locator("[data-schedule-row]")).toHaveCount(4, { timeout: 20_000 });
  const toggle = also.getByTestId("also-live-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText("Also live");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveText("Also live · 4");
  await expect(also.locator("[data-schedule-row]")).toHaveCount(0);
  await expect(also).not.toContainText(/GREAT|GOOD|MEH|SKIP/);
  await shot(page, `mockup-after-390-rolled-up-${browserName}-dark`);

  await page.reload();
  await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
  if ((await live.getAttribute("aria-pressed")) !== "true") await live.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 20_000 });
  await expect(also.locator("[data-schedule-row]")).toHaveCount(0);
  await toggle.click();
  await expect(also.locator("[data-schedule-row]").first()).toBeVisible();
});

test("Don't show again hides Also live; the Settings switch brings it back", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await seed(page, "light", [NHL_LIVE], {
    second: "nfl",
    board: { "baseball/mlb": [MLB_LIVE], "football/nfl": [] },
    extra: { "football/college-football": NCAAF_LIVE },
  });
  await page.goto("/");
  await expect(card(page, "Mariners at Blue Jays")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("live-toggle").click();
  const also = page.locator('section[data-testid="also-live"]');
  await expect(also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]')).toHaveCount(3, { timeout: 20_000 });
  await also.getByTestId("also-live-hide").click();
  await expect(page.getByTestId("also-live")).toHaveCount(0);
  // The pill stays on; only the list is gone.
  await expect(page.getByTestId("live-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  const sw = settings.getByRole("checkbox", { name: /Also live under the board/ });
  await expect(sw).not.toBeChecked();
  await sw.check();
  await settings.getByRole("button", { name: "Close settings" }).first().click();
  await expect(also.locator('[data-schedule-league="ncaaf"] [data-schedule-row]')).toHaveCount(3, { timeout: 20_000 });
  await expect(also.getByTestId("also-live-toggle")).toHaveAttribute("aria-expanded", "true");
});
