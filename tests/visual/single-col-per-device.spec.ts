import { expect, test, type Page } from "@playwright/test";

// A10 (Jacob 9/22): single-column view set on the PC followed him to the phone,
// and a portrait phone had no toggle to turn it off. Now the phone header has
// the toggle, and the setting never rides the account sync.

function prefs(extra: Record<string, unknown> = {}) {
  return {
    favoriteLeagues: ["mlb", "nfl"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  };
}

async function seed(page: Page, local: Record<string, unknown>) {
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("nss-preferences", JSON.stringify(p));
      sessionStorage.setItem("seeded", "1");
    }
  }, prefs(local));
  await page.route("**/news/highlights.json", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
}

// 390 = iPhone 12-16; 430 = Pro Max. Below 390 the row is already full (the
// calendar reaches the moon at 375), so the toggle stays in Settings there.
for (const width of [390, 430]) {
  test(`portrait phone at ${width}px: the header has the single-column toggle and it turns the view off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { singleColumn: true });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Toggle single-column view" }).locator("visible=true");
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Inside the viewport and not under the theme button.
    const box = (await toggle.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const theme = (await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(theme.x);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
    expect(stored.singleColumn).toBe(false);
  });
}

test("375px phone: no header toggle (no room in the row)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, { singleColumn: true });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle single-column view" }).locator("visible=true")).toHaveCount(0);
});

test("signed in: the server's single-column value is ignored on pull and never sent on push", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, { singleColumn: false });
  const puts: Record<string, unknown>[] = [];
  await page.route("**/api/me", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: true, email: "t@example.com", uid: "u1", platforms: {} }),
  }));
  await page.route("**/api/prefs", route => {
    if (route.request().method() === "PUT") {
      puts.push(JSON.parse(route.request().postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    // Written by the PC before this change: carries singleColumn:true.
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ prefs: prefs({ singleColumn: true, newsSingleColumn: true, theme: "dark" }) }),
    });
  });

  await page.goto("/");
  // The pull landed (theme is a synced key) …
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // … and this device kept its own layout.
  const toggle = page.getByRole("button", { name: "Toggle single-column view" }).locator("visible=true");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
  expect(stored.singleColumn).toBe(false);
  expect(stored.newsSingleColumn).toBeUndefined();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => puts.length, { timeout: 5000 }).toBeGreaterThan(0);
  for (const body of puts) {
    expect(body).not.toHaveProperty("singleColumn");
    expect(body).not.toHaveProperty("newsSingleColumn");
  }
});
