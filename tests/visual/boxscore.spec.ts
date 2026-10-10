import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

// Box score button in the details popup (Jacob 10/8). A box score always
// shows the score, so the button warns first; "Don't warn me again" skips it,
// and Settings → "Show box score warning" brings it back. MLB/NFL/NHL/NBA/
// WNBA/college render the box score in the popup; other leagues open ESPN.
// The summary is fetched only after the warning is passed.

const NOW = new Date("2026-10-07T23:30:00-04:00");
const SUMMARY = readFileSync(join(__dirname, "..", "fixtures", "boxscore-mlb.json"), "utf8");

type TeamSpec = { id: string; name: string; abbr: string };
const T = (id: string, name: string, abbr: string): TeamSpec => ({ id, name, abbr });

function event(id: string, league: string, away: TeamSpec, home: TeamSpec, state: "pre" | "in" | "post", scores: [string, string]) {
  const competitor = (t: TeamSpec, side: "home" | "away", score: string) => ({
    homeAway: side,
    team: { id: t.id, displayName: t.name, shortDisplayName: t.name, abbreviation: t.abbr, logo: "", color: "666666" },
    score,
  });
  const detail = state === "post" ? "Final" : state === "in" ? "Top 5th" : "10/7 - 8:08 PM EDT";
  return {
    id,
    date: "2026-10-07T22:08Z",
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    season: { type: 2, year: 2026 },
    status: {
      displayClock: "0:00",
      period: state === "pre" ? 0 : 5,
      type: { name: state === "post" ? "STATUS_FINAL" : state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED", state, detail, shortDetail: detail, completed: state === "post" },
    },
    links: state === "pre" ? [] : [
      { rel: ["summary", "desktop", "event"], href: `https://www.espn.com/${league}/game/_/gameId/${id}` },
      { rel: ["boxscore", "desktop", "event"], href: `https://www.espn.com/${league}/boxscore/_/gameId/${id}` },
    ],
    competitions: [{
      date: "2026-10-07T22:08Z",
      competitors: [competitor(home, "home", scores[1]), competitor(away, "away", scores[0])],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

const BOARDS: Record<string, unknown[]> = {
  "baseball/mlb": [
    event("401908015", "mlb", T("19", "Dodgers", "LAD"), T("15", "Braves", "ATL"), "post", ["3", "1"]),
    event("401908016", "mlb", T("10", "Yankees", "NYY"), T("2", "Red Sox", "BOS"), "in", ["2", "2"]),
    event("401908017", "mlb", T("21", "Mets", "NYM"), T("22", "Phillies", "PHI"), "pre", ["0", "0"]),
  ],
  "soccer/eng.1": [
    event("740001", "soccer", T("359", "Arsenal", "ARS"), T("363", "Chelsea", "CHE"), "post", ["2", "0"]),
  ],
};

const FINAL = "Dodgers at Braves — game details";
const LIVE = "Yankees at Red Sox — game details";
const PRE = "Mets at Phillies — game details";
const EPL = "Arsenal at Chelsea — game details";

async function seed(page: Page, context: BrowserContext, extraPrefs: Record<string, unknown> = {}) {
  const summaries: string[] = [];
  const espnPages: string[] = [];
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((extra) => {
    if (localStorage.getItem("nss-preferences")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [], favoriteTeams: [], theme: "light",
      showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
      leaguesOnboarded: true,
      firstLeague: "mlb", secondLeague: "epl", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
      hiddenLeagues: ["best"], defaultDateMode: "today", defaultLandingView: "scores",
      ...extra,
    }));
  }, extraPrefs);
  await page.route("**/apis/site/v2/sports/**", (route: Route) => {
    const url = new URL(route.request().url());
    if (/\/summary$/.test(url.pathname)) {
      summaries.push(url.searchParams.get("event") ?? "");
      return route.fulfill({ status: 200, contentType: "application/json", body: SUMMARY });
    }
    const m = /\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    const dates = url.searchParams.get("dates") ?? "";
    const events = m && dates.startsWith("20261007") ? (BOARDS[m[1]] ?? []) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  });
  await page.route("**/api/youtube?**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  // The ESPN page opens in a popup; answer it here so no test reaches espn.com.
  await context.route("https://www.espn.com/**", (route) => {
    espnPages.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>ESPN box score</title>" });
  });
  return { summaries, espnPages };
}

async function openDetails(page: Page, name: string) {
  const card = page.getByRole("button", { name, exact: true });
  await expect(card).toBeVisible({ timeout: 20_000 });
  // Keyboard, not a click: a click at the card's centre can land on a team
  // button, which on a phone opens that team instead.
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.use({ viewport: { width: 1280, height: 900 }, timezoneId: "America/New_York" });

test("final MLB: warning first, then our box score; summary fetched only after", async ({ page, context }) => {
  const { summaries } = await seed(page, context);
  await page.goto("/");
  const dialog = await openDetails(page, FINAL);

  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  const warn = page.getByRole("alertdialog");
  await expect(warn).toContainText("This shows the final score");
  await expect(warn.getByRole("button", { name: "Show box score" })).toBeVisible();
  await expect(warn.getByRole("button", { name: "Open ESPN instead" })).toBeVisible();
  // Nothing fetched and no box score in the DOM before the user agrees.
  expect(summaries).toEqual([]);
  await expect(page.getByTestId("box-score")).toHaveCount(0);

  // Cancel leaves the popup as it was; Escape on the warning closes only it.
  await warn.getByRole("button", { name: "Cancel" }).click();
  await expect(warn).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(summaries).toEqual([]);

  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Show box score" }).click();
  const box = page.getByTestId("box-score");
  await expect(box.getByRole("table", { name: "Line score" })).toBeVisible();
  expect(summaries).toEqual(["401908015"]);
  await expect(box.getByRole("table", { name: "Line score" })).toContainText("LAD");
  await expect(box.getByRole("row").filter({ hasText: "M. Betts" }).first()).toBeVisible();
  await expect(box.getByRole("link", { name: /Full box score on ESPN/ })).toBeVisible();
  // The warning was not skipped for next time.
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));
  expect(prefs.skipBoxscoreWarning ?? false).toBe(false);
});

test("live game says current score; pre-game has no button", async ({ page, context }) => {
  await seed(page, context);
  await page.goto("/");
  const live = await openDetails(page, LIVE);
  await live.getByRole("button", { name: "Box score", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("This shows the current score");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);

  const pre = await openDetails(page, PRE);
  await expect(pre.getByRole("button", { name: "Box score", exact: true })).toHaveCount(0);
});

test("EPL opens ESPN; Don't warn me again skips the warning; Settings brings it back", async ({ page, context }) => {
  const { espnPages, summaries } = await seed(page, context);
  await page.goto("/");
  let dialog = await openDetails(page, EPL);
  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  const warn = page.getByRole("alertdialog");
  await expect(warn.getByRole("button", { name: "Show box score" })).toHaveCount(0);

  // Cancel opens nothing.
  await warn.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);
  expect(espnPages).toEqual([]);

  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  await page.getByRole("alertdialog").getByLabel("Don't warn me again").check();
  const popup1 = page.waitForEvent("popup");
  await page.getByRole("alertdialog").getByRole("button", { name: "Open ESPN" }).click();
  await (await popup1).close();
  expect(espnPages).toEqual(["https://www.espn.com/soccer/boxscore/_/gameId/740001"]);
  expect(summaries).toEqual([]);

  // Second tap: straight to ESPN, no warning.
  const popup2 = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  await (await popup2).close();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));
  expect(prefs.skipBoxscoreWarning).toBe(true);

  // A supported league skips straight to the box score too.
  await page.keyboard.press("Escape");
  dialog = await openDetails(page, FINAL);
  await dialog.getByRole("button", { name: "Box score", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("box-score").getByRole("table", { name: "Line score" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Settings → "Show box score warning" turns it back on.
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByText("More settings", { exact: true }).click();
  const toggle = page.getByText("Show box score warning");
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect.poll(async () =>
    (await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"))).skipBoxscoreWarning,
  ).toBe(false);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });
  test("box score scrolls inside the popup, not the page", async ({ page, context }) => {
    await seed(page, context, { skipBoxscoreWarning: true });
    await page.goto("/");
    const dialog = await openDetails(page, FINAL);
    await dialog.getByRole("button", { name: "Box score", exact: true }).click();
    const box = page.getByTestId("box-score");
    await expect(box.getByRole("table", { name: "Line score" })).toBeVisible();
    await expect(box.getByRole("row").filter({ hasText: "M. Betts" }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);
  });
});
