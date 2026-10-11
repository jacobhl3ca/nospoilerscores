import { expect, test, type Page } from "@playwright/test";

// "Only my teams" (Settings, Jacob 10/7): a league column keeps only the
// starred teams' games. A league with nobody starred shows everything under a
// "star a team" banner; its ✕ empties the column until a team is starred, and
// "Show all" undoes that. Turning the toggle off restores the board as it was.

function prefs(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    favoriteLeagues: ["mlb"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    firstLeague: "mlb",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  });
}

function event(id: string, away: [string, string, string], home: [string, string, string]) {
  const team = ([tid, name, abbr]: [string, string, string], homeAway: string) => ({
    homeAway,
    team: { id: tid, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
    score: "0",
    records: [{ summary: "80-80" }],
  });
  return {
    id,
    date: "2026-09-30T23:08:00Z",
    name: `${away[1]} at ${home[1]}`,
    shortName: `${away[2]} @ ${home[2]}`,
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "7:08 PM EDT", shortDetail: "7:08 PM EDT", completed: false },
    },
    competitions: [{ competitors: [team(home, "home"), team(away, "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}

const SCOREBOARD = JSON.stringify({
  events: [
    event("401999101", ["2", "Boston Red Sox", "BOS"], ["10", "New York Yankees", "NYY"]),
    event("401999102", ["21", "New York Mets", "NYM"], ["22", "Philadelphia Phillies", "PHI"]),
    event("401999103", ["14", "Toronto Blue Jays", "TOR"], ["1", "Baltimore Orioles", "BAL"]),
  ],
});

async function setup(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00-04:00"));
  // Only on a fresh context: a reload must keep what the page saved.
  await page.addInitScript((blob) => {
    if (!sessionStorage.getItem("fav-seeded")) {
      localStorage.setItem("nss-preferences", blob);
      sessionStorage.setItem("fav-seeded", "1");
    }
  }, prefs(extra));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
}

const column = (page: Page) => page.locator('[data-league-column="mlb"]');
const card = (page: Page, re: RegExp) => column(page).getByRole("button", { name: re });
const yankees = (page: Page) => card(page, /Red Sox at New York Yankees/);
const mets = (page: Page) => card(page, /Mets at Philadelphia Phillies/);
const orioles = (page: Page) => card(page, /Blue Jays at Baltimore Orioles/);
const banner = (page: Page) => column(page).locator("[data-fav-only-banner]");
const strict = (page: Page) => column(page).locator("[data-fav-only-strict]");
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // A tap before hydration does nothing, so tap again until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

test("a starred team keeps only its game", async ({ page }) => {
  await setup(page, { favoriteTeams: ["mlb-21"], favoritesOnly: true });
  await page.goto("/");
  await expect(mets(page).first()).toBeVisible();
  await expect(yankees(page)).toHaveCount(0);
  await expect(orioles(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
});

test("no starred team: all games + banner; ✕ empties the column and sticks; Show all brings it back", async ({ page }) => {
  await setup(page, { favoriteTeams: [], favoritesOnly: true });
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("star a team to keep only yours");
  await expect(yankees(page).first()).toBeVisible();
  await expect(mets(page).first()).toBeVisible();
  await expect(orioles(page).first()).toBeVisible();
  // The banner asks for a star, so the cards offer one.
  await expect(column(page).getByRole("button", { name: /favorite/i }).first()).toBeVisible();

  await banner(page).getByRole("button", { name: "Only my teams in MLB" }).click();
  await expect(strict(page)).toBeVisible();
  await expect(strict(page)).toContainText("team starred yet");
  await expect(yankees(page)).toHaveCount(0);
  await expect(mets(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
  expect((await saved(page)).favoritesOnlyStrict).toEqual(["mlb"]);

  await page.reload();
  await expect(strict(page)).toBeVisible();
  await expect(yankees(page)).toHaveCount(0);

  await strict(page).getByRole("button", { name: "Show all" }).click();
  await expect(banner(page)).toBeVisible();
  await expect(yankees(page).first()).toBeVisible();
  expect((await saved(page)).favoritesOnlyStrict).toEqual([]);
});

test("Settings toggle off shows every game and clears both prefs", async ({ page }) => {
  await setup(page, { favoriteTeams: ["mlb-21"], favoritesOnly: true, favoritesOnlyStrict: ["nfl"] });
  await page.goto("/");
  await expect(yankees(page)).toHaveCount(0);
  const dialog = await openSettings(page);
  const toggle = dialog.getByRole("checkbox", { name: /Only my teams/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  const s = await saved(page);
  expect(s.favoritesOnly).toBeUndefined();
  expect(s.favoritesOnlyStrict).toBeUndefined();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(yankees(page).first()).toBeVisible();
  await expect(orioles(page).first()).toBeVisible();
  await expect(mets(page).first()).toBeVisible();

  await toggle.page().reload();
  const again = await openSettings(page);
  await again.getByRole("checkbox", { name: /Only my teams/ }).check();
  expect((await saved(page)).favoritesOnly).toBe(true);
});

test("toggle off renders the column exactly as without the prefs", async ({ browser }) => {
  const snapshot = async (extra: Record<string, unknown>) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await setup(page, extra);
    // A card's "Listen" chip lands after the radio table and /api/where load
    // (lib/useListenLinks). Read the card once both have answered and its
    // text holds still, so both snapshots see the same state.
    const radio = Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/radio-stations.json")),
      page.waitForResponse((r) => new URL(r.url()).pathname === "/api/where"),
    ]);
    await page.goto("/");
    await expect(yankees(page).first()).toBeVisible();
    await radio;
    const cards = column(page).locator('[role="button"][aria-label*=" at "], button[aria-label*=" at "]');
    let first = "";
    await expect.poll(async () => {
      const now = (await cards.first().innerText()).trim();
      const stable = now === first;
      first = now;
      return stable;
    }, { intervals: [300] }).toBe(true);
    const out = { count: await cards.count(), first, banner: await banner(page).count() };
    await ctx.close();
    return out;
  };
  const plain = await snapshot({ favoriteTeams: ["mlb-21"] });
  const off = await snapshot({ favoriteTeams: ["mlb-21"], favoritesOnly: false, favoritesOnlyStrict: ["mlb"] });
  expect(off).toEqual(plain);
  expect(plain.count).toBeGreaterThanOrEqual(3);
});

// Jacob 10/9: on a past tab the recap pill read the raw league, so "Best of
// the day" sat over a column that said "No games for your teams". The pill now
// reads the filtered list: no starred team played = no recap pill.
const FINISHED = JSON.stringify({
  events: JSON.parse(SCOREBOARD).events
    .filter((e: { id: string }) => e.id !== "401999102")
    .map((e: Record<string, unknown>) => ({
      ...e,
      date: "2026-09-29T23:08:00Z",
      status: { displayClock: "0:00", period: 9, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } },
    })),
});
const RECAPS = JSON.stringify({
  fetchedAt: "2026-09-30T14:00:00Z",
  recaps: {
    mlb: [
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260929", playbackUrl: "https://example.invalid/fastcast.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-x1", channel: "MLB.com", durationSec: 900, t: 1, sourcePolicy: "mlb.com" },
    ],
  },
});

async function setupYesterday(page: Page, extra: Record<string, unknown>) {
  await setup(page, { defaultDateMode: "yesterday", ...extra });
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: FINISHED }));
  await page.route("**/news/recaps.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: RECAPS }));
  await page.route("**/api/youtube?**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
}
const recapPill = (page: Page) => page.locator('[data-league-recap="mlb"]');

test("past tab: no starred team played = no recap pill over 'No games for your teams'", async ({ page }) => {
  await setupYesterday(page, { favoriteTeams: ["mlb-21"], favoritesOnly: true });
  await page.goto("/yesterday");
  await expect(column(page).locator("[data-fav-only-empty]")).toBeVisible({ timeout: 15_000 });
  await expect(column(page)).toContainText("No games for your teams");
  await expect(yankees(page)).toHaveCount(0);
  // Give a late pill (recaps.json resolves after the scores) time to mount.
  await page.waitForTimeout(1_000);
  await expect(recapPill(page)).toHaveCount(0);
});

test("past tab: a starred team that played keeps the recap pill", async ({ page }) => {
  await setupYesterday(page, { favoriteTeams: ["mlb-10"], favoritesOnly: true });
  await page.goto("/yesterday");
  await expect(yankees(page).first()).toBeVisible({ timeout: 15_000 });
  await expect(orioles(page)).toHaveCount(0);
  await expect(recapPill(page)).toBeVisible({ timeout: 15_000 });
  await expect(recapPill(page)).toContainText("Best of the day");
});

test("past tab: toggle off shows the recap pill even with no starred team playing", async ({ page }) => {
  await setupYesterday(page, { favoriteTeams: ["mlb-21"] });
  await page.goto("/yesterday");
  await expect(yankees(page).first()).toBeVisible({ timeout: 15_000 });
  await expect(recapPill(page)).toBeVisible({ timeout: 15_000 });
});
