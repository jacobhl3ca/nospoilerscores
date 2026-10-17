import { expect, test, type Page } from "@playwright/test";
import { supportLiveOn } from "../../src/lib/supportLinks";

// /sponsors (2026-10-15): built now, hidden until SUPPORT_LIVE_FROM (Dec 15).
// The body and the footer link are gated in the browser, so the Playwright
// clock opens them. The sitemap entry and robots tag are gated at build time,
// and the dev server renders with the real date, so those checks only run
// while the real date is before Dec 15 (BUILT_CLOSED).
// Formspree is route-intercepted, so nothing is really sent.

const FORMSPREE = "https://formspree.io/f/mkgqkgyr";
const BEFORE = new Date("2026-12-14T23:30:00-05:00");
const AFTER = new Date("2026-12-15T00:05:00-05:00");
const SIZES = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const THEMES = ["light", "dark"] as const;
const BUILT_CLOSED = !supportLiveOn();

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("nss-preferences", JSON.stringify({ theme: t })), theme);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`${size.width}px ${theme}: before Dec 15 the page reads "Opens Dec 15." only`, async ({ page }) => {
      await page.setViewportSize(size);
      await setTheme(page, theme);
      await page.clock.setFixedTime(BEFORE);
      const res = await page.goto("/sponsors");
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1, name: "Sponsors" })).toBeVisible();
      await expect(page.getByTestId("sponsors-gate")).toHaveText("Opens Dec 15.");
      await expect(page.getByTestId("sponsors-body")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Become a sponsor" })).toHaveCount(0);
      await expect(page.locator("main h2")).toHaveCount(0);
      if (BUILT_CLOSED) await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('a[href="/sponsors"]')).toHaveCount(0);
      await noOverflow(page);
    });

    test(`${size.width}px ${theme}: from Dec 15 all 3 sections, empty states, and the sponsor form`, async ({ page }) => {
      const bodies: Record<string, unknown>[] = [];
      await page.route(FORMSPREE, async (route) => {
        bodies.push(JSON.parse(route.request().postData() || "{}"));
        await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      });
      await page.setViewportSize(size);
      await setTheme(page, theme);
      await page.clock.setFixedTime(AFTER);
      await page.goto("/sponsors");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const body = page.getByTestId("sponsors-body");
      await expect(body).toBeVisible();
      await expect(page.getByTestId("sponsors-gate")).toHaveCount(0);
      await expect(body.getByText("HideScore is free. Sponsors keep it that way.")).toBeVisible();
      await expect(body.locator("h2")).toHaveText(["Sponsors", "Patrons", "Become a sponsor"]);
      await expect(body.getByText("No sponsors yet.")).toBeVisible();
      await expect(body.getByText("Be the first patron.")).toBeVisible();
      // PATREON_URL is empty until Jacob sends it: no Patreon link, no prices.
      await expect(page.getByTestId("sponsors-patreon")).toHaveCount(0);
      await expect(body).not.toContainText("$");

      await page.getByRole("button", { name: "Become a sponsor" }).click();
      const input = page.locator("#hs-feedback-input");
      await expect(input).toBeVisible();
      await expect(input).toHaveValue("Sponsor: ");
      await expect(page.locator("#hs-feedback-form .kind-pill")).toHaveCount(0);
      await input.fill("Sponsor: Acme Sports, hi@acme.example");
      await page.locator("#hs-feedback-form").getByRole("button", { name: "Send feedback" }).click();
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0]).toMatchObject({ message: "Sponsor: Acme Sports, hi@acme.example" });
      await noOverflow(page);
    });
  }
}

test("native shell: nothing paid, even after Dec 15", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  });
  await page.clock.setFixedTime(AFTER);
  await page.goto("/sponsors");
  await expect(page.getByTestId("sponsors-native")).toHaveText("HideScore is free.");
  await expect(page.getByTestId("sponsors-body")).toHaveCount(0);
  await expect(page.getByTestId("sponsors-gate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Become a sponsor" })).toHaveCount(0);
});

test("before Dec 15 (build date): no /sponsors in the sitemap", async ({ request }) => {
  test.skip(!BUILT_CLOSED, "the build-time gate is already open");
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("https://hidescore.com/wall-of-fame");
  expect(xml).not.toContain("/sponsors");
});

// The one footer link to /sponsors rides the support line (the link row is
// full at one line), so it follows the same view-time gate.
test("footer: no /sponsors link before Dec 15, on the support line from Dec 15", async ({ page }) => {
  await page.clock.setFixedTime(BEFORE);
  await page.goto("/about");
  await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Wall of fame" })).toBeVisible();
  await expect(page.locator('a[href="/sponsors"]')).toHaveCount(0);

  await page.clock.setFixedTime(AFTER);
  await page.goto("/about");
  const link = page.getByTestId("support-line-sponsors");
  await expect(link).toHaveAttribute("href", "/sponsors");
  await expect(page.locator('nav[aria-label="Site"] a[href="/sponsors"]')).toHaveCount(0);
  await link.click();
  await expect(page).toHaveURL((u) => u.pathname === "/sponsors");
  await expect(page.getByTestId("sponsors-body")).toBeVisible();
  // The page does not link to itself.
  await expect(page.getByTestId("support-line")).toBeVisible();
  await expect(page.getByTestId("support-line-sponsors")).toHaveCount(0);
});

test("footer: the native shell has no /sponsors link after Dec 15", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  });
  await page.clock.setFixedTime(AFTER);
  await page.goto("/about");
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();
  await expect(page.locator('a[href="/sponsors"]')).toHaveCount(0);
});
