import { expect, test, type Page } from "@playwright/test";

// Jacob 10/1: "a league goes off with one click and nothing brings it back".
// Every destructive click in Settings now shows "<what> · Undo" at the bottom
// of the drawer for 15 s, and Cmd-Z / Ctrl-Z does the same unless you are
// typing. Every write also flashes one "Saved" mark in the header.

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultDateMode: "today",
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "wnba",
  fourthLeague: "empty",
  fifthLeague: "empty",
};

async function seedPrefs(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ base, update }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify({ ...base, ...update }));
    sessionStorage.setItem("seeded", "1");
  }, { base: BASE_PREFS, update: extra });
}

async function openSettings(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  // A tap before hydration does nothing (seen on WebKit over the mini tunnel),
  // so tap again until the dialog opens.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  return dialog;
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));

// MLB, NFL and WNBA are in season on 9/29; NBA is not.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("league chip off → Undo pill → chip back on, hiddenLeagues restored", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const before = (await saved(page)).hiddenLeagues;

  const mlb = catalog.getByRole("checkbox", { name: "MLB", exact: true });
  await expect(mlb).toHaveAttribute("aria-checked", "true");
  await mlb.click();
  const pill = dialog.getByRole("status").filter({ hasText: "MLB off" });
  await expect(pill).toHaveText(/^MLB off\s*·\s*Undo$/);
  expect((await saved(page)).hiddenLeagues).toContain("mlb");

  await pill.getByRole("button", { name: "Undo" }).click();
  await expect(pill).toHaveCount(0);
  await expect(catalog.getByRole("checkbox", { name: "MLB", exact: true })).toHaveAttribute("aria-checked", "true");
  expect((await saved(page)).hiddenLeagues).toEqual(before);
});

test("Cmd-Z / Ctrl-Z undoes, but not while typing in the search box", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });

  await catalog.getByRole("checkbox", { name: "NFL", exact: true }).click();
  const pill = dialog.getByRole("status").filter({ hasText: "NFL off" });
  await expect(pill).toBeVisible();

  // Focus in the team search: the key belongs to the text field.
  const search = dialog.getByRole("searchbox", { name: "Search all teams" });
  await search.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(pill).toBeVisible();
  expect((await saved(page)).hiddenLeagues).toContain("nfl");

  // Anywhere else in the drawer it undoes.
  await search.blur();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(pill).toHaveCount(0);
  expect((await saved(page)).hiddenLeagues ?? []).not.toContain("nfl");
  await expect(catalog.getByRole("checkbox", { name: "NFL", exact: true })).toHaveAttribute("aria-checked", "true");

  // One level: nothing left to undo, so a second press changes nothing.
  const after = await saved(page);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await saved(page)).toEqual(after);
});

test("Edit list × → Undo puts the league back in the list", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  await dialog.getByRole("button", { name: "Edit list" }).click();
  await dialog.getByRole("button", { name: "Hide WNBA from this list" }).click();
  await expect(catalog.getByRole("checkbox", { name: "WNBA", exact: true })).toHaveCount(0);
  const pill = dialog.getByRole("status").filter({ hasText: "WNBA hidden" });
  await pill.getByRole("button", { name: "Undo" }).click();
  await expect(catalog.getByRole("checkbox", { name: "WNBA", exact: true })).toBeVisible();
  expect((await saved(page)).catalogHiddenLeagues).toBeUndefined();
});

test("remove a favorite team → Undo → the team is back", async ({ page }) => {
  await seedPrefs(page, { favoriteTeams: ["mlb-10", "nfl-2"] });
  const dialog = await openSettings(page);
  const teams = dialog.locator("section", { has: page.locator("h3", { hasText: "Favorite teams" }) });
  const chips = teams.locator('button[aria-label$=" from favorites"]');
  await expect(chips).toHaveCount(2);
  // The chip carries a logo, also for a league not on today's board.
  await expect.poll(
    () => chips.first().locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth).catch(() => 0),
    { timeout: 20_000 },
  ).toBeGreaterThan(0);

  const name = ((await chips.first().getAttribute("aria-label")) ?? "").replace(/^Remove /, "").replace(/ from favorites$/, "");
  await chips.first().click();
  await expect(chips).toHaveCount(1);
  const pill = dialog.getByRole("status").filter({ hasText: `${name} removed` });
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Undo" }).click();
  await expect(chips).toHaveCount(2);
  expect((await saved(page)).favoriteTeams).toEqual(["mlb-10", "nfl-2"]);
});

test("column Remove col → Undo → the pin is back", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const slot1 = dialog.locator('select[aria-label="Slot 1 league"]');
  await slot1.selectOption("empty");
  expect((await saved(page)).firstLeague).toBe("empty");
  const pill = dialog.getByRole("status").filter({ hasText: "Column 1 changed" });
  await pill.getByRole("button", { name: "Undo" }).click();
  await expect(pill).toHaveCount(0);
  const after = await saved(page);
  expect([after.firstLeague, after.secondLeague, after.thirdLeague]).toEqual(["mlb", "nfl", "wnba"]);
  await expect(slot1).toHaveValue("mlb");
});

test("team picker: My-leagues pills + More leagues, each with a logo", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const teams = dialog.locator("section", { has: page.locator("h3", { hasText: "Favorite teams" }) });
  const more = teams.getByRole("button", { name: "More leagues for teams" });
  await expect(more).toHaveText("More leagues");
  const row = teams.getByRole("button", { name: /^(More|Fewer) leagues for teams$/ }).locator("xpath=..");
  const leagueChips = row.locator("button[aria-pressed]");

  const mine = new Set(await catalog.locator('[role="checkbox"][aria-checked="true"] [data-league-mark]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-league-mark"))));
  const shown = await leagueChips.locator("[data-league-mark]").evaluateAll((els) => els.map((el) => el.getAttribute("data-league-mark")));
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBe(await leagueChips.count());
  for (const sport of shown) expect(mine.has(sport), `${sport} is in My leagues`).toBe(true);
  // MLB's chip draws its logo.
  const mlb = leagueChips.filter({ has: page.locator('[data-league-mark="mlb"]') });
  await expect.poll(() => mlb.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  // The old helper line is gone; the placeholder says it.
  await expect(teams.getByText("Type to search across all leagues")).toHaveCount(0);

  await more.click();
  await expect(teams.getByRole("button", { name: "Fewer leagues for teams" })).toHaveText("Fewer");
  expect(await leagueChips.count()).toBeGreaterThan(shown.length);
});

test("every write flashes Saved in the header, gone after 2 s", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-29T15:00:00-04:00") });
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const mark = dialog.getByTestId("settings-saved");
  await expect(mark).toHaveText("");

  await dialog.getByRole("checkbox", { name: /Stars on game cards/ }).click();
  await expect(mark).toHaveText("Saved");
  await page.clock.runFor(1_500);
  await expect(mark).toHaveText("Saved");
  await page.clock.runFor(1_000);
  await expect(mark).toHaveText("");
  // Not a destructive click: no Undo pill.
  await expect(dialog.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

// Jacob 10/4: "unticked league vanishes". An unticked chip keeps its place in
// the collapsed My leagues row, as an outline, until the drawer closes.
test("unticked league stays until the drawer closes", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const names = () => catalog.getByRole("checkbox").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

  const before = await names();
  const mlb = catalog.getByRole("checkbox", { name: "MLB", exact: true });
  await mlb.click();
  await expect(mlb).toHaveAttribute("aria-checked", "false");
  await expect(dialog.getByRole("status").filter({ hasText: "MLB off" })).toBeVisible();
  expect(await names()).toEqual(before);
  await mlb.click();
  await expect(mlb).toHaveAttribute("aria-checked", "true");
  expect((await saved(page)).hiddenLeagues ?? []).not.toContain("mlb");

  // The same for a cross-league chip.
  const topNews = catalog.getByRole("checkbox", { name: "Top news", exact: true });
  await topNews.click();
  await expect(topNews).toHaveAttribute("aria-checked", "false");
  expect(await names()).toEqual(before);
  await topNews.click();
  await expect(topNews).toHaveAttribute("aria-checked", "true");

  // Closing the drawer lets an unticked chip go.
  await catalog.getByRole("checkbox", { name: "NFL", exact: true }).click();
  await expect(catalog.getByRole("checkbox", { name: "NFL", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(catalog.getByRole("checkbox", { name: "MLB", exact: true })).toBeVisible();
  await expect(catalog.getByRole("checkbox", { name: "NFL", exact: true })).toHaveCount(0);
});

test("an unticked league still leaves with Edit list ×", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  await seedPrefs(page);
  const dialog = await openSettings(page);
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  const wnba = catalog.getByRole("checkbox", { name: "WNBA", exact: true });
  await wnba.click();
  await expect(wnba).toHaveAttribute("aria-checked", "false");
  await dialog.getByRole("button", { name: "Edit list" }).click();
  await dialog.getByRole("button", { name: "Hide WNBA from this list" }).click();
  await expect(wnba).toHaveCount(0);
});
