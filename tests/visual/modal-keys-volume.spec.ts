import { expect, test, type Page } from "@playwright/test";
import { BASE_PREFS, FAKE_YT_API } from "./fake-video";

// Jacob 10/11: on a video ↑/↓ are the volume and Shift+↑/↓ page. The direct
// stream half (a native <video>) is in modal-keys-news-native-video.spec.ts.
// This is the YouTube half, with the modal's own control bar (Settings →
// "Safe" controls), where the seek bar and the volume bar are focusable
// sliders that took every arrow, Shift or not, while the modal's handler took
// the same press too.

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const ITEMS = [
  { ...base, id: "t1", headline: "Volume post one: the text before", articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph one." },
  { ...base, id: "yt", headline: "Volume video: all the highlights", articleUrl: "https://www.youtube.com/watch?v=fixtureVOL", youtubeVideoId: "fixtureVOL" },
  { ...base, id: "t2", headline: "Volume post two: the text after", articleUrl: "https://www.reddit.com/r/nfl/comments/t2/", body: "Another." },
];

async function setup(page: Page) {
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), { ...BASE_PREFS, youtubeNativeControls: false });
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#235'></body>" }));
  await page.goto("/");
}

async function openPost(page: Page, headline: string) {
  await page.locator('button[aria-label="Open post"], button[aria-label="Play highlight"]', { hasText: headline }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByTestId("modal-controls")).toBeVisible();
}

const dialog = (page: Page) => page.getByRole("dialog");
const volumeBar = (page: Page) => dialog(page).getByRole("slider", { name: "Volume" });
const level = (page: Page) => volumeBar(page).getAttribute("aria-valuenow");
const onVideo = (page: Page) => expect(dialog(page).locator("iframe")).toBeVisible();
const onText = (page: Page, text: string) => expect(dialog(page).getByText(text, { exact: false }).first()).toBeVisible();
const panel = (page: Page) => page.getByRole("group", { name: "Keyboard shortcuts" });
const keysOf = (page: Page, label: string) =>
  panel(page).locator("div", { has: page.locator("dd", { hasText: new RegExp(`^${label}$`) }) }).last().locator("kbd").allTextContents();

test("YouTube clip: ↑/↓ step the volume by 5 and do not page", async ({ page }) => {
  await setup(page);
  await openPost(page, "Volume video");
  await onVideo(page);
  await expect(volumeBar(page)).toBeVisible();

  // The clip starts muted, so the first ↑ is a step up from 0.
  await expect.poll(() => level(page)).toBe("0");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => level(page)).toBe("5");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => level(page)).toBe("10");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => level(page)).toBe("5");
  await expect(dialog(page).getByRole("button", { name: "Mute" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => level(page)).toBe("0");
  await expect(dialog(page).getByRole("button", { name: "Unmute" })).toBeVisible();
  await onVideo(page);

  await page.keyboard.press("Shift+ArrowDown");
  await onText(page, "Volume post two");
  await page.keyboard.press("Shift+ArrowUp");
  await onVideo(page);
  await page.keyboard.press("Shift+ArrowUp");
  await onText(page, "Volume post one");
});

test("YouTube clip: with focus on the volume bar, plain ↓ lowers it once and ⇧↓ pages", async ({ page }) => {
  await setup(page);
  await openPost(page, "Volume video");
  await onVideo(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => level(page)).toBe("10");

  await volumeBar(page).focus();
  // The bar's own step, and no page turn with it.
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => level(page)).toBe("5");
  await page.waitForTimeout(150);
  expect(await level(page)).toBe("5");
  await onVideo(page);

  await page.keyboard.press("Shift+ArrowDown");
  await onText(page, "Volume post two");
});

// What the Next post button names as its shortcut on a video.
const NEXT_ON_VIDEO = ["Shift", "ArrowDown"].join("+");

const seeks = (page: Page) => page.evaluate(() => (window as unknown as { __seeks: unknown[] }).__seeks.length);

test("YouTube clip: with focus on the seek bar, a plain arrow skips once, and ⇧↑ and ⇧→ page", async ({ page }) => {
  await setup(page);
  await openPost(page, "Volume video");
  await onVideo(page);
  const seekBar = dialog(page).getByRole("slider", { name: /Seek through the clip/ });
  await seekBar.focus();
  // The bar's own nudge, once: the modal's handler leaves the press alone, so
  // → is not two skips and ↑ is not a skip plus a volume step.
  const n = await seeks(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seeks(page)).toBe(n + 1);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => seeks(page)).toBe(n + 2);
  await page.waitForTimeout(150);
  expect(await seeks(page)).toBe(n + 2);
  expect(await level(page)).toBe("0");
  await onVideo(page);

  await page.keyboard.press("Shift+ArrowRight");
  await onText(page, "Volume post two");
  await page.keyboard.press("Shift+ArrowLeft");
  await onVideo(page);
  await dialog(page).getByRole("slider", { name: /Seek through the clip/ }).focus();
  await page.keyboard.press("Shift+ArrowUp");
  await onText(page, "Volume post one");
});

test("the key legend: Volume and ⇧ paging on a video, plain ↑ ↓ paging on a text post", async ({ page }) => {
  await setup(page);
  await openPost(page, "Volume video");
  await onVideo(page);
  await page.getByTestId("modal-controls").getByRole("button", { name: "Keys", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  expect(await keysOf(page, "Volume")).toEqual(["↑", "↓"]);
  expect(await keysOf(page, "Prev / next post")).toEqual(["⇧↑", "⇧↓"]);
  const prev = page.getByTestId("modal-controls").getByRole("button", { name: "Previous post" });
  const next = page.getByTestId("modal-controls").getByRole("button", { name: "Next post" });
  await expect(prev).toHaveAttribute("title", "Previous post (⇧↑)");
  await expect(next).toHaveAttribute("aria-keyshortcuts", NEXT_ON_VIDEO);

  // The text post before it: the plain pair still pages, and the legend says so.
  await page.keyboard.press("Shift+ArrowUp");
  await onText(page, "Volume post one");
  await expect(panel(page)).toBeVisible();
  expect(await keysOf(page, "Next post")).toEqual(["→", "↓"]);
  await expect(panel(page).locator("dd", { hasText: /^Volume$/ })).toHaveCount(0);
  await expect(next).toHaveAttribute("title", "Next post (↓)");
  await expect(next).toHaveAttribute("aria-keyshortcuts", "ArrowDown");
  await page.keyboard.press("ArrowDown");
  await onVideo(page);
});
