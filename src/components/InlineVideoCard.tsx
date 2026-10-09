"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NewsItem, proxyImage } from "@/lib/news";

// News Autoplay (Jacob 10/8: "autoplay is for videos in the feed when they're
// in focus"). With the toolbar's Autoplay pill on, the ONE clip most in focus
// plays muted: among clips at least 60% visible, the one whose center is
// closest to the viewport center. Every other clip pauses, and scrolling hands
// play to the next one. No autoplay under prefers-reduced-motion, and none for
// an item with no direct media URL (YouTube-only), which keeps its thumbnail.
//
// Sound (Jacob 10/9, the Reddit pattern): the speaker in the playing clip's
// bottom-right corner (<SoundButton>) turns sound on in place. A tap anywhere
// else on the card opens the shared modal. Sound then stays on for the next
// clips until it is tapped off; a clip whose unmuted play the browser refuses
// plays muted and shows the muted icon. Nothing plays while the modal is open
// (suspendAutoplay) or the tab is hidden.
//
// <AutoplayVideo> is a <video> layer that fills its parent media box, so each
// surface (ESPN cards, the Cards strip and video cards, Feed posts) keeps its
// own thumbnail and play badge and only adds this layer. It must be a DIRECT
// child of the .news-media-preview box, where the Media blur rule
// (`.news-media-preview > *`) applies. A clip whose media is blurred does not
// play (Jacob 10/9 r6): play goes to the next unblurred clip in focus, and a
// blurred clip fetches no bytes.

const MIN_RATIO = 0.6;
// Near the page top the first clip in view plays, not the one nearest the
// middle (Jacob 10/9: on a phone clip 2 played while clip 1 sat on top).
const TOP_ZONE = 80;

export function inlineMediaUrl(item: NewsItem): string | null {
  return item.playbackUrl || item.videoUrl || null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Page-wide focus coordinator ─────────────────────────────────────────────
interface Entry {
  el: HTMLElement;
  ratio: number;
  start: () => void;
  stop: () => void;
}
const entries = new Map<Element, Entry>();
let current: Entry | null = null;
let io: IntersectionObserver | null = null;
let bodyRo: ResizeObserver | null = null;
let frame = 0;

// Mirrors the Media blur rules in globals.css: a card with its own Media off
// is blurred; else the global blur applies unless the card's own Media is on.
// A selector check, not getComputedStyle().filter: the 150 ms filter
// transition would read the old value right after a Media tap.
function mediaBlurred(el: Element): boolean {
  if (el.closest(".news-card-media-off")) return true;
  return document.documentElement.classList.contains("blur-news-media") && !el.closest(".news-card-media-on");
}

function pickFocused() {
  frame = 0;
  if (suspended || document.hidden) return;
  const mid = window.innerHeight / 2;
  const atTop = window.scrollY < TOP_ZONE;
  let best: Entry | null = null;
  let bestDist = Infinity;
  for (const e of entries.values()) {
    if (e.ratio < MIN_RATIO || mediaBlurred(e.el)) continue;
    const r = e.el.getBoundingClientRect();
    const dist = atTop ? r.top : Math.abs(r.top + r.height / 2 - mid);
    if (dist < bestDist) { best = e; bestDist = dist; }
  }
  if (best === current) return;
  current?.stop();
  current = best;
  best?.start();
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(pickFocused);
}
function stopCurrent() {
  current?.stop();
  current = null;
}

// While the video modal is open no inline clip plays (or makes sound) under
// it. On close the clip in focus plays again.
let suspended = false;
export function suspendAutoplay(on: boolean) {
  if (suspended === on) return;
  suspended = on;
  if (on) stopCurrent();
  else if (entries.size) schedule();
}
// A clip with sound must not play in a background tab.
function onVisibility() {
  if (document.hidden) stopCurrent();
  else schedule();
}
// Scroll picks wait until the scroll settles. A scroll event arrives before
// the observer's records for the new position, so an immediate pick read
// stale ratios and briefly started a clip that had just left the screen
// (r4, WebKit). Threshold crossings still pick at once via the observer.
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAfterScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(schedule, 120);
}

// Re-run the in-focus pick now. The coordinator also re-picks on card
// mount/unmount, scroll, resize, a page height change and every image/video
// load, but a layout change or a pill toggle can move cards without any of
// those (Jacob 10/8 r4: Feed → ESPN did not start the first clip), and a
// Media tap changes which clips may play (r6).
export function refocusAutoplay() {
  if (entries.size) schedule();
}

// play() refused by the browser (Firefox "Block Audio and Video", Safari
// "Never Auto-Play", iPhone Low Power Mode). Each refusal reports the clip's
// media box, so HomeContent can show its one-time popup over that clip. Once
// one clip is refused, every clip says "Tap to play" on itself (Jacob 10/9:
// the hint belongs on the video, not in a note under the toolbar), until a
// clip does play.
const blockedListeners = new Set<(box: HTMLElement) => void>();
export function onAutoplayBlocked(fn: (box: HTMLElement) => void): () => void {
  blockedListeners.add(fn);
  return () => { blockedListeners.delete(fn); };
}
let blockedNow = false;
const blockedSubs = new Set<() => void>();
function setBlockedNow(v: boolean) {
  if (blockedNow === v) return;
  blockedNow = v;
  blockedSubs.forEach((fn) => fn());
}
function subscribeBlocked(fn: () => void) {
  blockedSubs.add(fn);
  return () => { blockedSubs.delete(fn); };
}
function useAutoplayBlocked(): boolean {
  return useSyncExternalStore(subscribeBlocked, () => blockedNow, () => false);
}

// Sound on/off for every inline clip. Off on each page load (never saved), on
// after a corner tap, until the next corner tap or a refused unmuted play.
let soundOn = false;
const soundSubs = new Set<() => void>();
function setSoundOn(v: boolean) {
  if (soundOn === v) return;
  soundOn = v;
  soundSubs.forEach((fn) => fn());
}
function subscribeSound(fn: () => void) {
  soundSubs.add(fn);
  return () => { soundSubs.delete(fn); };
}
function useSoundOn(): boolean {
  return useSyncExternalStore(subscribeSound, () => soundOn, () => false);
}

function register(entry: Entry) {
  if (!io) {
    io = new IntersectionObserver((records) => {
      for (const rec of records) {
        const e = entries.get(rec.target);
        if (e) e.ratio = rec.intersectionRatio;
      }
      schedule();
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    window.addEventListener("scroll", scheduleAfterScroll, { passive: true });
    window.addEventListener("resize", schedule);
    // Images and clips loading above a card move it without crossing an
    // intersection threshold. `load` does not bubble, so listen in capture.
    document.addEventListener("load", schedule, true);
    document.addEventListener("visibilitychange", onVisibility);
    bodyRo = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    bodyRo?.observe(document.body);
  }
  entries.set(entry.el, entry);
  io.observe(entry.el);
  schedule();
}
function unregister(entry: Entry) {
  if (entries.get(entry.el) !== entry) return;
  entries.delete(entry.el);
  io?.unobserve(entry.el);
  if (current === entry) { current = null; entry.stop(); schedule(); }
  if (entries.size === 0 && io) {
    io.disconnect();
    io = null;
    window.removeEventListener("scroll", scheduleAfterScroll);
    clearTimeout(scrollTimer);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("load", schedule, true);
    document.removeEventListener("visibilitychange", onVisibility);
    bodyRo?.disconnect();
    bodyRo = null;
  }
}

// ── The video layer ─────────────────────────────────────────────────────────
// Fills its (position: relative) parent. Shown only while it plays, so the
// parent's thumbnail is what sits there otherwise.
export function AutoplayVideo({ item, enabled, fit = "cover", onPlayingChange }: {
  item: NewsItem;
  enabled: boolean;
  fit?: "cover" | "contain";
  onPlayingChange?: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const blocked = useAutoplayBlocked();
  const src = inlineMediaUrl(item);
  const active = enabled && !!src;

  useEffect(() => { onPlayingChange?.(playing); }, [playing, onPlayingChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video || !src || prefersReducedMotion()) return;
    if (typeof IntersectionObserver === "undefined") return;
    let hls: { destroy: () => void } | null = null;
    let attached = false;
    let cancelled = false;

    // Attach the source on the first start only, so a clip that never comes
    // into focus never fetches a byte.
    const attach = async () => {
      if (attached) return;
      attached = true;
      const isHls = /\.m3u8(\?|$)/i.test(src);
      if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
        const { default: Hls } = await import("hls.js");
        if (cancelled || !Hls.isSupported()) return;
        const h = new Hls();
        // A pulled clip: give up quietly, the thumbnail stays.
        h.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) h.destroy(); });
        h.loadSource(src);
        h.attachMedia(video);
        hls = h;
      } else {
        video.src = src;
      }
    };
    const entry: Entry = {
      el: video,
      ratio: 0,
      start: () => {
        void attach().then(() => {
          if (cancelled || current !== entry) return;
          video.muted = !soundOn;
          const play = () => video.play().catch((err: unknown) => {
            // AbortError is only a pause() that beat the start, not a block.
            if ((err as { name?: string })?.name !== "NotAllowedError") return;
            if (cancelled || current !== entry) return;
            // Sound refused (iPhone Safari may allow it only inside a tap):
            // play muted, and the corner shows the muted icon.
            if (!video.muted) {
              video.muted = true;
              setSoundOn(false);
              play();
              return;
            }
            // Refused even muted: the thumbnail and play badge stay.
            setBlockedNow(true);
            const box = video.parentElement ?? video;
            blockedListeners.forEach((fn) => fn(box));
          });
          play();
        });
      },
      stop: () => { if (!video.paused) video.pause(); },
    };
    register(entry);
    return () => {
      cancelled = true;
      unregister(entry);
      hls?.destroy();
    };
  }, [active, src]);

  if (!active) return null;
  return (
    <>
    <video
      ref={videoRef}
      muted
      playsInline
      loop
      preload="none"
      className={`absolute inset-0 w-full h-full ${fit === "contain" ? "object-contain bg-black" : "object-cover"}`}
      style={{ opacity: playing ? 1 : 0, transition: "opacity 200ms" }}
      onPlaying={() => { setPlaying(true); setBlockedNow(false); }}
      onPause={() => setPlaying(false)}
      aria-hidden="true"
      tabIndex={-1}
      data-autoplay-video=""
    />
    {blocked && !playing && <TapToPlay />}
    </>
  );
}

// 16:9 width whose height = the viewport under the app header and news
// toolbar, minus ~7rem for the card header and the clip's headline.
const BIG_MAX_WIDTH = "calc((100svh - var(--header-h, 0px) - var(--news-toolbar-h, 0px) - 7rem) * 16 / 9)";

// One 16:9 clip card for the ESPN layout (and any video source card while
// Autoplay is on): thumbnail + AutoplayVideo layer + headline.
export default function InlineVideoCard({ item, autoplay, large = true, onOpen, ariaLabel }: {
  item: NewsItem;
  autoplay: boolean;
  // Big mode: larger headline and a clip capped to fit the screen.
  large?: boolean;
  onOpen: () => void;
  ariaLabel: string;
}) {
  const [playing, setPlaying] = useState(false);
  const canAutoplay = autoplay && !!inlineMediaUrl(item);

  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.closest("[data-inline-video]")?.querySelector("video")?.pause();
    onOpen();
  };

  // A <div>, not a <button>: the corner SoundButton sits inside it. The
  // headline is the one open button; its ::after stretches over the whole
  // card, so a tap anywhere but the corner opens the modal.
  return (
    <div
      className="relative block w-full text-left cursor-pointer transition-opacity hover:opacity-95"
      data-news-key={item.articleUrl || item.id}
      data-inline-video={canAutoplay ? "auto" : "still"}
      data-sound-scope=""
    >
      {/* Big: cap the clip so it plus its headline fits under the sticky app
          header, toolbar and card header (Jacob 10/8). Width follows from the
          height cap so the box stays 16:9, centered in the card. */}
      <div
        className="news-media-preview relative w-full aspect-video overflow-hidden mx-auto rounded-md"
        style={{
          background: "var(--bg-card-hover)",
          maxWidth: large ? BIG_MAX_WIDTH : undefined,
        }}
      >
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImage(item.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <AutoplayVideo item={item} enabled={canAutoplay} onPlayingChange={setPlaying} />
        {!playing && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4))" }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        {playing && <SoundButton />}
      </div>
      <button
        type="button"
        onClick={open}
        aria-label={ariaLabel}
        className={`${STRETCHED_OPEN} px-1 ${large ? "py-2.5" : "py-2"}`}
      >
        <span className={`news-title leading-snug line-clamp-3 ${large ? "text-base" : "text-sm"}`} style={{ color: "var(--text)" }}>
          {item.headline}
        </span>
      </button>
    </div>
  );
}

// The card's open control: its ::after covers the whole card (the nearest
// positioned ancestor), and carries the keyboard focus ring. The corner
// SoundButton's z-[2] sits above it: .news-media-preview makes no stacking
// context.
export const STRETCHED_OPEN = "block w-full text-left cursor-pointer outline-none after:absolute after:inset-0 after:content-[''] after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-[var(--accent)] focus-visible:after:-outline-offset-2";

// Autoplay is on but the browser refused it: the clip says so itself, in the
// corner where the sound button sits while a clip plays. z-index keeps it over
// each surface's play-badge overlay, which comes later in the DOM.
function TapToPlay() {
  return (
    <span className="absolute right-2 bottom-2 z-[1] rounded px-1.5 py-0.5 text-[11px] font-semibold pointer-events-none" style={{ background: "rgba(0,0,0,0.6)", color: "white" }} data-tap-to-play="">
      Tap to play
    </span>
  );
}

// The playing clip's corner speaker: turns sound on or off in place, with no
// modal. 44 px tap area, 32 px chip. The click is a user gesture, so iPhone
// Safari allows the unmute. The clip is the one autoplay <video> inside the
// nearest [data-sound-scope].
export function SoundButton() {
  const on = useSoundOn();
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const video = e.currentTarget.closest("[data-sound-scope]")?.querySelector<HTMLVideoElement>("video[data-autoplay-video]");
    if (!video) return;
    const next = !on;
    video.muted = !next;
    setSoundOn(next);
    if (video.paused) void video.play().catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      aria-pressed={on}
      title={on ? "Sound off" : "Sound on"}
      className="absolute right-0 bottom-0 z-[2] w-11 h-11 flex items-end justify-end p-1.5 cursor-pointer outline-none group"
      data-sound-button=""
    >
      <span className="w-8 h-8 rounded-full flex items-center justify-center group-focus-visible:outline-2 group-focus-visible:outline-[var(--accent)]" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
        {on ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </span>
    </button>
  );
}
