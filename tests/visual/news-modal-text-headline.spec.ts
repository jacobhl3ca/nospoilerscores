import { expect, test, type Page } from "@playwright/test";

// Jacob 2026-09-27: "show headlines when in news modal mode even if show
// headlines is off. cuz for text posts it doesnt make sense." A text post is
// only its headline, so a blurred one in the modal is an empty card. With the
// Headlines toggle OFF (the default):
//   • the list row still blurs the headline,
//   • the open text post shows it in the clear, with no H peek,
//   • a clip still blurs its headline under the player, H peeks it.
//
// Jacob 2026-10-10, from a shared ESPN article link: "on news article headlines
// if open in a modal shouldn't have them hidden or toggleable. similar to other
// just-text posts from reddit right?" One rule now: in the modal only a clip's
// headline blurs. An article photo and a Reddit picture show theirs plain under
// the picture, with no tap, no H, no legend row, whatever the Headlines toggle
// or the card's own Headlines button says, and the same after a reload.
//
// Jacob 2026-10-11: an ESPN Videos item with no playable mp4 opens as a still.
// It is a video post whose clip we could not get, not an article, so its
// headline blurs under the still and follows the Headlines toggle like a clip.

// Same stand-in YouTube API as modal-key-hints.spec: a plain iframe, no network.
const FAKE_YT_API = `
(function () {
  function FakePlayer(el, config) {
    var mount = typeof el === "string" ? document.getElementById(el) : el;
    var iframe = document.createElement("iframe");
    iframe.id = "yt-player";
    iframe.src = "https://www.youtube.com/embed/" + config.videoId + "?fake=1";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    mount.replaceWith(iframe);
    this._iframe = iframe;
    setTimeout(function () { config.events.onReady && config.events.onReady({ target: this }); }.bind(this), 0);
  }
  var noop = function () {};
  FakePlayer.prototype = {
    playVideo: noop, pauseVideo: noop, mute: noop, unMute: noop, setPlaybackQuality: noop,
    getIframe: function () { return this._iframe; }, getPlayerState: function () { return -1; },
    getDuration: function () { return 30; }, getCurrentTime: function () { return 0; },
    getAvailableQualityLevels: function () { return []; }, getVideoData: function () { return { title: "x" }; },
    destroy: function () { this._iframe && this._iframe.remove(); },
  };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const TEXT = "Text post: they blew it in the fourth";
const VIDEO = "Video post: all the highlights";
const ARTICLE = "Article: quarterback benched after the loss";
const PICTURE = "Picture post: the final scoreboard";
const ARTICLE_IMG = "https://a1.espncdn.test/x.jpg";
// proxyImage only rewrites *.redd.it, so a .test host loads direct.
const PICTURE_IMG = "https://i.redd.test/p.png";
const STILL = "Videos still: the walk-off winner";
const STILL_IMG = "https://a1.espncdn.test/still.jpg";
const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#246"/></svg>';
const ITEMS = [
  { ...base, id: "t1", headline: TEXT, articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph one." },
  { ...base, id: "y1", headline: VIDEO, articleUrl: "https://www.youtube.com/watch?v=fixtureY1", youtubeVideoId: "fixtureY1" },
  { ...base, id: "a1", headline: ARTICLE, section: "ESPN", byline: "Fixture Writer", imageUrl: ARTICLE_IMG, articleUrl: "https://www.espn.com/college-football/story/_/id/1/x" },
  { ...base, id: "p1", headline: PICTURE, imageFullUrl: PICTURE_IMG, articleUrl: "https://www.reddit.com/r/nfl/comments/p1/" },
  { ...base, id: "50000009", headline: STILL, section: "ESPN Video", byline: "", imageUrl: STILL_IMG, articleUrl: "https://www.espn.com/video/clip?id=50000009" },
];

async function setup(page: Page, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript((extra) => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
      showTextPosts: true, revealNewsTitles: false, ...extra,
    }));
  }, extra);
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
  for (const host of ["a1.espncdn.test", "i.redd.test"]) {
    await page.route(`https://${host}/**`, (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: PHOTO }));
  }
  await page.goto("/");
}

const row = (page: Page, headline: string) => page.locator('button[aria-label="Open post"]', { hasText: headline }).first();
// Poll: .news-title animates its filter over 150ms.
const filterOf = (el: import("@playwright/test").Locator, timeout = 3_000) =>
  expect.poll(() => el.evaluate((n) => getComputedStyle(n).filter), { timeout });
const legend = (page: Page) => page.getByRole("group", { name: "Keyboard shortcuts" });
const keysBtn = (page: Page) => page.getByTestId("modal-controls").getByRole("button", { name: "Keys", exact: true });

test("Headlines off: a text post's headline shows in the modal, the list row stays blurred", async ({ page }) => {
  await setup(page);
  await expect(page.locator("html")).not.toHaveClass(/reveal-news-titles/);

  // The 3s filter poll below starts only once the row is there: on a cold dev
  // server the list can take longer than that to render.
  await expect(row(page, TEXT)).toBeVisible({ timeout: 30_000 });
  await filterOf(row(page, TEXT).locator(".news-title")).toMatch(/blur\(/);

  await row(page, TEXT).click();
  const dialog = page.getByRole("dialog");
  const h = dialog.locator("[data-modal-headline]");
  await expect(h).toHaveText(TEXT);
  await filterOf(h).toBe("none");
  await expect(h).not.toHaveAttribute("role", "button");

  // Nothing to peek, so H is not a key here and the legend has no H row.
  await page.keyboard.press("h");
  await filterOf(h).toBe("none");
  await keysBtn(page).click();
  await expect(legend(page)).toBeVisible();
  await expect(legend(page).getByText("Peek headline")).toHaveCount(0);

  await page.screenshot({ path: "test-results/modal-text-headline-off.png" });
});

test("Headlines off: a clip's headline still blurs in the modal, and H peeks it", async ({ page }) => {
  await setup(page);
  await row(page, VIDEO).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("iframe").first()).toBeVisible();
  await expect(dialog.locator("[data-modal-headline]")).toHaveCount(0);

  const title = dialog.locator(".news-title", { hasText: VIDEO });
  await filterOf(title).toMatch(/blur\(/);

  await keysBtn(page).click();
  await expect(legend(page).getByText("Peek headline")).toBeVisible();

  await page.keyboard.press("h");
  await filterOf(title).toBe("none");
});

// A failed image flips the modal to the text card, where the headline was plain
// already. "Image viewer" proves the lightbox is what is open.
async function expectPlainUnderPhoto(page: Page, headline: string) {
  const dialog = page.getByRole("dialog", { name: "Image viewer" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator("img").first()).toBeVisible();
  const h = dialog.locator("[data-modal-headline]");
  // 30s: after a reload the headline comes from the card's list (the address
  // bar carries no ?ht), and the cards are still loading behind the modal.
  await expect(h).toHaveText(headline, { timeout: 30_000 });
  // 10s: after a reload the page is still loading its cards behind the modal.
  await filterOf(h, 10_000).toBe("none");
  await expect(h).not.toHaveAttribute("role", "button");
  await expect(dialog.locator(".news-title", { hasText: headline })).toHaveCount(0);

  await page.keyboard.press("h");
  await filterOf(h).toBe("none");
  // A tap on it neither blurs it nor closes the modal.
  await h.click();
  await filterOf(h).toBe("none");
  await expect(dialog).toBeVisible();

  await keysBtn(page).click();
  await expect(legend(page)).toBeVisible();
  await expect(legend(page).getByText("Peek headline")).toHaveCount(0);
}

const CARD_OFF = { newsLayout: "espn", newsCardPrefs: { "espn-top": { revealTitles: false } } };

test("Headlines off + card off: an ESPN article's headline shows plain under the photo", async ({ page }) => {
  await setup(page, CARD_OFF);
  await expect(row(page, ARTICLE)).toBeVisible({ timeout: 30_000 });
  await filterOf(row(page, ARTICLE).locator(".news-title")).toMatch(/blur\(/);

  await row(page, ARTICLE).click();
  await expectPlainUnderPhoto(page, ARTICLE);
  await expect(page.getByRole("dialog").getByText("Fixture Writer")).toBeVisible();
  await page.screenshot({ path: "test-results/modal-article-headline-plain.png" });
});

test("Headlines off: a Reddit picture post's headline shows plain under the picture", async ({ page }) => {
  await setup(page);
  await expect(row(page, PICTURE)).toBeVisible({ timeout: 30_000 });
  await filterOf(row(page, PICTURE).locator(".news-title")).toMatch(/blur\(/);

  await row(page, PICTURE).click();
  await expectPlainUnderPhoto(page, PICTURE);
});

test("after a reload: the article headline is still plain, Headlines on + card off", async ({ page }) => {
  await setup(page, { ...CARD_OFF, revealNewsTitles: true });
  await expect(row(page, ARTICLE)).toBeVisible({ timeout: 30_000 });
  await row(page, ARTICLE).click();
  await expect(page.getByRole("dialog", { name: "Image viewer" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("hi")).toBe(ARTICLE_IMG);
  expect(new URL(page.url()).searchParams.get("hl")).toBe("ESPN");

  await page.reload();
  await expectPlainUnderPhoto(page, ARTICLE);
});

// The still opens from a video card ("Play highlight") or a list row.
const stillRow = (page: Page) =>
  page.locator('button[aria-label="Play highlight"], button[aria-label="Open post"]', { hasText: STILL }).first();

async function openStill(page: Page) {
  await expect(stillRow(page)).toBeVisible({ timeout: 30_000 });
  await stillRow(page).click();
  const dialog = page.getByRole("dialog", { name: "Image viewer" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator("img").first()).toBeVisible();
  await expect(dialog.locator("[data-modal-headline]")).toHaveCount(0);
  return dialog.locator(".news-title", { hasText: STILL });
}

test("Headlines off: an ESPN Videos still blurs its headline under the photo, H peeks it", async ({ page }) => {
  await setup(page);
  const title = await openStill(page);
  await filterOf(title).toMatch(/blur\(/);

  await keysBtn(page).click();
  await expect(legend(page).getByText("Peek headline")).toBeVisible();
  await page.keyboard.press("h");
  await filterOf(title).toBe("none");
  await page.keyboard.press("h");
  await filterOf(title).toMatch(/blur\(/);
  await page.screenshot({ path: "test-results/modal-espn-still-headline-blurred.png" });

  // The address bar keeps the feed, so a reload keeps the blur.
  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Image viewer" }).locator(".news-title", { hasText: STILL });
  await expect(reloaded).toBeVisible({ timeout: 30_000 });
  await filterOf(reloaded, 10_000).toMatch(/blur\(/);
});

test("Headlines on: an ESPN Videos still shows its headline plain", async ({ page }) => {
  await setup(page, { revealNewsTitles: true });
  await expect(page.locator("html")).toHaveClass(/reveal-news-titles/);
  const title = await openStill(page);
  await filterOf(title).toBe("none");
});
