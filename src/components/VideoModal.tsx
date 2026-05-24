"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/youtube";
import { formatPublished, proxyImage } from "@/lib/news";

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
  // When set, the modal renders this URL in a plain <iframe> — used for
  // Brightcove-hosted NHL recaps, which aren't YouTube and so bypass the
  // YouTube player API / watchdog / fallback-retry machinery entirely.
  embedUrl?: string | null;
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
  // Selftext body for Reddit text posts. Raw markdown — rendered with
  // paragraph breaks + autolinking. Only shown in textMode (no media).
  body?: string | null;
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

// Minimal Reddit selftext renderer. Reddit selftext is markdown but we only
// care about the structural bits that matter for readability — paragraphs,
// line breaks, and autolinked URLs. Full markdown (headings, bold, code
// fences) is rare in posts and not worth pulling marked/markdown-it for.
// Escapes HTML first so a post with literal "<script>" is safe.
function renderRedditBody(raw: string): React.ReactNode {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Split on blank-line gaps into paragraphs. Inside a paragraph, single
  // newlines become <br/>.
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((para, pi) => {
    // Linkify URLs (http/https). Build a mixed array of strings + anchors so
    // each piece can be rendered safely without dangerouslySetInnerHTML.
    const urlRe = /\bhttps?:\/\/[^\s<>"')]+/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRe.exec(para)) !== null) {
      const before = para.slice(lastIdx, match.index);
      if (before) parts.push(escape(before));
      const url = match[0];
      parts.push(
        <a
          key={`u-${pi}-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {url}
        </a>
      );
      lastIdx = match.index + url.length;
    }
    const tail = para.slice(lastIdx);
    if (tail) parts.push(escape(tail));
    // Handle intra-paragraph single newlines → <br/>. Walk parts and split
    // each string segment on \n, interleaving <br/> elements.
    const withBreaks: React.ReactNode[] = [];
    parts.forEach((part, idx) => {
      if (typeof part === "string") {
        const lines = part.split("\n");
        lines.forEach((line, li) => {
          if (line) withBreaks.push(line);
          if (li < lines.length - 1) withBreaks.push(<br key={`br-${pi}-${idx}-${li}`} />);
        });
      } else {
        withBreaks.push(part);
      }
    });
    return (
      <p key={`p-${pi}`} className={pi === 0 ? "" : "mt-3"}>
        {withBreaks}
      </p>
    );
  });
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
    // wnba.com check must precede nba.com — "wnba.com".endsWith("nba.com") is true.
    if (host.endsWith("wnba.com")) return "Open on WNBA.com";
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

export default function VideoModal({ videoId, fallbackUrl, onClose, playbackUrl, poster, imageUrl, embedUrl, sourceLabel, headline, byline, published, body }: VideoModalProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentId, setCurrentId] = useState(videoId);
  const failedIdsRef = useRef<string[]>([]);
  const retryingRef = useRef(false);
  // Some YouTube errors render inside the iframe without firing the JS
  // API's onError event — Error 153 ("Video player configuration error")
  // on certain MLB/restricted content is the offender. We start a timer
  // when onReady fires and force tryFallback() if playback never starts.
  const watchdogRef = useRef<number | null>(null);
  // imgFailed flips when the lightbox image errors out — at that point we
  // collapse to text-card mode so the user sees the headline + open button
  // instead of an empty modal (Firefox + Reddit external-preview is the
  // current offender).
  const [imgFailed, setImgFailed] = useState(false);
  // Captions: default OFF, custom toggle button surfaces them prominently
  // instead of leaving the user to dig through Safari's "more" overflow menu.
  // hasCaptionTrack hides the button on streams with no CC track at all
  // (e.g., v.redd.it MP4s).
  const [showCC, setShowCC] = useState(false);
  const [hasCaptionTrack, setHasCaptionTrack] = useState(false);
  // Brief "Copied ✓" confirmation after the copy-link button is tapped.
  const [copied, setCopied] = useState(false);
  const hlsMode = !!playbackUrl;
  const embedMode = !!embedUrl && !playbackUrl;
  const imageMode = !!imageUrl && !imgFailed && !playbackUrl && !embedUrl && !videoId;
  const textMode = !hlsMode && !embedMode && !imageMode && !videoId;
  const linkLabel = sourceLabel ? `Open on ${sourceLabel}` : sourceLabelFromUrl(fallbackUrl);
  // The URL the footer points at — the YouTube watch page for YT clips,
  // otherwise the original source page. Also what Copy-link writes out.
  const shareUrl = (hlsMode || embedMode || imageMode || textMode)
    ? (fallbackUrl || "")
    : `https://www.youtube.com/watch?v=${currentId}`;

  // Copy the highlight's link to the clipboard. navigator.clipboard works in
  // both the browser and the iOS WKWebView — the app loads from the https
  // hidescore.com origin, so it's a secure context — meaning no Capacitor
  // plugin and no native rebuild; this ships as a plain web push. Falls back
  // to a hidden-textarea execCommand for any context without the async API.
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* throwaway affordance — the link stays tappable if copy fails */
    }
  };

  // Reset caption state any time the modal swaps to a different stream
  useEffect(() => {
    setShowCC(false);
    setHasCaptionTrack(false);
  }, [playbackUrl]);

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
    // Flip detection — show the custom CC button only when the source
    // actually carries a captions/subtitles track.
    const refreshHasCaptionTrack = () => {
      const has = Array.from(video.textTracks).some(
        (t) => t.kind === "captions" || t.kind === "subtitles"
      );
      setHasCaptionTrack((prev) => (prev === has ? prev : has));
    };
    video.textTracks.addEventListener("addtrack", refreshHasCaptionTrack);
    video.addEventListener("loadedmetadata", refreshHasCaptionTrack);
    const isHls = /\.m3u8(\?|$)/i.test(playbackUrl);
    // Plain MP4 / Safari native HLS — set src and play.
    if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
      video.play().catch(() => {});
      return () => {
        video.textTracks.removeEventListener("addtrack", refreshHasCaptionTrack);
        video.removeEventListener("loadedmetadata", refreshHasCaptionTrack);
      };
    }
    // hls.js fallback for Chrome/Firefox/etc. on .m3u8 only.
    let hls: any = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return;
      hls = new Hls();
      // Stop the SubtitleTrackController from auto-promoting a DEFAULT=YES
      // track. Setter, not config — this version's HlsConfig doesn't expose
      // subtitleDisplay. The enforce loop below is the real source of truth;
      // this just keeps hls.js from fighting it during init.
      try { hls.subtitleDisplay = false; } catch {}
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    });
    return () => {
      cancelled = true;
      video.textTracks.removeEventListener("addtrack", refreshHasCaptionTrack);
      video.removeEventListener("loadedmetadata", refreshHasCaptionTrack);
      if (hls) hls.destroy();
    };
  }, [hlsMode, playbackUrl]);

  // Caption mode enforcer — keeps every captions/subtitles track in sync with
  // showCC. Safari's native HLS path will auto-promote a DEFAULT=YES track to
  // "showing" repeatedly during the load handshake (especially with the macOS
  // system CC accessibility pref on), so a one-shot disable isn't enough; we
  // re-assert across every load milestone AND poll for the first ~2s. After
  // playback settles the polling stops so the custom toggle stays responsive.
  useEffect(() => {
    if (!hlsMode) return;
    const video = videoRef.current;
    if (!video) return;
    const target: TextTrackMode = showCC ? "showing" : "disabled";
    const enforce = () => {
      for (const t of Array.from(video.textTracks)) {
        if (t.kind === "captions" || t.kind === "subtitles") {
          if (t.mode !== target) t.mode = target;
        }
      }
    };
    enforce();
    video.textTracks.addEventListener("addtrack", enforce);
    video.addEventListener("loadedmetadata", enforce);
    video.addEventListener("loadeddata", enforce);
    video.addEventListener("canplay", enforce);
    video.addEventListener("playing", enforce);
    const pollId = window.setInterval(enforce, 100);
    const stopPoll = window.setTimeout(() => window.clearInterval(pollId), 2000);
    return () => {
      video.textTracks.removeEventListener("addtrack", enforce);
      video.removeEventListener("loadedmetadata", enforce);
      video.removeEventListener("loadeddata", enforce);
      video.removeEventListener("canplay", enforce);
      video.removeEventListener("playing", enforce);
      window.clearInterval(pollId);
      window.clearTimeout(stopPoll);
    };
  }, [hlsMode, playbackUrl, showCC]);

  // YouTube IFrame Player API. Recreates on currentId change (fallback retry swaps it).
  useEffect(() => {
    if (hlsMode || embedMode || imageMode || textMode) return; // HLS / iframe / image / text branches handle rendering instead
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

    // Highest → lowest. Only request qualities we know YT advertises.
    const QUALITY_PREF = ["highres", "hd2160", "hd1440", "hd1080", "hd720"];
    const pickBest = (levels: string[]): string | null => {
      for (const q of QUALITY_PREF) if (levels.includes(q)) return q;
      return null;
    };
    const forceBest = (player: any) => {
      const levels: string[] = player.getAvailableQualityLevels?.() || [];
      const best = pickBest(levels);
      if (best) player.setPlaybackQuality?.(best);
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
          // vq is deprecated but still hinted by some clients.
          vq: "hd1080",
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            // Watchdog: if we never reach PLAYING or BUFFERING within
            // 10s, assume the iframe is stuck on a silent error screen
            // (e.g. YT Error 153 on MLB content) and try the next
            // candidate. Bounded by failedIdsRef + the worker's exclude
            // param, so retries terminate when no more candidates exist.
            if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
            watchdogRef.current = window.setTimeout(() => {
              const state = playerRef.current?.getPlayerState?.();
              if (state !== 1 && state !== 3) tryFallback();
            }, 10000);
          },
          // PLAYING (1) is the first state where getAvailableQualityLevels()
          // returns the real list — onReady gives []. setPlaybackQuality is
          // a deprecated suggestion, but it's the only knob we have.
          onStateChange: (event: any) => {
            // Playback actually started — kill the watchdog.
            if ((event.data === 1 || event.data === 3) && watchdogRef.current) {
              window.clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            if (event.data === 1) forceBest(event.target);
          },
          // If YT auto-quality downgrades us, push back up to the best level.
          onPlaybackQualityChange: (event: any) => {
            const levels: string[] = event.target.getAvailableQualityLevels?.() || [];
            const best = pickBest(levels);
            if (best && event.data !== best) event.target.setPlaybackQuality?.(best);
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
      if (watchdogRef.current) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (playerRef.current?.destroy) playerRef.current.destroy();
    };
  }, [currentId, fallbackUrl, hlsMode, embedMode, imageMode, textMode]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-8"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.92)" }} />

      {/* Content — clicks bubble to onClose so tapping the image, headline,
          or any whitespace around them dismisses. The video player and CC
          button stop propagation themselves so playback controls keep working. */}
      <div
        className="relative w-full max-w-5xl"
        style={{ zIndex: 1 }}
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

        {/* Captions toggle — only when the source carries a CC track. Sits
            beside the close button so it's always reachable instead of buried
            in Safari's overflow menu. */}
        {hlsMode && hasCaptionTrack && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowCC((v) => !v); }}
            aria-pressed={showCC}
            className="absolute -top-10 right-10 h-8 px-2 flex items-center justify-center rounded-md text-xs font-bold transition-colors cursor-pointer"
            style={{
              color: showCC ? "white" : "rgba(255,255,255,0.6)",
              background: showCC ? "var(--accent)" : "transparent",
              border: showCC ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.3)",
            }}
            title={showCC ? "Hide captions" : "Show captions"}
          >
            CC
          </button>
        )}


        {/* Player area — image lightbox (no aspect lock), 16:9 video, or YouTube iframe */}
        {imageMode ? (
          <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-black flex items-center justify-center" style={{ maxHeight: "85vh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyImage(imageUrl!)}
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
          <div ref={containerRef} className="relative w-full rounded-lg p-6 sm:p-8 max-h-[85vh] overflow-y-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
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
            {body && (
              <div
                className="text-sm sm:text-base leading-relaxed mt-4 pt-4"
                style={{ color: "var(--text)", borderTop: "1px solid var(--border)" }}
              >
                {renderRedditBody(body)}
              </div>
            )}
          </div>
        ) : (
          <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingBottom: "56.25%" }} onClick={(e) => e.stopPropagation()}>
            {hlsMode ? (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full"
                controls
                autoPlay
                muted
                playsInline
                poster={proxyImage(poster) ?? undefined}
              />
            ) : embedMode ? (
              <iframe
                src={embedUrl!}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
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

        {/* Direct link + copy — branded per source so users know where the
            link goes; the copy button gives iOS the same grab-the-URL that
            the browser's right-click menu does on the web. */}
        <div className={`${textMode ? "mt-4" : "mt-3"} flex items-center justify-center gap-3`}>
          <a
            href={shareUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={textMode
              ? "inline-block px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              : "text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2"}
            style={textMode ? { background: "var(--accent)", color: "white" } : undefined}
          >
            {(hlsMode || embedMode || imageMode || textMode) ? linkLabel : "Watch on YouTube"}
          </a>
          {shareUrl && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); copyLink(); }}
              className="text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2 cursor-pointer"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
