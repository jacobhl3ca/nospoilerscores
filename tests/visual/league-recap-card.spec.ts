import { expect, test, type Page } from "@playwright/test";

// The league-wide recap card (LeagueRecapCard) on a past-date board: one pill
// on TOP of the NFL and MLB columns, above the first game card, fed by a mocked
// /news/recaps.json. Also covers the NFL club short cut on the game card
// ("NFL 17m" beside "Lions 10m") from a mocked /news/highlights.json.
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
      { sport: "nfl", key: "bestsunday", heading: "Week 1 top plays", label: "Sunday's best plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "AGzdTAjWr7U", pageUrl: "https://www.youtube.com/watch?v=AGzdTAjWr7U", channel: "NFL", durationSec: 1801, t: 1, sourcePolicy: "official-channel" },
      { sport: "nfl", key: "top15", heading: "Week 1 top plays", label: "Top 15 plays", cadence: "weekly", coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 481, t: 1, sourcePolicy: "official-channel" },
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
  await expect(nflPill).toContainText("Week 1 top plays");
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
  await expect(page.getByRole("button", { name: "NFL highlights" }).first()).toHaveText(/NFL 17m/);
  await expect(page.getByRole("button", { name: "NFL highlights" }).nth(1)).toHaveText(/NFL 14m/);

  // Clicking the NFL pill opens the modal on the hand-off card (embed-blocked
  // channel), not a black player.
  await nflPill.getByRole("button", { name: "Top 15 plays (8m)" }).click();
  await expect(page.getByRole("button", { name: /Watch on YouTube/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  const shot = await page.locator("main").screenshot();
  await testInfo.attach("yesterday-nfl-mlb-recap-cards", { body: shot, contentType: "image/png" });
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
