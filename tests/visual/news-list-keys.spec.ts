import { expect, test, type Page } from "@playwright/test";

// The News list's keys (Jacob 10/7): H flips the Headlines chip, M the Media
// chip, E Hide seen. Each is the same tap the chip takes, so the chip's
// aria-pressed is the read-back. They stand down while a post is open (the
// modal owns H there) and while focus is in a text field.

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const ITEMS = [
  { ...base, id: "n1", headline: "List key post one", articleUrl: "https://www.reddit.com/r/nfl/comments/n1/", body: "Paragraph one." },
  { ...base, id: "n2", headline: "List key post two", articleUrl: "https://www.reddit.com/r/nfl/comments/n2/", body: "Another." },
];

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today", showTextPosts: true,
    }));
  });
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.goto("/");
  await expect(page.locator('button[aria-label="Open post"]', { hasText: "List key post one" }).first()).toBeVisible();
}

const headlines = (page: Page) => page.getByRole("button", { name: "Toggle headline reveal" });
const media = (page: Page) => page.getByRole("button", { name: "Toggle media reveal" });
const hideSeen = (page: Page) => page.getByTestId("news-hide-seen");

test("H, M and E flip the Headlines, Media and Hide seen chips, and back", async ({ page }) => {
  await setup(page);
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("h");
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/reveal-news-titles/);
  await page.keyboard.press("h");
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");

  await expect(media(page)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("m");
  await expect(media(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("M");
  await expect(media(page)).toHaveAttribute("aria-pressed", "false");

  await expect(hideSeen(page)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("e");
  await expect(hideSeen(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("e");
  await expect(hideSeen(page)).toHaveAttribute("aria-pressed", "false");
});

test("with a post open the list keys stand down (the modal owns H)", async ({ page }) => {
  await setup(page);
  await page.locator('button[aria-label="Open post"]', { hasText: "List key post one" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  for (const key of ["h", "m", "e"]) await page.keyboard.press(key);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");
  await expect(media(page)).toHaveAttribute("aria-pressed", "false");
  await expect(hideSeen(page)).toHaveAttribute("aria-pressed", "false");
});

test("typing in a text field or opening the source filter: no chip flips", async ({ page }) => {
  await setup(page);
  // Any text field on the page — the gate is the focused element, not where
  // it sits.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "text";
    input.id = "probe-input";
    document.body.appendChild(input);
  });
  await page.locator("#probe-input").focus();
  await page.keyboard.type("hme");
  await expect(page.locator("#probe-input")).toHaveValue("hme");
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");
  await expect(media(page)).toHaveAttribute("aria-pressed", "false");
  await expect(hideSeen(page)).toHaveAttribute("aria-pressed", "false");
  await page.locator("#probe-input").blur();

  await page.getByRole("button", { name: "Filter news" }).click();
  await expect(page.getByRole("dialog", { name: "Filter news by source" })).toBeVisible();
  await page.keyboard.press("h");
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");
});

test("Cmd/Ctrl chords stay the browser's", async ({ page }) => {
  await setup(page);
  await page.keyboard.press("Control+h");
  await page.keyboard.press("Alt+m");
  await expect(headlines(page)).toHaveAttribute("aria-pressed", "false");
  await expect(media(page)).toHaveAttribute("aria-pressed", "false");
});
