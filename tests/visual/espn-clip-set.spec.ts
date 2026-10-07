import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// ESPN Videos game clip sets (Jacob 10/7): every clip ESPN lists under one
// game rides in ONE card. The card looks like any single clip (no pill, no
// count); the modal opens on clip 1 and steps through the rest with the
// picture gallery's ‹ › arrows, counter and dots, and with ← →. J/L still
// seek, Shift+←/→ still page posts, and each clip's own headline is blurred
// with H peeking it.
//
// The clip is a real WebM recorded at test time (espn-videos-play.spec.ts),
// served at each mp4 URL.

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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPpfDwAE/wH+wbXp5wAAAABJRU5ErkJggg==", "base64");
const CDN = "https://espnmedia-cdn.akamaized.net/espn/media";
const mp4 = (n: string) => `${CDN}/16x9/${n}/${n}.mp4`;
const clip = (id: string, n: string, headline: string) => ({
  id, headline, videoUrl: mp4(n), imageUrl: `${CDN}/common/${n}.jpg`, durationSec: 30, published: "2026-10-07T05:16:10Z",
});
const base = { description: "", byline: "", published: "2026-10-07T05:16:25Z" };
const SET = {
  ...base,
  id: "50122460",
  headline: "Padres stave off elimination in Game 3",
  imageUrl: `${CDN}/common/one.jpg`,
  articleUrl: "https://www.espn.com/video/clip?id=50122460",
  section: "MLB",
  videoUrl: mp4("one"),
  durationSec: 30,
  feedClip: true,
  gameId: "401908004",
  clips: [
    clip("50122460", "one", "Padres stave off elimination in Game 3"),
    clip("50122461", "two", "Padres keep season alive with a double play"),
    clip("50122309", "three", "Bogaerts' baserunning pads the lead"),
  ],
};
const SINGLE = {
  ...base, id: "50000001", headline: "A plain single clip", imageUrl: `${CDN}/common/single.jpg`,
  articleUrl: "https://www.espn.com/video/clip?id=50000001", section: "ESPN Video", videoUrl: mp4("single"), durationSec: 20,
};

async function openNews(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", skipExplainer: true, skipNewsExplainer: true,
    showNews: true, leaguesOnboarded: true, switcherDefaultsVersion: 2, defaultLandingView: "news", newsTypeFilter: "all",
    newsTopNews: true, firstLeague: "nfl",
  })));
  await page.route("**/news/*.json", (route) => {
    const url = route.request().url();
    const body = url.includes("highlights.json") ? '{"games":{}}'
      : url.includes("/espn-videos.json") ? JSON.stringify({ items: [SET, SINGLE] })
      : '{"items":[]}';
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.route(`${CDN}/**`, (route) => route.request().url().endsWith(".mp4")
    ? route.fulfill({ status: 200, contentType: "video/webm", body: CLIP })
    : route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.goto("/");
  await expect(page.locator('button[title="Switch news league"]').first()).toHaveText("NFL");
}

const row = (page: Page, text: RegExp) =>
  page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: text }).first();
const video = (page: Page) => page.locator('[role="dialog"] video');
const prevClip = (page: Page) => page.getByRole("button", { name: "Previous clip" });
const nextClip = (page: Page) => page.getByRole("button", { name: "Next clip" });
const counter = (page: Page) => page.getByTestId("clip-counter");
const footerTitle = (page: Page) => page.getByRole("dialog").locator("p.news-title").first();
const blurOf = (page: Page) => footerTitle(page).evaluate((el) => getComputedStyle(el).filter);

test("the set's card looks like a single clip: no pill, no count", async ({ page }) => {
  await openNews(page);
  const card = row(page, /Padres stave off elimination/);
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(/\d+\s*\/\s*\d+|clips?\b/i);
});

test("the modal opens on clip 1 and the arrows step through the set", async ({ page }) => {
  await openNews(page);
  await row(page, /Padres stave off elimination/).click();
  await expect(video(page)).toHaveAttribute("src", mp4("one"));
  await expect(counter(page)).toHaveText("1 / 3");
  // Clip 1: only › shows.
  await expect(prevClip(page)).toBeDisabled();
  await expect(prevClip(page)).toHaveCSS("opacity", "0");
  await expect(nextClip(page)).toBeEnabled();

  await nextClip(page).click();
  await expect(video(page)).toHaveAttribute("src", mp4("two"));
  await expect(counter(page)).toHaveText("2 / 3");
  await expect(prevClip(page)).toBeEnabled();
  await expect(nextClip(page)).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Clip 2 of 3" })).toHaveCount(1);
  // Clip 2's own headline, blurred; H peeks it.
  await expect(footerTitle(page)).toHaveText("Padres keep season alive with a double play");
  await expect.poll(() => blurOf(page)).toMatch(/blur\(/);
  await page.locator('[role="dialog"]').first().focus();
  await page.keyboard.press("h");
  await expect.poll(() => blurOf(page)).toBe("none");

  // → steps to the last clip, which shows only ‹.
  await page.keyboard.press("ArrowRight");
  await expect(video(page)).toHaveAttribute("src", mp4("three"));
  await expect(counter(page)).toHaveText("3 / 3");
  await expect(nextClip(page)).toBeDisabled();
  await expect(prevClip(page)).toBeEnabled();
  // The step re-blurred the headline: the peek was clip 2's.
  await expect.poll(() => blurOf(page)).toMatch(/blur\(/);
  // → at the end does nothing; ← goes back.
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText("3 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect(counter(page)).toHaveText("2 / 3");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("J / L still seek inside a set, and Shift+→ pages to the next post", async ({ page }) => {
  await openNews(page);
  await row(page, /Padres stave off elimination/).click();
  await expect(video(page)).toHaveAttribute("src", mp4("one"));
  // The recorded WebM has no duration; give the element a 2-minute clip and
  // record every seek the modal makes.
  await video(page).evaluate((v) => {
    const w = window as unknown as { __seeks: number[] };
    w.__seeks = [];
    Object.defineProperty(v, "duration", { configurable: true, get: () => 120 });
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => 30, set: (x: number) => { w.__seeks.push(x); } });
  });
  await page.locator('[role="dialog"]').first().focus();
  await page.keyboard.press("l");
  await page.keyboard.press("j");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks)).toEqual([40, 20]);
  await expect(counter(page)).toHaveText("1 / 3");

  await page.keyboard.press("Shift+ArrowRight");
  await expect(video(page)).toHaveAttribute("src", mp4("single"));
  await expect(counter(page)).toHaveCount(0);
  await expect(nextClip(page)).toHaveCount(0);
});

test("the key legend names the clip arrows", async ({ page }) => {
  await openNews(page);
  await row(page, /Padres stave off elimination/).click();
  await expect(video(page)).toBeVisible();
  await page.locator('[role="dialog"]').first().focus();
  await page.keyboard.press("?");
  const legend = page.locator("#modal-key-legend");
  await expect(legend.getByText("Prev / next clip")).toBeVisible();
  await expect(legend.getByText("Skip 10s")).toBeVisible();
  await expect(legend.getByText("Skip 5s")).toHaveCount(0);
});
