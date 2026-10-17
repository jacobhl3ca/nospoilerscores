import { expect, test, type Page } from "@playwright/test";

// Brand icons (10/13): the Apple logo and Google "G" on the Settings sign-in
// buttons, and the Google Calendar / Apple Calendar app icons in the game
// sheet's "Add to calendar" row (web only — the native wrapper keeps text).
// Light and dark, phone and laptop. Each test saves a screen to its output dir.

const prefs = (theme: "light" | "dark") => JSON.stringify({
  favoriteLeagues: ["mlb"],
  favoriteTeams: [],
  theme,
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
});

const team = (id: string, name: string, abbr: string, homeAway: string) => ({
  homeAway,
  team: { id, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
  score: "0",
  records: [{ summary: "90-72" }],
});

// An upcoming game tonight, 7:08 pm ET.
const SCOREBOARD = JSON.stringify({
  events: [{
    id: "401999301",
    date: "2026-10-08T23:08:00Z",
    name: "New York Mets at Philadelphia Phillies",
    shortName: "NYM @ PHI",
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Thu, October 8th at 7:08 PM EDT", shortDetail: "10/8 - 7:08 PM EDT", completed: false },
    },
    competitions: [{
      competitors: [team("22", "Philadelphia Phillies", "PHI", "home"), team("21", "New York Mets", "NYM", "away")],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  }],
});

async function setup(page: Page, width: number, theme: "light" | "dark", native = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00-04:00"));
  await page.addInitScript(({ blob, native }) => {
    localStorage.setItem("nss-preferences", blob);
    const w = window as unknown as { __opened: string[]; open: unknown; Capacitor?: unknown };
    w.__opened = [];
    w.open = (u: string) => { w.__opened.push(String(u)); return null; };
    if (native) w.Capacitor = { isNativePlatform: () => true };
  }, { blob: prefs(theme), native });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
}

const card = (page: Page) => page.locator('[data-league-column="mlb"]').getByRole("group", { name: /Mets at Philadelphia Phillies/ }).first();

async function openCalendarRow(page: Page) {
  await page.goto("/");
  await expect(card(page)).toBeVisible();
  // Top-left padding: on a phone the team name opens the team page instead.
  await card(page).click({ position: { x: 8, y: 8 } });
  const add = page.getByRole("button", { name: /^Add to calendar:/ });
  await expect(add).toBeVisible();
  const before = (await add.boundingBox())!.height;
  await add.click();
  const group = page.getByRole("group", { name: "Add to calendar" });
  await expect(group).toBeVisible();
  return { group, before };
}

for (const width of [1280, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Settings sign-in buttons show their logos (${width}px, ${theme})`, async ({ page }, info) => {
      await setup(page, width, theme);
      await page.goto("/");
      await page.getByRole("button", { name: "Open settings", exact: true }).click();
      const apple = page.getByRole("button", { name: "Sign in with Apple" });
      const google = page.getByRole("button", { name: "Sign in with Google" });
      await expect(apple.locator("svg")).toBeVisible();
      await expect(google.locator("svg")).toBeVisible();
      // The Apple mark takes the button's text colour, so it shows on both themes.
      const [fill, bg] = await apple.evaluate((el) => {
        const svg = el.querySelector("svg")!;
        return [getComputedStyle(svg).color, getComputedStyle(el).backgroundColor];
      });
      expect(fill).not.toBe(bg);
      await apple.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`settings-${width}-${theme}.png`) });
    });

    test(`Add to calendar shows both app icons on the web (${width}px, ${theme})`, async ({ page }, info) => {
      await setup(page, width, theme);
      const { group, before } = await openCalendarRow(page);
      const icons = group.locator("img[data-cal-icon]");
      await expect(icons).toHaveCount(2);
      for (const i of [0, 1]) {
        await expect(icons.nth(i)).toBeVisible();
        await expect.poll(() => icons.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      }
      const google = group.getByRole("button", { name: /^Add to Google Calendar:/ });
      const apple = group.getByRole("link", { name: /^Download \.ics for Apple or Outlook:/ });
      await page.screenshot({ path: info.outputPath(`calendar-${width}-${theme}.png`) });
      // Same height as the "Add to calendar" button they replace.
      expect(Math.round((await google.boundingBox())!.height)).toBe(Math.round(before));
      expect(Math.round((await apple.boundingBox())!.height)).toBe(Math.round(before));
      // One line each, nothing cut off.
      for (const el of [google, apple]) {
        expect(await el.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(0);
      }

      const download = page.waitForEvent("download");
      await apple.click();
      expect((await download).suggestedFilename()).toMatch(/\.ics$/);
    });
  }
}

test("Google Calendar opens the prefilled event", async ({ page }) => {
  await setup(page, 1280, "light");
  const { group } = await openCalendarRow(page);
  await group.getByRole("button", { name: /^Add to Google Calendar:/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened))
    .toEqual([expect.stringMatching(/^https:\/\/calendar\.google\.com\/calendar\/render\?.*text=/)]);
});

test("inside the native app the calendar row stays text only", async ({ page }) => {
  await setup(page, 390, "light", true);
  const { group } = await openCalendarRow(page);
  await expect(group.getByRole("button")).toHaveCount(2);
  await expect(group.locator("img")).toHaveCount(0);
});
