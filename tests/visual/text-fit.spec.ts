import { expect, test, type Page } from "@playwright/test";

// Holds TWO invariants about tile text, both of which have shipped broken more
// than once:
//
//   1. A single-event tile (races, boxing, chess, poker) never renders a
//      CLIPPED title or venue line. It has one line beside a glyph and nothing
//      else on it, so a long name had no way out and just cut off — "Heineken
//      Dutch Grand …" over "Circuit Park Zandvoort · Zan…" (Jacob 8/10). On a
//      race tile the clipped tail is the identity of the race, which makes
//      truncation the worst available outcome. EventCard's FittedLine shortens,
//      then shrinks, before it will ever truncate; this asserts the result.
//
//   2. No tile text is EVER larger than the team names on the cards beside it.
//      The fit ladder only ever steps DOWN from the class's own size, and that
//      ceiling is the thing to guard: "the event tile is bigger than MLB" is a
//      recurring report, and the failure mode of a fit-to-width routine is
//      always to grow.
//
// DOM measurements, not screenshots — a pixel baseline would churn on every
// unrelated style change, which is why card-height-parity.spec.ts is written
// the same way.

async function setLeagues(page: Page, leagues: string[]) {
  await page.addInitScript((favs) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: favs,
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: favs[0],
    secondLeague: favs[1] ?? "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })), leagues);
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"games":{}}',
  }));
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
}

// The longest-named round on the 2026 F1 calendar, verbatim from ESPN — the
// exact payload that produced the clipped screenshot. Sponsor + country + the
// circuit whose own name repeats its city.
function dutchGrandPrix() {
  return JSON.stringify({
    events: [{
      id: "600001",
      date: "2026-08-23T13:00Z",
      name: "Heineken Dutch Grand Prix",
      shortName: "Heineken Dutch GP",
      circuit: { fullName: "Circuit Park Zandvoort", address: { city: "Zandvoort", country: "Netherlands" } },
      links: [{ href: "https://www.espn.com/f1/race/_/id/600001" }],
      status: { type: { state: "pre" } },
      competitions: [{
        type: { id: "3" },
        date: "2026-08-23T13:00Z",
        status: { type: { state: "pre" } },
        broadcasts: [{ names: ["ESPN"] }],
      }],
    }],
  });
}

// A finished MLB slate whose team names are the longest in the league, so the
// team-name ceiling is measured against something real rather than "NYY".
function longNamedGames() {
  const team = (id: string, name: string, abbr: string) => ({
    id, displayName: name, shortDisplayName: name, abbreviation: abbr, score: "0",
    logo: "", color: "666666",
  });
  const event = (id: string, away: ReturnType<typeof team>, home: ReturnType<typeof team>) => ({
    id,
    date: "2026-08-10T23:00:00Z",
    name: `${away.displayName} at ${home.displayName}`,
    shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    season: { type: 2 },
    status: { displayClock: "0:00", period: 9, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "7:00 PM ET", shortDetail: "7:00 PM ET", completed: false } },
    competitions: [{
      date: "2026-08-10T23:00:00Z",
      competitors: [
        { homeAway: "home", team: home, score: "0", records: [{ summary: "60-55" }] },
        { homeAway: "away", team: away, score: "0", records: [{ summary: "55-60" }] },
      ],
      broadcasts: [], headlines: [], notes: [],
    }],
  });
  return JSON.stringify({
    events: [event("700001", team("az", "Diamondbacks", "ARI"), team("wsh", "Nationals", "WSH"))],
  });
}

// Every fitted line on the board, with the numbers both invariants need.
// scrollWidth > clientWidth is exactly the condition `truncate` paints an
// ellipsis for, so it IS the definition of "cut off" here.
async function fittedLines(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-fit-line]")].map((el) => ({
      kind: el.getAttribute("data-fit-line") ?? "",
      text: (el.textContent ?? "").trim(),
      overflowPx: el.scrollWidth - el.clientWidth,
      fontPx: parseFloat(getComputedStyle(el).fontSize),
    })),
  );
}

async function maxTeamNamePx(page: Page) {
  return page.evaluate(() => {
    const sizes = [...document.querySelectorAll<HTMLElement>(".team-name")]
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((n) => Number.isFinite(n));
    return sizes.length ? Math.max(...sizes) : 0;
  });
}

// 1280 = the default desktop board; 430 = a large phone (2-column); 360 = the
// tight 3-column mobile board (.ns-board-tight), the width the screenshot came
// from and the one with ~100px of card to work with.
const WIDTHS = [1280, 430, 360];

for (const width of WIDTHS) {
  test(`a race tile shows its whole name and venue at ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-10T16:00:00-04:00"));
    await page.setViewportSize({ width, height: 900 });
    await setLeagues(page, ["f1", "mlb"]);
    await page.route("**/racing/f1/scoreboard**", route => route.fulfill({
      status: 200, contentType: "application/json", body: dutchGrandPrix(),
    }));
    await page.route("**/baseball/mlb/scoreboard**", route => route.fulfill({
      status: 200, contentType: "application/json", body: longNamedGames(),
    }));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "F1" })).toBeVisible();
    // Wait for the fit pass to settle before measuring — it runs on rAF after
    // the commit, exactly like the fighter-name and golf measurements.
    await expect.poll(async () => (await fittedLines(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(250);

    const lines = await fittedLines(page);
    for (const line of lines) {
      expect(line.overflowPx, `${line.kind} "${line.text}" is cut off by ${line.overflowPx}px at ${width}px`)
        .toBeLessThanOrEqual(0);
    }

    // Whatever the ladder settled on, the race is still NAMED. "Heineken Dutch
    // Grand Prix" → "Heineken Dutch GP" → "Dutch GP" all keep "Dutch"; a
    // shortening that lost it would be a different race.
    const title = lines.find((l) => l.kind === "title");
    expect(title, "the race tile rendered no title line").toBeTruthy();
    expect(title!.text).toContain("Dutch");
    // And the venue line still names the CIRCUIT, not just its city.
    const subtitle = lines.find((l) => l.kind === "subtitle");
    expect(subtitle!.text).toContain("Zandvoort");
  });

  test(`tile text never outgrows the team names beside it at ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-10T16:00:00-04:00"));
    await page.setViewportSize({ width, height: 900 });
    await setLeagues(page, ["f1", "mlb"]);
    await page.route("**/racing/f1/scoreboard**", route => route.fulfill({
      status: 200, contentType: "application/json", body: dutchGrandPrix(),
    }));
    await page.route("**/baseball/mlb/scoreboard**", route => route.fulfill({
      status: 200, contentType: "application/json", body: longNamedGames(),
    }));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "F1" })).toBeVisible();
    await expect.poll(async () => (await fittedLines(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(250);

    const cap = await maxTeamNamePx(page);
    expect(cap, "no .team-name on the board to measure the ceiling against").toBeGreaterThan(0);
    // 1rem is the largest team-name size the app defines anywhere (the
    // single-column .ns-cards-lg board); nothing may exceed it, ever.
    expect(cap).toBeLessThanOrEqual(16);
    for (const line of await fittedLines(page)) {
      expect(line.fontPx, `${line.kind} renders at ${line.fontPx}px, above the ${cap}px team-name ceiling`)
        .toBeLessThanOrEqual(cap);
    }
  });
}
