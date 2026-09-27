import { expect, test, type Page } from "@playwright/test";

// The card's "+N" networks overlay capped itself at 65% of the card and kept
// every name on one line, so a long RSN ("Space City Home Network") ran past
// the box's right border and pushed the ✕ out with it (9/26). The box now
// sizes to its longest name, capped at the card, and names wrap only when
// that cap bites. Checked at desktop, tablet and phone widths.

async function setMlb(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"],
    favoriteTeams: [],
    theme: "light",
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
  })));
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"games":{}}',
  }));
}

function upcomingGame(networks: string[]) {
  return JSON.stringify({
    events: [{
      id: "401999101",
      date: "2026-09-27T23:10:00Z",
      name: "Los Angeles Angels at Houston Astros",
      shortName: "LAA @ HOU",
      season: { type: 2 },
      status: {
        displayClock: "0:00",
        period: 0,
        type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sun, September 27th at 7:10 PM EDT", shortDetail: "9/27 - 7:10 PM EDT", completed: false },
      },
      competitions: [{
        competitors: [
          { homeAway: "home", team: { id: "18", displayName: "Houston Astros", shortDisplayName: "Astros", abbreviation: "HOU", logo: "", color: "002D62" }, score: "0", records: [{ summary: "88-73" }] },
          { homeAway: "away", team: { id: "3", displayName: "Los Angeles Angels", shortDisplayName: "Angels", abbreviation: "LAA", logo: "", color: "BA0021" }, score: "0", records: [{ summary: "70-91" }] },
        ],
        broadcasts: [{ names: networks }],
        headlines: [],
        notes: [],
      }],
    }],
  });
}

async function openOverlay(page: Page, networks: string[]) {
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00-04:00"));
  await setMlb(page);
  await page.route("**/baseball/mlb/scoreboard?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: upcomingGame(networks),
  }));
  await page.goto("/");
  await page.locator('button[aria-haspopup="dialog"][title^="See all networks"]').locator("visible=true").first().click();
  const overlay = page.getByRole("dialog", { name: "Where to watch" });
  await expect(overlay).toBeVisible();
  return overlay;
}

const LONG = ["Space City Home Network", "MLB.TV", "FanDuel Sports Network West"];

for (const width of [1440, 1024, 390]) {
  test(`networks overlay at ${width}px: every name and the ✕ sit inside the box and the card`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const overlay = await openOverlay(page, LONG);
    const fit = await overlay.evaluate((box) => {
      const b = box.getBoundingClientRect();
      const card = (box as HTMLElement).offsetParent!.getBoundingClientRect();
      const kids = [...box.querySelectorAll("a, button")].map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent, left: r.left, right: r.right };
      });
      return { box: { left: b.left, right: b.right }, card: { left: card.left, right: card.right }, kids };
    });
    expect(fit.kids.length).toBe(LONG.length + 1);
    for (const k of fit.kids) {
      expect(k.right, `${k.text} right edge`).toBeLessThanOrEqual(fit.box.right + 0.5);
      expect(k.left, `${k.text} left edge`).toBeGreaterThanOrEqual(fit.box.left - 0.5);
    }
    expect(fit.box.right).toBeLessThanOrEqual(fit.card.right + 0.5);
    expect(fit.box.left).toBeGreaterThanOrEqual(fit.card.left - 0.5);
  });
}

test("short two-network list keeps each name on one line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const overlay = await openOverlay(page, ["SNY", "NBCS-CA"]);
  const heights = await overlay.locator("a").evaluateAll((els) =>
    els.map((el) => el.getClientRects().length));
  expect(heights).toEqual([1, 1]);
});
