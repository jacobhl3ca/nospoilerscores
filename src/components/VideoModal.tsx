"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/youtube";

interface VideoModalProps {
  videoId: string;
  fallbackUrl: string;
  onClose: () => void;
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

export default function VideoModal({ videoId, fallbackUrl, onClose }: VideoModalProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState(videoId);
  const failedIdsRef = useRef<string[]>([]);
  const retryingRef = useRef(false);

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

  // YouTube IFrame Player API. Recreates on currentId change (fallback retry swaps it).
  useEffect(() => {
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
  }, [currentId, fallbackUrl]);

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

        {/* 16:9 YouTube player */}
        <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingBottom: "56.25%" }}>
          <div id="yt-player" className="absolute inset-0 w-full h-full" />
        </div>

        {/* YouTube direct link */}
        <div className="mt-3 text-center">
          <a
            href={`https://www.youtube.com/watch?v=${currentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2"
          >
            Watch on YouTube
          </a>
        </div>
      </div>
    </div>
  );
}
