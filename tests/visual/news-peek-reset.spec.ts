import { expect, test } from "@playwright/test";

// Jacob 2026-09-08: "when i unhide and headlines are hidden by default … when i
// switch to next or previous news item all should be hidden. even when i go back
// to the previous one."
//
// The modal's per-item reveal (PeekBlur) is reset by RE-KEYING it on `postKey`.
// This spec is the audit probe: peek the headline, page next, page back, and
// assert the incoming headline is blurred — including on the frames right after
// the click, so a one-frame unblurred flash of the next spoiler also fails.

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultLandingView: "news",
  defaultDateMode: "today",
  // Clips only. A text post's modal headline never blurs (Jacob 9/27), so
  // there is nothing to peek or re-hide on one; paging onto one would fail
  // this probe for the wrong reason.
  newsVideosOnly: true,
};

const HEADLINE = 'button[aria-label="Open post"]:has(.news-title)';

// Same stand-in YouTube API as news-modal-text-headline.spec: a plain iframe,
// no network.
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

// Every Reddit feed answers three clips, so the modal has a next and a
// previous post without the live feeds (the prebaked public/news/*.json files
// are gitignored and may be missing).
async function mockFeeds(page: import("@playwright/test").Page) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    const items = [1, 2, 3].map((i) => {
      const id = `${name.replace(/[^a-z0-9]/gi, "").slice(0, 8)}${i}`.padEnd(11, "x").slice(0, 11);
      return {
        id: `${name}-y${i}`, headline: `${name} clip ${i}: a spoiler headline`, description: "", imageUrl: null,
        published: new Date(Date.now() - i * 3_600_000).toISOString(), byline: "u/fixture", section: `r/${name}`,
        articleUrl: `https://www.youtube.com/watch?v=${id}`, youtubeVideoId: id,
      };
    });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
  });
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#111'></body>" }));
}

async function gotoNews(page: import("@playwright/test").Page) {
  await mockFeeds(page);
  await page.addInitScript((base) => {
    localStorage.setItem("nss-preferences", JSON.stringify(base));
  }, BASE_PREFS);
  await page.goto("/");
  const all = page.locator(HEADLINE);
  await expect(all.first()).toBeVisible({ timeout: 30_000 });
  let last = -1;
  await expect.poll(async () => {
    const n = await all.count();
    const stable = n > 0 && n === last;
    last = n;
    return stable;
  }, { timeout: 20_000, intervals: [400] }).toBe(true);
}

// Every .news-title inside the open dialog, with its settled blur + peek class.
async function modalTitles(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return [];
    return [...dlg.querySelectorAll(".news-title")].map((el) => ({
      text: (el.textContent || "").trim().slice(0, 60),
      peek: el.classList.contains("peek"),
      filter: getComputedStyle(el).filter,
    }));
  });
}

test("paging the news modal re-hides the headline (next, and back again)", async ({ page }) => {
  await gotoNews(page);

  // Open the first post whose modal exposes a Next pager.
  await page.locator(HEADLINE).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next post" }).first()).toBeEnabled();

  const before = await modalTitles(page);
  expect(before.length).toBeGreaterThan(0);
  const headlineA = before[0].text;
  expect(before.every((t) => !t.peek)).toBe(true);

  // Reveal it — the whole point of the per-item peek.
  await dialog.locator(".news-title").first().click();
  await expect.poll(async () => (await modalTitles(page))[0]?.peek, { timeout: 3_000 }).toBe(true);

  // Sample EVERY animation frame across the step, so a single unblurred frame
  // of the incoming headline is caught, not just the settled state.
  await page.evaluate(() => {
    (window as unknown as { __peekFrames: unknown[] }).__peekFrames = [];
    const tick = () => {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        for (const el of dlg.querySelectorAll(".news-title")) {
          (window as unknown as { __peekFrames: unknown[] }).__peekFrames.push({
            text: (el.textContent || "").trim().slice(0, 60),
            peek: el.classList.contains("peek"),
          });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.getByRole("button", { name: "Next post" }).first().click();
  await page.waitForTimeout(600);

  const afterNext = await modalTitles(page);
  const headlineB = afterNext[0]?.text ?? "";
  expect(headlineB).not.toBe(headlineA);

  const frames = await page.evaluate(() => (window as unknown as { __peekFrames: { text: string; peek: boolean }[] }).__peekFrames);
  const leaked = frames.filter((f) => f.text !== headlineA && f.peek);

  // 1. Settled state: post B is blurred.
  expect(afterNext.map((t) => t.peek)).toEqual(afterNext.map(() => false));
  expect(afterNext[0].filter).toMatch(/blur\(/);
  // 2. No frame ever showed post B's headline in the clear.
  expect(leaked.slice(0, 3)).toEqual([]);

  // 3. Going BACK to post A re-hides it too.
  await page.getByRole("button", { name: "Previous post" }).first().click();
  await page.waitForTimeout(600);
  const afterPrev = await modalTitles(page);
  expect(afterPrev[0].text).toBe(headlineA);
  expect(afterPrev[0].peek).toBe(false);
  expect(afterPrev[0].filter).toMatch(/blur\(/);
});
