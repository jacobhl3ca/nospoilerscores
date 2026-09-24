import { expect, test, type Page } from "@playwright/test";

// The post modal's key legend, bottom-right (Jacob 9/8), closed until asked
// for (Jacob 9/23). The rows themselves are unit-tested
// (tests/modal-key-legend.test.ts); what can only be checked in a browser is
// the part that isn't pure — that it starts closed, that the cluster's Keys
// button and "?" open and close it, where the panel lands, that it stays out
// of the way of the player, and that it's desktop-only.

// A stand-in YouTube API: builds a plain iframe where the player would go, so
// a YouTube post has a real frame to hit-test without touching the network.
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
const ITEMS = [
  { ...base, id: "k1", headline: "Key post one: a finish in the fourth", articleUrl: "https://www.reddit.com/r/nfl/comments/k1/", body: "Paragraph one." },
  { ...base, id: "k2", headline: "Key post two: the next one", articleUrl: "https://www.reddit.com/r/nfl/comments/k2/", body: "Another." },
  { ...base, id: "ky", headline: "Key video: all the highlights", articleUrl: "https://www.youtube.com/watch?v=fixtureKY", youtubeVideoId: "fixtureKY" },
  { ...base, id: "k3", headline: "Key post three: the last one", articleUrl: "https://www.reddit.com/r/nfl/comments/k3/", body: "More." },
];

async function setup(page: Page, opts: { width?: number; height?: number; staleDismissal?: boolean } = {}) {
  await page.setViewportSize({ width: opts.width ?? 1280, height: opts.height ?? 800 });
  await page.addInitScript((stale) => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
      skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
      switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
    }));
    // The old build's "dismissed for good" flag. It means nothing now.
    if (stale) localStorage.setItem("hs.keyHintsOff", "1");
  }, !!opts.staleDismissal);
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
  await page.goto("/");
}

async function openPost(page: Page, headline: string) {
  await page.locator('button[aria-label="Open post"]', { hasText: headline }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByTestId("modal-controls")).toBeVisible();
}

const panel = (page: Page) => page.getByRole("group", { name: "Keyboard shortcuts" });
const keysBtn = (page: Page) => page.getByTestId("modal-controls").getByRole("button", { name: "Keys", exact: true });
const hideX = (page: Page) => panel(page).getByRole("button", { name: "Hide keyboard shortcuts" });

test("the legend starts closed; the Keys button opens it in the bottom-right corner", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");

  await expect(keysBtn(page)).toBeVisible();
  await expect(keysBtn(page)).toHaveAttribute("aria-expanded", "false");
  await expect(panel(page)).toHaveCount(0);

  await keysBtn(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(keysBtn(page)).toHaveAttribute("aria-expanded", "true");

  // Bottom-right quadrant of a 1280×800 viewport, and inside it.
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBeGreaterThan(640);
  expect(box.y).toBeGreaterThan(400);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThanOrEqual(800);

  // Esc and ? are live in every state, so the panel always prints them.
  await expect(panel(page).locator("kbd", { hasText: "Esc" })).toBeVisible();
  await expect(panel(page).locator("kbd").filter({ hasText: /^\?$/ })).toBeVisible();
  await expect(panel(page).getByText("Show / hide these")).toBeVisible();

  // The button toggles: a second click closes it.
  await keysBtn(page).click();
  await expect(panel(page)).toHaveCount(0);
});

test("Keys leads the cluster row, 44px tall, left of ‹ › ✕", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");

  const k = (await keysBtn(page).boundingBox())!;
  const prev = (await page.getByTestId("modal-controls").getByRole("button", { name: "Previous post" }).boundingBox())!;
  expect(Math.round(k.height)).toBe(44);
  expect(k.x + k.width).toBeLessThanOrEqual(prev.x);
  expect(Math.abs(k.y - prev.y)).toBeLessThanOrEqual(1);
});

test("the open legend stands on the cluster, and the page's Keys pill steps aside", async ({ page }) => {
  await setup(page);
  // The page's own guide is up before a post opens …
  await expect(page.locator(".hs-controls-hint")).toBeVisible();
  await openPost(page, "Key post one");
  // … and gone while the modal is open.
  await expect(page.locator(".hs-controls-hint")).toHaveCount(0);

  await keysBtn(page).click();
  const p = (await panel(page).boundingBox())!;
  const c = (await page.getByTestId("modal-controls").boundingBox())!;
  // Directly above: no overlap, a small gap, right edges flush.
  expect(p.y + p.height).toBeLessThanOrEqual(c.y);
  expect(c.y - (p.y + p.height)).toBeLessThanOrEqual(12);
  expect(Math.abs((p.x + p.width) - (c.x + c.width))).toBeLessThanOrEqual(1);
});

test("the open legend is click-through — it can't swallow the video's own controls", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");
  await keysBtn(page).click();

  const hit = await panel(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
    return { insidePanel: !!at && el.contains(at) };
  });
  expect(hit.insidePanel).toBe(false);

  // Its own ✕ is the exception, and it has to stay clickable.
  const onX = await hideX(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && el.contains(at);
  });
  expect(onX).toBe(true);
});

test("the panel's ✕ closes it, with no Undo and nothing stored", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");
  await keysBtn(page).click();

  await hideX(page).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(keysBtn(page)).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBeNull();

  // A click hands focus back to the dialog, so the modal's keys keep working.
  await page.keyboard.press("?");
  await expect(panel(page)).toBeVisible();
});

test("? opens and closes it, and an old stored dismissal is ignored", async ({ page }) => {
  await setup(page, { staleDismissal: true });
  await openPost(page, "Key post one");
  await expect(panel(page)).toHaveCount(0);

  await page.keyboard.press("?");
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("?");
  await expect(panel(page)).toHaveCount(0);
  // Untouched either way — nothing reads or writes it now.
  expect(await page.evaluate(() => localStorage.getItem("hs.keyHintsOff"))).toBe("1");
});

test("open stays open while paging posts, and the next open starts closed", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");
  await keysBtn(page).click();
  await expect(panel(page)).toBeVisible();

  const dialog = page.getByRole("dialog");
  const before = await dialog.locator(".news-title").first().textContent();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => dialog.locator(".news-title").first().textContent()).not.toBe(before);
  await expect(panel(page)).toBeVisible();

  await page.getByTestId("modal-controls").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openPost(page, "Key post one");
  await expect(panel(page)).toHaveCount(0);
});

test("closed, nothing covers the YouTube player's bottom-right corner", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key video");
  const frame = page.getByRole("dialog").locator("iframe").first();
  await expect(frame).toBeVisible();
  await page.waitForTimeout(300);

  const covered = await frame.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // YouTube's fullscreen and settings buttons live in the last ~100px of the
    // bottom bar; probe that strip for anything from the corner stack.
    const probes = [[r.right - 20, r.bottom - 20], [r.right - 60, r.bottom - 20], [r.right - 100, r.bottom - 20]];
    const stack = '[data-testid="modal-controls"], [role="group"][aria-label="Keyboard shortcuts"]';
    return probes.filter(([x, y]) => !!document.elementFromPoint(x, y)?.closest(stack)).length;
  });
  expect(covered).toBe(0);
  // And the cluster itself sits below the frame, not on it.
  const f = (await frame.boundingBox())!;
  const c = (await page.getByTestId("modal-controls").boundingBox())!;
  expect(c.y).toBeGreaterThanOrEqual(f.y + f.height);
});

test("the modal's other keys still work with the legend up", async ({ page }) => {
  await setup(page);
  await openPost(page, "Key post one");
  await keysBtn(page).click();
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a phone gets no Keys button and no legend, even on ?", async ({ page }) => {
  await setup(page, { width: 390, height: 844 });
  await openPost(page, "Key post one");
  await expect(keysBtn(page)).toBeHidden();
  await page.keyboard.press("?");
  await expect(panel(page)).toBeHidden();
});
