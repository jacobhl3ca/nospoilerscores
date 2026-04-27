"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/youtube";
import { formatPublished } from "@/lib/news";

interface VideoModalProps {
  videoId: string;
  fallbackUrl: string;
  onClose: () => void;
  // When set, the modal plays this HLS (or MP4) stream directly via <video> +
  // hls.js instead of embedding a YouTube iframe. Used for MLB clips where the
  // source's own stream is accessible (gives us the exact clip, not a YouTube
  // reupload that may be a different cut).
  playbackUrl?: string | null;
  // Poster image for the <video> element while HLS loads.
  poster?: string | null;
  // When set, the modal renders an image lightbox instead of any video. Used
  // for i.redd.it image posts so they pop in-context like videos do.
  imageUrl?: string | null;
  // Friendly source name for the footer link — overrides the hostname-derived
  // default (e.g. "r/baseball" instead of "Reddit", "MLB Most Popular" instead
  // of "MLB.com"). Falls back to URL-host inference when null.
  sourceLabel?: string | null;
  // Post metadata — surfaced in a card layout so the modal is a useful
  // preview of the post (headline / author / time / subreddit) instead of
  // just an unframed image lightbox. When no media (no video, no image)
  // these turn the modal into a text-post preview card with an "Open on …"
  // button for click-out.
  headline?: string | null;
  byline?: string | null;
  published?: string | null;
}

// Pulls the original `search_query=...` out of a YouTube search URL so we can
// re-query /api/youtube for an alternate videoId when the primary embed fails.
function extractSearchQuery(fallbackUrl: string): string | null {
  try {
    const u = new URL(fallbackUrl);
    return u.searchParams.get("search_query");
  } catch {
    return null;
  }
}

// Per-source label for the modal's "Open on …" link. The footer used to read
// "Open on source" generically — this maps the URL host to the actual brand so
// users know whether they're heading to Reddit, MLB, ESPN, etc. before tapping.
function sourceLabelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.endsWith("reddit.com") || host === "redd.it" || host.endsWith(".redd.it")) return "Open on Reddit";
    if (host.endsWith("mlb.com")) return "Open on MLB.com";
    if (host.endsWith("espn.com") || host.endsWith("espn.go.com")) return "Open on ESPN";
    if (host.endsWith("nba.com")) return "Open on NBA.com";
    if (host.endsWith("nhl.com")) return "Open on NHL.com";
    if (host.endsWith("nfl.com")) return "Open on NFL.com";
    if (host.endsWith("cbssports.com")) return "Open on CBS Sports";
    if (host.endsWith("thescore.com")) return "Open on theScore";
    return `Open on ${host}`;
  } catch {
    return "Open source";
  }
}

export default function VideoModal({ videoId, fallbackUrl, onClose, playbackUrl, poster, imageUrl, sourceLabel, headline, byline, published }: VideoModalProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentId, setCurrentId] = useState(videoId);
  const failedIdsRef = useRef<string[]>([]);
  const retryingRef = useRef(false);
  // imgFailed flips when the lightbox image errors out — at that point we
  // collapse to text-card mode so the user sees the headline + open button
  // instead of an empty modal (Firefox + Reddit external-preview is the
  // current offender).
  const [imgFailed, setImgFailed] = useState(false);
  const hlsMode = !!playbackUrl;
  const imageMode = !!imageUrl && !imgFailed && !playbackUrl && !videoId;
  const textMode = !hlsMode && !imageMode && !videoId;
  const linkLabel = sourceLabel ? `Open on ${sourceLabel}` : sourceLabelFromUrl(fallbackUrl);

  // Reset when the modal is opened with a different primary id
  useEffect(() => {
    setCurrentId(videoId);
    failedIdsRef.current = [];
  }, [videoId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Direct-stream playback branch — handles two URL shapes:
  //   • .m3u8 manifests (MLB highlights) — Safari natively, hls.js elsewhere
  //   • plain MP4 (e.g. v.redd.it CMAF fallback) — every browser natively
  // hls.js is lazy-loaded only when needed so it stays out of the main bundle.
  useEffect(() => {
    if (!hlsMode) return;
    const video = videoRef.current;
    if (!video || !playbackUrl) return;
    const isHls = /\.m3u8(\?|$)/i.test(playbackUrl);
    // Plain MP4 / Safari native HLS — set src and play.
    if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
      video.play().catch(() => {});
      return;
    }
    // hls.js fallback for Chrome/Firefox/etc. on .m3u8 only.
    let hls: any = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return;
      hls = new Hls();
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    });
    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [hlsMode, playbackUrl]);

  // YouTube IFrame Player API. Recreates on currentId change (fallback retry swaps it).
  useEffect(() => {
    if (hlsMode || imageMode || textMode) return; // HLS / image / text branches handle rendering instead
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";

    if (!(window as any).YT) {
      document.head.appendChild(tag);
    }

    const tryFallback = async () => {
      if (retryingRef.current) return;
      retryingRef.current = true;
      const q = extractSearchQuery(fallbackUrl);
      if (!q) {
        retryingRef.current = false;
        return;
      }
      // Mark current id as failed and ask the worker for an alternate
      const failed = [...failedIdsRef.current, currentId];
      failedIdsRef.current = failed;
      try {
        const res = await fetch(
          `${getApiBase()}/api/youtube?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(failed.join(","))}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.videoId && data.videoId !== currentId) {
            setCurrentId(data.videoId);
          }
        }
      } catch {
        // swallow — leave the broken player; user still has "Watch on YouTube"
      } finally {
        retryingRef.current = false;
      }
    };

    const initPlayer = () => {
      playerRef.current = new (window as any).YT.Player("yt-player", {
        videoId: currentId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            const qualities = event.target.getAvailableQualityLevels();
            if (qualities.length > 0) {
              event.target.setPlaybackQuality(qualities[0]);
            }
            event.target.playVideo();
          },
          // YT error codes 100 (removed), 101 / 150 (embed disabled),
          // 5 (HTML5 issue), 2 (bad param). Any of these → swap to next.
          onError: () => {
            tryFallback();
          },
        },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current?.destroy) playerRef.current.destroy();
    };
  }, [currentId, fallbackUrl, hlsMode, imageMode, textMode]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-8"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.92)" }} />

      {/* Content */}
      <div
        className="relative w-full max-w-5xl"
        style={{ zIndex: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Player area — image lightbox (no aspect lock), 16:9 video, or YouTube iframe */}
        {imageMode ? (
          <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-black flex items-center justify-center" style={{ maxHeight: "85vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl!}
              alt=""
              className="max-w-full max-h-[85vh] object-contain"
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : textMode ? (
          // Text-post preview card — Reddit headline-only posts (or any item
          // whose image failed to load) get a clean card layout instead of
          // an empty lightbox. Everything stays on hidescore until the user
          // hits the "Open on …" button at the bottom.
          <div ref={containerRef} className="relative w-full rounded-lg p-6 sm:p-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {sourceLabel && (
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>{sourceLabel}</p>
            )}
            {headline && (
              <h2 className="text-lg sm:text-2xl font-semibold leading-snug mb-3" style={{ color: "var(--text)" }}>{headline}</h2>
            )}
            {(byline || published) && (
              <p className="text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>
                {[byline, published ? formatPublished(published) : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingBottom: "56.25%" }}>
            {hlsMode ? (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full"
                controls
                autoPlay
                muted
                playsInline
                poster={poster ?? undefined}
              />
            ) : (
              <div id="yt-player" className="absolute inset-0 w-full h-full" />
            )}
          </div>
        )}

        {/* Headline + byline below media — for image / video modes, gives
            context without filling the modal. textMode renders these inside
            the card itself, so skip them here. */}
        {!textMode && headline && (
          <div className="mt-3 text-center px-2">
            <p className="text-sm sm:text-base text-white/90 leading-snug">{headline}</p>
            {(byline || published) && (
              <p className="text-xs text-white/40 mt-1">
                {[byline, published ? formatPublished(published) : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* Direct link — branded per source so users know where they're going */}
        <div className={`${textMode ? "mt-4" : "mt-3"} text-center`}>
          <a
            href={(hlsMode || imageMode || textMode) ? (fallbackUrl || "#") : `https://www.youtube.com/watch?v=${currentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={textMode
              ? "inline-block px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              : "text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2"}
            style={textMode ? { background: "var(--accent)", color: "white" } : undefined}
          >
            {(hlsMode || imageMode || textMode) ? linkLabel : "Watch on YouTube"}
          </a>
        </div>
      </div>
    </div>
  );
}
