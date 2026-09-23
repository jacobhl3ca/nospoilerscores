import { expect, test } from "@playwright/test";

// A1 (2026-09-12 plan): "if i click play on video in news i lose ability to
// use h to hide/show the title". Root cause: with YouTube's native controls on
// (the default since 8/9), a click on YouTube's own play button inside the
// iframe pulls DOM focus into that cross-origin frame — after which every
// keystroke belongs to YouTube's document, not ours, so H (and Esc, f, ↓/↑…)
// stop reaching the modal. The old recovery ran off the top window's "blur"
// event, which Safari does not reliably fire for this click (Chromium was
// fine, which is why it read as "the keyboard broke" rather than "a focus
// bug"). See recoverFocusFromFrame in VideoModal.tsx.
//
// This spec reproduces the actual mechanism — a click landing on a real
// cross-origin <iframe> shifting document.activeElement — without depending
// on the network or a specific news post existing: the YouTube IFrame API and
// the embed itself are both faked via page.route, and the post is opened
// through the ?v= deep-link HomeContent already parses for shared highlights
// (same one buildHighlightShareUrl produces), carrying a headline so H has
// something to peek. A real Safari repro needs a manual WebKit pass — this
// repo's playwright.config only provisions Chromium (see sticky-seam.spec.ts).

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
    this._state = -1;
    var self = this;
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.__fakeYt !== true || e.source !== iframe.contentWindow) return;
      self._state = e.data.state;
      config.events.onStateChange && config.events.onStateChange({ data: e.data.state, target: self });
    });
    setTimeout(function () {
      config.events.onReady && config.events.onReady({ target: self });
    }, 0);
  }
  FakePlayer.prototype.playVideo = function () {};
  FakePlayer.prototype.pauseVideo = function () {};
  FakePlayer.prototype.getIframe = function () { return this._iframe; };
  FakePlayer.prototype.getPlayerState = function () { return this._state; };
  FakePlayer.prototype.getDuration = function () { return 30; };
  FakePlayer.prototype.getCurrentTime = function () { return 0; };
  FakePlayer.prototype.getAvailableQualityLevels = function () { return []; };
  FakePlayer.prototype.setPlaybackQuality = function () {};
  FakePlayer.prototype.getVideoData = function () { return { title: "Fake Highlight" }; };
  FakePlayer.prototype.mute = function () {};
  FakePlayer.prototype.unMute = function () {};
  FakePlayer.prototype.destroy = function () { this._iframe && this._iframe.remove(); };
  window.YT = {
    Player: FakePlayer,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 },
  };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

// The "iframe content" — genuinely cross-origin (served under youtube.com),
// so clicking it reproduces the real focus-stealing mechanism rather than
// just asserting the code path ran. Posts a fake PLAYING state back so the
// onStateChange half of the fix is exercised too, same as a real click on
// YouTube's own play button would drive both signals almost simultaneously.
const FAKE_EMBED_HTML = `<!doctype html><html><body style="margin:0;background:#000">
<button id="play" style="width:100%;height:100%;border:0;background:#000;color:#fff" tabindex="0">PLAY</button>
<script>
document.getElementById("play").addEventListener("click", function () {
  this.focus();
  parent.postMessage({ __fakeYt: true, state: 1 }, "*");
});
</script>
</body></html>`;

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
};

async function openDeepLinkedVideoPost(page: import("@playwright/test").Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API })
  );
  await page.route("https://www.youtube.com/embed/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: FAKE_EMBED_HTML })
  );
  await page.addInitScript((base) => {
    localStorage.setItem("nss-preferences", JSON.stringify(base));
  }, BASE_PREFS);

  const headline = "Giants edge Cowboys in the fourth";
  await page.goto(
    `/?v=fake123&hu=${encodeURIComponent("https://example.com/watch")}&hl=NFL&ht=${encodeURIComponent(headline)}`
  );
  await expect(page.getByRole("dialog")).toHaveCount(1);
  return headline;
}

test("H still peeks the headline after clicking play on a news video", async ({ page }) => {
  const headline = await openDeepLinkedVideoPost(page);
  const dialog = page.getByRole("dialog");
  const title = dialog.locator(".news-title", { hasText: headline });
  await expect(title).toBeVisible();

  // Blurred (hidden) to start — the peek is off by default.
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).filter)).toMatch(/blur\(/);

  // Click YouTube's (faked) play button — a real click landing on a
  // cross-origin iframe, exactly the click that used to steal focus for good.
  // Focus recovery is deferred ~250ms (the scrubber-drag guard), so wait for
  // it to actually land back on the dialog rather than racing it — pressing H
  // the instant activeElement flips to the iframe would fail for the wrong
  // reason (too early), not because the fix is broken.
  await page.frameLocator("iframe").locator("#play").click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("dialog");

  // The regression: without the fix, H's keydown listener never sees this
  // keystroke because focus is still inside YouTube's document.
  await page.keyboard.press("h");
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).filter), {
    message: "H did not reach the modal — focus was never recovered from the iframe",
  }).toBe("none");

  // And H toggles it back off.
  await page.keyboard.press("h");
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).filter)).toMatch(/blur\(/);
});

test("Esc still closes the modal after clicking play on its video", async ({ page }) => {
  // A second, independent proof that focus really came back to the dialog
  // rather than H alone getting a special path: Esc is handled by the same
  // document-level keydown listener H is, so this covers the wider regression
  // (Esc, f, arrows all going silent, not just H) with the same fix.
  await openDeepLinkedVideoPost(page);
  await page.frameLocator("iframe").locator("#play").click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("dialog");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
