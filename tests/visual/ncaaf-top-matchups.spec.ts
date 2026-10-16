import { expect, test, type Page, type Route } from "@playwright/test";

// College football top matchups (lib/rankedMatchupSort.ts): with the monkey
// on, the NCAAF column puts pre-game cards with both teams ranked first, by
// the sum of the two poll ranks, then one-ranked games, then the unranked
// games in record order. With the monkey off, the column stays in kickoff
// order. A Saturday slate with kickoffs deliberately out of rank order.

const NOW = new Date("2026-10-03T07:00:00-04:00"); // Sat 7 AM ET, all games pre

type Side = { id: string; name: string; abbr: string; rank: number | null; record: string };
const S = (id: string, name: string, abbr: string, rank: number | null, record: string): Side => ({ id, name, abbr, rank, record });

// Kickoff order. Rank sums: #3+#7 = 10, #12+#5 = 17, #8+#10 = 18, #2+#20 = 22.
const SLATE: { id: string; away: Side; home: Side; iso: string }[] = [
  { id: "401920001", away: S("2116", "UCF Knights", "UCF", null, "4-0"), home: S("2633", "Tulane Green Wave", "TULN", null, "4-0"), iso: "2026-10-03T16:00Z" },
  { id: "401920002", away: S("2306", "Kansas State Wildcats", "KSU", null, "2-2"), home: S("251", "Texas Longhorns", "TEX", 1, "4-0"), iso: "2026-10-03T16:30Z" },
  { id: "401920003", away: S("333", "Alabama Crimson Tide", "ALA", 7, "3-1"), home: S("61", "Georgia Bulldogs", "UGA", 3, "4-0"), iso: "2026-10-03T19:30Z" },
  { id: "401920004", away: S("99", "LSU Tigers", "LSU", 8, "4-0"), home: S("145", "Ole Miss Rebels", "MISS", 10, "4-0"), iso: "2026-10-03T20:00Z" },
  { id: "401920005", away: S("2", "Auburn Tigers", "AUB", 20, "3-1"), home: S("194", "Ohio State Buckeyes", "OSU", 2, "4-0"), iso: "2026-10-03T21:00Z" },
  { id: "401920006", away: S("2483", "Oregon Ducks", "ORE", 5, "4-0"), home: S("130", "Michigan Wolverines", "MICH", 12, "3-1"), iso: "2026-10-03T23:30Z" },
  { id: "401920007", away: S("150", "Duke Blue Devils", "DUKE", null, "1-3"), home: S("2390", "Miami Hurricanes", "MIA", 24, "3-1"), iso: "2026-10-04T00:00Z" },
];
const label = (g: (typeof SLATE)[number]) => `${g.away.name} at ${g.home.name}`;
const byId = (id: string) => label(SLATE.find((g) => g.id === id)!);

function event(g: (typeof SLATE)[number]) {
  const competitor = (t: Side, homeAway: "home" | "away") => ({
    homeAway,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: "0",
    records: [{ summary: t.record }],
    // ESPN marks an unranked team with 99.
    curatedRank: { current: t.rank ?? 99 },
  });
  const shortDetail = "10/3 - TBD";
  return {
    id: g.id,
    date: g.iso,
    name: label(g),
    shortName: `${g.away.abbr} @ ${g.home.abbr}`,
    season: { type: 2, year: 2026 },
    status: { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: shortDetail, shortDetail, completed: false } },
    competitions: [{
      id: g.id,
      date: g.iso,
      competitors: [competitor(g.home, "home"), competitor(g.away, "away")],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

async function openBoard(page: Page, showRatings: boolean) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => { if (!localStorage.getItem("nss-preferences")) localStorage.setItem("nss-preferences", JSON.stringify(p)); }, {
    favoriteLeagues: [], favoriteTeams: [], theme: "dark", showRatings, defaultRatings: showRatings ? "on" : "off",
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    firstLeague: "ncaaf", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
    hiddenLeagues: ["best"], defaultDateMode: "today", defaultLandingView: "scores",
  });
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const [from, to = from] = (url.searchParams.get("dates") ?? "").split("-");
    const events = m[1] === "football/college-football" && from <= "20261003" && to >= "20261003" ? SLATE.map(event) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  await page.route(/gc\.zgo\.at|stats\.hidescore\.com|goatcounter|sentry\.io/, (r) => r.abort());
  await page.goto("/");
}

// The card names in column order, as each card's accessible name reads.
const NAMES = new RegExp(`^(?:${SLATE.map(label).join("|")})`);
async function cardOrder(page: Page): Promise<string[]> {
  const col = page.locator('[data-league-column="ncaaf"]');
  await expect(col.getByRole("button", { name: NAMES })).toHaveCount(SLATE.length, { timeout: 30_000 });
  const names = await col.getByRole("button", { name: NAMES }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return names.map((n) => SLATE.map(label).find((l) => n.startsWith(l))!);
}

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("top matchups: the three lowest combined-rank games lead, in order", async ({ page }) => {
      await openBoard(page, true);
      const order = await cardOrder(page);
      expect(order.slice(0, 3)).toEqual([byId("401920003"), byId("401920006"), byId("401920004")]);
      // Then #2 vs #20, then one-ranked (#1, #24), then the unranked game.
      expect(order.slice(3)).toEqual([byId("401920005"), byId("401920002"), byId("401920007"), byId("401920001")]);
    });

    test("chronological mode keeps kickoff order", async ({ page }) => {
      await openBoard(page, false);
      expect(await cardOrder(page)).toEqual(SLATE.map(label));
    });
  });
}
