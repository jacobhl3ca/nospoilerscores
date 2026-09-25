import { expect, test, type Page } from "@playwright/test";

// The league-wide recap card (LeagueRecapCard) on a past-date board: one pill
// on TOP of the NFL and MLB columns, above the first game card, fed by a mocked
// /news/recaps.json. Also covers the NFL club short cut on the game card
// ("17m" beside "Lions 10m") from a mocked /news/highlights.json.
//
// DOM assertions plus one attached screenshot of the two columns — not a
// pixel baseline, which would churn on every unrelated style change (see
// card-height-parity.spec.ts for the same call).

const NOW = new Date("2026-09-14T16:00:00-04:00"); // Mon 4 pm ET → /yesterday = Sun 9/13

async function seed(page: Page) {
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
  })), ["nfl", "mlb"]);
  await page.route("**/api/youtube?**", route =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
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
      period: week ? 4 : 9,
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

const NFL_EVENTS = JSON.stringify({
  season: { type: 2, year: 2026 },
  week: { number: 1 },
  events: [
    finishedEvent("401872923", { name: "Saints", abbr: "NO", score: "17" }, { name: "Lions", abbr: "DET", score: "27" }, "2026-09-13T17:00:00Z", 1),
    finishedEvent("401872925", { name: "Buccaneers", abbr: "TB", score: "20" }, { name: "Bengals", abbr: "CIN", score: "23" }, "2026-09-13T17:00:00Z", 1),
  ],
});

const MLB_EVENTS = JSON.stringify({
  events: [
    finishedEvent("776001", { name: "Mets", abbr: "NYM", score: "4" }, { name: "Phillies", abbr: "PHI", score: "2" }, "2026-09-13T17:35:00Z"),
    finishedEvent("776002", { name: "Yankees", abbr: "NYY", score: "3" }, { name: "Red Sox", abbr: "BOS", score: "5" }, "2026-09-13T17:35:00Z"),
  ],
});

// Shape written by bakeLeagueRecaps (scripts/prebake-news.mjs).
const RECAPS = JSON.stringify({
  fetchedAt: "2026-09-14T14:00:00Z",
  recaps: {
    nfl: [
      { sport: "nfl", key: "bestsunday", heading: "Week 1", label: "Sunday's best plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "AGzdTAjWr7U", pageUrl: "https://www.youtube.com/watch?v=AGzdTAjWr7U", channel: "NFL", durationSec: 1801, t: 1, sourcePolicy: "official-channel" },
      { sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 481, t: 1, sourcePolicy: "official-channel" },
    ],
    mlb: [
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/fastcast.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-sunday-s-best-in-15-minutes-x8085", channel: "MLB.com", durationSec: 900, t: 1, sourcePolicy: "mlb.com" },
      { sport: "mlb", key: "realfast", heading: "Best of the day", label: "60 seconds", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/realfast.m3u8", pageUrl: "https://www.mlb.com/video/real-fast-sunday-s-best-in-60-seconds-x6846", channel: "MLB.com", durationSec: 60, t: 1, sourcePolicy: "mlb.com" },
    ],
  },
});

// Shape written by bakeGameHighlights, with the NFL club slot (plan §5).
const HIGHLIGHTS = JSON.stringify({
  fetchedAt: "2026-09-14T14:00:00Z",
  games: {
    "nfl:401872923": {
      t: NOW.getTime() - 60_000, teams: ["Saints", "Lions"], matchup: "lions|saints", eventDate: "2026-09-13T17:00:00Z",
      official: "KC4OW2m3hjs", officialChannel: "NFL", officialDurationSec: 990,
      club: "wJMx_KQwg-8", clubChannel: "Detroit Lions", clubDurationSec: 596,
      sourcePolicy: "official-channel",
    },
    "nfl:401872925": {
      t: NOW.getTime() - 60_000, teams: ["Buccaneers", "Bengals"], matchup: "bengals|buccaneers", eventDate: "2026-09-13T17:00:00Z",
      official: "6Jc-OI39Qng", officialChannel: "NFL", officialDurationSec: 855,
      sourcePolicy: "official-channel",
    },
  },
});

test("the recap pill sits on top of the NFL and MLB columns on /yesterday, and the NFL card carries the club cut", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: RECAPS }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: HIGHLIGHTS }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "NFL" })).toBeVisible({ timeout: 15_000 });

  // NFL pill: heading + one button per cut, shortest first, minutes only —
  // never a title.
  const nflPill = page.locator('[data-league-recap="nfl"]');
  await expect(nflPill).toBeVisible({ timeout: 15_000 });
  await expect(nflPill).toContainText("Week 1");
  await expect(nflPill.getByRole("button")).toHaveCount(2);
  await expect(nflPill.getByRole("button", { name: "Top 15 plays (8m)" })).toBeVisible();
  await expect(nflPill.getByRole("button", { name: "Sunday's best plays (30m)" })).toBeVisible();
  await expect(nflPill).not.toContainText(/Best Plays From Sunday|NFL Season/);

  // MLB pill: the two mlb.com cuts.
  const mlbPill = page.locator('[data-league-recap="mlb"]');
  await expect(mlbPill).toBeVisible({ timeout: 15_000 });
  await expect(mlbPill).toContainText("Best of the day");
  await expect(mlbPill.getByRole("button", { name: "60 seconds (1m)" })).toBeVisible();
  await expect(mlbPill.getByRole("button", { name: "Best of the day (15m)" })).toBeVisible();

  // On TOP: the pill precedes the column's first game card in document order.
  for (const sport of ["nfl", "mlb"]) {
    const above = await page.evaluate((s) => {
      const pill = document.querySelector(`[data-league-recap="${s}"]`);
      if (!pill) return null;
      const pr = pill.getBoundingClientRect();
      // The column's cards = the game cards that share the pill's x-range.
      const cards = [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')]
        .filter((c) => {
          const r = c.getBoundingClientRect();
          const cx = (r.left + r.right) / 2;
          return cx >= pr.left && cx <= pr.right;
        });
      if (!cards.length) return null;
      const topMost = Math.min(...cards.map((c) => c.getBoundingClientRect().top));
      // DOCUMENT_POSITION_FOLLOWING (4): every card comes after the pill.
      const follows = cards.every((c) => (pill.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) === 4);
      return follows && pr.bottom <= topMost;
    }, sport);
    expect(above, `${sport} pill above its first card`).toBe(true);
  }

  // NFL game card: league cut with minutes + the club short cut beside it;
  // the card whose clubs posted nothing shows the league button only.
  // Club button is OFF pending QA (CLUB_BUTTON_ENABLED in GameHighlights.tsx):
  // the baked club slot must not render, even though the record carries it.
  await expect(page.getByRole("button", { name: "NFL highlights" })).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Detroit Lions highlights" })).toHaveCount(0);
  // Minutes ALONE on the visible label - the league name lives in the column
  // heading and in the button's aria-label, which the getByRole above uses.
  await expect(page.getByRole("button", { name: "NFL highlights" }).first()).toHaveText(/^17m$/);
  await expect(page.getByRole("button", { name: "NFL highlights" }).nth(1)).toHaveText(/^14m$/);

  // Clicking the NFL pill opens the modal on the hand-off card (embed-blocked
  // channel), not a black player.
  await nflPill.getByRole("button", { name: "Top 15 plays (8m)" }).click();
  await expect(page.getByRole("button", { name: /Watch on YouTube/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  const shot = await page.locator("main").screenshot();
  await testInfo.attach("yesterday-nfl-mlb-recap-cards", { body: shot, contentType: "image/png" });
});

// Three NFL cuts on a week board (the live shape on 9/24: 6m / 17m / 30m),
// plus MLB's two. At 390px a column is 114px wide; before 9/24 the pill kept
// one row, so the buttons ran into the next column and MLB's heading truncated
// to "Best of…". Now: stacked (heading over an equal-width button row), nothing
// past the pill's own edge, the full heading whole; desktop keeps one row.
const RECAPS_THREE = JSON.stringify({
  fetchedAt: "2026-09-14T14:00:00Z",
  recaps: {
    nfl: [
      { sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 342, t: 1, sourcePolicy: "official-channel" },
      { sport: "nfl", key: "everytd", heading: "Week 1", label: "Every touchdown", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "KC4OW2m3hjs", pageUrl: "https://www.youtube.com/watch?v=KC4OW2m3hjs", channel: "NFL", durationSec: 1047, t: 1, sourcePolicy: "official-channel" },
      { sport: "nfl", key: "bestsunday", heading: "Week 1", label: "Sunday's best plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "AGzdTAjWr7U", pageUrl: "https://www.youtube.com/watch?v=AGzdTAjWr7U", channel: "NFL", durationSec: 1803, t: 1, sourcePolicy: "official-channel" },
    ],
    mlb: [
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/fastcast.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-x8085", channel: "MLB.com", durationSec: 900, t: 1, sourcePolicy: "mlb.com" },
      { sport: "mlb", key: "realfast", heading: "Best of the day", label: "60 seconds", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/realfast.m3u8", pageUrl: "https://www.mlb.com/video/real-fast-x6846", channel: "MLB.com", durationSec: 60, t: 1, sourcePolicy: "mlb.com" },
    ],
  },
});

async function pillMetrics(page: Page, sport: string) {
  return page.evaluate((s) => {
    const pill = document.querySelector<HTMLElement>(`[data-league-recap="${s}"]`)!;
    const pr = pill.getBoundingClientRect();
    const heading = pill.querySelector<HTMLElement>("span")!;
    const buttons = [...pill.querySelectorAll<HTMLElement>("button")];
    return {
      layout: pill.dataset.recapLayout,
      width: Math.round(pr.width),
      overflow: pill.scrollWidth - pill.clientWidth,
      headingText: heading.textContent?.trim(),
      headingClipped: heading.scrollWidth > heading.clientWidth,
      buttonsPastEdge: buttons.filter((b) => b.getBoundingClientRect().right > pr.right + 0.5).length,
      buttonsClipped: buttons.filter((b) => b.scrollWidth > b.clientWidth).length,
      buttonTexts: buttons.map((b) => b.textContent?.trim()),
    };
  }, sport);
}

test("phone (390px): three NFL cuts stack under \"Week 1 highlights\" and stay inside the column; desktop keeps one row", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(NOW);
  await seed(page);
  // A third pinned column (in season on the fixed date) so the board is the
  // real three-across phone layout with 114px columns, not two wide ones.
  await page.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem("nss-preferences") ?? "{}");
    localStorage.setItem("nss-preferences", JSON.stringify({ ...p, thirdLeague: "mls" }));
  });
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/soccer/**/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: RECAPS_THREE }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: HIGHLIGHTS }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "NFL" })).toBeVisible({ timeout: 15_000 });
  const nflPill = page.locator('[data-league-recap="nfl"]');
  await expect(nflPill).toBeVisible({ timeout: 15_000 });
  await expect(nflPill.getByRole("button")).toHaveCount(3);
  await expect(page.locator('[data-league-recap="mlb"]')).toBeVisible({ timeout: 15_000 });
  await expect(nflPill).toHaveAttribute("data-recap-layout", "stacked");

  const nfl = await pillMetrics(page, "nfl");
  expect(nfl.width, "a phone column").toBeLessThan(200);
  expect(nfl.buttonTexts).toEqual(["6m", "17m", "30m"]);
  expect(nfl.headingText).toBe("Week 1 highlights");
  expect(nfl.headingClipped).toBe(false);
  // Nothing hidden: every phone heading fits its line, so none is dropped.
  expect(await page.locator("[data-recap-heading].invisible").count()).toBe(0);
  expect(nfl.overflow).toBe(0);
  expect(nfl.buttonsPastEdge).toBe(0);
  expect(nfl.buttonsClipped).toBe(0);

  const mlb = await pillMetrics(page, "mlb");
  expect(mlb.layout).toBe("stacked");
  // Full heading on its own line (Jacob 9/25: "best of the day" on mobile).
  expect(mlb.headingText).toBe("Best of the day");
  expect(mlb.headingClipped).toBe(false);
  expect(mlb.overflow).toBe(0);
  expect(mlb.buttonsPastEdge).toBe(0);

  // The columns' first game cards line up: the spacer on a column with no
  // records is the same height as the real pills.
  const tops = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[aria-label$="game details"]')];
    const byCol = new Map<number, number>();
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const col = Math.round(r.left / 10);
      byCol.set(col, Math.min(byCol.get(col) ?? Infinity, Math.round(r.top)));
    }
    return [...byCol.values()];
  });
  expect(tops.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);

  const shot = await page.locator("main").screenshot();
  await testInfo.attach("phone-390-recap-pills", { body: shot, contentType: "image/png" });

  // A narrower phone: the full phrase no longer fits, so "W1", not a
  // clipped or dropped heading.
  await page.setViewportSize({ width: 340, height: 740 });
  await expect(nflPill.locator("[data-recap-heading]")).toHaveText("W1", { timeout: 5_000 });
  const narrowNfl = await pillMetrics(page, "nfl");
  expect(narrowNfl.headingClipped).toBe(false);
  // MLB falls back to "Best of day" where the full heading does not fit.
  expect((await pillMetrics(page, "mlb")).headingClipped).toBe(false);
  expect(await page.locator("[data-recap-heading].invisible").count()).toBe(0);

  // Desktop: one row, the full heading.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nflPill).toHaveAttribute("data-recap-layout", "row", { timeout: 5_000 });
  const wide = await pillMetrics(page, "mlb");
  expect(wide.headingText).toBe("Best of the day");
  expect(wide.buttonsPastEdge).toBe(0);
});

// MLB on an oddity round-up day (the live shape of 9/23): Top 5, Real Fast,
// FastCast and Oddities. Four buttons ran 24px past a 225px column and left
// "Best of the day" 39px before the word buttons existed (measured 9/25).
// Now: words, not a second "▶ 1m"; Top 5 first, Oddities last; nothing past
// the pill's edge or clipped at any width; the heading whole or dropped.
const RECAPS_MLB_FOUR = JSON.stringify({
  fetchedAt: "2026-09-14T14:00:00Z",
  recaps: {
    mlb: [
      { sport: "mlb", key: "oddities", heading: "Best of the day", label: "Oddities", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/oddities.m3u8", pageUrl: "https://www.mlb.com/video/oddities-of-the-week-9-13-26", channel: "MLB.com", durationSec: 74, t: 1, sourcePolicy: "mlb.com" },
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/fastcast.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-x8085", channel: "MLB.com", durationSec: 900, t: 1, sourcePolicy: "mlb.com" },
      { sport: "mlb", key: "realfast", heading: "Best of the day", label: "60 seconds", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/realfast.m3u8", pageUrl: "https://www.mlb.com/video/real-fast-x6846", channel: "MLB.com", durationSec: 60, t: 1, sourcePolicy: "mlb.com" },
      { sport: "mlb", key: "top5", heading: "Best of the day", label: "Top 5 plays of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://example.invalid/top5.m3u8", pageUrl: "https://www.mlb.com/video/9-13-26-top-5-plays-of-the-day", channel: "MLB.com", durationSec: 60, t: 1, sourcePolicy: "mlb.com" },
    ],
  },
});

test("MLB Top 5 + Oddities: word buttons in order, nothing clipped from 340px to desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await page.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem("nss-preferences") ?? "{}");
    localStorage.setItem("nss-preferences", JSON.stringify({ ...p, thirdLeague: "mls" }));
  });
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/soccer/**/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"events":[]}' }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: RECAPS_MLB_FOUR }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: HIGHLIGHTS }));

  await page.goto("/yesterday");
  const mlbPill = page.locator('[data-league-recap="mlb"]');
  await expect(mlbPill).toBeVisible({ timeout: 15_000 });
  await expect(mlbPill.getByRole("button")).toHaveCount(4);
  // aria-labels keep the series name and minutes, whatever the visible word.
  await expect(mlbPill.getByRole("button", { name: "Top 5 plays of the day (1m)" })).toBeVisible();
  await expect(mlbPill.getByRole("button", { name: "Oddities (1m)" })).toBeVisible();
  const keys = () => mlbPill.locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-recap-key")));
  expect(await keys()).toEqual(["top5", "realfast", "fastcast", "oddities"]);

  const phone = await pillMetrics(page, "mlb");
  expect(phone.layout).toBe("stacked");
  expect(phone.buttonTexts).toEqual(["Top 5", "1m", "15m", "Odd"]);
  expect(phone.headingText).toBe("Best of the day");
  expect(phone.overflow).toBe(0);
  expect(phone.buttonsPastEdge).toBe(0);
  expect(phone.buttonsClipped).toBe(0);
  const shot = await page.locator("main").screenshot();
  await testInfo.attach("phone-390-mlb-four", { body: shot, contentType: "image/png" });

  for (const width of [340, 855, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(300);
    const m = await pillMetrics(page, "mlb");
    expect(m.overflow, `${width}px overflow`).toBe(0);
    expect(m.buttonsPastEdge, `${width}px buttons past the edge`).toBe(0);
    expect(m.buttonsClipped, `${width}px clipped buttons`).toBe(0);
    // Whole or dropped (invisible), never cut to "Best of…".
    const heading = mlbPill.locator("[data-recap-heading]");
    const hidden = await heading.evaluate((h) => h.classList.contains("invisible"));
    if (!hidden) expect(m.headingClipped, `${width}px heading`).toBe(false);
  }
  // Desktop row: words, the minutes buttons keep their ▶, the word ones carry none.
  const row = await pillMetrics(page, "mlb");
  expect(row.layout).toBe("row");
  expect(row.buttonTexts).toEqual(["Top 5", "1m", "15m", "Odd"]);
  expect(await mlbPill.locator('[data-recap-key="realfast"] svg').count()).toBe(1);
  expect(await mlbPill.locator('[data-recap-key="top5"] svg').count()).toBe(0);
});

test("no record for the day → no pill, no layout change", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page);
  await page.route("**/football/nfl/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: NFL_EVENTS }));
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({ status: 200, contentType: "application/json", body: MLB_EVENTS }));
  await page.route("**/news/recaps.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"fetchedAt":"2026-09-14T14:00:00Z","recaps":{}}' }));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "NFL" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[aria-label$="game details"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page.locator("[data-league-recap]")).toHaveCount(0);
});
