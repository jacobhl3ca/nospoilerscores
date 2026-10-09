import { expect, test, type Page } from "@playwright/test";

// NFL "Playoff race" tag (owner design 10/9): a small badge on at most 3 games
// a week, weeks 13–18, where both teams are alive and one is within a game of
// a playoff spot or its division lead. Pre-game and live only, and only where
// the NFL record shows. Rules in lib/nflPlayoffRace.ts.
//
// Fixture: a Week 15 Sunday (12/20/2026) at 2:30 PM ET. The AFC table below
// (14 games each) makes g1 (seed 7 v first out, level), g2 (both a game off
// seed 7) and g3 (a 1-game division lead) the three tightest; g6 is also in a
// race but ranks 4th; g5 has no race and is already final.

type Row = [id: number, w: number, l: number, seed: number, clincher?: string];
const AFC: Row[][] = [
  [[1, 11, 3, 2], [2, 10, 4, 5], [3, 6, 8, 11], [4, 3, 11, 15, "e"]],
  [[5, 12, 2, 1], [6, 8, 6, 7], [7, 7, 7, 9], [8, 4, 10, 14]],
  [[9, 9, 5, 4], [10, 8, 6, 8], [11, 5, 9, 13], [12, 2, 12, 16, "e"]],
  [[13, 10, 4, 3], [14, 9, 5, 6], [15, 7, 7, 10], [16, 5, 9, 12]],
];
const NFC: Row[][] = [0, 1, 2, 3].map((d) => [0, 1, 2, 3].map((i): Row => [17 + d * 4 + i, 7, 7, d * 4 + i + 1]));

type Override = Record<number, { w?: number; l?: number }>;

function standings(over: Override) {
  const conf = (abbreviation: string, divs: Row[][]) => ({
    abbreviation,
    children: divs.map((teams, d) => ({
      name: `${abbreviation} ${["East", "North", "South", "West"][d]}`,
      standings: {
        entries: teams.map(([id, w, l, seed, clincher]) => ({
          team: { id: String(id), displayName: `Team ${id}`, abbreviation: `T${id}` },
          stats: [
            { name: "wins", value: over[id]?.w ?? w },
            { name: "losses", value: over[id]?.l ?? l },
            { name: "ties", value: 0 },
            { name: "playoffSeed", value: seed },
            ...(clincher ? [{ name: "clincher", displayValue: clincher }] : []),
          ],
        })),
      },
    })),
  });
  return JSON.stringify({ season: 2026, children: [conf("AFC", AFC), conf("NFC", NFC)] });
}

const REC = new Map(AFC.flat().map(([id, w, l]) => [id, [w, l] as [number, number]]));
const recOf = (id: number, over: Override) => `${over[id]?.w ?? REC.get(id)![0]}-${over[id]?.l ?? REC.get(id)![1]}`;

type State = "pre" | "in" | "post";
type Slot = { id: string; away: number; home: number; date: string; state: State; homeWins?: boolean };

const STATUS: Record<State, object> = {
  pre: { displayClock: "0:00", period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sun, December 20th at 4:25 PM EST", shortDetail: "12/20 - 4:25 PM EST", completed: false } },
  in: { displayClock: "7:12", period: 3, type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "7:12 - 3rd Quarter", shortDetail: "7:12 - 3rd", completed: false } },
  post: { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } },
};

function scoreboard(slots: Slot[], over: Override) {
  const side = (id: number, homeAway: string, winner: boolean, state: State) => ({
    homeAway,
    team: { id: String(id), displayName: `Team ${id}`, shortDisplayName: `Team ${id}`, abbreviation: `T${id}`, logo: "", color: "333333" },
    score: state === "pre" ? "" : winner ? "24" : "17",
    winner: state === "post" ? winner : undefined,
    records: [{ summary: recOf(id, over) }],
  });
  return JSON.stringify({
    events: slots.map((s) => ({
      id: s.id,
      date: s.date,
      name: `Team ${s.away} at Team ${s.home}`,
      shortName: `T${s.away} @ T${s.home}`,
      season: { type: 2, year: 2026 },
      week: { number: 15 },
      status: STATUS[s.state],
      competitions: [{
        competitors: [side(s.home, "home", !!s.homeWins, s.state), side(s.away, "away", !s.homeWins, s.state)],
        broadcasts: [],
        headlines: [],
        notes: [],
      }],
    })),
  });
}

const EARLY = "2026-12-20T18:00:00Z"; // 1:00 PM ET
const LATE = "2026-12-20T21:25:00Z"; // 4:25 PM ET
const SLATE: Slot[] = [
  { id: "401900001", away: 10, home: 6, date: EARLY, state: "in" },
  { id: "401900002", away: 15, home: 7, date: LATE, state: "pre" },
  { id: "401900003", away: 3, home: 1, date: LATE, state: "pre" },
  { id: "401900006", away: 16, home: 2, date: LATE, state: "pre" },
  // Final: Team 5 won, and both the scoreboard and the feed count it.
  { id: "401900005", away: 8, home: 5, date: EARLY, state: "post", homeWins: true },
];
const AFTER_G5: Override = { 5: { w: 13 }, 8: { l: 11 } };

function prefs(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    favoriteLeagues: ["nfl"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "nfl",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  });
}

async function setup(page: Page, width: number, opts: { prefs?: Record<string, unknown>; slate?: Slot[]; over?: Override } = {}) {
  const slate = opts.slate ?? SLATE;
  const over = opts.over ?? AFTER_G5;
  await page.setViewportSize({ width, height: 1000 });
  await page.clock.setFixedTime(new Date("2026-12-20T14:30:00-05:00"));
  // Only on a fresh context: a reload must keep what Settings saved.
  await page.addInitScript((blob) => {
    if (!sessionStorage.getItem("race-seeded")) {
      localStorage.setItem("nss-preferences", blob);
      sessionStorage.setItem("race-seeded", "1");
    }
  }, prefs(opts.prefs));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/football/nfl/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: scoreboard(slate, over) }));
  await page.route("**/football/nfl/standings**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: standings(over) }));
}

const badges = (page: Page) => page.getByRole("img", { name: "Playoff race: both teams are in the playoff hunt" });
const card = (page: Page, away: number, home: number) => page.getByRole("button", { name: `Team ${away} at Team ${home} — game details` });

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const width of [390, 1440]) {
  test(`${width}px: 3 tags on the tightest pre/live games, none on the final`, async ({ page }, info) => {
    await setup(page, width);
    await page.goto("/");
    await expect(card(page, 15, 7)).toBeVisible({ timeout: 30_000 });
    await expect(badges(page)).toHaveCount(3);
    await expect(card(page, 10, 6).getByRole("img", { name: /^Playoff race/ })).toBeVisible();
    await expect(card(page, 15, 7).getByRole("img", { name: /^Playoff race/ })).toBeVisible();
    await expect(card(page, 3, 1).getByRole("img", { name: /^Playoff race/ })).toBeVisible();
    await expect(card(page, 16, 2).getByRole("img", { name: /^Playoff race/ })).toHaveCount(0);
    await expect(card(page, 8, 5).getByRole("img", { name: /^Playoff race/ })).toHaveCount(0);

    // One line, inside its card, no page scroll.
    const tag = card(page, 15, 7).getByRole("img", { name: /^Playoff race/ });
    const tagBox = (await tag.boundingBox())!;
    const cardBox = (await card(page, 15, 7).boundingBox())!;
    expect(tagBox.height).toBeLessThan(24);
    expect(tagBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`playoff-race-${width}.png`) });
  });

  test(`${width}px: a picked game that goes final loses its tag, and no other game gains one`, async ({ page }) => {
    const slate = SLATE.map((s) => (s.id === "401900003" ? { ...s, date: EARLY, state: "post" as State, homeWins: false } : s));
    // Team 3 upset Team 1: both feeds count it.
    await setup(page, width, { slate, over: { ...AFTER_G5, 1: { l: 4 }, 3: { w: 7 } } });
    await page.goto("/");
    await expect(card(page, 15, 7)).toBeVisible({ timeout: 30_000 });
    await expect(badges(page)).toHaveCount(2);
    await expect(card(page, 3, 1).getByRole("img", { name: /^Playoff race/ })).toHaveCount(0);
    await expect(card(page, 16, 2).getByRole("img", { name: /^Playoff race/ })).toHaveCount(0);
  });

  test(`${width}px: NFL records off → no tags`, async ({ page }) => {
    await setup(page, width, { prefs: { upcomingRecordLeagues: [] } });
    await page.goto("/");
    await expect(card(page, 15, 7)).toBeVisible({ timeout: 30_000 });
    await expect(card(page, 15, 7).getByText("7-7")).toHaveCount(0);
    await expect(badges(page)).toHaveCount(0);
  });

  test(`${width}px: "Playoff race tags" off → no tags, and it stays off after reload`, async ({ page }) => {
    await setup(page, width);
    await page.goto("/");
    await expect(badges(page)).toHaveCount(3, { timeout: 30_000 });
    const dialog = await openSettings(page);
    const toggle = dialog.getByRole("checkbox", { name: /Playoff race tags/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(badges(page)).toHaveCount(0);

    await page.reload();
    await expect(card(page, 15, 7)).toBeVisible({ timeout: 30_000 });
    await expect(card(page, 15, 7).getByText("7-7").first()).toBeVisible();
    await expect(badges(page)).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") ?? "{}"));
    expect(saved.hidePlayoffRaceTags).toBe(true);
    const again = await openSettings(page);
    await expect(again.getByRole("checkbox", { name: /Playoff race tags/ })).not.toBeChecked();
  });
}
