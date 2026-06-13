"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/youtube";
import { formatPublished, proxyImage } from "@/lib/news";
import { shareCardUrl, type ShareCardMeta } from "@/lib/shareCard";

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
  // Matchup metadata for game highlights — when present, Copy-link renders +
  // uploads a preview card and shares a hidescore.com link that unfurls with
  // the two teams + date instead of the raw YouTube/source URL. Null for news.
  shareCard?: ShareCardMeta | null;
  // Spoiler masks over the YouTube player chrome. Both default ON (covered);
  // user toggles each in Settings. Only affect the YouTube highlight path.
  maskVideoTitle?: boolean;
  maskVideoBottom?: boolean;
  // Which seek control the YouTube player shows: progress bar + jumps ("both",
  // default), bar only, or jumps only.
  seekControl?: "both" | "bar" | "jumps";
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

// Embed-mode players (Brightcove, used by the NHL Top Videos news card) need
// autoplay requested in the player URL — the iframe's allow="autoplay" only
// grants the permission, it doesn't start playback. Append muted autoplay so
// embed clips open playing like the YouTube (autoplay:1, mute:1) and HLS
// (autoPlay muted) paths already do. muted=true is mandatory: browsers block
// UNmuted autoplay, so without it the player stays paused. searchParams.set
// overwrites, so this stays correct even if the baked URL later carries its own.
function withAutoplay(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("autoplay", "true");
    u.searchParams.set("muted", "true");
    return u.toString();
  } catch {
    return url;
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

// Preset jump targets for the spoiler-safe seek controls. Clicking just left/
// right of the video to skip works for a few seconds but is tedious to reach
// the middle of a long reel — and the native scrubber stays hidden because it
// spoils progress. These jump to a fraction of the clip with no timeline ever
// shown. (No 100% — that's just the ending.)
const JUMP_PCTS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

export default function VideoModal({ videoId, fallbackUrl, onClose, playbackUrl, poster, imageUrl, embedUrl, sourceLabel, headline, byline, published, body, shareCard, maskVideoTitle = true, maskVideoBottom = true, seekControl = "both" }: VideoModalProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
  // Playback position (0–1) for the custom progress bar. Polled off the YT
  // player; NO timeline/scrubber thumbnails (those are the spoiler) — just a
  // fill. Drag-seek is capped at 90% (see seekFromClientX) so the ending can't
  // be skipped to, matching the jump presets' "no 100%".
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingBarRef = useRef(false);
  // controls:0 hides YouTube's native mute button, and clips autoplay muted
  // (browsers block unmuted autoplay) — so we render a custom unmute toggle.
  const [muted, setMuted] = useState(true);
  // The title-bar spoiler mask is ALWAYS on for YouTube clips. YouTube
  // re-surfaces the clip title (and channel byline) on hover, on pause, AND a
  // few seconds into playback whenever the mouse moves — and hover over a
  // cross-origin iframe can't be reliably detected from the parent, so any
  // "fade it out during playback" scheme leaks the title (the whole point of
  // the app is no spoilers). We keep it permanently covered and sized tight to
  // the title block so it costs almost no footage.
  // Fullscreen. nativeFs tracks the Fullscreen API on the player WRAPPER —
  // fullscreening the wrapper (not the bare iframe) keeps the spoiler mask and
  // the control strip on top, so YouTube's title stays covered in fullscreen
  // too. fakeFs is the CSS-overlay fallback for iPhone Safari / the iOS app's
  // WKWebView, where element fullscreen on a non-<video> element doesn't exist.
  const fsWrapRef = useRef<HTMLDivElement>(null);
  const [nativeFs, setNativeFs] = useState(false);
  const [fakeFs, setFakeFs] = useState(false);
  const fsActive = nativeFs || fakeFs;
  // Timestamp of the last native-fullscreen exit — some browsers deliver the
  // Escape keydown alongside the exit, and that Escape must not also close the
  // whole modal.
  const fsExitAtRef = useRef(0);
  const hlsMode = !!playbackUrl;
  const embedMode = !!embedUrl && !playbackUrl;
  const imageMode = !!imageUrl && !imgFailed && !playbackUrl && !embedUrl && !videoId;
  const textMode = !hlsMode && !embedMode && !imageMode && !videoId;
  const ytMode = !hlsMode && !embedMode && !imageMode && !textMode;
  const linkLabel = sourceLabel ? `Open on ${sourceLabel}` : sourceLabelFromUrl(fallbackUrl);
  // The YouTube video id, when this is a YouTube clip (not an HLS/embed/image/
  // text card) — used both for the footer link and the hidescore deep-link.
  const ytId = ytMode ? currentId : null;
  // The URL the footer points at — the YouTube watch page for YT clips,
  // otherwise the original source page.
  const sourceShareUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : (fallbackUrl || "");
  // For game highlights we hand out a hidescore.com link instead: it opens the
  // clip in-app (?v=) AND unfurls in iMessage as a matchup card (?c=, served by
  // the worker from the PNG we upload in copyLink). News/non-game clips have no
  // shareCard, so they keep the plain source URL.
  const shareUrl = shareCard ? shareCardUrl(shareCard, ytId) : sourceShareUrl;

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

  // Jump to a fraction of the clip. Works off the YouTube player's reported
  // duration so no timeline is ever revealed.
  const seekToPct = useCallback((pct: number) => {
    const p = playerRef.current;
    if (!p?.getDuration || !p?.seekTo) return;
    const d = p.getDuration();
    if (!d || d <= 0) return;
    p.seekTo((d * pct) / 100, true);
    p.playVideo?.();
  }, []);

  // Drag/click the progress bar to seek. Caps the target at 90% so the user
  // can never jump to the ending (same spoiler rule as the jump presets); the
  // fill itself still shows true position, including past 90% during normal
  // playback. No thumbnail preview is ever shown.
  const seekFromClientX = useCallback((clientX: number) => {
    const el = barRef.current;
    const p = playerRef.current;
    if (!el || !p?.getDuration || !p?.seekTo) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const frac = Math.max(0, Math.min(0.9, (clientX - r.left) / r.width));
    const d = p.getDuration();
    if (!d || d <= 0) return;
    p.seekTo(d * frac, true);
    p.playVideo?.();
    setProgress(frac);
  }, []);

  // Poll the YT player's position to drive the progress-bar fill while the
  // clip plays. Cheap (every 350ms) and only while this is a YouTube clip.
  useEffect(() => {
    if (!ytMode) return;
    const id = window.setInterval(() => {
      if (draggingBarRef.current) return; // don't fight an active drag
      const p = playerRef.current;
      const d = p?.getDuration?.() ?? 0;
      const t = p?.getCurrentTime?.() ?? 0;
      if (d > 0) setProgress(Math.min(1, t / d));
    }, 350);
    return () => window.clearInterval(id);
  }, [ytMode]);

  // Toggle mute on the YouTube player.
  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) { p.unMute?.(); p.setVolume?.(100); setMuted(false); }
    else { p.mute?.(); setMuted(true); }
  }, [muted]);

  // Toggle fullscreen. For YouTube we expand the WRAPPER (so the spoiler mask
  // and control bar ride along and the title stays hidden); native element
  // fullscreen first, CSS-overlay fallback on iOS where it's unavailable.
  // HLS/embed keep plain element fullscreen — those have no spoiler title.
  const toggleFullscreen = useCallback(() => {
    if (!ytMode) {
      if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
      const el: any = hlsMode ? videoRef.current : embedMode ? iframeRef.current : null;
      if (!el) return;
      if (typeof el.requestFullscreen === "function") el.requestFullscreen().catch(() => {});
      else if (typeof el.webkitEnterFullscreen === "function") el.webkitEnterFullscreen();
      else if (typeof el.webkitRequestFullscreen === "function") el.webkitRequestFullscreen();
      return;
    }
    if (fakeFs) { setFakeFs(false); return; }
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    const wrap: any = fsWrapRef.current;
    if (!wrap) return;
    if (typeof wrap.requestFullscreen === "function") {
      wrap.requestFullscreen().catch(() => setFakeFs(true));
    } else if (typeof wrap.webkitRequestFullscreen === "function") {
      wrap.webkitRequestFullscreen();
    } else {
      setFakeFs(true); // iOS Safari / WKWebView — no element fullscreen
    }
  }, [ytMode, hlsMode, embedMode, fakeFs]);

  // Keep nativeFs in sync with the browser, and remember when we left so a
  // co-delivered Escape doesn't also close the modal.
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = (document.fullscreenElement || (document as any).webkitFullscreenElement) ?? null;
      const active = !!fsEl && fsEl === fsWrapRef.current;
      setNativeFs(active);
      if (!active) fsExitAtRef.current = Date.now();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  // Keyboard: Esc backs out of fullscreen first, then closes; "f" fullscreens.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fakeFs) { setFakeFs(false); return; }
        if (nativeFs) return;                                  // browser exits FS itself
        if (Date.now() - fsExitAtRef.current < 350) return;    // just left FS — swallow
        onClose();
        return;
      }
      // "f" toggles fullscreen — but don't steal it from text entry or from
      // Cmd/Ctrl-F (browser find) and other modified chords.
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, fakeFs, nativeFs, toggleFullscreen]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

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
    // hls.js fallback for Chrome/Firefox/etc. on .m3u8 only. (Safari/iOS never
    // reach here — they take the native-HLS branch above, where the rendition
    // is governed by the <video> element's rendered size, i.e. the modal width.)
    // Configured to favor the top rendition from the first frame: these are
    // short highlight clips (MLB ~30-90s, v.redd.it), so the default ABR — which
    // starts on a low/mid level and ramps up over several segments — would often
    // let the clip end before it ever reached max quality.
    let hls: any = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return;
      hls = new Hls({
        // Don't let the (deliberately small) modal cap the level, and assume
        // broadband so the very first segment isn't fetched at a low rendition.
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 5_000_000,
      });
      // Stop the SubtitleTrackController from auto-promoting a DEFAULT=YES
      // track. Setter, not config — this version's HlsConfig doesn't expose
      // subtitleDisplay. The enforce loop below is the real source of truth;
      // this just keeps hls.js from fighting it during init.
      try { hls.subtitleDisplay = false; } catch {}
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Pin to the highest rendition. For these short clips we want max
        // quality immediately rather than waiting for ABR to climb to it
        // mid-clip; setting currentLevel disables auto-switching, which is
        // safe here — the clips are seconds-to-minutes long, not live streams.
        // (The longer ~10-min NHL condensed games go through Brightcove embeds,
        // not this path, so nothing here is long enough to risk a stall.)
        if (hls.levels && hls.levels.length > 0) {
          hls.currentLevel = hls.levels.length - 1;
        }
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
          // controls:0 strips YouTube's bottom control bar — the red seek line
          // AND the elapsed/duration readout (e.g. 16:13 / 18:30), both of which
          // spoil how far through a highlight reel you are. It also disables
          // scrubbing (itself a spoiler vector). Mute/CC/fullscreen go with it:
          // we render our own subtle control strip below the video instead.
          controls: 0,
          // Hide in-video annotations/cards — they can carry spoilers.
          iv_load_policy: 3,
          // vq is deprecated but still hinted by some clients.
          vq: "hd1080",
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            // A freshly-built player always autoplays muted — keep the custom
            // toggle in sync (covers fallback swaps after an unmute, too).
            setMuted(true);
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

  // Shared sizing for the YT video region + control bar so both line up and,
  // in fullscreen, the video is capped to leave room for the bar underneath.
  const FS_BAR_RESERVE = 64; // px reserved below the video for the control bar
  const fsMediaWidth = `min(100vw, calc((100vh - ${FS_BAR_RESERVE}px) * 16 / 9))`;
  const btnBase = "flex items-center justify-center rounded-md text-white/55 hover:text-white transition-colors cursor-pointer";

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
        className="relative w-full max-w-7xl" /* PROTOTYPE 6/2: 6xl→7xl modal-width lever (Safari/iOS quality). Revert to max-w-6xl if the desktop trade-off isn't worth it. */
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


        {/* Player area — image lightbox (no aspect lock), YouTube (custom
            chrome), or 16:9 video for HLS/embed */}
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
        ) : ytMode ? (
          // YouTube clip. The wrapper is what we fullscreen (so the mask + the
          // control bar come along and the title stays covered in fullscreen).
          <div
            ref={fsWrapRef}
            onClick={(e) => e.stopPropagation()}
            style={fsActive ? {
              position: "fixed", inset: 0, zIndex: 10000, background: "#000",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            } : undefined}
          >
            {/* Video region — 16:9 in-flow, or capped to leave bar room in FS */}
            <div
              className="relative w-full overflow-hidden bg-black"
              style={fsActive
                ? { width: fsMediaWidth, aspectRatio: "16 / 9", borderRadius: 0 }
                : { paddingBottom: "56.25%", borderRadius: "0.5rem" }}
            >
              <div id="yt-player" className="absolute inset-0 w-full h-full" />
              {/* Spoiler masks over YouTube's chrome — always on (see note by
                  the state declarations), each independently toggleable in
                  Settings (maskVideoTitle / maskVideoBottom). pointer-events stay
                  off so click-to-play/pause keeps working. STRAIGHT BLACK, no
                  gradient: a hard edge, so each bar is the thinnest height that
                  still hides the chrome and crops the least footage.
                  TOP — measured (full Chrome, embed framed at the modal's real
                  player sizes, 2026-06-12): the title is a SINGLE truncated line
                  whose bottom sits at a ~FIXED ~36px regardless of player size
                  (33px @219h mobile, 36px @394/619h) — it does NOT scale with the
                  player, so this is essentially a flat px strip, not a %. The
                  channel byline below it ends ~51px. We cover the title (the
                  spoiler); the byline is just the channel name (NBA/MLB — not a
                  spoiler) so we let it peek rather than crop ~15px more. clamp's %
                  only nudges mid-size; min/max keep it ~42–50px everywhere. To also
                  hide the byline, raise to ~54px (costs more crop on phones).
                  WHY ALWAYS-ON (do not make it conditional): on desktop YouTube
                  re-shows the title overlay on MOUSE-MOVE mid-playback, and hover
                  over the cross-origin YT iframe is undetectable from this parent
                  frame — so we can't show the bar only when the title appears. A
                  prior hover/fade attempt leaked the title on PC (see the 6/12
                  fview session). Always-on is the price of a cross-origin player.
                  BOTTOM — measured: controls:0 strips YouTube's ENTIRE bottom bar
                  (no timeline/seek line exists), so this bar covers nothing YT
                  during playback — it's pure footage crop, kept just thick enough
                  to hide the poster-state "Watch on YouTube" pill / logo. Safe to
                  shrink further or toggle off. */}
              {maskVideoTitle && (
                <div
                  aria-hidden
                  className="absolute top-0 inset-x-0 z-10 pointer-events-none"
                  style={{
                    height: "clamp(42px, 7%, 50px)",
                    background: "#000",
                  }}
                />
              )}
              {maskVideoBottom && (
                <div
                  aria-hidden
                  className="absolute bottom-0 inset-x-0 z-10 pointer-events-none"
                  style={{
                    height: "clamp(22px, 5.5%, 50px)",
                    background: "#000",
                  }}
                />
              )}
            </div>

            {/* Custom progress bar — position + drag-to-seek. Sits BELOW the
                video (never over footage). Spoiler-safe: a plain fill (no YT
                thumbnail preview), and seekFromClientX caps the target at 90% so
                the ending can't be skipped to. Hidden when the user picks
                jumps-only in Settings. */}
            {seekControl !== "jumps" && (
              <div className="mt-2" style={fsActive ? { width: fsMediaWidth } : { width: "100%" }}>
                <div
                  ref={barRef}
                  role="slider"
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  tabIndex={0}
                  title="Drag to seek"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => { e.stopPropagation(); draggingBarRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); seekFromClientX(e.clientX); }}
                  onPointerMove={(e) => { if (draggingBarRef.current) seekFromClientX(e.clientX); }}
                  onPointerUp={(e) => { e.stopPropagation(); draggingBarRef.current = false; }}
                  onPointerCancel={() => { draggingBarRef.current = false; }}
                  className="w-full cursor-pointer"
                  style={{ paddingTop: "7px", paddingBottom: "7px" }}
                >
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(progress, 1) * 100}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Control strip — sits BELOW the video (never over the footage).
                In fullscreen it rides along in the reserved space under the
                centered video. A 1fr/auto/1fr grid so the jump row is dead-
                centered (lined up with the footer) regardless of how wide the
                mute label and fullscreen icon on either side are. Subtle,
                icon-first, YouTube-like. */}
            <div
              className="mt-2 grid items-center gap-2"
              style={fsActive
                ? { width: fsMediaWidth, paddingLeft: "0.25rem", paddingRight: "0.25rem", gridTemplateColumns: "1fr auto 1fr" }
                : { width: "100%", gridTemplateColumns: "1fr auto 1fr" }}
            >
              {/* Mute / unmute — autoplay is muted, so invite a tap while muted */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Sound on" : "Mute"}
                className={`${btnBase} justify-self-start h-8 gap-1.5 px-2 text-xs font-medium`}
              >
                {muted ? (
                  <>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5 6 9H2v6h4l5 4z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                    <span>Tap for sound</span>
                  </>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>

              {/* Spoiler-safe jump presets — skip ahead without a timeline.
                  Hidden when the user picks bar-only; the empty div keeps the
                  3-column grid so the fullscreen button stays right-aligned. */}
              {seekControl !== "bar" ? (
                <div className="min-w-0 flex items-center justify-center gap-0.5 flex-wrap">
                  <span className="hidden sm:inline text-[11px] text-white/35 mr-1 select-none">Skip to</span>
                  {JUMP_PCTS.map((p) => (
                    <button
                      key={p}
                      onClick={(e) => { e.stopPropagation(); seekToPct(p); }}
                      className={`${btnBase} h-7 px-1.5 text-xs font-medium`}
                      title={`Jump to ${p}%`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              ) : <div />}

              {/* Fullscreen toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                aria-label={fsActive ? "Exit fullscreen" : "Fullscreen"}
                title={fsActive ? "Exit fullscreen (Esc)" : "Fullscreen (f)"}
                className={`${btnBase} justify-self-end h-8 w-8`}
              >
                {fsActive ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="relative mx-auto w-full rounded-lg overflow-hidden bg-black" style={{ width: "min(100%, calc(78vh * 16 / 9))", aspectRatio: "16 / 9" }} onClick={(e) => e.stopPropagation()}>
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
            ) : (
              <iframe
                ref={iframeRef}
                src={withAutoplay(embedUrl!)}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
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
