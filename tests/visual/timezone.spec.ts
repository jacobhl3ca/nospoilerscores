import { expect, test, type Page, type Route } from "@playwright/test";

// Start times follow the Time zone setting (Jacob 10/4). ESPN's status text
// carries an Eastern clock ("10/6 - 8:00 PM EDT") and the cards used to print
// it as is, so NFL / NCAAF read Eastern in every zone. Matrix: the browser's
// own zone × the Settings pick, each card's day label + clock, and the day
// the board asks ESPN for as "today". Then a zone change in the open panel
// moves the cards with no reload, a reload keeps it, and Auto goes back to
// the device zone.

const NOW = new Date("2026-10-04T12:00:00-04:00"); // Sun noon ET

type TeamSpec = { id: string; name: string; abbr: string };
const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });

function event(id: string, away: TeamSpec, home: TeamSpec, iso: string, shortDetail: string) {
  const competitor = (t: TeamSpec, side: "home" | "away") => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score: "0",
    records: [{ summary: "3-1" }],
  });
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: shortDetail, shortDetail, completed: false } },
    competitions: [{
      date: iso,
      competitors: [competitor(home, "home"), competitor(away, "away")],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

// Each game is filed under its Eastern day, the way ESPN files it.
const BOARDS: Record<string, { day: string; ev: unknown }[]> = {
  "football/college-football": [
    { day: "20261006", ev: event("c1", T("1", "Southern Miss", "USM"), T("2", "Troy", "TROY"), "2026-10-07T00:00Z", "10/6 - 8:00 PM EDT") },
  ],
  "football/nfl": [
    { day: "20261008", ev: event("f1", T("11", "Chiefs", "KC"), T("12", "Jaguars", "JAX"), "2026-10-09T00:15Z", "10/8 - 8:15 PM EDT") },
  ],
  "soccer/usa.1": [
    { day: "20261007", ev: event("s1", T("21", "Red Bulls", "NY"), T("22", "Galaxy", "LA"), "2026-10-07T23:30Z", "Scheduled") },
  ],
  "basketball/wnba": [
    // A playoff "If necessary" slot: midnight-ET date, no clock.
    { day: "20261009", ev: event("w1", T("31", "Liberty", "NY"), T("32", "Aces", "LV"), "2026-10-09T04:00Z", "10/9 - TBD") },
  ],
};

const CARDS = {
  ncaaf: "Southern Miss at Troy — game details",
  nfl: "Chiefs at Jaguars — game details",
  mls: "Red Bulls at Galaxy — game details",
  wnba: "Liberty at Aces — game details",
};

// Expected text per effective zone. "Today" there: NY/LA/Kolkata Sun 10/4,
// Tokyo already Mon 10/5 (1 AM), so its day labels move a day on.
const EXPECT: Record<string, { today: string; ncaaf: string; nfl: string; mls: string }> = {
  "America/New_York": { today: "20261004", ncaaf: "Tue 10/6 - 8:00PM", nfl: "Thu 10/8 - 8:15PM", mls: "Wed 10/7 - 7:30PM" },
  "America/Los_Angeles": { today: "20261004", ncaaf: "Tue 10/6 - 5:00PM", nfl: "Thu 10/8 - 5:15PM", mls: "Wed 10/7 - 4:30PM" },
  "Asia/Tokyo": { today: "20261005", ncaaf: "Wed 10/7 - 9:00AM", nfl: "Fri 10/9 - 9:15AM", mls: "Thu 10/8 - 8:30AM" },
  "Asia/Kolkata": { today: "20261004", ncaaf: "Wed 10/7 - 5:30AM", nfl: "Fri 10/9 - 5:45AM", mls: "Thu 10/8 - 5:00AM" },
};

async function seed(page: Page, timezone?: string): Promise<string[]> {
  const asked: string[] = [];
  await page.clock.setFixedTime(NOW);
  // Seed once: a reload must keep what the panel saved.
  await page.addInitScript((timezone) => {
    if (localStorage.getItem("nss-preferences")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [],
      favoriteTeams: [],
      theme: "light",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      firstLeague: "ncaaf",
      secondLeague: "nfl",
      thirdLeague: "mls",
      fourthLeague: "wnba",
      fifthLeague: "empty",
      hiddenLeagues: ["best"],
      defaultDateMode: "today",
      defaultLandingView: "scores",
      ...(timezone ? { timezone } : {}),
    }));
  }, timezone);
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const dates = url.searchParams.get("dates") ?? "";
    if (m[1] === "football/nfl") asked.push(dates);
    const [from, to = from] = dates.split("-");
    const events = (BOARDS[m[1]] ?? []).filter((b) => b.day >= from && b.day <= to).map((b) => b.ev);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  return asked;
}

const cardText = async (page: Page, name: string) =>
  (await page.getByRole("button", { name, exact: true }).innerText()).replace(/\s+/g, " ");

async function expectCards(page: Page, zone: string) {
  const want = EXPECT[zone];
  for (const key of ["ncaaf", "nfl", "mls"] as const) {
    await expect.poll(() => cardText(page, CARDS[key]), { timeout: 20_000, message: `${zone} ${key}` }).toContain(want[key]);
  }
  await expect.poll(() => cardText(page, CARDS.wnba), { timeout: 20_000 }).toContain("TBD");
}

const MATRIX: { browser: string; pref?: string; zone: string }[] = [
  { browser: "America/New_York", zone: "America/New_York" },
  { browser: "America/New_York", pref: "America/Los_Angeles", zone: "America/Los_Angeles" },
  { browser: "America/Los_Angeles", zone: "America/Los_Angeles" },
  { browser: "America/Los_Angeles", pref: "America/New_York", zone: "America/New_York" },
  { browser: "Asia/Tokyo", zone: "Asia/Tokyo" },
  { browser: "America/New_York", pref: "Asia/Kolkata", zone: "Asia/Kolkata" },
];

for (const c of MATRIX) {
  test.describe(`browser ${c.browser} × pref ${c.pref ?? "none"}`, () => {
    test.use({ timezoneId: c.browser, viewport: { width: 1440, height: 900 } });
    test(`cards and today follow ${c.zone}`, async ({ page }) => {
      const asked = await seed(page, c.pref);
      await page.goto("/");
      await expectCards(page, c.zone);
      // The board's first NFL pull is "today" in the effective zone.
      expect(asked[0]).toBe(EXPECT[c.zone].today);
      await expect(page.getByRole("button", { name: "Today", exact: true }).first()).toHaveAttribute("aria-current", "date");
    });
  });
}

test.describe("zone change in the open panel", () => {
  test.use({ timezoneId: "America/New_York", viewport: { width: 1440, height: 900 } });
  test("applies at once, survives a reload, Auto goes back to the device zone", async ({ page }) => {
    const asked = await seed(page);
    await page.goto("/");
    await expectCards(page, "America/New_York");
    await page.evaluate(() => { (window as unknown as { __sameLoad: number }).__sameLoad = 1; });

    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.locator("summary", { hasText: "More settings" }).click();
    await dialog.getByRole("group", { name: "Time zone", exact: true }).getByRole("button", { name: "Other…" }).click();
    await dialog.getByLabel("All time zones").selectOption("Asia/Tokyo");
    // The cards behind the panel move with no reload, and the board pulls
    // Tokyo's today.
    await expectCards(page, "Asia/Tokyo");
    expect(await page.evaluate(() => (window as unknown as { __sameLoad?: number }).__sameLoad)).toBe(1);
    await expect.poll(() => asked.includes("20261005")).toBe(true);

    await page.reload();
    await expectCards(page, "Asia/Tokyo");

    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await dialog.locator("summary", { hasText: "More settings" }).click();
    await dialog.getByRole("group", { name: "Time zone", exact: true }).getByRole("button", { name: /^Auto/ }).click();
    await expectCards(page, "America/New_York");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
    expect("timezone" in saved).toBe(false);
  });
});
