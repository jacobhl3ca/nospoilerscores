import { expect, test, type Page } from "@playwright/test";

// Jacob 9/16 iPhone screenshot, "Yest", Scores tab, 3-across phone board
// (~390px, MLB | NFL | CFL): a game card's row of highlight buttons overflowed
// its card — "▶ NFL 17m" and "▶ Chiefs 5m" spilled past each other and the
// card edge. Root cause: GameHighlights' two-slot button row uses `flex-1
// min-w-0` (correct — shrinks the BOX to its share of the row) but the label
// span is `whitespace-nowrap` with no `overflow-hidden`/`truncate` on the
// button, so once a label is wider than the box the browser shrinks the box
// but still PAINTS the text past its edge — same defect a4872dc6 fixed for
// the Telemundo pair (missing `min-w-0` there; here `min-w-0` is present but
// nothing clips the overflowing text).
//
// Reproduced here with a currently-reachable combo (not the retired NFL club
// button, CLUB_BUTTON_ENABLED = false pending QA): a league whose official
// button has no baked duration falls back to its league BADGE
// (highlightBadgeLabel), and Serie A's is the 7-character "SERIE A" — paired
// with the "Alt" search/secondary button. Both buttons resolve live via a
// mocked /api/youtube (no highlights.json bake), the same as production when
// the prebake hasn't run yet.

const NOW = new Date("2026-09-14T16:00:00-04:00"); // Mon 4 pm ET -> /yesterday = Sun 9/13
const EVENT_ISO = "2026-09-13T17:00:00Z";

async function seed(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["seriea", "mlb"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "seriea",
    secondLeague: "mlb",
    thirdLeague: "nfl",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "yesterday",
    defaultLandingView: "scores",
  })));
}

type TeamSpec = { name: string; abbr: string; score: string };
function finishedEvent(id: string, away: TeamSpec, home: TeamSpec, iso: string, week?: number) {
  const team = (t: TeamSpec, suffix: string) => ({
    id: `${id}${suffix}`, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, score: t.score,
    logo: "", color: "666666",
  });
  const h = team(home, "h");
  const a = team(away, "a");
  return {
    id,
    date: iso,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    ...(week ? { week: { number: week } } : {}),
    status: {
      displayClock: "0:00",
      period: week ? 4 : 2,
      type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true },
    },
    competitions: [{
      competitors: [
        { homeAway: "home", team: h, score: home.score, winner: true, records: [{ summary: "1-0" }] },
        { homeAway: "away", team: a, score: away.score, winner: false, records: [{ summary: "0-1" }] },
      ],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

const SERIEA_EVENTS = JSON.stringify({
  events: [finishedEvent("600001", { name: "Juventus", abbr: "JUV", score: "1" }, { name: "Inter", abbr: "INT", score: "2" }, EVENT_ISO)],
});
const MLB_EVENTS = JSON.stringify({
  events: [finishedEvent("776001", { name: "Mets", abbr: "NYM", score: "4" }, { name: "Phillies", abbr: "PHI", score: "2" }, "2026-09-13T17:35:00Z")],
});
const NFL_EVENTS = JSON.stringify({
  season: { type: 2, year: 2026 },
  week: { number: 1 },
  events: [finishedEvent("401872923", { name: "Saints", abbr: "NO", score: "17" }, { name: "Lions", abbr: "DET", score: "27" }, "2026-09-13T17:00:00Z", 1)],
});

async function seedRoutes(page: Page) {
  await page.route("**/soccer/**/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/soccer/ita.1/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: SERIEA_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"fetchedAt":"2026-09-14T14:00:00Z","recaps":{}}' }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  // No bake: both the official and secondary/search buttons live-resolve via
  // /api/youtube. Neither carries a duration, so the official button falls
  // back to the league badge ("SERIE A") rather than minutes — the longest
  // label either button can show today. The parallel (unexcluded) secondary
  // request lands the SAME clip as the official on the first pass (both ask
  // for the same channel), which the app detects and re-resolves once,
  // excluding it (`&exclude=`) — this mock mirrors that by returning a
  // second, distinct id only once `exclude` is present.
  await page.route("**/api/youtube?**", route => {
    const url = new URL(route.request().url());
    const videoId = url.searchParams.has("exclude") ? "secondaryClipAlt1" : "officialClipSeriea1";
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videoId }) });
  });
}

async function buttonRowOverflow(page: Page, cardSelector: string) {
  return page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel);
    if (!card) return null;
    const cr = card.getBoundingClientRect();
    const buttons = [...card.querySelectorAll<HTMLElement>(".highlight-btn")];
    return {
      cardRight: cr.right,
      cardLeft: cr.left,
      buttonCount: buttons.length,
      buttonTexts: buttons.map((b) => b.textContent?.trim()),
      // The rendered box vs. what actually painted (icon+text) — scrollWidth
      // catches the box being sized correctly (min-w-0) while its content
      // still paints wider than it (no overflow-hidden), which a naive
      // "button.right <= card.right" check would miss.
      pastCardEdge: buttons.filter((b) => b.getBoundingClientRect().right > cr.right + 0.5).length,
      contentWiderThanBox: buttons.filter((b) => b.scrollWidth > b.clientWidth + 0.5).length,
      overlapping: buttons.length === 2 && buttons[0].getBoundingClientRect().right > buttons[1].getBoundingClientRect().left + 0.5,
    };
  }, cardSelector);
}

test("phone (390px), 3-col board: Serie A's two-button row (badge + Alt) stays inside its card, no overlap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await seedRoutes(page);

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Serie A" })).toBeVisible({ timeout: 15_000 });

  const cardSel = '[aria-label="Juventus at Inter — game details"]';
  const card = page.locator(cardSel);
  await expect(card).toBeVisible({ timeout: 15_000 });

  const officialBtn = card.getByRole("button", { name: "CBS Sports Golazo highlights" });
  await expect(officialBtn).toBeVisible({ timeout: 15_000 });
  await expect(officialBtn).toHaveText(/^SERIE A$/);
  const altBtn = card.getByRole("button", { name: "Official alternate highlights" });
  await expect(altBtn).toBeVisible({ timeout: 15_000 });
  await expect(altBtn).toHaveText(/^Alt$/);
  const metrics = await buttonRowOverflow(page, cardSel);
  expect(metrics).not.toBeNull();
  const shotDir = process.env.NSS_SHOT_DIR;
  const tag = process.env.NSS_SHOT_TAG ?? "shot";
  if (shotDir) {
    await page.locator(cardSel).screenshot({ path: `${shotDir}/${tag}-seriea-card-390.png` });
    await page.locator("main").screenshot({ path: `${shotDir}/${tag}-board-390.png` });
  }

  expect(metrics!.buttonCount, "both buttons rendered").toBe(2);
  expect(metrics!.pastCardEdge, "no button box past the card edge").toBe(0);
  expect(metrics!.contentWiderThanBox, "no button's painted content wider than its own box").toBe(0);
  expect(metrics!.overlapping, "buttons must not overlap each other").toBe(false);

  // Desktop (1440px): the same card is far wider than either label needs, so
  // this is a no-op check that the fix does not regress the wide layout.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(officialBtn).toBeVisible();
  if (shotDir) {
    await page.locator(cardSel).screenshot({ path: `${shotDir}/${tag}-seriea-card-1440.png` });
  }
  const wideMetrics = await buttonRowOverflow(page, cardSel);
  expect(wideMetrics!.pastCardEdge).toBe(0);
  expect(wideMetrics!.contentWiderThanBox).toBe(0);
  expect(wideMetrics!.overlapping).toBe(false);
});
