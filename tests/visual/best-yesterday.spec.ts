import { expect, test, type Page, type Route } from "@playwright/test";

// B1 "Best of yesterday": the cross-league column of last night's best games,
// on the TODAY board. The board's last column is on Auto, so the column puts
// itself there (≥3 qualifying games). Mocked ESPN boards for yesterday + a
// mocked /news/highlights.json make the pool exact:
//   NFL   2 finished, both with a clip        → in
//   WNBA  1 with a clip, 1 without            → 1 in
//   EPL   2 with a clip, 1 postponed          → 2 in
//   MLS   1 with a clip, but MLS is hidden    → out
// = 5 cards. Checked at a phone width and a desktop width, with the card
// layout for a finished day and not one score anywhere in the column's DOM.

const NOW = new Date("2026-09-23T16:00:00-04:00"); // Wed 4 pm ET → yesterday = Tue 9/22
const YESTERDAY = "20260922";

type TeamSpec = { id: string; name: string; abbr: string; score: string };
type Status = "final" | "postponed";

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, status: Status = "final") {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: t.score,
    winner: status === "final" && Number(t.score) > Number((side === "home" ? away : home).score),
    records: [{ summary: "10-5" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: status === "final"
      ? { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } }
      : { displayClock: "0:00", period: 0, type: { name: "STATUS_POSTPONED", state: "post", detail: "Postponed", shortDetail: "Postponed", completed: false } },
    competitions: [{
      competitors: [competitor(home, "home"), competitor(away, "away")],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

// Scores picked to be unmistakable if any of them ever reached the page.
const T = (id: string, name: string, abbr: string, score: string): TeamSpec => ({ id, name, abbr, score });
const BOARDS: Record<string, unknown[]> = {
  "football/nfl": [
    event("501", T("1", "Patriots", "NE", "37"), T("2", "Seahawks", "SEA", "34"), "2026-09-22T00:15:00Z"),
    event("502", T("3", "Lions", "DET", "41"), T("4", "Bears", "CHI", "38"), "2026-09-22T17:00:00Z"),
  ],
  "basketball/wnba": [
    event("601", T("11", "Liberty", "NY", "88"), T("12", "Aces", "LV", "86"), "2026-09-22T23:30:00Z"),
    event("602", T("13", "Sun", "CON", "95"), T("14", "Dream", "ATL", "71"), "2026-09-23T01:00:00Z"),
  ],
  "soccer/eng.1": [
    event("701", T("21", "Arsenal", "ARS", "4"), T("22", "Chelsea", "CHE", "3"), "2026-09-22T19:00:00Z"),
    event("702", T("23", "Everton", "EVE", "5"), T("24", "Fulham", "FUL", "4"), "2026-09-22T19:00:00Z"),
    event("703", T("25", "Brighton", "BHA", "0"), T("26", "Burnley", "BUR", "0"), "2026-09-22T19:00:00Z", "postponed"),
  ],
  "soccer/usa.1": [
    event("801", T("31", "Galaxy", "LA", "6"), T("32", "Sounders", "SEA", "5"), "2026-09-23T02:30:00Z"),
  ],
};

const baked = (matchup: string, channel: string, id: string) => ({
  t: NOW.getTime() - 3_600_000, matchup, official: id, officialChannel: channel, officialDurationSec: 600, sourcePolicy: "official-channel",
});
const HIGHLIGHTS = JSON.stringify({
  fetchedAt: "2026-09-23T14:00:00Z",
  games: {
    "nfl:501": baked("patriots|seahawks", "NFL", "aaaaaaaaa01"),
    "nfl:502": baked("bears|lions", "NFL", "aaaaaaaaa02"),
    "wnba:601": baked("aces|liberty", "WNBA", "aaaaaaaaa03"),
    // wnba:602 has no clip → stays out.
    "epl:701": baked("arsenal|chelsea", "NBC Sports", "aaaaaaaaa04"),
    "epl:702": baked("everton|fulham", "NBC Sports", "aaaaaaaaa05"),
    "epl:703": baked("brighton|burnley", "NBC Sports", "aaaaaaaaa06"), // postponed → out anyway
    "mls:801": baked("galaxy|sounders", "Major League Soccer", "aaaaaaaaa07"), // MLS hidden → out
  },
});

// Matched on each card's accessible name, which keeps full team names at every
// width (a phone column shows abbreviations).
const EXPECTED = ["Patriots at Seahawks", "Lions at Bears", "Liberty at Aces", "Arsenal at Chelsea", "Everton at Fulham"];
const NEVER = ["Sun at Dream", "Brighton at Burnley", "Galaxy at Sounders"];
const SCORES = ["37", "34", "41", "38", "88", "86", "95", "71"];

async function seed(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "nfl",
    secondLeague: "wnba",
    // thirdLeague unset: the last column is on Auto, which is where the
    // column goes.
    fourthLeague: "empty",
    fifthLeague: "empty",
    hiddenLeagues: ["mls"],
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })));
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fallback();
    const events = url.searchParams.get("dates") === YESTERDAY ? (BOARDS[m[1]] ?? []) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/news/highlights.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: HIGHLIGHTS }));
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}

for (const { name, width, height } of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1180, height: 820 },
]) {
  test(`Best of yesterday takes the Auto column on today's board (${name} ${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await seed(page);
    await page.goto("/");

    const col = page.locator('[data-league-column="best"]');
    await expect(col).toBeVisible({ timeout: 30_000 });
    // The last column, after the two pinned ones.
    const order = await page.locator("[data-league-column]").evaluateAll((els) => els.map((e) => e.getAttribute("data-league-column")));
    expect(order).toEqual(["nfl", "wnba", "best"]);

    // Header: the full name where it fits, the short form in a phone column —
    // one line either way.
    const heading = col.getByRole("heading").first();
    await expect(heading).toHaveText(width < 640 ? "Yesterday" : "Best of yesterday");
    const headingBox = await heading.boundingBox();
    expect(headingBox!.height, "the column title wrapped onto a second line").toBeLessThan(32);

    // Five cards, each naming its own league, each with a play button.
    const cards = col.locator("[data-league-tag]");
    await expect(cards).toHaveCount(5, { timeout: 15_000 });
    expect((await cards.allTextContents()).sort()).toEqual(["EPL", "EPL", "NFL", "NFL", "WNBA"]);
    for (const matchup of EXPECTED) await expect(col.getByRole("button", { name: `${matchup} — game details` })).toHaveCount(1);
    for (const matchup of NEVER) await expect(col.getByRole("button", { name: `${matchup} — game details` })).toHaveCount(0);
    const text = (await col.innerText()).replace(/\s+/g, " ");
    // Every card carries a highlight button: the column exists to be played.
    await expect(col.locator('button[aria-label*="ighlight" i], button[title*="ighlight" i]')).toHaveCount(5, { timeout: 15_000 });

    // No score anywhere in the column's DOM — text or attributes — not the
    // fixture numbers and nothing shaped like a result.
    const dom = await col.evaluate((el) => el.outerHTML);
    for (const s of SCORES) expect(dom, `score ${s} leaked into the column`).not.toMatch(new RegExp(`>\\s*${s}\\s*<|\\b${s}\\s*[-–]\\s*\\d|\\d\\s*[-–]\\s*${s}\\b`));
    expect(text).not.toMatch(/\b\d{1,3}\s*[-–]\s*\d{1,3}\b/);

    const shot = await page.screenshot({ fullPage: false });
    await testInfo.attach(`best-yesterday-${width}`, { body: shot, contentType: "image/png" });
    // SHOTS_DIR=… keeps a copy outside test-results for a PR or a read-back.
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/best-yesterday-${width}.png` });
  });
}

test("under three qualifying games the Auto column keeps its league", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page);
  // Only two clips: the NFL pair. Registered after seed(), so it wins.
  const two = JSON.parse(HIGHLIGHTS) as { games: Record<string, unknown> };
  two.games = { "nfl:501": two.games["nfl:501"], "nfl:502": two.games["nfl:502"] };
  await page.route("**/news/highlights.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(two) }));
  await page.goto("/");
  await expect(page.locator('[data-league-column="nfl"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-league-column]")).toHaveCount(3);
  await expect(page.locator('[data-league-column="best"]')).toHaveCount(0);
});

test("Best of yesterday is a today-board column: the yesterday board keeps its Auto league", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await seed(page);
  await page.goto("/yesterday");
  await expect(page.locator('[data-league-column="nfl"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-league-column="best"]')).toHaveCount(0);
});
