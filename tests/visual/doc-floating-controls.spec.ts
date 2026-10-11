import { expect, test, type Page } from "@playwright/test";

// Doc pages' floating controls (DocFloatingControls, 2026-10-09): a ✕ pill at
// the bottom centre that goes back to the board, and a ▼/▲ arrow at the
// bottom right that jumps to the end and back. Plus the /contact email as a
// blue pill. At a phone width and a desktop width.
//
// The arrow only shows on a page taller than 1.5 screens. /contact is about
// 1,100px tall at 390px and 980px at 1440px, so a 600px-high viewport keeps
// both pages over that line at both widths.

const WIDTHS = [
  { width: 390, height: 600 },
  { width: 1440, height: 600 },
];
const LONG_PAGES = ["/contact", "/privacy"];

const closePill = (page: Page) => page.getByRole("link", { name: "Close and open HideScore" });
const arrow = (page: Page) => page.locator(".doc-float-arrow");

for (const size of WIDTHS) {
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size });

    for (const path of LONG_PAGES) {
      test(`${path}: ✕ pill, scroll arrow, last line clear`, async ({ page }) => {
        await page.goto(path);

        const close = closePill(page);
        await expect(close).toBeVisible();
        await expect(close).toHaveAttribute("href", "/");
        const box = (await close.boundingBox())!;
        expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(2);
        expect(box.y + box.height).toBeGreaterThan(size.height - 80);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);

        // At the top: ▼ goes to the end.
        await expect(arrow(page)).toHaveText("▼");
        await expect(arrow(page)).toHaveAttribute("aria-label", "Scroll to bottom");
        await arrow(page).click();
        await expect
          .poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1))
          .toBe(true);

        // At the end, nothing covers the last paragraph.
        const last = page.locator("main p").last();
        const lastBox = (await last.boundingBox())!;
        const closeBox = (await close.boundingBox())!;
        expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(closeBox.y);

        // Now ▲ goes back to the top.
        await expect(arrow(page)).toHaveText("▲");
        await expect(arrow(page)).toHaveAttribute("aria-label", "Scroll to top");
        await arrow(page).click();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await expect(arrow(page)).toHaveText("▼");

        if (size.width === 390) {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow).toBeLessThanOrEqual(0);
        }
      });
    }

    test("/contact: the email is a blue pill", async ({ page }) => {
      await page.goto("/contact");
      const email = page.locator('main a[href^="mailto:"]').first();
      await expect(email).toBeVisible();
      await expect(email).toHaveAttribute("href", /^mailto:/);
      const accent = await page.getByRole("link", { name: "Open HideScore", exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
      const bg = await email.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe(accent);
      expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("/notrack (short page): ✕ pill, no arrow", async ({ page }) => {
      await page.goto("/notrack");
      await expect(closePill(page)).toBeVisible();
      // Let the effect run before checking that it left the arrow out.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(arrow(page)).toHaveCount(0);
    });
  });
}
