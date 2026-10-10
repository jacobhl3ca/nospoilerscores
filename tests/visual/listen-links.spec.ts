import { expect, test, type Page } from "@playwright/test";

// Listen links (lib/radio.ts): a live MLB game on two TV networks whose ESPN
// feed carries a national ESPN Radio row, seen from New York. The Where to watch dialog gets
// a Listen section (Mets flagship + ESPN Radio; the Phillies flagship is
// Philadelphia-only so it stays hidden), the game details get a Listen: row,
// and the dialog stays inside the card at desktop, tablet and phone widths.

const prefs = JSON.stringify({
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
});

const team = (id: string, name: string, abbr: string, homeAway: string) => ({
  homeAway,
  team: { id, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
  score: "2",
  records: [{ summary: "90-72" }],
});

const scoreboard = (espnRadio: boolean, networks: string[] = ["FS1", "SNY"]) => JSON.stringify({
  events: [{
    id: "401999201",
    date: "2026-10-08T23:08:00Z",
    name: "New York Mets at Philadelphia Phillies",
    shortName: "NYM @ PHI",
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: 5,
      type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "Top 5th", shortDetail: "Top 5th", completed: false },
    },
    competitions: [{
      competitors: [team("22", "Philadelphia Phillies", "PHI", "home"), team("21", "New York Mets", "NYM", "away")],
      broadcasts: networks.length ? [{ names: networks }] : [],
      geoBroadcasts: [
        { type: { id: "1", shortName: "TV" }, market: { id: "1", type: "National" }, media: { shortName: "FS1" }, lang: "en", region: "us" },
        ...(espnRadio ? [{ type: { id: "5", shortName: "Radio" }, market: { id: "1", type: "National" }, media: { shortName: "ERADM" }, lang: "en", region: "us" }] : []),
      ],
      headlines: [],
      notes: [],
    }],
  }],
});
const SCOREBOARD = scoreboard(true);

const free = (name: string, url: string, dma?: number[]) => ({
  name, url, lang: "en", checked: "2026-10-08",
  access: dma ? { cost: "free", geo: "market", dma, vpnOk: "unknown" } : { cost: "free", geo: "none", vpnOk: "unknown" },
});
const TABLE = JSON.stringify({
  teams: {
    "mlb:21": [free("WFAN 101.9 FM / 660 AM", "https://www.audacy.com/stations/wfan", [501])],
    "mlb:22": [free("94WIP", "https://www.audacy.com/stations/94wip", [504])],
  },
  national: { ERADM: free("ESPN Radio", "https://www.iheart.com/live/espn-radio-7903/") },
  leagues: { mlb: { paid: [{ name: "SiriusXM", url: "https://www.siriusxm.com/sports/mlb", lang: "en", checked: "2026-10-08", access: { cost: "paid", geo: "none", signIn: true } }] } },
});

async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-08T20:30:00-04:00"));
  await page.addInitScript((blob) => {
    localStorage.setItem("nss-preferences", blob);
    localStorage.removeItem("hs-radio-stations-v1");
    sessionStorage.removeItem("hs-where-v1");
  }, prefs);
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: SCOREBOARD }));
  await page.route("**/radio-stations.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: TABLE }));
  await page.route("**/api/where", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ country: "US", region: "NY", metro: 501 }),
  }));
}

const column = (page: Page) => page.locator('[data-league-column="mlb"]');
const card = (page: Page) => column(page).getByRole("button", { name: /Mets at Philadelphia Phillies/ }).first();

for (const width of [1440, 1024, 390]) {
  test(`Where to watch shows Listen at ${width}px and fits the card`, async ({ page }) => {
    await setup(page, width);
    await page.goto("/");
    await expect(card(page)).toBeVisible();
    const chip = column(page).getByRole("button", { name: /^FS1/ });
    // The chip turns into a dialog toggle once the station table lands.
    await expect(chip).toHaveAttribute("aria-haspopup", "dialog");
    await chip.click();
    const dialog = column(page).getByRole("dialog", { name: "Where to watch" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "FS1" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "SNY" })).toBeVisible();
    await expect(dialog.getByText("Listen", { exact: true })).toBeVisible();
    const links = dialog.locator("a.listen-link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText("WFAN 101.9 FM / 660 AM");
    await expect(links.nth(0)).toHaveAttribute("href", "https://www.audacy.com/stations/wfan");
    await expect(links.nth(1)).toHaveText("ESPN Radio");
    await expect(dialog).not.toContainText("94WIP");
    await expect(dialog).not.toContainText("SiriusXM");

    const box = await dialog.boundingBox();
    const cardBox = await card(page).boundingBox();
    expect(box && cardBox).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    // No row spills past the dialog's own edge.
    const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("game details show a Listen: row with the same links", async ({ page }) => {
  await setup(page, 1440);
  await page.goto("/");
  await expect(card(page)).toBeVisible();
  // Wait for the table so the detail sheet opens with it loaded.
  await expect(column(page).getByRole("button", { name: /^FS1/ })).toHaveAttribute("aria-haspopup", "dialog");
  await card(page).click({ position: { x: 40, y: 40 } });
  const row = page.locator(".listen-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText("Listen:");
  await expect(row.getByRole("link", { name: "WFAN 101.9 FM / 660 AM" })).toBeVisible();
  await expect(row.getByRole("link", { name: "ESPN Radio" })).toBeVisible();
});

test("outside both markets with no ESPN Radio: only the paid line", async ({ page }) => {
  await setup(page, 1440);
  await page.route("**/api/where", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ country: "US", region: "CO", metro: 751 }),
  }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: scoreboard(false),
  }));
  await page.goto("/");
  const chip = column(page).getByRole("button", { name: /^FS1/ });
  await expect(chip).toHaveAttribute("aria-haspopup", "dialog");
  await chip.click();
  const dialog = column(page).getByRole("dialog", { name: "Where to watch" });
  await expect(dialog.locator("a.listen-link")).toHaveText(["SiriusXMsign-inPaid"]);
});

test("Settings → Radio links off removes the Listen chip and the saved pref says so", async ({ page }) => {
  await setup(page, 1440);
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: scoreboard(true, []),
  }));
  await page.goto("/");
  const chip = column(page).getByRole("button", { name: "Listen", exact: true });
  await expect(chip).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await dialog.getByText("More settings", { exact: true }).click();
  const toggle = dialog.getByRole("checkbox", { name: /Radio links/ });
  await expect(toggle).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /local-only radio links everywhere/ })).not.toBeChecked();
  await toggle.uncheck();
  await page.keyboard.press("Escape");
  await expect(card(page)).toBeVisible();
  await expect(chip).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(saved.showListenLinks).toBe(false);
});

test("one TV network keeps its one-tap link; Listen sits in the game details", async ({ page }) => {
  await setup(page, 1440);
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: scoreboard(true, ["FS1"]),
  }));
  let tableLoaded = false;
  page.on("requestfinished", (r) => { if (r.url().endsWith("/radio-stations.json")) tableLoaded = true; });
  await page.goto("/");
  await expect(column(page).getByRole("link", { name: "FS1", exact: true })).toBeVisible();
  await expect.poll(() => tableLoaded).toBe(true);
  // Still a link after the table lands: never swaps to a button under a tap.
  await expect(column(page).getByRole("link", { name: "FS1", exact: true })).toBeVisible();
  await expect(column(page).getByRole("button", { name: "FS1", exact: true })).toHaveCount(0);
  await card(page).click({ position: { x: 40, y: 40 } });
  await expect(page.locator(".listen-row").getByRole("link", { name: "WFAN 101.9 FM / 660 AM" })).toBeVisible();
});

test("no TV listed: the chip reads Listen and opens the radio list", async ({ page }) => {
  await setup(page, 390);
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: scoreboard(true, []),
  }));
  await page.goto("/");
  const chip = column(page).getByRole("button", { name: "Listen", exact: true });
  await chip.click();
  const dialog = column(page).getByRole("dialog", { name: "Where to watch" });
  await expect(dialog.locator("a.listen-link")).toHaveText(["WFAN 101.9 FM / 660 AM", "ESPN Radio"]);
});

// Phase 4: an event tile (a NASCAR race at Talladega) gets a Listen row in its
// detail sheet from the per-track row ("nascar:talladega" → MRN). No chip on
// the tile face. A finished race gets none.
const RACE_TABLE = JSON.stringify({
  teams: {},
  national: {},
  leagues: { nascar: { paid: [{ name: "SiriusXM NASCAR Radio", url: "https://www.siriusxm.com/sports/nascar", lang: "en", checked: "2026-10-09", access: { cost: "paid", geo: "none", signIn: true } }] } },
  events: { "nascar:talladega": [free("MRN Radio", "https://tunein.com/radio/Motor-Racing-Network-s1/")] },
});
const raceEvent = (state: "pre" | "in" | "post") => JSON.stringify({
  events: [{
    id: "800101",
    date: "2026-10-18T18:00Z",
    name: "YellaWood 500",
    shortName: "YellaWood 500",
    links: [{ href: "https://www.espn.com/racing/race/_/id/800101" }],
    status: { type: { state } },
    competitions: [{
      date: "2026-10-18T18:00Z",
      status: { type: { state } },
      venue: { fullName: "Talladega Superspeedway", address: { city: "Talladega", state: "AL" } },
      broadcasts: [{ names: ["NBC"] }],
    }],
  }],
});

async function setupRace(page: Page, state: "pre" | "in" | "post") {
  await page.setViewportSize({ width: 1024, height: 900 });
  // Race at 2 PM ET: before it at 10:30 AM, after it (finished) at 8:30 PM.
  await page.clock.setFixedTime(new Date(state === "post" ? "2026-10-18T20:30:00-04:00" : "2026-10-18T10:30:00-04:00"));
  await page.addInitScript((blob) => {
    localStorage.setItem("nss-preferences", blob);
    localStorage.removeItem("hs-radio-stations-v1");
    sessionStorage.removeItem("hs-where-v1");
  }, prefs.replace(/"mlb"/g, '"nascar"'));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/api/youtube?**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/racing/nascar-premier/scoreboard**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: raceEvent(state) }));
  await page.route("**/radio-stations.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: RACE_TABLE }));
  await page.route("**/api/where", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ country: "US", region: "NY", metro: 501 }),
  }));
}

test("event tile: the race sheet shows a Listen row with the track's network", async ({ page }) => {
  await setupRace(page, "pre");
  await page.goto("/");
  const title = page.locator('[data-fit-line="title"]').first();
  await expect(title).toHaveText(/YellaWood/);
  await title.click();
  const row = page.locator(".listen-row");
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: "MRN Radio" })).toHaveAttribute("href", "https://tunein.com/radio/Motor-Racing-Network-s1/");
  await expect(row).not.toContainText("SiriusXM");
});

test("event tile: a finished race sheet has no Listen row", async ({ page }) => {
  await setupRace(page, "post");
  await page.goto("/");
  const title = page.locator('[data-fit-line="title"]').first();
  await expect(title).toHaveText(/YellaWood/);
  await title.click();
  await expect(page.getByRole("dialog")).toContainText("Talladega");
  await expect(page.locator(".listen-row")).toHaveCount(0);
});
