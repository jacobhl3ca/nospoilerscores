import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

// Covered playoff cards (src/lib/pairingMask.ts) keep their rating once live or
// final, and a column with 2+ covers gets one "Show all teams" (Jacob 9/30).
// A tap is remembered per matchup (Jacob 10/2): a new page in the same browser
// opens it, a new browser does not, and a TBD card is for this visit only.
// Four Division Series Game 1s on Oct 3, shaped like ESPN's listing that day
// ("NLDS - Game 1" in notes; see tests/pairing-mask.test.ts).

type Side = { id: string; name: string; abbr: string };
type State = "pre" | "post" | "delay";
const SERIES: { id: string; label: string; away: Side; home: Side }[] = [
  { id: "401900001", label: "NLDS - Game 1", away: { id: "22", name: "Phillies", abbr: "PHI" }, home: { id: "19", name: "Dodgers", abbr: "LAD" } },
  { id: "401900002", label: "NLDS - Game 1", away: { id: "16", name: "Cubs", abbr: "CHC" }, home: { id: "8", name: "Brewers", abbr: "MIL" } },
  { id: "401900003", label: "ALDS - Game 1", away: { id: "10", name: "Yankees", abbr: "NYY" }, home: { id: "5", name: "Guardians", abbr: "CLE" } },
  { id: "401900004", label: "ALDS - Game 1", away: { id: "2", name: "Red Sox", abbr: "BOS" }, home: { id: "30", name: "Rays", abbr: "TB" } },
];
const TEAM_TEXT = new RegExp(`${SERIES.flatMap((s) => [s.away.name, s.home.name]).join("|")}|\\b(?:${SERIES.flatMap((s) => [s.away.abbr, s.home.abbr]).join("|")})\\b`);

function event(s: { id: string; label: string; away: Side; home: Side }, i: number, state: State) {
  const iso = `2026-10-03T${String(17 + i * 2).padStart(2, "0")}:08Z`;
  const type = state === "pre"
    ? { name: "STATUS_SCHEDULED", state: "pre", completed: false, detail: "Sat, October 3rd at 1:08 PM EDT", shortDetail: "10/3 - 1:08 PM EDT" }
    : state === "post"
      ? { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" }
      : { name: "STATUS_DELAYED", state: "in", completed: false, detail: "Rain Delay", shortDetail: "Rain Delay" };
  const score = (n: number) => (state === "pre" ? "0" : String(n));
  const team = (t: Side) => ({ id: t.id, abbreviation: t.abbr, displayName: t.name, shortDisplayName: t.name, name: t.name, logo: `https://a.espncdn.com/i/teamlogos/mlb/500/${t.abbr.toLowerCase()}.png` });
  return {
    id: s.id, date: iso, name: `${s.away.name} at ${s.home.name}`, shortName: `${s.away.abbr} @ ${s.home.abbr}`,
    season: { year: 2026, type: 3 },
    status: { period: state === "pre" ? 0 : state === "post" ? 9 : 6, displayClock: "0:00", type },
    competitions: [{
      id: s.id, date: iso,
      notes: [{ type: "event", headline: s.label }],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: score(3), winner: state === "post", team: team(s.home) },
        { homeAway: "away", score: score(2), winner: false, team: team(s.away) },
      ],
    }],
  };
}

const prefs = {
  favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "dark", showRatings: true, defaultRatings: "on",
  skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
  firstLeague: "mlb", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
  defaultDateMode: "today", defaultLandingView: "scores",
};

async function openBoard(page: Page, events: unknown[]) {
  await page.route("**/baseball/mlb/scoreboard?**", (route) => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    const body = JSON.stringify({ events: dates.startsWith("20261003") ? events : [] });
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.route(/gc\.zgo\.at|stats\.hidescore\.com|goatcounter|sentry\.io/, (r) => r.abort());
  await page.clock.setFixedTime(new Date("2026-10-03T20:00:00-04:00"));
  await page.addInitScript((p) => { if (!localStorage.getItem("nss-preferences")) localStorage.setItem("nss-preferences", JSON.stringify(p)); }, prefs);
  await page.goto("/");
}

const covers = (page: Page) => page.locator("[data-pairing-mask]");
const revealAll = (page: Page | Locator) => page.getByTestId("pairing-reveal-all");
const badge = '[role="img"][aria-label^="Worth-watching rating: "]';
const revealed = (page: Page | Locator, s: { away: Side; home: Side }) => page.getByRole("button", { name: new RegExp(`${s.away.name} at ${s.home.name}`) });

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("pre-game covers carry no rating; the column has one Show all teams", async ({ page }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "pre")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      await expect(covers(page).locator(badge)).toHaveCount(0);
      await expect(revealAll(page)).toHaveCount(1);
      await expect(revealAll(page)).toBeVisible();
      await expect(revealAll(page)).toHaveAccessibleName("Show teams for all 4 covered games (reveals who advanced)");
    });

    test("final covers show their rating and still name no club", async ({ page }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      for (const s of SERIES) {
        const cover = page.locator(`[data-pairing-mask="${s.id}"]`);
        await expect(cover.locator(badge)).toHaveCount(1);
        const html = await cover.evaluate((el) => el.outerHTML);
        expect(html).not.toMatch(TEAM_TEXT);
        expect(html).not.toMatch(/<img|logo/i);
      }
    });

    test("a live cover in a delay shows no rating, the same as a full card", async ({ page }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, i === 0 ? "delay" : i === 3 ? "pre" : "post")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      await expect(page.locator(`[data-pairing-mask="${SERIES[0].id}"] ${badge}`)).toHaveCount(0);
      await expect(page.locator(`[data-pairing-mask="${SERIES[1].id}"] ${badge}`)).toHaveCount(1);
      // The badge adds no row: a rated final cover is as tall as a pre-game one.
      const height = (id: string) => page.locator(`[data-pairing-mask="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().height));
      expect(await height(SERIES[1].id)).toBe(await height(SERIES[3].id));
    });

    test("one Show teams opens one card; Show all teams opens the rest; a new browser is covered", async ({ page, browser }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });

      await page.locator(`[data-pairing-mask="${SERIES[0].id}"]`).getByRole("button", { name: /^Show teams for the / }).click();
      await expect(covers(page)).toHaveCount(3);
      await expect(revealed(page, SERIES[0])).toBeVisible();
      await expect(revealAll(page)).toHaveAccessibleName(/all 3 covered games/);

      await revealAll(page).click();
      await expect(covers(page)).toHaveCount(0);
      for (const s of SERIES) await expect(revealed(page, s)).toBeVisible();
      await expect(revealAll(page)).toHaveCount(0);

      await page.reload();
      for (const s of SERIES) await expect(revealed(page, s)).toBeVisible({ timeout: 30_000 });
      await expect(covers(page)).toHaveCount(0);

      await expectNewVisitCovers(browser, width);
    });

    test("a Show teams tap stays open on a new page; another matchup stays covered", async ({ page, context }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      await page.locator(`[data-pairing-mask="${SERIES[0].id}"]`).getByRole("button", { name: /^Show teams for the / }).click();
      await expect(revealed(page, SERIES[0])).toBeVisible();

      const next = await context.newPage();
      await openBoard(next, SERIES.map((s, i) => event(s, i, "post")));
      await expect(revealed(next, SERIES[0])).toBeVisible({ timeout: 30_000 });
      await expect(covers(next)).toHaveCount(3);
      await expect(next.locator(`[data-pairing-mask="${SERIES[1].id}"]`)).toBeVisible();

      // Game 2 of the same series, home and away swapped, opens too.
      const s0 = SERIES[0];
      const game2 = { id: "401900011", label: "NLDS - Game 2", away: s0.home, home: s0.away };
      const third = await context.newPage();
      await openBoard(third, [event(game2, 0, "post"), event(SERIES[1], 1, "post")]);
      await expect(revealed(third, game2)).toBeVisible({ timeout: 30_000 });
      await expect(covers(third)).toHaveCount(1);
    });

    test("Show all teams stays open on a new page", async ({ page, context }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      await revealAll(page).click();
      await expect(covers(page)).toHaveCount(0);

      const next = await context.newPage();
      await openBoard(next, SERIES.map((s, i) => event(s, i, "post")));
      for (const s of SERIES) await expect(revealed(next, s)).toBeVisible({ timeout: 30_000 });
      await expect(covers(next)).toHaveCount(0);
      await expect(revealAll(next)).toHaveCount(0);
    });

    test("a reveal in one tab opens the same matchup in another open tab", async ({ page, context }) => {
      await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
      const other = await context.newPage();
      await openBoard(other, SERIES.map((s, i) => event(s, i, "post")));
      await expect(covers(other)).toHaveCount(4, { timeout: 30_000 });
      await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
      await page.locator(`[data-pairing-mask="${SERIES[2].id}"]`).getByRole("button", { name: /^Show teams for the / }).click();
      await expect(revealed(other, SERIES[2])).toBeVisible();
      await expect(covers(other)).toHaveCount(3);
    });

    test("a TBD card opens for this visit only", async ({ page, context }) => {
      const tbd = { id: "401900021", label: "NLDS - Game 1", away: { id: "-1", name: "TBD", abbr: "TBD" }, home: SERIES[0].home };
      await openBoard(page, [event(tbd, 0, "pre")]);
      await expect(covers(page)).toHaveCount(1, { timeout: 30_000 });
      await covers(page).getByRole("button", { name: /^Show teams for the / }).click();
      await expect(covers(page)).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("hs:pairing-revealed-v2"))).toBeNull();

      const next = await context.newPage();
      await openBoard(next, [event(tbd, 0, "pre")]);
      await expect(covers(next)).toHaveCount(1, { timeout: 30_000 });
    });

    test("a single covered game gets no Show all teams", async ({ page }) => {
      await openBoard(page, [event(SERIES[0], 0, "post")]);
      await expect(covers(page)).toHaveCount(1, { timeout: 30_000 });
      await expect(revealAll(page)).toHaveCount(0);
    });
  });
}

// ESPN front page column (Jacob 10/3): an NCAAF block leads, the MLB block
// with the covered Division Series games sits below it. "Show all teams" goes
// in the MLB block, over its cards, not at the top of the column. Header strip
// + homepage feed mocked as in espn-front-page.spec.ts.
const NCAAF = [
  { id: "401910001", away: { id: "87", name: "Fighting Irish", abbr: "ND" }, home: { id: "153", name: "Tar Heels", abbr: "UNC" } },
  { id: "401910002", away: { id: "61", name: "Bulldogs", abbr: "UGA" }, home: { id: "2", name: "Tigers", abbr: "AUB" } },
];
function ncaafEvent(g: (typeof NCAAF)[number], i: number) {
  const e = event({ ...g, label: "" }, i, "pre");
  return { ...e, season: { year: 2026, type: 2 }, competitions: [{ ...e.competitions[0], notes: [] }] };
}
const STRIP = {
  sports: [
    { slug: "football", leagues: [{ slug: "college-football", events: NCAAF.map((g, i) => ({ id: g.id, priority: i })) }] },
    { slug: "baseball", leagues: [{ slug: "mlb", events: SERIES.map((s, i) => ({ id: s.id, priority: 2 + i })) }] },
  ],
};

async function openEspnBoard(page: Page) {
  const boards: Record<string, unknown[]> = {
    "football/college-football": NCAAF.map(ncaafEvent),
    "baseball/mlb": SERIES.map((s, i) => event(s, i, "post")),
  };
  await page.route("**/apis/site/v2/sports/**", (route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = (url.searchParams.get("dates") ?? "").startsWith("20261003") ? (boards[m[1]] ?? []) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/apis/v2/scoreboard/header**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STRIP) }));
  await page.route("**/oneFeed/frontpage**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feed: [] }) }));
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  await page.route(/gc\.zgo\.at|stats\.hidescore\.com|goatcounter|sentry\.io/, (r) => r.abort());
  await page.clock.setFixedTime(new Date("2026-10-03T20:00:00-04:00"));
  await page.addInitScript((p) => { if (!localStorage.getItem("nss-preferences")) localStorage.setItem("nss-preferences", JSON.stringify(p)); },
    { ...prefs, favoriteLeagues: [], secondLeague: "top", hiddenLeagues: ["best"] });
  await page.goto("/");
}

const espnCol = (page: Page) => page.locator('[data-league-column="top"]');
const mlbCol = (page: Page) => page.locator('[data-league-column="mlb"]');

for (const width of [390, 1440]) {
  test.describe(`ESPN front page ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("Show all teams sits in the MLB block, opens both columns, and stays open on a new page", async ({ page, context }) => {
      await openEspnBoard(page);
      await expect(espnCol(page).locator("[data-pairing-mask]")).toHaveCount(4, { timeout: 30_000 });
      await expect(mlbCol(page).locator("[data-pairing-mask]")).toHaveCount(4);
      expect(await espnCol(page).locator("[data-espn-league]").evaluateAll((els) => els.map((e) => e.getAttribute("data-espn-league")))).toEqual(["ncaaf", "mlb"]);

      await expect(revealAll(espnCol(page))).toHaveCount(1);
      await expect(espnCol(page).locator('[data-espn-league="ncaaf"] [data-testid="pairing-reveal-all"]')).toHaveCount(0);
      const control = espnCol(page).locator('[data-espn-league="mlb"] [data-testid="pairing-reveal-all"]');
      await expect(control).toHaveCount(1);
      const controlBox = (await control.boundingBox())!;
      const ncaafBox = (await espnCol(page).locator('[data-espn-league="ncaaf"]').boundingBox())!;
      const firstCover = (await espnCol(page).locator("[data-pairing-mask]").first().boundingBox())!;
      expect(controlBox.y, "control is above the NCAAF block's end").toBeGreaterThanOrEqual(ncaafBox.y + ncaafBox.height);
      expect(controlBox.y + controlBox.height, "control is not above the first covered card").toBeLessThanOrEqual(firstCover.y);

      await control.click();
      await expect(covers(page)).toHaveCount(0);
      for (const s of SERIES) {
        await expect(revealed(espnCol(page), s)).toBeVisible();
        await expect(revealed(mlbCol(page), s)).toBeVisible();
      }
      await expect(revealAll(page)).toHaveCount(0);

      const next = await context.newPage();
      await openEspnBoard(next);
      for (const s of SERIES) await expect(revealed(espnCol(next), s)).toBeVisible({ timeout: 30_000 });
      await expect(covers(next)).toHaveCount(0);
      await expect(revealAll(next)).toHaveCount(0);
    });

    test("a tap in the MLB column opens the ESPN column copy", async ({ page }) => {
      await openEspnBoard(page);
      await expect(espnCol(page).locator("[data-pairing-mask]")).toHaveCount(4, { timeout: 30_000 });
      await mlbCol(page).locator(`[data-pairing-mask="${SERIES[0].id}"]`).getByRole("button", { name: /^Show teams for the / }).click();
      await expect(revealed(espnCol(page), SERIES[0])).toBeVisible();
      await expect(espnCol(page).locator("[data-pairing-mask]")).toHaveCount(3);

      await revealAll(mlbCol(page)).click();
      await expect(espnCol(page).locator("[data-pairing-mask]")).toHaveCount(0);
      for (const s of SERIES) await expect(revealed(espnCol(page), s)).toBeVisible();
    });
  });
}

async function expectNewVisitCovers(browser: Browser, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block", baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await openBoard(page, SERIES.map((s, i) => event(s, i, "post")));
  await expect(covers(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(revealAll(page)).toBeVisible();
  await ctx.close();
}
