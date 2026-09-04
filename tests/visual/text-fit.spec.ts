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

// ── The font step has to reach the DOM, not just the component's state ──────
//
// Every case above resolves by SHORTENING (the race has a variants ladder), so
// the whole suite only ever exercised answers of `size: null` — and `null`
// re-clears the same empty inline style the measure pass had just cleared. The
// one path it never covered was the one that matters: a line with nothing left
// to drop, which has to shrink the FONT.
//
// That path was broken. `measure` clears node.style.fontSize to read the size
// cap off the DOM, and React only rewrites that style when `fit` actually
// changes — so the second pass, which lands on the same answer, bailed out of
// setFit, rendered nothing, and left the cleared size in place. Shrinking the
// font changes the span's height, the ResizeObserver re-measures, and the fit
// undid itself: "Triton Super High Roller · Jeju" measured a clean 12px fit on
// every pass and still painted clipped at 14px (Jacob 9/4).
//
// So this asserts BOTH halves — the line fits, and it is genuinely smaller than
// the size its class asks for. Checking "not clipped" alone would have passed
// with a shortened variant and missed the bug entirely.
function unshortenablePokerSeries() {
  return JSON.stringify({
    schemaVersion: 1,
    verifiedAt: "2026-08-06",
    coverage: ["WSOP", "WPT", "EPT", "Triton"],
    events: [{
      id: "triton-fit-2026",
      tour: "Triton",
      // No " · " tail, and no segment the venue repeats, so pokerTitleVariants
      // has exactly one rung and the ladder MUST fall through to the font step.
      // Long enough that 14px overflows, short enough that the ladder lands
      // inside its 11px floor — the band where a step is the RIGHT answer.
      // Past the floor, truncation is the documented last resort, not a bug.
      title: "Invitational Super High Roller Series",
      startDate: "2026-08-08",
      endDate: "2026-08-14",
      location: "Shinhwa World",
      broadcasts: ["Triton Poker"],
      eventUrl: "https://www.tritonpokerseries.com/en-US/",
      officialChannel: "Triton Poker",
      officialLabel: "Triton",
      highlightQuery: "Triton highlights",
      priority: 90,
    }],
  });
}

test("a tile title with nothing to shorten shrinks in the DOM instead of clipping", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-10T16:00:00-04:00"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await setLeagues(page, ["poker", "mlb"]);
  await page.route("**/poker-events.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: unshortenablePokerSeries(),
  }));
  await page.route("**/baseball/mlb/scoreboard**", route => route.fulfill({
    status: 200, contentType: "application/json", body: longNamedGames(),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  await expect.poll(async () => (await fittedLines(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);

  const title = (await fittedLines(page)).find((l) => l.kind === "title" && l.text.includes("Super High Roller"));
  expect(title, "the poker tile rendered no title line").toBeTruthy();
  expect(title!.overflowPx, `title "${title!.text}" is cut off by ${title!.overflowPx}px`).toBeLessThanOrEqual(0);
  // text-sm is 14px; anything at 14 means the measured step never landed.
  expect(title!.fontPx, "the fitted size never reached the DOM").toBeLessThan(14);
});

// ── The narrow board wraps instead of clipping, and pays for it in place ─────
//
// A 122px card (three columns on a 414px phone) has no size at which a real
// event name fits on one line: "Triton Super High Roller · Jeju" still clipped
// sitting at the 11px floor, and shortening it far enough to fit meant dropping
// the tour's own name. So the compact tile wraps to two lines — under one
// condition, which is the whole test: "only if its same height of a card as 1
// mlb card" (Jacob 9/4). The second line is traded out of the meta row above,
// not added to the card.
//
// The horizontal check in the tests above cannot catch a regression here: a
// wrapped line's scrollWidth always equals its clientWidth, so a -webkit-line-clamp
// that bites looks identical to text that fits. Assert the VERTICAL overflow,
// the full string, and the height parity together.
test("the 3-column phone tile wraps the whole name at MLB card height", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-04T16:00:00-04:00"));
  await page.setViewportSize({ width: 414, height: 900 });
  await setLeagues(page, ["poker", "mlb"]);
  // A third column is what squeezes the board to .ns-board-tight.
  await page.addInitScript(() => {
    const raw = localStorage.getItem("nss-preferences");
    if (!raw) return;
    localStorage.setItem("nss-preferences", JSON.stringify({
      ...JSON.parse(raw), favoriteLeagues: ["poker", "mlb", "nfl"], thirdLeague: "nfl",
    }));
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  await expect.poll(async () => (await fittedLines(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);

  const tile = await page.evaluate(() => {
    const title = [...document.querySelectorAll<HTMLElement>('[data-fit-line="title"]')]
      .find((el) => /Super High Roller/.test(el.textContent ?? ""));
    if (!title) return null;
    const card = title.closest<HTMLElement>("div.rounded-lg");
    const mlb = [...document.querySelectorAll<HTMLElement>("div.rounded-lg")]
      .find((el) => el.style.background.includes("--bg-card") && el.querySelector(".team-name"));
    return {
      text: title.textContent ?? "",
      full: title.getAttribute("title") ?? "",
      clampedPx: title.scrollHeight - title.clientHeight,
      clippedPx: title.scrollWidth - title.clientWidth,
      cardH: Math.round(card!.getBoundingClientRect().height),
      cardW: Math.round(card!.getBoundingClientRect().width),
      mlbH: mlb ? Math.round(mlb.getBoundingClientRect().height) : null,
    };
  });

  expect(tile, "no poker tile on the board").toBeTruthy();
  expect(tile!.cardW, "this board is not the tight one this test is about").toBeLessThan(155);
  expect(tile!.text, "the tile dropped part of the name").toBe(tile!.full);
  expect(tile!.clippedPx, "the title still overflows sideways").toBeLessThanOrEqual(0);
  // Tolerance, not zero: a -webkit-box reports scrollHeight 1px over its own
  // two 14px line boxes from font-metric rounding, with nothing actually hidden.
  // What this has to catch is a THIRD line being clamped away, which shows up as
  // a full line-height (14px) of overflow — an order of magnitude above the noise.
  expect(tile!.clampedPx, `line-clamp cut ${tile!.clampedPx}px off the bottom of the title`).toBeLessThan(7);
  expect(tile!.mlbH, "no MLB card to compare against").toBeTruthy();
  expect(tile!.cardH, "the wrapped tile no longer matches an MLB card's height").toBe(tile!.mlbH);
});
