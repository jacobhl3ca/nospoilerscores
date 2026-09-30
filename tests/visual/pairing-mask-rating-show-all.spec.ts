import { expect, test, type Browser, type Page } from "@playwright/test";

// Covered playoff cards (src/lib/pairingMask.ts) keep their rating once live or
// final, and a column with 2+ covers gets one "Show all teams" (Jacob 9/30).
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

function event(s: (typeof SERIES)[number], i: number, state: State) {
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
const revealAll = (page: Page) => page.getByTestId("pairing-reveal-all");
const badge = '[role="img"][aria-label^="Worth-watching rating: "]';
const revealed = (page: Page, s: (typeof SERIES)[number]) => page.getByRole("button", { name: new RegExp(`${s.away.name} at ${s.home.name}`) });

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

    test("one Show teams opens one card; Show all teams opens the rest for this visit", async ({ page, browser }) => {
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

    test("a single covered game gets no Show all teams", async ({ page }) => {
      await openBoard(page, [event(SERIES[0], 0, "post")]);
      await expect(covers(page)).toHaveCount(1, { timeout: 30_000 });
      await expect(revealAll(page)).toHaveCount(0);
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
