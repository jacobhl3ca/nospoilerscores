import { expect, test } from "@playwright/test";

// These cases deliberately install different browser clocks and each load a
// live sports slate. Keep them serial so the local dev server is not flooded
// by six simultaneous ESPN-backed fetches.
test.describe.configure({ mode: "serial" });

const MLB_TRADES = 'a[href="https://trades.hidescore.com/?sport=mlb"]';
const NBA_TRADES = 'a[href="https://trades.hidescore.com/?sport=nba"]';

const promos = [
  {
    label: "MLB deadline",
    now: "2026-08-05T16:00:00-04:00",
    league: "m",
    selector: MLB_TRADES,
  },
  {
    label: "NBA deadline",
    now: "2026-02-05T16:00:00-05:00",
    league: "n",
    selector: NBA_TRADES,
  },
  {
    label: "NBA offseason",
    now: "2026-08-05T16:00:00-04:00",
    league: "n",
    selector: NBA_TRADES,
  },
];

test.describe("seasonal trade-board promos", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    for (const promo of promos) {
      test(`${viewport.name} shows the ${promo.label} promo in the subtitle slot`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.clock.setFixedTime(new Date(promo.now));
        await page.goto(`/?l=${promo.league}&s=${promo.league}.0.0&dd=t&dv=s`);

        const link = page.locator(promo.selector);
        await expect(link).toBeVisible({ timeout: 20_000 });
        // Upright with a trailing "↗": the cue that this part of the italic
        // line is a link that leaves the site.
        await expect(link).toHaveText("Trades ↗");
        await expect(link).toHaveCSS("font-style", "normal");
        const subtitle = link.locator("xpath=..");
        const fits = await subtitle.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        );
        expect(fits).toBe(true);
      });
    }
  }
});

test("offseason NBA remains labelled and manually selectable", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-05T16:00:00-04:00"));
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");

  await page.getByRole("button", { name: "MLB", exact: true }).click();
  const nbaOption = page.getByRole("button", { name: "NBA · offseason", exact: true });
  await expect(nbaOption).toBeVisible({ timeout: 20_000 });
  await expect(nbaOption.locator("em")).toHaveText("· offseason");
  await nbaOption.click();

  await expect(page.getByRole("heading", { name: "NBA", exact: true })).toBeVisible();
  await expect(page.locator(NBA_TRADES)).toBeVisible();
});
