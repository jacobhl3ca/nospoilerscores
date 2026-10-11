import { expect, type Page } from "@playwright/test";

// Fakes for the News video specs (news-video-back-seek, news-video-landscape).
// Not a spec itself: Playwright only collects *.spec.ts.
//
// The fake YouTube player keeps the real IFrame API's lag: getCurrentTime()
// trails a seekTo() by 1.5s, the way YouTube's cached position does until a
// seek has finished buffering.

export const FAKE_YT_API = `
(function () {
  window.__seeks = [];
  window.__ytBuilt = 0;
  function FakePlayer(el, config) {
    window.__ytBuilt += 1;
    var mount = typeof el === "string" ? document.getElementById(el) : el;
    var iframe = document.createElement("iframe");
    iframe.id = "yt-player";
    iframe.src = "https://www.youtube.com/embed/" + config.videoId + "?fake=1";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    mount.replaceWith(iframe);
    this._iframe = iframe;
    this._events = config.events || {};
    this._state = -1;
    this._t = 60;
    this._reported = 60;
    var self = this;
    setTimeout(function () { self._events.onReady && self._events.onReady({ target: self }); }, 0);
  }
  FakePlayer.prototype._set = function (state) {
    var self = this;
    this._state = state;
    setTimeout(function () { self._events.onStateChange && self._events.onStateChange({ data: state, target: self }); }, 0);
  };
  FakePlayer.prototype.playVideo = function () { if (this._state !== 1) this._set(1); };
  FakePlayer.prototype.pauseVideo = function () { if (this._state !== 2) this._set(2); };
  FakePlayer.prototype.seekTo = function (t, ahead) {
    window.__seeks.push({ t: t, ahead: ahead });
    var self = this;
    this._t = t;
    clearTimeout(this._lag);
    this._lag = setTimeout(function () { self._reported = self._t; }, 1500);
  };
  FakePlayer.prototype.getIframe = function () { return this._iframe; };
  FakePlayer.prototype.getPlayerState = function () { return this._state; };
  FakePlayer.prototype.getDuration = function () { return 90; };
  FakePlayer.prototype.getCurrentTime = function () { return this._reported; };
  FakePlayer.prototype.getAvailableQualityLevels = function () { return []; };
  FakePlayer.prototype.setPlaybackQuality = function () {};
  FakePlayer.prototype.getVideoData = function () { return { title: "Fake Highlight" }; };
  FakePlayer.prototype.setVolume = function () {};
  FakePlayer.prototype.mute = function () {};
  FakePlayer.prototype.unMute = function () {};
  FakePlayer.prototype.loadModule = function () {};
  FakePlayer.prototype.unloadModule = function () {};
  FakePlayer.prototype.destroy = function () { this._iframe && this._iframe.remove(); };
  window.YT = { Player: FakePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
`;

export const BASE_PREFS = {
  favoriteLeagues: ["nfl"],
  favoriteTeams: [],
  theme: "dark",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultLandingView: "news",
  defaultDateMode: "today",
  newsTypeFilter: "all",
};

export async function openFakeYouTubeClip(page: Page, prefs: Record<string, unknown> = {}) {
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_YT_API }));
  await page.route("https://www.youtube.com/embed/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#235'></body>" }));
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), { ...BASE_PREFS, ...prefs });
  await page.goto(`/?v=fake123&hu=${encodeURIComponent("https://example.com/watch")}&hl=NFL&ht=${encodeURIComponent("Giants edge Cowboys in the fourth")}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAttribute("data-player-state", "playing");
  return dialog;
}

export const lastYtSeek = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __seeks: { t: number; ahead: boolean }[] }).__seeks;
    return s.length ? s[s.length - 1] : null;
  });

// A <video> whose clock the test owns: 90s long, parked at 0:60, and every
// currentTime write inside the dialog logged. No media is fetched or decoded,
// so the position cannot drift while the test reads it.
export const FAKE_MEDIA = () => {
  const w = window as unknown as { __vseeks: number[] };
  w.__vseeks = [];
  const clock = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get() { return 90; } });
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) { return clock.get(this) ?? 60; },
    set(this: HTMLMediaElement, v: number) {
      clock.set(this, v);
      if (this.closest("[role=dialog]")) w.__vseeks.push(v);
    },
  });
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  // The clip URL never resolves to media; keep the "can't play" card away.
  window.addEventListener("error", (e) => { if (e.target instanceof HTMLMediaElement) e.stopImmediatePropagation(); }, true);
};

const NOW = new Date().toISOString();
const base = { description: "", published: NOW, imageUrl: null, byline: "", section: "ESPN" };
const ITEMS = [
  { ...base, id: "v1", headline: "Clip one: a late winner", articleUrl: "https://www.espn.com/video/clip?id=1", playbackUrl: "https://clips.example.test/one.mp4" },
  { ...base, id: "v2", headline: "Clip two: the save of the night", articleUrl: "https://www.espn.com/video/clip?id=2", playbackUrl: "https://clips.example.test/two.mp4" },
];

export async function openFakeStreamClip(page: Page) {
  await page.addInitScript(FAKE_MEDIA);
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), BASE_PREFS);
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: /Clip one/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Video player" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("video")).toBeAttached();
  return dialog;
}
