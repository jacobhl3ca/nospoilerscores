import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// ESPN Videos items carry a baked videoUrl (a direct mp4 on ESPN's akamaized
// CDN, scripts/lib/espn-clip.mjs) and play in our modal's native <video>.
// An item without one, or with a URL off that CDN, keeps the still image and
// the "Open on ESPN" link (Jacob 10/1).
//
// The clip is a real WebM recorded at test time (see
// modal-keys-news-native-video.spec.ts), served at the mp4 URL.

let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(2000);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

// 1×1 PNG for every still.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPpfDwAE/wH+wbXp5wAAAABJRU5ErkJggg==", "base64");
const CDN = "https://espnmedia-cdn.akamaized.net/espn/media";
const base = { description: "", published: "", byline: "", section: "ESPN Video" };
const ITEMS = [
  { ...base, id: "50000001", headline: "Playable clip one", imageUrl: `${CDN}/common/one.jpg`, articleUrl: "https://www.espn.com/video/clip?id=50000001", videoUrl: `${CDN}/16x9/one/one.mp4`, durationSec: 61 },
  { ...base, id: "50000002", headline: "Still clip two", imageUrl: `${CDN}/common/two.jpg`, articleUrl: "https://www.espn.com/video/clip?id=50000002" },
  { ...base, id: "50000003", headline: "Off-CDN clip three", imageUrl: `${CDN}/common/three.jpg`, articleUrl: "https://www.espn.com/video/clip?id=50000003", videoUrl: "https://cdn.example.test/three.mp4" },
];

async function openNews(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
    showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", newsTypeFilter: "all",
    // NFL pinned to column 1 so the settled layout does not follow the
    // auto-picker; a Top news pick keeps ESPN Videos in a column.
    newsTopNews: true, firstLeague: "nfl",
  })));
  await page.route("**/news/*.json", (route) => {
    const url = route.request().url();
    const body = url.includes("highlights.json") ? '{"games":{}}'
      : url.includes("/espn-videos.json") ? JSON.stringify({ items: ITEMS })
      : '{"items":[]}';
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.route(`${CDN}/**`, (route) => route.request().url().endsWith(".mp4")
    ? route.fulfill({ status: 200, contentType: "video/webm", body: CLIP })
    : route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("https://cdn.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
  await page.goto("/");
  // Wait for the settled layout: the news view holds a skeleton until the
  // first board load lands, then paints NFL first (Jacob 10/2).
  await expect(page.locator('button[title="Switch news league"]').first()).toHaveText("NFL");
}

const row = (page: Page, text: RegExp) =>
  page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: text }).first();
const dialog = (page: Page) => page.getByRole("dialog").filter({ has: page.locator(".news-title") }).first();

test("an ESPN Videos item with a baked mp4 plays in the modal's <video>", async ({ page }) => {
  await openNews(page);
  await row(page, /Playable clip one/).click();
  const video = page.locator('[role="dialog"] video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", `${CDN}/16x9/one/one.mp4`);
  await expect(dialog(page).getByText(/Open on ESPN/).first()).toBeVisible();
});

test("an ESPN Videos item without one, or off the CDN, keeps the still + Open on ESPN", async ({ page }) => {
  await openNews(page);
  for (const name of [/Still clip two/, /Off-CDN clip three/]) {
    await row(page, name).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('[role="dialog"] video')).toHaveCount(0);
    await expect(dialog(page).getByText(/Open on ESPN/).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("the news Source filter calls league-official sites \"League sites\"", async ({ page }) => {
  await openNews(page);
  await page.getByRole("button", { name: "Filter news" }).click();
  const filter = page.getByRole("dialog", { name: "Filter news by source" });
  await expect(filter.getByRole("checkbox", { name: "League sites" })).toBeVisible();
  await expect(filter.getByRole("checkbox", { name: "Homepage" })).toHaveCount(0);
});
