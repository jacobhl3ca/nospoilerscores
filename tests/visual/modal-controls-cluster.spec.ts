import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

// A4 (Jacob 9/12): "the controls for news modals should be on bottom right
// simply but clearly. make sure looks good for mobiel and web". One cluster —
// ‹ › ✕ — fixed bottom-right on every width, for every post type. This checks
// each control is inside the viewport, 44px, and clear of the media, the
// footer links, and the bottom 48px of a YouTube player (its scrubber).

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

// A flat grey 1200x900 PNG, served for every picture so no test touches the
// network. Big enough that the modal treats it as a real photo (lightbox).
function greyPng(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit greyscale
  const raw = Buffer.alloc((w + 1) * h, 0x66);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0; // filter byte
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = greyPng(1200, 900);

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "u/fixture", section: "r/nfl" };
const ITEMS = [
  { ...base, id: "t1", headline: "Text post: what a finish in the fourth", articleUrl: "https://www.reddit.com/r/nfl/comments/t1/", body: "Paragraph one.\n\nParagraph two." },
  { ...base, id: "i1", headline: "Image post: the sideline view", articleUrl: "https://www.reddit.com/r/nfl/comments/i1/", imageUrl: "https://i.redd.it/fixture-i1.png", imageFullUrl: "https://i.redd.it/fixture-i1.png" },
  { ...base, id: "y1", headline: "Video post: all the highlights", articleUrl: "https://www.youtube.com/watch?v=fixtureY1", youtubeVideoId: "fixtureY1" },
  { ...base, id: "t2", headline: "Text post two: the next one", articleUrl: "https://www.reddit.com/r/nfl/comments/t2/", body: "Another." },
];

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nfl"], favoriteTeams: [], theme: "dark", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: true, leaguesOnboarded: true,
    switcherDefaultsVersion: 2, defaultLandingView: "news", defaultDateMode: "today",
  })));
  await page.route("**/news/*.json", (route) => {
    if (route.request().url().includes("highlights.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS }) });
  });
  await page.route(/\.(png|jpe?g|webp)(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("https://images.weserv.nl/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];
const POSTS = [
  { kind: "text", headline: "Text post: what a finish" },
  { kind: "image", headline: "Image post: the sideline view" },
  { kind: "youtube", headline: "Video post: all the highlights" },
];

for (const size of SIZES) {
  for (const post of POSTS) {
    test(`${post.kind} post at ${size.width}x${size.height}: ‹ › ✕ bottom-right, clear of the media`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await setup(page);
      await page.goto("/");
      await page.locator('button[aria-label="Open post"]', { hasText: post.headline }).first().click();
      if (post.kind === "image") await expect(page.getByRole("dialog", { name: "Image viewer" })).toBeVisible();
      const cluster = page.getByTestId("modal-controls");
      await expect(cluster).toBeVisible();
      await page.waitForTimeout(500);

      const names = ["Previous post", "Next post", "Close"];
      const boxes: Box[] = [];
      for (const name of names) {
        const btn = cluster.getByRole("button", { name });
        await expect(btn).toBeVisible();
        const b = (await btn.boundingBox())!;
        expect(Math.round(b.width)).toBe(44);
        expect(Math.round(b.height)).toBe(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width);
        expect(b.y + b.height).toBeLessThanOrEqual(size.height);
        boxes.push(b);
      }
      // Right to left: ✕ is the corner, › then ‹.
      expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x);

      // Only one Close in the modal outside fullscreen.
      await expect(page.getByRole("dialog").getByRole("button", { name: "Close" })).toHaveCount(1);

      const dialog = page.getByRole("dialog");
      const media = post.kind === "youtube"
        ? dialog.locator("iframe").first()
        : post.kind === "image" ? dialog.locator("img").first() : dialog.locator(".news-title").first();
      const mb = (await media.boundingBox())!;
      for (const b of boxes) expect(overlaps(b, mb), `control overlaps the ${post.kind} media`).toBe(false);
      if (post.kind === "youtube") {
        const scrub = { x: mb.x, y: mb.y + mb.height - 48, width: mb.width, height: 48 };
        for (const b of boxes) expect(overlaps(b, scrub), "control sits on the player's scrubber").toBe(false);
      }
      for (const link of await dialog.getByRole("button", { name: /Copy link/ }).all()) {
        const lb = await link.boundingBox();
        if (lb) for (const b of boxes) expect(overlaps(b, lb), "control covers Copy link").toBe(false);
      }

      await page.screenshot({ path: `test-results/modal-controls-${post.kind}-${size.width}.png` });

      // The cluster actually drives the modal.
      const before = await dialog.locator(".news-title").first().textContent();
      await cluster.getByRole("button", { name: "Next post" }).click();
      await expect.poll(() => dialog.locator(".news-title").first().textContent()).not.toBe(before);
      await cluster.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }
}
