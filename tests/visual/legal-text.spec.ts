import { expect, test } from "@playwright/test";

// Legal text (2026-10-16, report #399): the outside services on /privacy, the
// DMCA agent placeholder and repeat-infringer line on /terms, and the bracket
// picks rules on /terms. Both pages keep the device theme and fit a phone.

const SERVICES = [
  "Cloudflare", "Umami", "GoatCounter", "Sentry", "Apple", "Google", "Resend", "Formspree", "GitHub",
  "images.weserv.nl", "Open-Meteo",
];

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${size.width}px ${scheme}: /privacy lists the outside services`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      const res = await page.goto("/privacy");
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 2, name: "Outside services we use" })).toBeVisible();
      const names = page.locator("[data-services] li > strong");
      for (const name of SERVICES) await expect(names.getByText(name, { exact: true })).toHaveCount(1);
      await expect(page.locator("main time")).toHaveAttribute("datetime", "2026-10-16");
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g)!.map(Number);
      expect((r + g + b) / 3 > 128).toBe(scheme === "light");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`${size.width}px ${scheme}: /terms has the DMCA lines and the bracket rules`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      const res = await page.goto("/terms#bracket-rules");
      expect(res?.status()).toBe(200);
      await expect(page.locator("[data-dmca-agent]")).toHaveText(/^\[DMCA AGENT: .+ TO BE ADDED BY THE OWNER\]$/);
      await expect(page.locator("[data-repeat-infringer]")).toContainText(
        "We end the accounts of repeat infringers in appropriate circumstances",
      );
      const rules = page.locator("#bracket-rules + ul");
      await expect(page.locator("#bracket-rules")).toBeInViewport();
      await expect(rules).toContainText("Apple and Google are not sponsors");
      await expect(rules).toContainText("18 or older");
      await expect(rules).toContainText("Brackets sent after the lock play for fun and cannot win.");
      await expect(rules.locator("a[href='mailto:hi@hidescore.com']")).toHaveCount(1);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g)!.map(Number);
      expect((r + g + b) / 3 > 128).toBe(scheme === "light");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
