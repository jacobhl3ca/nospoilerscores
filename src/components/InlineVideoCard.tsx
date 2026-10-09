"use client";

import { useEffect, useRef, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";

// One large 16:9 news clip that plays MUTED while it is on screen (the ESPN
// layout's "Big" mode, Jacob 10/8). ≥ 60% visible starts it, < 40% pauses it,
// and only one card in the page plays at a time. A tap opens the shared modal
// with sound, the same as every other news card. No autoplay when the user
// asks for reduced motion, when `autoplay` is false (cards past the first 8,
// to cap data use), or when the item has no direct media URL (YouTube-only):
// those keep the plain thumbnail + play button.

// The card playing right now, page-wide. A new card that starts pauses it.
let activeVideo: HTMLVideoElement | null = null;

const START_RATIO = 0.6;
const STOP_RATIO = 0.4;

export function inlineMediaUrl(item: NewsItem): string | null {
  return item.playbackUrl || item.videoUrl || null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function InlineVideoCard({ item, autoplay, onOpen, ariaLabel }: {
  item: NewsItem;
  autoplay: boolean;
  onOpen: () => void;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = inlineMediaUrl(item);
  const canAutoplay = autoplay && !!src;

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!canAutoplay || !wrap || !video || !src || prefersReducedMotion()) return;
    if (typeof IntersectionObserver === "undefined") return;
    let hls: { destroy: () => void } | null = null;
    let attached = false;
    let cancelled = false;

    // Attach the source on the first start only, so a card that never
    // scrolls into view never fetches a byte (preload="none" alone still
    // lets some browsers fetch metadata once src is set).
    const attach = async () => {
      if (attached) return;
      attached = true;
      const isHls = /\.m3u8(\?|$)/i.test(src);
      if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
        const { default: Hls } = await import("hls.js");
        if (cancelled || !Hls.isSupported()) return;
        const h = new Hls();
        h.loadSource(src);
        h.attachMedia(video);
        hls = h;
      } else {
        video.src = src;
      }
    };
    const start = async () => {
      await attach();
      if (cancelled) return;
      if (activeVideo && activeVideo !== video) activeVideo.pause();
      activeVideo = video;
      video.muted = true;
      video.play().catch(() => { /* autoplay refused: the thumbnail stays */ });
    };
    const stop = () => {
      if (!video.paused) video.pause();
      if (activeVideo === video) activeVideo = null;
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.intersectionRatio >= START_RATIO) void start();
        else if (e.intersectionRatio < STOP_RATIO) stop();
      }
    }, { threshold: [0, STOP_RATIO, START_RATIO, 1] });
    io.observe(wrap);
    return () => {
      cancelled = true;
      io.disconnect();
      stop();
      hls?.destroy();
    };
  }, [canAutoplay, src]);

  const open = () => {
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
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
      <div ref={wrapRef} className="news-media-preview relative w-full aspect-video overflow-hidden" style={{ background: "var(--bg-card-hover)" }}>
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
        {canAutoplay && (
          <video
            ref={videoRef}
            muted
            playsInline
            loop
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: playing ? 1 : 0, transition: "opacity 200ms" }}
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            aria-hidden="true"
            tabIndex={-1}
          />
        )}
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
        {playing && (
          // Muted-autoplay cue: tap for sound in the modal.
          <span className="absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-[11px] font-semibold pointer-events-none" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
            Tap for sound
          </span>
        )}
      </div>
      <div className="news-title px-3 py-2.5 text-base leading-snug line-clamp-3" style={{ color: "var(--text)" }}>
        {item.headline}
      </div>
    </button>
  );
}
