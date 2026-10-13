import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

// PLL + NLL columns (2026-10-13). Real ESPN events from tests/fixtures, clock
// pinned to the day each was played:
//   Sep 20 2026  the PLL Championship (Outlaws at Waterdogs, 14-4)
//   May 17 2026  NLL Finals Game 2 (Rock at Thunderbirds, 12-7)
// Both are playoff rounds that name an earlier round's winners, so each card
// is covered until Show teams is tapped. No score text either way.
const pllFinal = JSON.parse(readFileSync("tests/fixtures/pll-championship-event.json", "utf8"));
const nllFinalsG2 = JSON.parse(readFileSync("tests/fixtures/nll-finals-g2-event.json", "utf8"));
// Screenshots for a read-back; test-results/ is gitignored. LAX_QA_DIR=qa
// writes them to the worktree's qa/ folder instead.
const QA = process.env.LAX_QA_DIR ?? "test-results/lacrosse-qa";
mkdirSync(QA, { recursive: true });

async function mockLacrosse(page: Page) {
  const serve = (event: { date: string }, ymd: string) => async (route: import("@playwright/test").Route) => {
    const dates = new URL(route.request().url()).searchParams.get("dates") ?? "";
    const events = dates.includes(ymd) || dates === ymd.slice(0, 6) ? [event] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events }) });
  };
  await page.route("**/lacrosse/pll/scoreboard**", serve(pllFinal, "20260920"));
  await page.route("**/lacrosse/nll/scoreboard**", serve(nllFinalsG2, "20260517"));
}

// Image elements inside the column that failed to load.
async function brokenImages(page: Page, sport: string): Promise<string[]> {
  return page.locator(`[data-league-column="${sport}"] img`).evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
}

// Score text a card could leak: the two final scores as a pair, in any order.
const SCORE = (a: number, b: number) => new RegExp(`\\b${a}\\s*[-–:]\\s*${b}\\b|\\b${b}\\s*[-–:]\\s*${a}\\b`);

test("Sep 20 2026: the PLL Championship card is covered, then shows teams and logos, never a score", async ({ page }) => {
  await mockLacrosse(page);
  await page.clock.setFixedTime(new Date("2026-09-20T20:00:00-04:00"));
  await page.goto("/?l=pl&s=pl.0.0&dd=t&dv=s");
  const col = page.locator('[data-league-column="pll"]');
  const mask = col.locator(`[data-pairing-mask="${pllFinal.id}"]`);
  await expect(mask).toBeVisible({ timeout: 30_000 });
  await expect(mask).toContainText("Championship");
  await expect(col.getByText(/Outlaws|Waterdogs/)).toHaveCount(0);
  await page.screenshot({ path: `${QA}/pll-sep20-covered.png`, fullPage: false });

  await mask.getByRole("button", { name: /Show teams/ }).click();
  await expect(col.getByRole("button", { name: /Outlaws at .*Waterdogs/ })).toHaveCount(1);
  await expect(col).not.toContainText(SCORE(14, 4));
  await page.waitForLoadState("networkidle");
  expect(await brokenImages(page, "pll")).toEqual([]);
  await page.screenshot({ path: `${QA}/pll-sep20-revealed.png`, fullPage: false });
});

test("May 17 2026: NLL Finals Game 2 is covered and shows no series score", async ({ page }) => {
  await mockLacrosse(page);
  await page.clock.setFixedTime(new Date("2026-05-17T21:00:00-04:00"));
  await page.goto("/?l=lx&s=lx.0.0&dd=t&dv=s");
  const col = page.locator('[data-league-column="nll"]');
  const mask = col.locator(`[data-pairing-mask="${nllFinalsG2.id}"]`);
  await expect(mask).toBeVisible({ timeout: 30_000 });
  await expect(mask).toContainText("Finals");
  await expect(col).not.toContainText(/leads|series tied|\b[12]-[01]\b/i);
  await mask.getByRole("button", { name: /Show teams/ }).click();
  await expect(col.getByRole("button", { name: /Rock at .*Thunderbirds/ })).toHaveCount(1);
  await expect(col).not.toContainText(SCORE(12, 7));
  await expect(col).not.toContainText(/leads|series tied/i);
  await page.waitForLoadState("networkidle");
  expect(await brokenImages(page, "nll")).toEqual([]);
  await page.screenshot({ path: `${QA}/nll-may17-finals-g2.png`, fullPage: false });
});

test("a fresh profile has no lacrosse column; ticking PLL in Settings adds it to the switcher and the board", async ({ page }) => {
  await mockLacrosse(page);
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
  await page.addLocatorHandler(page.getByRole("button", { name: "Use defaults" }), async (b) => {
    await b.evaluate((el) => (el as HTMLElement).click());
  });
  await page.clock.setFixedTime(new Date("2026-09-20T20:00:00-04:00"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("[data-league-column]").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-league-column="pll"], [data-league-column="nll"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const catalog = dialog.getByRole("group", { name: "Leagues in the header switcher" });
  await catalog.getByRole("button", { name: "More leagues", exact: true }).click();
  const row = catalog.getByRole("checkbox", { name: /^PLL \(pro lacrosse\)/ });
  await expect(row).toHaveAttribute("aria-checked", "false");
  await page.screenshot({ path: `${QA}/settings-pll-off.png`, fullPage: false });
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.locator('button[title="Switch league"]').first().click();
  const switcher = page.getByRole("dialog", { name: "Switch league" });
  const pick = switcher.getByRole("button", { name: /^PLL/ }).first();
  await expect(pick).toBeVisible();
  await pick.click();
  await expect(page.locator('[data-league-column="pll"]')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${QA}/board-pll-picked.png`, fullPage: false });
});

// The PLL column's news card is r/PLL first (then ESPN's lacrosse wire). A
// post that names the champion must sit under the same headline blur as every
// other league.
test("News: a PLL headline that names a winner is blurred like every other league", async ({ page }) => {
  const SPOILER = "The Philadelphia Waterdogs are your 2026 PLL Champions!";
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    const items = name === "reddit-pll" ? [{
      id: "pll-t1", headline: SPOILER, description: "", imageUrl: null, published: "2026-09-21T02:00:00Z",
      byline: "u/fixture", section: "r/PLL", articleUrl: "https://www.reddit.com/r/PLL/comments/t1/", body: "Text.",
    }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(name === "highlights" ? { games: {} } : { items }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: [], favoriteTeams: [], theme: "system", showRatings: false, skipExplainer: true, skipNewsExplainer: true,
      showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
      firstLeague: "pll",
    }));
  });
  await page.clock.setFixedTime(new Date("2026-09-21T09:00:00-04:00"));
  await page.goto("/");
  const title = page.locator(".news-title", { hasText: "Waterdogs are your 2026 PLL Champions" }).first();
  await expect(title).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).filter), { timeout: 3_000 }).toMatch(/blur\(([6-9]|\d\d)/);
  await page.screenshot({ path: `${QA}/news-pll-headline-blurred.png`, fullPage: false });
});
