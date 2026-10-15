import { expect, test } from "@playwright/test";

// /terms (2026-10-11): as is with no warranty, third-party data and
// trademarks, the takedown address, New Jersey law and the change notice, plus
// the "Terms" link after Privacy in both footers. The not-affiliated sentence
// sits in the Terms body only; both footers dropped it (10/14).

const NOT_AFFILIATED = "HideScore is not affiliated with, endorsed by, or sponsored by any league, team or broadcaster.";

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`${size.width}px: /terms has every section`, async ({ page }) => {
    await page.setViewportSize(size);
    const res = await page.goto("/terms");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await expect(page.locator("main h2")).toHaveText([
      "Provided as is",
      "Limit of liability",
      "Third-party data and content",
      "Trademarks",
      "Takedown requests",
      "Governing law",
      "Changes and contact",
    ]);
    const main = page.locator("main section");
    await expect(main).toContainText("with no warranty of any kind");
    await expect(main).toContainText("public sports sites and video services");
    await expect(main).toContainText("trademarks of their owners");
    await expect(main).toContainText("The laws of the State of New Jersey, USA, govern these terms");
    await expect(main).toContainText("Changes are posted here with a new date.");
    // The takedown address is the readable mailto, not a Cloudflare-obfuscated one.
    const mail = page.locator("#takedown + p a");
    await expect(mail).toHaveAttribute("href", "mailto:hi@hidescore.com");
    await expect(mail).toHaveText("hi@hidescore.com");
    await expect(page.locator("main time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);

    // The not-affiliated sentence is in the body once, not in the footer; no
    // "Terms" link to itself.
    await expect(page.locator("main", { hasText: NOT_AFFILIATED })).toHaveCount(1);
    await expect(main.locator("p", { hasText: NOT_AFFILIATED })).toHaveCount(1);
    await expect(page.locator("main > p", { hasText: NOT_AFFILIATED })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Site" });
    await expect(nav.getByRole("link", { name: "Terms" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("doc footer: Terms is the last link, after Privacy", async ({ page }) => {
  await page.goto("/privacy");
  const nav = page.getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link").last()).toHaveText("Terms");
  await expect(nav.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await page.goto("/about");
  const labels = await page.getByRole("navigation", { name: "Site" }).getByRole("link").allTextContents();
  expect(labels.slice(-2)).toEqual(["Privacy", "Terms"]);
  // No not-affiliated line under the doc footer (10/14).
  await page.goto("/faq");
  await expect(page.locator("main > p", { hasText: NOT_AFFILIATED })).toHaveCount(0);
  await expect(page.getByText(NOT_AFFILIATED)).toHaveCount(0);
});

test("board footer: WOF after Guides, Terms after Privacy, no not-affiliated line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    defaultLandingView: "scores",
  })));
  await page.goto("/");
  const footer = page.locator("footer");
  const terms = footer.getByRole("link", { name: "Terms", exact: true });
  await expect(terms).toHaveAttribute("href", "/terms");
  const labels = await footer.locator("a").allTextContents();
  expect(labels.indexOf("Terms")).toBe(labels.indexOf("Privacy") + 1);
  expect(labels.indexOf("WOF")).toBe(labels.indexOf("Guides") + 1);
  await expect(footer.getByRole("link", { name: "WOF: Wall of Fame", exact: true })).toHaveAttribute("href", "/wall-of-fame");
  await expect(footer.getByText(NOT_AFFILIATED)).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
