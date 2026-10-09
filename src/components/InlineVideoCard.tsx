"use client";

import { useEffect, useRef, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";

// News Autoplay (Jacob 10/8: "autoplay is for videos in the feed when they're
// in focus"). With the toolbar's Autoplay pill on, the ONE clip most in focus
// plays muted: among clips at least 60% visible, the one whose center is
// closest to the viewport center. Every other clip pauses, and scrolling hands
// play to the next one. A tap still opens the shared modal with sound. No
// autoplay under prefers-reduced-motion, and none for an item with no direct
// media URL (YouTube-only), which keeps its thumbnail.
//
// <AutoplayVideo> is a <video> layer that fills its parent media box, so each
// surface (ESPN cards, the Cards strip and video cards, Feed posts) keeps its
// own thumbnail and play badge and only adds this layer. It must be a DIRECT
// child of the .news-media-preview box: the Media blur rule
// (`.news-media-preview > *`) then blurs the playing frames too.

const MIN_RATIO = 0.6;

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

function pickFocused() {
  frame = 0;
  const mid = window.innerHeight / 2;
  let best: Entry | null = null;
  let bestDist = Infinity;
  for (const e of entries.values()) {
    if (e.ratio < MIN_RATIO) continue;
    const r = e.el.getBoundingClientRect();
    const dist = Math.abs(r.top + r.height / 2 - mid);
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
// those (Jacob 10/8 r4: Feed → ESPN did not start the first clip).
export function refocusAutoplay() {
  if (entries.size) schedule();
}

// play() refused by the browser (Firefox "Block Audio and Video", Safari Low
// Power Mode): HomeContent shows a one-time note under the toolbar.
const blockedListeners = new Set<() => void>();
export function onAutoplayBlocked(fn: () => void): () => void {
  blockedListeners.add(fn);
  return () => { blockedListeners.delete(fn); };
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
          video.muted = true;
          video.play().catch((err: unknown) => {
            // Refused: the thumbnail and play badge stay. AbortError is only a
            // pause() that beat the start, not a block.
            if ((err as { name?: string })?.name === "NotAllowedError") blockedListeners.forEach((fn) => fn());
          });
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
    <video
      ref={videoRef}
      muted
      playsInline
      loop
      preload="none"
      className={`absolute inset-0 w-full h-full ${fit === "contain" ? "object-contain bg-black" : "object-cover"}`}
      style={{ opacity: playing ? 1 : 0, transition: "opacity 200ms" }}
      onPlaying={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      aria-hidden="true"
      tabIndex={-1}
      data-autoplay-video=""
    />
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
    e.currentTarget.querySelector("video")?.pause();
    onOpen();
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={ariaLabel}
      className="block w-full text-left cursor-pointer transition-opacity hover:opacity-95"
      data-news-key={item.articleUrl || item.id}
      data-inline-video={canAutoplay ? "auto" : "still"}
    >
      {/* Big: cap the clip so it plus its headline fits under the sticky app
          header, toolbar and card header (Jacob 10/8). Width follows from the
          height cap so the box stays 16:9, centered in the card. */}
      <div
        className="news-media-preview relative w-full aspect-video overflow-hidden mx-auto"
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
        {playing && <TapForSound />}
      </div>
      <div className={`news-title px-3 leading-snug line-clamp-3 ${large ? "py-2.5 text-base" : "py-2 text-sm"}`} style={{ color: "var(--text)" }}>
        {item.headline}
      </div>
    </button>
  );
}

// Muted-autoplay cue: a tap opens the modal with sound.
export function TapForSound() {
  return (
    <span className="absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-[11px] font-semibold pointer-events-none" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
      Tap for sound
    </span>
  );
}
