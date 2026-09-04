import { expect, test, type Page } from "@playwright/test";

// A tennis card on the normal slate must render its highlight button.
//
// The regression this locks down (2026-09-04, Jacob: "us open highlights for
// yesterday not showing up properly ... cards not same size as MLB cards"):
// LeagueColumn's four MAIN-SLATE <GameCard> call sites (past-date, live, pre,
// finished) omitted `leagueLabel`, while the three helper paths
// (renderCondensed / renderUpcomingSlate / renderPreviousSlate) passed it. For
// every league whose approved uploader is keyed on the SPORT
// (OFFICIAL_CHANNELS.wnba, .mlb, ...) the omission is invisible — the lookup
// falls through to the sport key. Tennis is the one sport whose channel exists
// ONLY under `${sport}_${label}` (tennis_usopen, tennis_wimbledon, ...), so
// getOfficialChannelName("tennis", undefined) returned null,
// hasNoTrustedHighlightSource went true, highlightUrl was nulled, and EVERY
// Grand Slam card lost its highlight button — and, because the row is what
// makes a finished card its full height, sat one row shorter than the MLB
// cards beside it. It survived because single-column mode (renderCondensed)
// DID pass the label, and because scripts/check-highlight-fallbacks.mjs
// resolves against the tournament channel directly and so never sees the UI's
// label plumbing at all.
//
// Assert the user-visible end state, not the prop: the button is on the card.

const FIXED = "2026-08-30T16:00:00-04:00"; // → /yesterday resolves to 2026-08-29 ET
const MATCH_ID = "990001";
const VIDEO_ID = "GuBBEFjoDw8";
const AWAY = "Aryna Sabalenka";
const HOME = "Emma Navarro";

function usOpenScoreboard() {
  const athlete = (displayName: string) => ({
    displayName, shortName: displayName, flag: { href: "https://a.espncdn.com/i/teamlogos/countries/500/usa.png" },
  });
  return JSON.stringify({
    events: [{
      id: "189-2026",
      date: "2026-08-24T04:00Z",
      name: "US Open",
      major: true,
      groupings: [{
        grouping: { slug: "womens-singles" },
        competitions: [{
          id: MATCH_ID,
          date: "2026-08-29T18:00:00Z",
          round: { displayName: "Round 2" },
          status: { period: 2, displayClock: "", type: { state: "post", name: "STATUS_FINAL", completed: true, detail: "Final", shortDetail: "Final" } },
          competitors: [
            { homeAway: "home", athlete: athlete(HOME), winner: false, linescores: [{ winner: false }, { winner: false }] },
            { homeAway: "away", athlete: athlete(AWAY), winner: true, linescores: [{ winner: true }, { winner: true }] },
          ],
        }],
      }],
    }],
  });
}

// Exactly the shape scripts/prebake-news.mjs writes, including the provenance
// markers getChannelVerifiedBakedId demands (sourcePolicy + per-slot channel +
// the sorted, normalized matchup fingerprint + a bake stamp inside the 10-day
// window measured against the page's clock).
function bakedHighlights(nowMs: number) {
  const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  return JSON.stringify({
    fetchedAt: new Date(nowMs).toISOString(),
    games: {
      [`tennis:${MATCH_ID}`]: {
        t: nowMs,
        teams: [AWAY, HOME],
        matchup: [norm(AWAY), norm(HOME)].sort().join("|"),
        eventDate: "2026-08-29T18:00:00Z",
        official: VIDEO_ID,
        officialChannel: "US Open Tennis Championships",
        sourcePolicy: "official-channel",
      },
    },
  });
}

async function openTennisSlate(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED));
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["tennis"], favoriteTeams: [], theme: "light",
    showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
    leaguesOnboarded: true, firstLeague: "tennis",
    secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
    defaultDateMode: "yesterday", defaultLandingView: "scores",
  })));
  await page.route("**/tennis/atp/scoreboard**", route => route.fulfill({
    status: 200, contentType: "application/json", body: usOpenScoreboard(),
  }));
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: bakedHighlights(new Date(FIXED).getTime()),
  }));
  // A live YouTube resolve must never be what rescues this — the prebaked id is
  // the whole fast path. Fail the lookup so only the baked route can pass.
  await page.route("**/api/youtube**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
}

test("a Grand Slam card on the main slate shows its official highlight button", async ({ page }) => {
  await openTennisSlate(page);
  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "US Open" })).toBeVisible();
  // The label reached GameHighlights: the channel is the TOURNAMENT's, which is
  // only reachable through the `tennis_usopen` key that needs league.label.
  await expect(
    page.getByRole("button", { name: "US Open Tennis Championships highlights" }),
  ).toBeVisible({ timeout: 15_000 });
});

test("that card is a full-height card — the highlight row, not a short one", async ({ page }) => {
  await openTennisSlate(page);
  await page.goto("/yesterday");
  await expect(
    page.getByRole("button", { name: "US Open Tennis Championships highlights" }),
  ).toBeVisible({ timeout: 15_000 });
  // Same shape card-height-parity asserts for the team sports: the button lives
  // in a trailing row on the card, so a card that earned one has two children.
  const rows = await page.evaluate(() => {
    const card = document.querySelector('[aria-label$="game details"]');
    return { children: card?.children.length ?? 0, hasBtn: !!card?.querySelector(".highlight-btn") };
  });
  expect(rows.hasBtn).toBe(true);
  expect(rows.children).toBe(2);
});
