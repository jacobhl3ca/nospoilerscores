import { expect, test, type Page } from "@playwright/test";

// The offseason opener used to answer one question two different ways. The past
// tab put a compact "Starts 10/20" in the column header, while Today and
// Tomorrow stacked a two-line "Season starts Oct 20 / 8 weeks away" banner ABOVE
// the very fixtures it was captioning — on a phone that pushed opening night
// below the fold, so the column read exactly like the pre-fix bare countdown
// (Jacob 8/23). All three tabs now wear the header cue, and it shares the italic
// slot with the trade-board promo instead of evicting it.
//
// These load a live ESPN slate, so they assert the SHAPE of the column and never
// a specific date. Serial for the same reason trade-promo.spec.ts is: three
// ranged scoreboard fetches at once floods the local dev server.
test.describe.configure({ mode: "serial" });

const NBA_TRADES = 'a[href="https://trades.hidescore.com/?sport=nba"]';
// Deep in the NBA offseason and inside the 80-day openerInRange window, so the
// ranged lookahead returns opening night. Both halves matter: outside the window
// a bare countdown is the CORRECT render.
const OFFSEASON_NOW = "2026-08-23T22:00:00-04:00";
const TABS = ["Yesterday", "Today", "Tomorrow"] as const;

async function openOffseasonNba(page: Page, tab: string) {
  await page.clock.setFixedTime(new Date(OFFSEASON_NOW));
  await page.goto("/?l=n&s=n.0.0&dd=t&dv=s");
  await expect(page.getByRole("heading", { name: "NBA", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: tab, exact: true }).click();
  // The trade promo shares the subtitle slot with the cue, so waiting on it
  // means the header has settled rather than racing the ranged ESPN fetch.
  await expect(page.locator(NBA_TRADES)).toBeVisible({ timeout: 20_000 });
}

// The whole subtitle line, promo included: "Starts 10/20 · Trades ↗" once the
// schedule is out, a bare "Trades ↗" before it drops.
async function subtitleText(page: Page) {
  return (await page.locator(NBA_TRADES).locator("xpath=..").innerText()).trim();
}

for (const tab of TABS) {
  test(`${tab}: the offseason opener rides in the header, not as a banner`, async ({ page }) => {
    await openOffseasonNba(page, tab);
    const subtitle = await subtitleText(page);
    // No slate published yet means the banner is correct and the assertions
    // below would pass vacuously. Skip loudly instead of reporting a green tick.
    test.skip(!subtitle.startsWith("Starts "), `ESPN has published no opening-night slate for ${tab} yet`);
    // Start date AND the promo, one line, promo last so it sheds first.
    expect(subtitle).toMatch(/^Starts \d{1,2}\/\d{1,2} · Trades ↗$/);
    // ...and the two-line block it replaced is gone from the column body.
    await expect(page.getByText(/^Season starts /)).toHaveCount(0);
    await expect(page.getByText(/^\d+ weeks away$/)).toHaveCount(0);
  });
}

test("all three date tabs answer the offseason the same way", async ({ page }) => {
  const shapes = new Set<string>();
  for (const tab of TABS) {
    await openOffseasonNba(page, tab);
    const banner = (await page.getByText(/^Season starts /).count()) > 0;
    const cue = (await subtitleText(page)).startsWith("Starts ");
    shapes.add(`banner=${banner} cue=${cue}`);
  }
  // The bug was Yesterday disagreeing with Today and Tomorrow.
  expect([...shapes]).toHaveLength(1);
});
