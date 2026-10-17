import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Postponed games (Jacob 10/17). On Fri Oct 16 the ALCS Game 4 rainout was the
// only MLB game, the board dropped it, and Dad saw an MLB column with no
// reason. The called game now leads its column as a plain card, the replay
// day's label loses ESPN's "Makeup of Oct 16" tail, and the replay card says
// where it came from. The ESPN shapes are the real 10/16–10/18 scoreboards
// (tests/fixtures/alcs-rainout-2026-10-16.json).

type Ev = Record<string, unknown> & { id: string; date: string; status: { type: { name: string; state: string } } };
const FIX = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "alcs-rainout-2026-10-16.json"), "utf8")) as Record<string, Ev[]>;

// A finished regular-season game between two other teams, for the "postponed sits
// above the final" check.
function finalGame(): Ev {
  const fri = FIX["20261016"][0];
  const ev = JSON.parse(JSON.stringify(fri)) as Ev & { competitions: Array<{ competitors: Array<Record<string, unknown>>; notes: unknown[] }> };
  ev.id = "401999001";
  ev.date = "2026-10-16T17:00Z";
  ev.name = "Seattle Mariners at Houston Astros";
  ev.shortName = "SEA @ HOU";
  ev.status = { type: { name: "STATUS_FINAL", state: "post", detail: "Final", shortDetail: "Final", completed: true } } as Ev["status"];
  // Not a playoff game, so no "Show teams" cover hides it.
  ev.season = { type: 2 };
  ev.competitions[0].notes = [];
  ev.competitions[0].competitors = [
    { homeAway: "home", score: "4", winner: true, records: [], team: { id: "18", abbreviation: "HOU", displayName: "Houston Astros", shortDisplayName: "Astros", logo: "", color: "666666" } },
    { homeAway: "away", score: "3", winner: false, records: [], team: { id: "12", abbreviation: "SEA", displayName: "Seattle Mariners", shortDisplayName: "Mariners", logo: "", color: "666666" } },
  ];
  return ev;
}

// The LCS covers its teams until "Show teams" (lib/pairingMask.ts). Most
// checks read the teams, so they start with the TB–CLE series opened.
const TB_CLE_REVEALED = "mlb:2026:30-5";

async function setup(page: Page, opts: { clock: string; theme?: "light" | "dark"; days?: Record<string, Ev[]>; covered?: boolean }) {
  await page.clock.setFixedTime(new Date(opts.clock));
  if (!opts.covered) await page.addInitScript((key) => localStorage.setItem("hs:pairing-revealed-v2", key), TB_CLE_REVEALED);
  await page.addInitScript((theme) => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"],
    favoriteTeams: [],
    theme,
    showRatings: true,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "mlb",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })), opts.theme ?? "light");
  await page.route("**/news/highlights.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.route("**/statsapi.mlb.com/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/youtube?**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No results"}' }));
  const days = opts.days ?? FIX;
  await page.route("**/baseball/mlb/scoreboard**", (route) => {
    const ymd = new URL(route.request().url()).searchParams.get("dates") ?? "";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: days[ymd] ?? [] }) });
  });
}

const calledCard = (page: Page) => page.locator("[data-called-game]");

// WCAG relative-luminance contrast of an element's text on its own background.
async function pillContrast(page: Page): Promise<number> {
  return page.locator("[data-called-status]").first().evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(el);
    const a = lum(parse(cs.color));
    const b = lum(parse(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Fri, postponed only (${theme}): the card leads the column and names Sat 8 PM`, async ({ page }) => {
    await setup(page, { clock: "2026-10-16T18:00:00-04:00", theme });
    await page.goto("/");
    const card = calledCard(page);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.locator("[data-called-status]")).toHaveText("POSTPONED · Rain");
    await expect(card.locator("[data-called-next]")).toHaveText("Next game: Sat Oct 17, 8:00 PM");
    await expect(card.locator("[data-called-label]")).toHaveText("ALCS · Game 4");
    // No rating badge, no highlights, not a button.
    await expect(card.locator('[role="img"][aria-label^="Worth-watching"]')).toHaveCount(0);
    await expect(card.locator(".highlight-btn, button, a")).toHaveCount(0);
    // Saturday's game shows below it.
    const sat = page.locator('[aria-label="Tampa Bay Rays at Cleveland Guardians — game details"]').first();
    await expect(sat).toBeVisible();
    const cardBox = (await card.boundingBox())!;
    const satBox = (await sat.boundingBox())!;
    expect(cardBox.y).toBeLessThan(satBox.y);
    expect(await pillContrast(page)).toBeGreaterThanOrEqual(4.5);
  });
}

test("Fri, covered series: the card names the round, not the teams, until Show teams", async ({ page }) => {
  await setup(page, { clock: "2026-10-16T18:00:00-04:00", covered: true });
  await page.goto("/");
  const card = calledCard(page);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card.locator("[data-called-status]")).toHaveText("POSTPONED · Rain");
  await expect(card.locator("[data-called-next]")).toHaveText("Next game: Sat Oct 17, 8:00 PM");
  await expect(card).toContainText("ALCS · Game 4");
  await expect(card).not.toContainText("TB");
  await expect(card).not.toContainText("CLE");
  await card.getByRole("button", { name: /Show teams/ }).click();
  await expect(calledCard(page)).toContainText("TB");
  await expect(calledCard(page)).toContainText("CLE");
});

test("a day with a final and a postponed game: the postponed card is above the final", async ({ page }) => {
  await setup(page, {
    clock: "2026-10-16T21:00:00-04:00",
    days: { ...FIX, "20261016": [finalGame(), ...FIX["20261016"]] },
  });
  await page.goto("/");
  const card = calledCard(page);
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  const fin = page.locator('[aria-label="Seattle Mariners at Houston Astros — game details"]').first();
  await expect(fin).toBeVisible();
  expect((await card.boundingBox())!.y).toBeLessThan((await fin.boundingBox())!.y);
});

test("Sun: the makeup game's label reads ALCS · Game 5, no 'Makeup'", async ({ page }) => {
  await setup(page, { clock: "2026-10-18T12:00:00-04:00" });
  await page.goto("/");
  await expect(page.locator('[aria-label="Tampa Bay Rays at Cleveland Guardians — game details"]').first()).toBeVisible({ timeout: 30_000 });
  const main = page.locator("main");
  await expect(main).toContainText(/ALCS · (Game 5|G5)/);
  await expect(main).not.toContainText("Makeup");
  await expect(calledCard(page)).toHaveCount(0);
});

test("Sat: Game 4 says it was moved from Fri (rain)", async ({ page }) => {
  await setup(page, { clock: "2026-10-17T12:00:00-04:00" });
  await page.goto("/");
  const sat = page.locator('[aria-label="Tampa Bay Rays at Cleveland Guardians — game details"]').first();
  await expect(sat).toBeVisible({ timeout: 30_000 });
  await expect(sat.locator("[data-moved-from]")).toHaveText("Moved from Fri (rain)", { timeout: 15_000 });
  await expect(calledCard(page)).toHaveCount(0);
});

test("Sat, covered series: the cover still says moved from Fri (rain)", async ({ page }) => {
  await setup(page, { clock: "2026-10-17T12:00:00-04:00", covered: true });
  await page.goto("/");
  await expect(page.locator("[data-pairing-mask] [data-moved-from]").first()).toHaveText("Moved from Fri (rain)", { timeout: 30_000 });
});
