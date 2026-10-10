import { expect, test } from "@playwright/test";

// /teams/<league>/<team> (2026-09-26). The schedule is fetched from ESPN on the
// client; that request is mocked here (a live ESPN call is slow/flaky in CI and
// blocked in sandboxes), with a payload that DOES carry a final score and W-L
// records, so the no-score assertions below test the page's stripping rather
// than an empty feed. A functional check, not a screenshot: the title, at least
// one covered card, no score-shaped text in the schedule region, and the three
// JSON-LD nodes the page promises.

const PATH = "/teams/nfl/new-york-giants";
// "24-17", "3 – 1": a scoreline. Dates on the cards are "Sun, Sep 27"-style,
// times "1:00 PM", so neither can match.
const SCORE = /\b\d{1,3}\s*[-–]\s*\d{1,3}\b/;

// ESPN team-schedule shape (score as {value, displayValue}, record as
// [{type, displayValue}], status nested in the competition), one finished game
// and one upcoming, around the fixed clock below.
type Side = { id: string; name: string; short: string; abbr: string; score?: number; record: string };
function scheduleEvent(id: string, date: string, home: Side, away: Side, final: boolean) {
  const competitor = (t: Side, homeAway: "home" | "away") => ({
    id: t.id,
    homeAway,
    ...(final ? { winner: (t.score ?? 0) > ((homeAway === "home" ? away : home).score ?? 0) } : {}),
    team: { id: t.id, displayName: t.name, shortDisplayName: t.short, abbreviation: t.abbr, logos: [{ href: "", rel: ["full", "default"] }] },
    ...(final ? { score: { value: t.score, displayValue: String(t.score) } } : {}),
    record: [{ type: "total", displayValue: t.record }],
  });
  const status = final
    ? { period: 4, displayClock: "0:00", type: { name: "STATUS_FINAL", state: "post", completed: true, detail: "Final", shortDetail: "Final" } }
    : { period: 0, displayClock: "0:00", type: { name: "STATUS_SCHEDULED", state: "pre", completed: false, detail: "Sun, October 11th at 1:00 PM EDT", shortDetail: "10/11 - 1:00 PM EDT" } };
  return {
    id,
    date,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { year: 2026, displayName: "2026" },
    seasonType: { id: "2", type: 2, name: "Regular Season", abbreviation: "reg" },
    competitions: [{
      id,
      date,
      status,
      competitors: [competitor(home, "home"), competitor(away, "away")],
      broadcasts: [{ media: { shortName: "FOX" } }],
      notes: [],
    }],
  };
}
const NYG = { id: "19", name: "New York Giants", short: "Giants", abbr: "NYG", record: "2-3" };
const GIANTS_2026 = {
  events: [
    scheduleEvent("401990001", "2026-10-04T17:00Z",
      { id: "18", name: "New Orleans Saints", short: "Saints", abbr: "NO", score: 24, record: "3-2" },
      { ...NYG, score: 17 }, true),
    scheduleEvent("401990002", "2026-10-11T17:00Z",
      { ...NYG },
      { id: "21", name: "Philadelphia Eagles", short: "Eagles", abbr: "PHI", record: "4-1" }, false),
  ],
};

test("NFL team page: title, covered cards, no score, JSON-LD", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-09T12:00:00-04:00"));
  await page.route("**/football/nfl/teams/19/schedule**", route => {
    const u = new URL(route.request().url());
    const regular2026 = u.searchParams.get("season") === "2026" && u.searchParams.get("seasontype") === "2";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(regular2026 ? GIANTS_2026 : { events: [] }) });
  });
  // Standings fill records/ranks onto the cards; the page must strip them, and
  // an empty table keeps the fetch off the network.
  await page.route("**/football/nfl/standings**", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await page.goto(PATH);
  // Title copy changed on purpose in #293 (query-first "Score & Schedule").
  await expect(page).toHaveTitle("New York Giants Score & Schedule Without Spoilers | HideScore");

  const region = page.locator("[data-team-schedule]");
  await expect(region.locator("[data-team-game]").first()).toBeVisible({ timeout: 30_000 });
  const cards = await region.locator("[data-team-game]").count();
  expect(cards).toBeGreaterThanOrEqual(1);
  // The finished game (its score is in the payload) is one of them.
  await expect(region.locator('[data-team-game="post"]')).toHaveCount(1);
  expect(cards).toBeLessThanOrEqual(10);

  // Ratings on too, so a finished card renders everything it can.
  await region.getByRole("button", { name: "Show ratings" }).click();
  const text = await region.innerText();
  expect(text).not.toMatch(SCORE);
  expect(text).not.toMatch(/(^|\s)[WL](\s|$)/m);
  expect(text.toLowerCase()).not.toContain("record");

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = new Set<string>();
  for (const raw of blocks) {
    const data = JSON.parse(raw);
    for (const node of data["@graph"] ?? [data]) types.add(node["@type"]);
  }
  expect(types).toContain("SportsTeam");
  expect(types).toContain("FAQPage");
  expect(types).toContain("BreadcrumbList");
});
