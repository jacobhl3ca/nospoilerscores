import { expect, test, type Page } from "@playwright/test";

// The MLB card is the height every finished card should be.
//
// A finished card's action row (the highlight buttons) is the whole difference
// between a card with a clip and one without. Two rules have fought over it:
//
//   f2deaf2d (8/9)  reserved the row on every finished card so a mixed column
//                   lined up. On a slate where NOTHING resolves — a whole MLB
//                   column before the recaps land — that put a permanently blank
//                   27px band under every card ("bigger box not until it has
//                   actual highlight", Jacob 8/10), so
//   f8522ad5 (8/11) took it back, and this spec asserted the no-highlight card
//                   is SHORTER by one row. Then 9/5: "the MLB cards height [is]
//                   the height each card should be … I still see other leagues
//                   cards being smaller" — the yesterday board, MLB's 3m/10m
//                   beside college games whose clip never comes.
//
// The rule now (globals.css `.hl-slot`): a finished card reserves the row the
// moment ANY card on the board has earned one, and not before. So these assert
// three things — a mixed slate lines up, a slate where nothing resolves stays
// collapsed (the 8/10 rule survives), and the floor crosses columns (the 9/5
// screenshot: MLB with clips beside a college column without).
//
// DOM-measurement tests, not screenshots — a pixel baseline would churn on
// every unrelated style change.

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
    defaultDateMode: "yesterday",
    defaultLandingView: "scores",
  })), leagues);
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"games":{}}',
  }));
}

// Two finished games on one slate, named so a highlight mock can resolve one
// and not the other — the exact mixed column that used to go ragged.
function twoFinishedGames(names: [string, string, string, string], idBase = 900001, startIso = "2026-08-06T02:00:00Z", conferenceId?: string) {
  const team = (id: string, name: string, abbr: string, score: string) => ({
    id, displayName: name, shortDisplayName: name, abbreviation: abbr, score,
    logo: "", color: "666666",
    ...(conferenceId ? { conferenceId } : {}),
  });
  const event = (id: string, away: ReturnType<typeof team>, home: ReturnType<typeof team>) => ({
    id,
    date: startIso,
    name: `${away.displayName} at ${home.displayName}`,
    shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 4,
      type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
    },
    competitions: [{
      competitors: [
        { homeAway: "home", team: home, score: home.score, winner: true, records: [{ summary: "1-0" }] },
        { homeAway: "away", team: away, score: away.score, winner: false, records: [{ summary: "0-1" }] },
      ],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  });
  const [a, b, c, d] = names;
  return JSON.stringify({
    events: [
      event(String(idBase), team(`${idBase}a`, a, a.slice(0, 3).toUpperCase(), "80"), team(`${idBase}b`, b, b.slice(0, 3).toUpperCase(), "90")),
      event(String(idBase + 1), team(`${idBase}c`, c, c.slice(0, 3).toUpperCase(), "70"), team(`${idBase}d`, d, d.slice(0, 3).toUpperCase(), "75")),
    ],
  });
}

type Measured = { name: string; height: number; slot: number | null; btnRow: number | null; hasBtn: boolean; lastRowText: string };

// Height of each game card, its action slot, and — when it has one — the real
// button row (margin + button), identified by away team. The card root is the
// element carrying the "… game details" accessible name.
async function measuredCards(page: Page): Promise<Measured[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')].map((card) => {
      const slot = card.querySelector<HTMLElement>(":scope > .hl-slot");
      const btn = slot?.querySelector<HTMLElement>(".highlight-btn") ?? null;
      const row = btn?.parentElement ?? null;
      const last = card.lastElementChild as HTMLElement | null;
      const btnRow = row && slot
        ? Math.round(row.getBoundingClientRect().bottom - slot.getBoundingClientRect().top)
        : null;
      return {
        name: (card.getAttribute("aria-label") ?? "").split(" at ")[0],
        height: Math.round(card.getBoundingClientRect().height),
        slot: slot ? Math.round(slot.getBoundingClientRect().height) : null,
        btnRow,
        hasBtn: !!btn,
        lastRowText: (last?.innerText ?? "").trim(),
      };
    }),
  );
}

function resolveOnly(page: Page, awayName: string) {
  return page.route("**/api/youtube?**", route => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    return q.includes(awayName)
      ? route.fulfill({ status: 200, contentType: "application/json", body: '{"videoId":"GuBBEFjoDw8"}' })
      : route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' });
  });
}

test("a finished card with no highlight reserves the row once a neighbour has one — same height", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setLeagues(page, ["wnba"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"]),
  }));
  // Resolve a video for the Aces game only. The Fever game gets nothing.
  await resolveOnly(page, "Aces");

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "WNBA highlights" })).toHaveCount(1);

  await expect.poll(async () => {
    const [withVideo, without] = await measuredCards(page);
    return withVideo && without ? withVideo.height === without.height : null;
  }, { timeout: 15_000 }).toBe(true);

  const [withVideo, without] = await measuredCards(page);
  expect(withVideo.hasBtn).toBe(true);
  expect(without.hasBtn).toBe(false);
  // The reserve is exactly the real button row — margin plus button — measured
  // off the card that has one, so the two can never drift apart by a pixel.
  expect(withVideo.btnRow).toBeGreaterThan(20);
  expect(withVideo.slot).toBe(withVideo.btnRow);
  expect(without.slot).toBe(withVideo.btnRow);
  // And the short card ends on its (empty) slot, not on a phantom button.
  expect(without.lastRowText).toBe("");
});

test("a slate where nothing resolves reserves no row anywhere — the 8/10 rule", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setLeagues(page, ["wnba"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"]),
  }));
  await page.route("**/api/youtube?**", route =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  await expect(page.getByRole("button", { name: /highlights/i })).toHaveCount(0);
  // Let the resolvers finish so a late "missing" can't sneak a row in.
  await page.waitForTimeout(1500);

  const cards = await measuredCards(page);
  expect(cards).toHaveLength(2);
  expect(cards[0].height).toBe(cards[1].height);
  for (const card of cards) {
    // Equal because BOTH collapsed: the slot is there and it is empty.
    expect(card.slot).toBe(0);
    expect(card.hasBtn).toBe(false);
  }
});

// ── …and the row is NOT reserved while the clip is merely not due yet ────────
//
// The reserve answers "this card will never get a button". It must not answer
// "not yet": a highlight is gated for hours after the start (highlightBufferHours
// — 3.5 for the WNBA, 4 for tennis), so a match that just went final on TODAY's
// board would otherwise wear an empty band all afternoon while its clip is still
// being cut. Jacob 9/6, the US Open finals: "reserved row i dont think needed?
// maybe normal mlb height until highlights are ready". GameHighlights marks that
// window with [data-hl-pending] and globals.css exempts it.
test("a clip that is not due yet reserves nothing, even beside a card that has one", async ({ page }) => {
  // 4:00 PM ET. The WNBA games tipped at 2:00 PM ET → 3.5h buffer closes at
  // 5:30 PM, so their clips are PENDING. MLS kicked off at 8:00 AM → long open.
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setLeagues(page, ["wnba", "mls"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"], 900001, "2026-08-06T18:00:00Z"),
  }));
  await page.route("**/soccer/usa.1/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Galaxy", "Sounders", "Union", "Crew"], 910001, "2026-08-06T12:00:00Z"),
  }));
  await resolveOnly(page, "Galaxy");

  await page.goto("/today");
  // 15s, not the 5s default: the today board mounts more than /yesterday and a
  // cold dev server can take its time on the first paint (flaked at 5s).
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  // Wait on the CARD, not a button label — the MLS button is named for the
  // league's full name ("Major League Soccer highlights") on this board.
  await expect.poll(async () => {
    const cards = await measuredCards(page);
    return cards.find((c) => c.name.includes("Galaxy"))?.hasBtn ?? null;
  }, { timeout: 15_000 }).toBe(true);
  // Let every resolver settle so a late arrival can't fake the collapse.
  await page.waitForTimeout(1500);

  const cards = await measuredCards(page);
  const galaxy = cards.find((c) => c.name.includes("Galaxy"))!;
  const pending = cards.filter((c) => c.name.includes("Aces") || c.name.includes("Fever"));
  expect(pending).toHaveLength(2);
  // The board HAS a button, so the floor is armed — and still stands down on
  // the two cards whose clip is only pending.
  expect(galaxy.hasBtn).toBe(true);
  expect(galaxy.slot).toBeGreaterThan(20);
  for (const card of pending) {
    expect(card.hasBtn).toBe(false);
    expect(card.slot).toBe(0);
  }
});

// The other side of the same line: once the buffer HAS opened and nothing was
// found, the card is not pending, it is empty-handed — and it takes the row so
// it lines up with the card that has one (the 9/5 rule).
test("once the buffer opens, a card with no clip reserves the row again", async ({ page }) => {
  // 8:00 PM ET — past the WNBA games' 5:30 PM buffer.
  await page.clock.setFixedTime(new Date("2026-08-06T20:00:00-04:00"));
  await setLeagues(page, ["wnba"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"], 900001, "2026-08-06T18:00:00Z"),
  }));
  await resolveOnly(page, "Aces");

  await page.goto("/today");
  // 15s, not the 5s default: the today board mounts more than /yesterday and a
  // cold dev server can take its time on the first paint (flaked at 5s).
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "WNBA highlights" })).toHaveCount(1);

  await expect.poll(async () => {
    const [withVideo, without] = await measuredCards(page);
    return withVideo && without ? withVideo.height === without.height : null;
  }, { timeout: 15_000 }).toBe(true);

  const [withVideo, without] = await measuredCards(page);
  expect(without.hasBtn).toBe(false);
  expect(without.slot).toBe(withVideo.btnRow);
});

test("the floor crosses columns: one clip in one league lifts the finished cards in another", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await setLeagues(page, ["wnba", "mls"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"]),
  }));
  await page.route("**/soccer/usa.1/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoFinishedGames(["Galaxy", "Sounders", "Union", "Crew"], 910001),
  }));
  // Only the WNBA Aces game has a clip. Both MLS cards must still match it.
  await resolveOnly(page, "Aces");

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MLS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "WNBA highlights" })).toHaveCount(1);

  await expect.poll(async () => {
    const cards = await measuredCards(page);
    return cards.length === 4 ? new Set(cards.map((c) => c.height)).size : null;
  }, { timeout: 15_000 }).toBe(1);

  const cards = await measuredCards(page);
  const withVideo = cards.find((c) => c.hasBtn)!;
  expect(withVideo.name).toBe("Aces");
  for (const card of cards) expect(card.slot).toBe(withVideo.btnRow);
});

// ── …and never on a league that has no trusted uploader at all ──────────────
//
// The reserve answers "this card will never get a button" for a game whose
// league DOES have one — a college football game on a channel ESPN skips. A
// league in NO_HIGHLIGHT_FALLBACK (NCAA volleyball: 1/5 strict on the 2025
// tournament, regular season on ESPN+/B1G+ with no official upload) never earns
// a button on any card, so the reserve there is a permanent blank band — the
// volleyball column in Jacob's 9/16 screenshot. GameHighlights emits the same
// [data-hl-pending] marker for it, permanently.
// 9/16, not 8/6: volleyball's season opens 08-21, so an August board drops the column.
test("a dark league reserves nothing, even beside a league that has a clip", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T20:00:00-04:00"));
  await setLeagues(page, ["wnba", "ncaavb"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"], 900001, "2026-09-16T18:00:00Z"),
  }));
  await page.route("**/volleyball/womens-college-volleyball/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["North Florida", "William & Mary", "Rhode Island", "Penn"], 920001, "2026-09-16T18:00:00Z"),
  }));
  await resolveOnly(page, "Aces");

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const cards = await measuredCards(page);
    return cards.find((c) => c.name.includes("Aces"))?.hasBtn ?? null;
  }, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1500);

  const cards = await measuredCards(page);
  const aces = cards.find((c) => c.name.includes("Aces"))!;
  const vb = cards.filter((c) => c.name.includes("North Florida") || c.name.includes("Rhode Island"));
  expect(vb).toHaveLength(2);
  expect(aces.slot).toBeGreaterThan(20);
  for (const card of vb) {
    expect(card.hasBtn).toBe(false);
    expect(card.slot).toBe(0);
  }
});

// ── …and not on a volleyball card that DOES map to a conference channel ─────
//
// The dark-league case above is a volleyball game with no channel at all. A P4
// game maps to one ("Big Ten Volleyball", conference 5, from #75) — and that
// channel posts football, not volleyball, so the card resolved nothing, emitted
// no marker and reserved a permanent 36px band. 18 of them on Jacob's 9/17
// board. ncaavb is in NEVER_RESERVE_SPORTS now: a volleyball card reserves
// nothing whether or not it has a channel.
test("a P4 volleyball card with a conference channel still reserves nothing", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-16T20:00:00-04:00"));
  await setLeagues(page, ["wnba", "ncaavb"]);
  await page.route("**/basketball/wnba/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Aces", "Lynx", "Fever", "Sky"], 900001, "2026-09-16T18:00:00Z"),
  }));
  await page.route("**/volleyball/womens-college-volleyball/scoreboard?**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: twoFinishedGames(["Illinois", "Purdue", "Michigan", "Indiana"], 930001, "2026-09-16T18:00:00Z", "5"),
  }));
  await resolveOnly(page, "Aces");

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "WNBA" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const cards = await measuredCards(page);
    return cards.find((c) => c.name.includes("Aces"))?.hasBtn ?? null;
  }, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1500);

  const cards = await measuredCards(page);
  const vb = cards.filter((c) => c.name.includes("Illinois") || c.name.includes("Michigan"));
  expect(vb).toHaveLength(2);
  for (const card of vb) expect(card.slot).toBe(0);
});
