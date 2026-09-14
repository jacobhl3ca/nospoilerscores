"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase, leadChannelBlocksEmbeds, channelAlwaysMasksTitle } from "@/lib/youtube";
import { openExternal, handleExternalClick } from "@/lib/openExternal";
import { formatPublished, proxyImage } from "@/lib/news";
import { isScoreSpoiler } from "@/lib/spoilers";
import { shareCardUrl, buildHighlightShareUrl, type ShareCardMeta } from "@/lib/shareCard";
import { getTimeZone } from "@/lib/etDay";
import { routeModalKey } from "@/lib/modalArrowKeys";

interface VideoModalProps {
  videoId: string;
  fallbackUrl: string;
  // "explicit" = one of the ✕ buttons; "accidental" (default) = backdrop,
  // a tap on content that bubbles, or Esc. The host only offers its undo
  // pill for accidental closes.
  onClose: (reason?: "explicit" | "accidental") => void;
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
  // Reddit gallery ("more than 1 picture") posts: every image in the post.
  // The lightbox pages through these in place — arrows / swipe / ← → keys —
  // and only steps to the next POST once you're off the end of the gallery.
  images?: string[] | null;
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
  // Opt-in (default OFF): show YouTube's NATIVE control bar (controls:1) instead
  // of our spoiler-safe stripped player. When on, YT's own progress/seek bar +
  // time are visible (a spoiler trade the user accepts — useful in fullscreen),
  // the click-catcher steps aside so YT's controls work.
  youtubeNativeControls?: boolean;
  // Which seek control the YouTube player shows: progress bar + jumps ("both",
  // default), bar only, or jumps only.
  seekControl?: "both" | "bar" | "jumps";
  // Seek-bar fill style — "off" (blank track, default), "grey", or "white".
  seekFill?: "off" | "grey" | "white";
  // Drop the 90% seek cap so the bar / ±5s can reach the clip's end.
  allowEnd?: boolean;
  // Confirm a click/jump that would land past the halfway point.
  warnHalfway?: boolean;
  // News items: page to the previous / next post in the same rendered list
  // without closing the modal. Absent means no pager controls.
  onPrev?: () => void;
  onNext?: () => void;
  // Other playable versions of THIS clip (e.g. the Telemundo Spanish cut of a
  // World Cup game). Surfaced as one-tap buttons on the embed-blocked fallback
  // overlay so a FIFA-blocked FOX clip can jump straight to an embeddable stream
  // instead of only linking out to YouTube (Jacob 7/14).
  alternates?: { label: string; videoId: string }[];
}

// Minimal slice of the YouTube IFrame Player API this modal actually drives.
// The real player is built by the injected YT script (window.YT.Player) and is
// untyped (no @types/youtube dependency), so we type just the methods we call.
// A ready YT.Player exposes all of these, so they're typed as present — the
// `?.` guards the code uses on them stay valid (optional calls on required
// methods compile fine) while direct calls after a guard narrow cleanly.
interface YTPlayer {
  getDuration: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
  // The <iframe> the player lives in. Only read to answer one question — is
  // document.activeElement this frame, i.e. did the user's click just move
  // focus INTO YouTube (see the focus-recovery effect below, Jacob 9/5).
  getIframe: () => HTMLIFrameElement;
  // Undocumented but reliable helpers used by the quality/title-spoiler logic.
  // Optional because they aren't guaranteed present on every API revision.
  getAvailableQualityLevels?: () => string[];
  setPlaybackQuality?: (quality: string) => void;
  getVideoData?: () => { title?: string } | undefined;
  // Caption modules for the CC toggle. loadModule presence is verified at the
  // call site (typeof check); setOption is called with optional chaining.
  loadModule: (module: string) => void;
  unloadModule: (module: string) => void;
  setOption?: (module: string, option: string, value: { languageCode: string }) => void;
}

// Event object the YT IFrame API hands to onReady/onStateChange/etc. `data` is
// a numeric player state on onStateChange but a quality string on
// onPlaybackQualityChange, so it can be either.
interface YTPlayerEvent {
  target: YTPlayer;
  data: number | string;
}

// The slice of the global YouTube IFrame API we touch. It's injected at runtime
// from https://www.youtube.com/iframe_api, so it isn't in any @types package.
interface YTNamespace {
  Player: new (
    // An element, not just an id: we hand YT a node we created ourselves so it
    // has something of its own to replace. See ytHostRef.
    elementId: string | HTMLElement,
    config: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onPlaybackQualityChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
        onAutoplayBlocked?: (event: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    umami?: { track: (event: string, data?: Record<string, string>) => void };
  }
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

// Channels the fallback retry is allowed to play from, in preference order,
// carried on the fallback URL as `nss_channels=A|B&nss_strict=1` by callers
// that resolved their video under a strict channel gate (F1, golf). YouTube
// ignores the extra params on a /results URL, so the same string still works
// verbatim as the external "Watch on YouTube" hand-off — same trick as the
// existing `nss_no_fallback=1`. A YouTube search retry with no strict channel
// list is rejected below; non-highlight media use direct source URLs instead.
function strictFallbackChannels(fallbackUrl: string): string[] {
  try {
    const u = new URL(fallbackUrl);
    if (u.searchParams.get("nss_strict") !== "1") return [];
    return (u.searchParams.get("nss_channels") || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Motorsport race gate carried the same way (`nss_race=` — see EventCard).
// Exactly the same failure mode the channel gate above was added for: the
// official F1/NASCAR/INDYCAR channel uploads every round, so an ungated retry
// after an embed block would serve a DIFFERENT race from the very same
// (correct) channel — which the channel gate cannot catch.
function raceFallbackParam(fallbackUrl: string): string {
  try {
    const race = new URL(fallbackUrl).searchParams.get("nss_race");
    return race ? `&race=${encodeURIComponent(race)}` : "";
  } catch {
    return "";
  }
}

// Gridiron week gate carried the same way (`nss_week=` — see GameHighlights).
// Identical failure mode to the race gate one league over: the NFL channel
// uploads every week of the season, and its recap titles carry a week rather
// than a date, so an ungated retry after an embed block can serve the SAME two
// teams' OTHER meeting from the very same (correct) channel — which neither the
// channel gate nor the worker's date/year gates can catch.
function weekFallbackParam(fallbackUrl: string): string {
  try {
    const week = new URL(fallbackUrl).searchParams.get("nss_week");
    return week && /^\d{1,2}$/.test(week) ? `&week=${week}` : "";
  } catch {
    return "";
  }
}

// Competition title gate carried the same way (`nss_comp=` — see
// GameHighlights). The week gate's blind spot: an NFL preseason card sends NO
// week (its Week 1–3 numbering collides with the regular season's), so the
// only thing keeping a retry off the same pair's regular-season recap is the
// title having to say "preseason". Rugby's Nations Championship rides the same
// param to keep its retry off the U20s.
function compFallbackParam(fallbackUrl: string): string {
  try {
    const comp = new URL(fallbackUrl).searchParams.get("nss_comp");
    return comp ? `&comp=${encodeURIComponent(comp)}` : "";
  } catch {
    return "";
  }
}

// Minimal Reddit selftext renderer. Reddit selftext is markdown but we only
// care about the structural bits that matter for readability — paragraphs,
// line breaks, and autolinked URLs. Full markdown (headings, bold, code
// fences) is rare in posts and not worth pulling marked/markdown-it for.
// Every text segment is pushed as a React child (never dangerouslySetInnerHTML),
// so React escapes it on render — a post with literal "<script>" or "&" is
// already safe and shows verbatim. A manual HTML-escape here would double-encode,
// painting "AT&T" as the literal "AT&amp;T".
function renderRedditBody(raw: string): React.ReactNode {
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
      if (before) parts.push(before);
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
    if (tail) parts.push(tail);
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

// Seconds skipped per ←/→ arrow press, matching YouTube's own arrow keys.
const SEEK_STEP = 5;

// A blurred text block whose individual tap reveals (or re-blurs) just itself,
// independent of the global Headlines toggle — for the modal's spoiler-bearing
// headline and the Reddit selftext body. stopPropagation so a peek tap doesn't
// also dismiss the modal (the dark backdrop is what closes it).
function PeekBlur({ tag = "div", className, style, children, peek: peekProp, onToggle, keyShortcut }: {
  tag?: "div" | "h2" | "p";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** Controlled mode: the owner holds the peek state (the headline, driven by
   *  the H key). Omit both props and the block keeps its own state (the Reddit
   *  body, which is tap-only). */
  peek?: boolean;
  onToggle?: () => void;
  /** Advertised to assistive tech as this block's shortcut, when it has one. */
  keyShortcut?: string;
}) {
  const [peekState, setPeek] = useState(false);
  const controlled = peekProp !== undefined;
  const peek = controlled ? peekProp : peekState;
  const Tag = tag as React.ElementType;
  const cls = `news-title${peek ? " peek" : ""}${className ? ` ${className}` : ""}`;
  const toggle = () => { if (controlled) onToggle?.(); else setPeek((p) => !p); };
  const hint = keyShortcut ? ` (${keyShortcut.toUpperCase()})` : "";
  return (
    <Tag
      className={cls}
      style={style}
      aria-keyshortcuts={keyShortcut}
      // Operable by pointer AND keyboard — without role/tabIndex/onKeyDown this
      // clickable element would be invisible to keyboard and screen-reader users
      // (WCAG 2.1.1). aria-pressed mirrors the blur state for assistive tech.
      role="button"
      tabIndex={0}
      aria-pressed={peek}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggle(); }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(); }
      }}
      title={(peek ? "Tap to blur" : "Tap to reveal") + hint}
      aria-label={peek ? "Hide spoiler text" : "Reveal spoiler text"}
    >
      {children}
    </Tag>
  );
}

// Byline · relative-time meta line under an article's headline. The relative
// timestamp ("3h ago") is wrapped in a semantic <time dateTime> so assistive
// tech and any crawler get the machine-readable ISO date instead of only the
// fuzzy relative text, and a title tooltip surfaces the exact publish time on
// hover. Mirrors the <time dateTime> treatment on the privacy page's "Last
// updated" date. Visible text is unchanged: byline and "3h ago" render exactly
// as before, joined by " · " only when both are present. formatPublished
// returns "" for an unparseable date, in which case the <time> is omitted (the
// same drop the previous .filter(Boolean) join produced).
function ArticleMeta({ byline, published, className, style }: {
  byline?: string | null;
  published?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rel = published ? formatPublished(published) : "";
  if (!byline && !rel) return null;
  // Show the exact-time tooltip in the app's EFFECTIVE zone (the Settings
  // "Time zone" override, or the device zone by default) — the same zone every
  // game card, event tile, and slate label already use via getTimeZone(). This
  // was the one clock-time display left reading the raw device zone, so an
  // override user hovering a news item saw a timestamp in a different zone than
  // the times shown everywhere else. Without an override getTimeZone() resolves
  // to the device zone, so the rendered tooltip is byte-identical for everyone
  // who hasn't set one.
  const exact = published && rel
    ? new Date(published).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: getTimeZone() })
    : undefined;
  return (
    <p className={className} style={style}>
      {byline}
      {byline && rel ? " · " : null}
      {published && rel ? (
        <time dateTime={published} title={exact}>{rel}</time>
      ) : null}
    </p>
  );
}

export default function VideoModal({ videoId, fallbackUrl, onClose, playbackUrl, poster, imageUrl, images, embedUrl, sourceLabel, headline, byline, published, body, shareCard, maskVideoTitle = false, maskVideoBottom = true, youtubeNativeControls = false, seekControl = "both", seekFill = "off", allowEnd = false, warnHalfway = false, onPrev, onNext, alternates }: VideoModalProps) {
  const playerRef = useRef<YTPlayer | null>(null);
  // The React-owned box the YouTube player lives INSIDE. React renders this and
  // nothing else touches it; the #yt-player node YT destroys is a plain DOM
  // child we append below. See initPlayer for why that separation matters.
  const ytHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The dialog root (role="dialog") — used by the focus-management effect below
  // to seat focus inside the modal on open, trap Tab within it, and restore it
  // to the opener on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  // Gallery ("more than 1 picture") posts: which picture of the post is showing.
  // Reset per post — prev/next paging REUSES this modal instance, so without the
  // reset post B would open on post A's 4th picture (same trap PeekBlur's
  // postKey solves for the headline reveal).
  const gallery = (images ?? []).filter(Boolean);
  const galLen = gallery.length;
  const isGallery = galLen > 1 && !playbackUrl && !embedUrl && !videoId;
  const [galIdx, setGalIdx] = useState(0);
  const galAt = Math.min(galIdx, Math.max(0, galLen - 1));
  // Step within the gallery. Returns false at either end (and for single-image
  // posts) so the caller falls through to prev/next POST.
  const stepGallery = useCallback((dir: number) => {
    if (!isGallery) return false;
    const next = galAt + dir;
    if (next < 0 || next >= galLen) return false;
    setGalIdx(next);
    setImgFailed(false); // a dud frame shouldn't collapse the whole gallery
    return true;
  }, [isGallery, galAt, galLen]);
  // Horizontal swipe on the image lightbox → prev/next post (mobile parity with
  // the bottom Prev/Next buttons and the desktop Shift+← → keys). Inside a gallery it
  // walks the pictures first and only leaves the post at either end, so a swipe
  // never skips over photos the user hasn't seen.
  // The modal ROOT — see the fullscreen block further down. Declared up here
  // because the paging helpers below hand fullscreen to it.
  const fsHostRef = useRef<HTMLDivElement>(null);
  // Paging between posts must not drop fullscreen. Each post type mounts a
  // DIFFERENT player (YouTube wrapper / native <video> / image / text card), so
  // when the fullscreen element is one that's about to unmount — the native
  // <video> the browser's own fullscreen button targets, say — hand fullscreen
  // to the root FIRST. Re-requesting on another element while already fullscreen
  // TRANSFERS it with no exit; letting the old one unmount instead drops the
  // browser all the way back out, which is what made a Reddit text post kick you
  // out mid-column (Jacob 8/23).
  const carryFullscreen = useCallback(() => {
    const fsEl = document.fullscreenElement;
    const host = fsHostRef.current;
    if (!fsEl || !host || fsEl === host || !host.contains(fsEl)) return;
    host.requestFullscreen?.().catch(() => {});
  }, []);
  const goPrev = useCallback(() => { if (!onPrev) return; carryFullscreen(); onPrev(); }, [onPrev, carryFullscreen]);
  const goNext = useCallback(() => { if (!onNext) return; carryFullscreen(); onNext(); }, [onNext, carryFullscreen]);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    swipeRef.current = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Decisive horizontal flick only — ignore taps and vertical scrolls.
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      if (stepGallery(1)) return;
      goNext();
    } else {
      if (stepGallery(-1)) return;
      goPrev();
    }
  };
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
  // Browser autoplay policy is different from an unavailable/broken video.
  // Keep it out of the fallback search path and show a clear, user-actionable
  // prompt instead of silently leaving a paused black player.
  const autoplayBlockedRef = useRef(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Has THIS YouTube clip ever actually reached PLAYING/BUFFERING?
  // Everything before the first frame is a different world from everything
  // after it, because playback can only START from a real user gesture INSIDE
  // the cross-origin iframe. `playerRef.current.playVideo()` travels as a
  // postMessage and carries NO user activation with it, so once the browser has
  // refused autoplay, no amount of tapping our own overlays can start the clip
  // — which is exactly the "the play button does nothing" bug (Jacob 8/9, WNBA
  // + NFL). While this is false we deliberately leave YouTube's own big red
  // play button exposed and un-intercepted: it's the only control in the DOM
  // that can legally begin playback. Once it's true we go back to the
  // click-catcher so keyboard shortcuts and double-tap seek behave as before.
  const hasStartedRef = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  // Set by the player effect so code outside it (the autoplay-prompt retry
  // timer) can still trigger the alternate-video search.
  const tryFallbackRef = useRef<(() => void) | null>(null);
  const retryConfirmRef = useRef<number | null>(null);
  // imgFailed flips when the lightbox image errors out — at that point we
  // collapse to text-card mode so the user sees the headline + open button
  // instead of an empty modal (Firefox + Reddit external-preview is the
  // current offender).
  const [imgFailed, setImgFailed] = useState(false);
  // Flips true when the YouTube clip can't play in-app AND no working alternate
  // was found — the common case is a league (FIFA especially) disabling embedded
  // playback (YT error 101/150) on every one of its uploads, so re-searching just
  // loops. Instead of leaving YouTube's own "Video unavailable" screen, we show a
  // clean overlay with a "Watch on YouTube" button (Jacob 7/14).
  const [ytFailed, setYtFailed] = useState(false);
  // Flips true when a direct-stream clip (hlsMode: v.redd.it HLS / MP4, streamff
  // et al., or an MLB .m3u8) fails to load — a fatal hls.js error or a native
  // <video> "error"/stalled event. Without this the native player's built-in
  // spinner just spins forever on a dead segment (e.g. Reddit revokes segment
  // access on a pulled clip → the CMAF .mp4 404/403s while the manifest still
  // parses). Common on r/soccer, whose goal clips rotate through fragile
  // external hosts and get pulled fast. Instead of an endless spinner we show a
  // clean "Open on <source>" fallback, mirroring the ytFailed overlay.
  const [mediaFailed, setMediaFailed] = useState(false);
  // Captions: default OFF, custom toggle button surfaces them prominently
  // instead of leaving the user to dig through Safari's "more" overflow menu.
  // hasCaptionTrack hides the button on streams with no CC track at all
  // (e.g., v.redd.it MP4s).
  const [showCC, setShowCC] = useState(false);
  const [hasCaptionTrack, setHasCaptionTrack] = useState(false);
  // Brief "Copied ✓" confirmation after the copy-link button is tapped.
  const [copied, setCopied] = useState(false);
  // Playback position (0–1), polled off the YT player. The seek bar no longer
  // draws a visible fill (the fill was itself a "how far through am I" spoiler),
  // so this now only feeds the slider's accessibility value (capped at 90%).
  // Drag-seek is capped at 90% (see seekFromClientX) so the ending can't be
  // skipped to, matching the jump presets' "no 100%".
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingBarRef = useRef(false);
  // In-player "peek" overrides for the spoiler bars — let the user momentarily
  // uncover a strip to glance at whatever's under it. Title bar: a broadcast
  // scoreboard hidden under it (spot varies: top-left for ESPN NHL). Bottom
  // bar: it covers actual game FOOTAGE (the crop is tuned tight, but a peek
  // lets you check you're not missing a play at the bottom of frame, and lets
  // anyone who keeps the bar on still look when they want). Both LOCAL to this
  // modal (reset on every open) so the no-spoiler default always returns —
  // separate from the persistent Settings toggles (maskVideoTitle/Bottom).
  // Collapse the control chrome (seek bar + control strip + watch links) to give
  // the video the whole frame — especially useful in mobile fullscreen. Toggled
  // by the eye in the video's bottom-right corner.
  const [controlsHidden, setControlsHidden] = useState(false);
  // A seek the user must confirm because it lands past halfway (only when the
  // warnHalfway pref is on). Holds the action to run on confirm; null = no
  // prompt showing. Local, resets each open.
  const [pendingSeek, setPendingSeek] = useState<null | { run: () => void; pct: number }>(null);
  // Whether the clip's real YouTube title is provably spoiler-free. When true
  // we DON'T cover the title (the whole point of the always-on mask is to hide a
  // score in the title; if there's no score to hide, show it). Defaults false =
  // covered, and only flips true once onReady/PLAYING reads a clean title — so a
  // title is never uncovered before we've checked it. The worker already skips
  // spoiler titles for search-path clips, so most titles here are clean; this
  // also covers reddit/unvetted clips by re-checking client-side.
  const [titleSafe, setTitleSafe] = useState(false);
  // …except on the combat channels, where the title bar never uncovers at all —
  // see channelAlwaysMasksTitle. Read from the same strict-channel gate the
  // embed check uses, so it holds for the fallback swaps too.
  const titleAlwaysMasked = channelAlwaysMasksTitle(strictFallbackChannels(fallbackUrl));
  // PAUSED (or ENDED) means YouTube draws its own overlay on top of the iframe:
  // the "More videos" grid on pause, the suggested-video endscreen at the end.
  // Both are pure spoiler vectors — rel:0 only narrows them to the SAME channel,
  // which for a UFC clip serves you a "POST-FIGHT INTERVIEW" thumbnail with the
  // winner's face on it. No playerVar can turn either off, so we cover them.
  const [ytPaused, setYtPaused] = useState(false);
  // Latch so the near-end auto-pause (see the progress poll) runs once per clip.
  const endLatchRef = useRef(false);
  // TRUE only for the pause the progress poll fires a second before the clip
  // runs out, and for a real ENDED. That is the pause worth blacking the whole
  // player out for — see the cover's own note. An ordinary mid-clip pause sets
  // ytPaused WITHOUT this.
  const [ytAtEnd, setYtAtEnd] = useState(false);
  // controls:0 hides YouTube's native mute button, and clips autoplay muted
  // (browsers block unmuted autoplay) — so we render a custom mute toggle + a
  // volume slider. `volume` is 0–100 (the YT player's scale); it's the level we
  // restore to when un-muting.
  const [muted, setMuted] = useState(true);
  // Volume persists across clips/sessions (the level you un-mute to). Autoplay
  // still starts muted — only the slider level is restored.
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 100;
    const v = parseInt(localStorage.getItem("hs.videoVolume") || "", 10);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 100;
  });
  const volRef = useRef<HTMLDivElement>(null);
  // Auto-hide the cursor over the video after a moment of no movement (a real
  // player feel). Any mouse move brings it back via bumpCursor().
  const [idleCursor, setIdleCursor] = useState(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpCursor = useCallback(() => {
    setIdleCursor(false);
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    cursorTimerRef.current = setTimeout(() => setIdleCursor(true), 2500);
  }, []);
  const draggingVolRef = useRef(false);
  // The title-bar spoiler mask is ALWAYS on for YouTube clips. YouTube
  // re-surfaces the clip title (and channel byline) on hover, on pause, AND a
  // few seconds into playback whenever the mouse moves — and hover over a
  // cross-origin iframe can't be reliably detected from the parent, so any
  // "fade it out during playback" scheme leaks the title (the whole point of
  // the app is no spoilers). We keep it permanently covered and sized tight to
  // the title block so it costs almost no footage.
  // Fullscreen. nativeFs tracks the Fullscreen API on the modal ROOT — never on
  // the bare iframe, so the spoiler mask and the control strip ride along and
  // YouTube's title stays covered in fullscreen too.
  //
  // The root is also the ONLY element that survives every post type: the
  // player, the image lightbox and the text card are sibling branches that
  // mount and unmount underneath it. Fullscreening the player wrapper meant
  // paging a Reddit column from a clip onto a text post pulled the fullscreen
  // element out of the DOM, and the browser dropped straight back out of
  // fullscreen. Hosting it on the root keeps fullscreen across the whole column
  // (Jacob 8/23). fakeFs is the CSS-overlay fallback for iPhone Safari / the
  // iOS app's WKWebView, where element fullscreen on a non-<video> element
  // doesn't exist.
  const [nativeFs, setNativeFs] = useState(false);
  const [fakeFs, setFakeFs] = useState(false);
  const fsActive = nativeFs || fakeFs;
  // Timestamp of the last native-fullscreen exit — some browsers deliver the
  // Escape keydown alongside the exit, and that Escape must not also close the
  // whole modal.
  const fsExitAtRef = useRef(0);
  // Player priority: when the prebake found a validated YouTube id for a clip,
  // prefer the YouTube player over the source's own HLS/Brightcove stream
  // (Jacob 7/3 — "revert to youtube player by default for now"). The assorted
  // news players (native HLS / redlib / Brightcove) behave inconsistently
  // across Firefox / YouTube / mobile; the YouTube player is the consistent one
  // AND already ships our spoiler-safe no-bottom-bar chrome. A videoId therefore
  // wins, and only clips with no YouTube id (e.g. MLB statsapi HLS) fall through
  // to hlsMode/embedMode.
  const hlsMode = !!playbackUrl && !videoId;
  const embedMode = !!embedUrl && !playbackUrl && !videoId;
  const imageMode = !!imageUrl && !imgFailed && !playbackUrl && !embedUrl && !videoId;
  const textMode = !hlsMode && !embedMode && !imageMode && !videoId;
  const ytMode = !hlsMode && !embedMode && !imageMode && !textMode;
  // Other versions of this clip still worth offering on the embed-blocked overlay
  // (drop the one that just failed).
  const embedAlternates = (alternates ?? []).filter((a) => a.videoId && a.videoId !== currentId);
  const linkLabel = sourceLabel ? `Open on ${sourceLabel}` : sourceLabelFromUrl(fallbackUrl);
  // Stable per-post identity. Prev/next paging REUSES this same modal (stepVideo
  // only swaps props — the modal isn't remounted), so any child holding local
  // state persists across posts unless it's re-keyed. PeekBlur owns the
  // headline/body spoiler reveal in its own useState, so without keying it by
  // the post a headline the user revealed on post A stays revealed on post B
  // (Jacob 7/19). Keying each PeekBlur by postKey remounts it fresh per post,
  // resetting the reveal, while leaving the video player + modal chrome mounted.
  // Join EVERY identity field rather than taking the first non-null one, and
  // read the videoId PROP rather than currentId. The old
  // `String(currentId ?? playbackUrl ?? … ?? "")` had two holes:
  //   • The opener normalises a missing video id to "" (optsToModal in
  //     HomeContent: `videoId: opts.videoId || ""`), and ?? does NOT skip an
  //     empty string — so for EVERY text / article / image post this collapsed
  //     to the constant "". Every such post shared one identity, so peeking
  //     post A's headline left post B (and A again, on the way back) revealed,
  //     the gallery cursor never reset, and trackVideoPlay's `!postKey` guard
  //     dropped every native-player play event (Jacob 9/8). It only ever worked
  //     on YouTube clips, which are the one kind that carries a real id.
  //   • currentId is STATE synced by an effect, so on the first render after a
  //     step it still held the OUTGOING post's id — one painted frame of the
  //     incoming headline in the clear, which is exactly what deriving
  //     headlinePeek below is meant to prevent. The prop updates in the same
  //     render as the swap, so nothing lags.
  const postKey = [videoId, playbackUrl, embedUrl, imageUrl, fallbackUrl, headline]
    .map((v) => v || "")
    .join("\u0000");
  const trackedPlayRef = useRef<string | null>(null);
  const trackVideoPlay = useCallback(() => {
    if (!postKey || trackedPlayRef.current === postKey) return;
    trackedPlayRef.current = postKey;
    window.umami?.track("video-play", {
      player: ytMode ? "youtube" : hlsMode ? "native" : "other",
      source: (sourceLabel || "unknown").slice(0, 40),
    });
  }, [postKey, ytMode, hlsMode, sourceLabel]);
  // Same reuse trap as PeekBlur: page to another post and the gallery cursor
  // must go back to picture 1 (post B would otherwise open on post A's 4th).
  useEffect(() => { setGalIdx(0); }, [postKey]);
  // A peek is a glance, not a setting: leaving a post ALWAYS re-blurs it, and
  // coming back to a post you peeked earlier finds it blurred again (Jacob 9/8
  // — "when i switch to next or previous news item all should be hidden, even
  // when i go back to the previous one"). Comparing a remembered peekedKey
  // against postKey got the step forward right but not the step back: the key
  // was still remembered, so ← back to A re-revealed it.
  //
  // The reset runs DURING render rather than in an effect. useState(false) plus
  // useEffect(() => setPeek(false), [postKey]) runs AFTER paint, so post B's
  // headline would show un-blurred for one frame, and in this app a one-frame
  // headline IS the spoiler (the same reason layout.tsx blurs news media in a
  // pre-paint script). Adjusting state while rendering is React's supported
  // escape hatch for exactly this; it re-renders before the browser sees the
  // first pass. headlinePeek also gates on peekedFor, so even that discarded
  // first pass computes `false` for the incoming post. Never written to prefs.
  const [peeked, setPeeked] = useState(false);
  const [peekedFor, setPeekedFor] = useState(postKey);
  if (peekedFor !== postKey) {
    setPeekedFor(postKey);
    if (peeked) setPeeked(false);
  }
  const headlinePeek = peeked && peekedFor === postKey;
  const toggleHeadlinePeek = useCallback(() => setPeeked((p) => !p), []);
  // The dialog root's data-player-state, so a click-through test (and anything
  // else outside the cross-origin iframe) can read play/pause without asking
  // YouTube. Reveals nothing — not the position, not the duration.
  const [playerState, setPlayerState] = useState<"playing" | "paused" | "none">("none");
  useEffect(() => { setPlayerState("none"); }, [postKey]);

  const clearAutoplayBlocked = useCallback(() => {
    autoplayBlockedRef.current = false;
    setAutoplayBlocked(false);
  }, []);
  const markAutoplayBlocked = useCallback(() => {
    autoplayBlockedRef.current = true;
    setAutoplayBlocked(true);
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);
  const handleNativePlayError = useCallback((error: unknown) => {
    if ((error as { name?: string } | null)?.name === "NotAllowedError") {
      markAutoplayBlocked();
    }
  }, [markAutoplayBlocked]);
  const resumeBlockedPlayback = useCallback(() => {
    clearAutoplayBlocked();
    if (hlsMode) {
      videoRef.current?.play().catch(handleNativePlayError);
    } else if (ytMode) {
      playerRef.current?.playVideo?.();
      // playVideo() is a postMessage — it can be refused silently (autoplay
      // policy) OR land on a clip that renders a *silent* error screen inside
      // the iframe (YT Error 153, which never fires onError). Give it 8s; if
      // we're still not playing, THEN it's worth burning an alternate video id.
      // This is the only path that can still reach the "league blocked" card
      // from a never-started player, so a clip that simply needed a tap never
      // gets mislabelled as an embed block (Jacob 8/9, NFL).
      if (retryConfirmRef.current) window.clearTimeout(retryConfirmRef.current);
      retryConfirmRef.current = window.setTimeout(() => {
        retryConfirmRef.current = null;
        const state = playerRef.current?.getPlayerState?.();
        if (state !== 1 && state !== 3) tryFallbackRef.current?.();
      }, 8000);
    }
  }, [clearAutoplayBlocked, handleNativePlayError, hlsMode, ytMode]);

  useEffect(() => {
    clearAutoplayBlocked();
    // New post / new stream — clear any prior failure overlay so the fresh clip
    // gets a clean attempt (prev/next paging reuses this modal, so a flag set on
    // the previous post persists otherwise). setImgFailed clears the lightbox
    // image-error flag for the same reason: two consecutive image posts both
    // have videoId/currentId/playbackUrl/embedUrl undefined, so imageUrl is the
    // only dep that changes between them — without it here, a broken image on
    // post A left imgFailed stuck true and post B's valid image was suppressed
    // into text-card mode until the modal was closed and reopened.
    setMediaFailed(false);
    setImgFailed(false);
    // A swapped clip has not started either — re-expose YouTube's own play
    // button until the new id actually reaches PLAYING.
    hasStartedRef.current = false;
    setHasStarted(false);
    if (retryConfirmRef.current) {
      window.clearTimeout(retryConfirmRef.current);
      retryConfirmRef.current = null;
    }
  }, [currentId, playbackUrl, embedUrl, imageUrl, clearAutoplayBlocked]);
  useEffect(() => () => {
    if (retryConfirmRef.current) window.clearTimeout(retryConfirmRef.current);
  }, []);
  // The YouTube video id, when this is a YouTube clip (not an HLS/embed/image/
  // text card) — used both for the footer link and the hidescore deep-link.
  const ytId = ytMode ? currentId : null;
  // The URL the footer points at — the YouTube watch page for YT clips,
  // otherwise the original source page.
  const sourceShareUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : (fallbackUrl || "");
  // Copy link hands out a hidescore.com link that reopens THIS highlight in-app
  // (like YouTube's copy-link gives a youtube.com link) — not the raw
  // Reddit/source URL. YouTube clips fold into the short ?v= form; non-YouTube
  // clips (redd.it/streamff MP4, Brightcove embeds, image posts) encode their
  // media so a cold load can rebuild the modal. Game highlights also carry the
  // ?c= matchup card so the link unfurls with the two teams + date in iMessage.
  // Only when there's nothing playable to deep-link do we fall back to the source.
  const highlightLink = buildHighlightShareUrl({
    videoId: ytId,
    playbackUrl,
    embedUrl,
    imageUrl,
    posterUrl: poster,
    sourceUrl: fallbackUrl,
    sourceLabel,
    headline,
    cardKey: shareCard?.key ?? null,
  });
  const shareUrl = highlightLink ?? (shareCard ? shareCardUrl(shareCard, ytId) : sourceShareUrl);

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

  // Cap fraction for the bar/jumps — 90% by default so the ending can't be
  // skipped to, or 100% when the user opts into "Allow seeking to the end".
  const seekCap = allowEnd ? 1 : 0.9;

  // Run a seek, but if warnHalfway is on and the target lands in the second
  // half while we're still in the first, hold it behind a confirm overlay
  // instead. (Only gates a deliberate forward jump from the first half — it
  // won't nag once you're already past the midpoint.)
  const guardSeek = useCallback((targetFrac: number, run: () => void) => {
    // Read the position off whichever player is up: a direct stream (MLB
    // .m3u8, v.redd.it) has no playerRef at all, and reading 0 there would nag
    // on a jump the viewer is already past (Jacob 9/5, same YouTube-only
    // oversight seekBy carried until 8/9).
    const v = videoRef.current;
    const p = playerRef.current;
    const d = v && hlsMode ? (isFinite(v.duration) ? v.duration : 0) : (p?.getDuration?.() ?? 0);
    const cur = d > 0 ? ((v && hlsMode ? v.currentTime : p?.getCurrentTime?.() ?? 0) / d) : 0;
    if (warnHalfway && targetFrac > 0.5 && cur <= 0.5) {
      setPendingSeek({ run, pct: Math.round(targetFrac * 100) });
      return;
    }
    run();
  }, [warnHalfway, hlsMode]);

  // Jump to a fraction of the clip. Works off the YouTube player's reported
  // duration so no timeline is ever revealed.
  const seekToPct = useCallback((pct: number) => {
    // Direct streams play through an in-document <video>, not the YT player —
    // same clamp, same halfway guard, just the other element (Jacob 9/5, so the
    // 0-9 keys land on an MLB clip and not only on a YouTube one).
    const v = videoRef.current;
    if (v && hlsMode) {
      const dv = v.duration;
      if (!dv || !isFinite(dv) || dv <= 0) return;
      const targetV = Math.min(pct / 100, seekCap);
      guardSeek(targetV, () => {
        v.currentTime = dv * targetV;
        void v.play().catch(() => { /* autoplay prompt already covers this */ });
        setProgress(targetV);
      });
      return;
    }
    const p = playerRef.current;
    if (!p?.getDuration || !p?.seekTo) return;
    const d = p.getDuration();
    if (!d || d <= 0) return;
    const target = Math.min(pct / 100, seekCap);
    guardSeek(target, () => {
      p.seekTo(d * target, true);
      p.playVideo?.();
      setProgress(target);
    });
  }, [seekCap, guardSeek, hlsMode]);

  // Fraction (capped) for a given pointer x on the bar — shared by the seek and
  // the warn-guard so they agree on the target.
  const fracFromClientX = useCallback((clientX: number) => {
    const el = barRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(0, Math.min(seekCap, (clientX - r.left) / r.width));
  }, [seekCap]);

  // Drag/click the progress bar to seek. Capped at seekCap (90% unless the user
  // allows the end) so the ending can't be skipped to. No thumbnail preview is
  // ever shown. The warn-halfway confirm is gated at pointer-DOWN (below), not
  // here, so an active drag isn't interrupted.
  const seekFromClientX = useCallback((clientX: number) => {
    const p = playerRef.current;
    if (!p?.getDuration || !p?.seekTo) return;
    const frac = fracFromClientX(clientX);
    const d = p.getDuration();
    if (!d || d <= 0) return;
    p.seekTo(d * frac, true);
    p.playVideo?.();
    setProgress(frac);
  }, [fracFromClientX]);

  // Skip back/forward by SEEK_STEP seconds — drives the ←/→ arrow keys and the
  // on-screen ±5s buttons. Unlike a jump or a bar-drag, stepping ±5s isn't a
  // "skip straight to the ending" spoiler — it's slow, deliberate scrubbing — so
  // forward is allowed all the way to the real end (100%), independent of the
  // 90% cap that still gates the jumps and the bar. Back floors at 0. No
  // warn-halfway prompt — a small relative nudge isn't a "click past 50%".
  const seekBy = useCallback((delta: number) => {
    // Direct-stream clips (MLB .m3u8, v.redd.it, streamff) play through an
    // in-document <video>, not the YouTube player — playerRef is null for them,
    // so every seek path (← →, double-tap, the ⟲5/⟳5 buttons) silently did
    // nothing on an MLB highlight (Jacob 8/9). It reads like a Safari/HLS quirk
    // but it's ours: the handler was written YouTube-only. Same clamping rules.
    const v = videoRef.current;
    if (v && hlsMode) {
      const dur = v.duration;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      const target = delta >= 0 ? Math.min(v.currentTime + delta, dur) : Math.max(0, v.currentTime + delta);
      v.currentTime = target;
      void v.play().catch(() => { /* autoplay prompt already covers this */ });
      setProgress(Math.min(1, target / dur));
      return;
    }
    const p = playerRef.current;
    if (!p?.getDuration || !p?.seekTo) return;
    const d = p.getDuration();
    if (!d || d <= 0) return;
    const t = p.getCurrentTime?.() ?? 0;
    const target = delta >= 0 ? Math.min(t + delta, d) : Math.max(0, t + delta);
    p.seekTo(target, true);
    p.playVideo?.();
    setProgress(Math.min(1, target / d));
  }, [hlsMode]);

  // Toggle play/pause on the YouTube player — drives both the Space/k keys and a
  // click anywhere on the video (via the click-catcher overlay). We do it through
  // the API rather than letting the click reach the iframe so that focus never
  // enters the cross-origin frame; if it did, every later keystroke (Esc, f, the
  // arrows, Space) would be swallowed by YouTube instead of reaching this modal.
  const togglePlay = useCallback(() => {
    // Direct streams (MLB .m3u8, v.redd.it, streamff) are an in-document
    // <video> with no playerRef, so Space and click-to-pause did nothing on an
    // MLB clip — the same YouTube-only shape seekBy was fixed out of on 8/9
    // (Jacob 9/5).
    const v = videoRef.current;
    if (v && hlsMode) {
      if (v.paused) void v.play().catch(handleNativePlayError);
      else v.pause();
      return;
    }
    const p = playerRef.current;
    if (!p?.getPlayerState) return;
    const PLAYING = (window as unknown as { YT?: { PlayerState?: { PLAYING?: number } } }).YT?.PlayerState?.PLAYING ?? 1;
    if (p.getPlayerState() === PLAYING) p.pauseVideo?.();
    else p.playVideo?.();
  }, [hlsMode, handleNativePlayError]);

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
      // Stop just short of the end so the player never reaches ENDED, which is
      // what triggers YouTube's full-screen suggested-video endscreen. Pausing
      // here raises our own cover instead (ytPaused), so the last frame stays
      // put and no "up next" thumbnails ever render. Guarded on d > 2 so short
      // clips and the pre-metadata window (d === 0) are left alone.
      // Fires at most once per clip: without the latch, resuming at the end
      // would be re-paused 350ms later, trapping the viewer on the last frame.
      if (d > 2 && t > 0 && d - t <= 1 && !endLatchRef.current) {
        endLatchRef.current = true;
        setYtAtEnd(true);
        p?.pauseVideo?.();
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [ytMode]);

  // Persist the volume level so it carries across clips and sessions.
  useEffect(() => {
    try { localStorage.setItem("hs.videoVolume", String(volume)); } catch { /* ignore */ }
  }, [volume]);
  // Clear the idle-cursor timer on unmount.
  useEffect(() => () => { if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current); }, []);

  // Toggle mute on the YouTube player. Un-muting restores the slider's level
  // (or 100 if it was dragged to 0).
  const toggleMute = useCallback(() => {
    // Direct streams again: no playerRef, so drive the <video>'s own muted flag
    // (its native control strip picks the change up). Keeps the m key honest on
    // an MLB clip instead of silently doing nothing (Jacob 9/5).
    const v = videoRef.current;
    if (v && hlsMode) { v.muted = !v.muted; setMuted(v.muted); return; }
    const p = playerRef.current;
    if (!p) return;
    if (muted) {
      const v = volume > 0 ? volume : 100;
      p.unMute?.(); p.setVolume?.(v); setVolume(v); setMuted(false);
    } else {
      p.mute?.(); setMuted(true);
    }
  }, [muted, volume, hlsMode]);

  // Apply a volume level (0–100) from any source — shared by the pointer
  // handler and the keyboard handler below. Sets the YT player volume and
  // mutes/un-mutes at the extremes so the icon + level always agree.
  const setVolLevel = useCallback((level: number) => {
    const v = Math.round(Math.max(0, Math.min(100, level)));
    const p = playerRef.current;
    p?.setVolume?.(v);
    if (v > 0) { p?.unMute?.(); setMuted(false); } else { p?.mute?.(); setMuted(true); }
    setVolume(v);
  }, []);

  // Drag/click the volume slider.
  const setVolFromClientX = useCallback((clientX: number) => {
    const el = volRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    setVolLevel(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
  }, [setVolLevel]);

  // Toggle fullscreen. YouTube, the image lightbox and Reddit text posts all
  // expand the modal ROOT (so the spoiler mask, control bar and pager ride
  // along, the title stays hidden, and stepping between post types doesn't drop
  // out of fullscreen); native element fullscreen first, CSS-overlay fallback on
  // iOS where it's unavailable. HLS/embed keep plain element fullscreen — those
  // have no spoiler title and want the browser's own native player chrome.
  const toggleFullscreen = useCallback(() => {
    if (hlsMode || embedMode) {
      if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
      const el = (hlsMode ? videoRef.current : iframeRef.current) as
        (HTMLElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void }) | null;
      if (!el) return;
      if (typeof el.requestFullscreen === "function") el.requestFullscreen().catch(() => {});
      else if (typeof el.webkitEnterFullscreen === "function") el.webkitEnterFullscreen();
      else if (typeof el.webkitRequestFullscreen === "function") el.webkitRequestFullscreen();
      return;
    }
    if (fakeFs) { setFakeFs(false); return; }
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    const host = fsHostRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!host) return;
    if (typeof host.requestFullscreen === "function") {
      host.requestFullscreen().catch(() => setFakeFs(true));
    } else if (typeof host.webkitRequestFullscreen === "function") {
      host.webkitRequestFullscreen();
    } else {
      setFakeFs(true); // iOS Safari / WKWebView — no element fullscreen
    }
  }, [hlsMode, embedMode, fakeFs]);

  // ── Double-tap-to-seek on the video surface (mobile) ──────────────────
  // Tapping the left/right side of the clip jumps ∓5s — the gesture every
  // mobile video app trains for. A single tap still toggles play/pause and a
  // double-tap in the CENTER still toggles fullscreen (the old double-click
  // behaviour, now scoped to the middle third so the sides are free to seek).
  // We discriminate single vs double by TIMING, not the native dblclick event
  // — mobile browsers don't fire dblclick on a double-tap — and seek through
  // the same API path as the on-screen ±5s buttons, so no timeline is exposed
  // (spoiler-safe). The brief side flash is the only feedback.
  const [seekFlash, setSeekFlash] = useState<{ side: "l" | "r"; n: number } | null>(null);
  const surfaceTapRef = useRef<{ t: number; side: "l" | "r" | "c"; timer: number | null }>({ t: 0, side: "c", timer: null });
  const seekFlashTimerRef = useRef<number | null>(null);
  const seekFlashNonceRef = useRef(0);

  const flashSeek = useCallback((side: "l" | "r") => {
    seekFlashNonceRef.current += 1;
    setSeekFlash({ side, n: seekFlashNonceRef.current });
    if (seekFlashTimerRef.current) window.clearTimeout(seekFlashTimerRef.current);
    seekFlashTimerRef.current = window.setTimeout(() => setSeekFlash(null), 550);
  }, []);

  const handleSurfaceTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
    const side: "l" | "r" | "c" = frac < 0.34 ? "l" : frac > 0.66 ? "r" : "c";
    const now = Date.now();
    const prev = surfaceTapRef.current;
    if (prev.timer) window.clearTimeout(prev.timer);
    // A second tap on the SAME zone within 300ms is a double-tap.
    if (now - prev.t < 300 && prev.side === side) {
      if (side === "l") { seekBy(-SEEK_STEP); flashSeek("l"); }
      else if (side === "r") { seekBy(SEEK_STEP); flashSeek("r"); }
      else { toggleFullscreen(); }
      // Keep the stamp for the seek zones so a held rhythm chains (tap-tap-tap
      // = ∓15s); reset center so a 3rd tap doesn't immediately re-fullscreen.
      surfaceTapRef.current = { t: side === "c" ? 0 : now, side, timer: null };
    } else {
      // Maybe a single tap — defer play/pause 300ms to see if a partner lands.
      const timer = window.setTimeout(() => {
        togglePlay();
        surfaceTapRef.current = { ...surfaceTapRef.current, timer: null };
      }, 300);
      surfaceTapRef.current = { t: now, side, timer };
    }
  }, [seekBy, togglePlay, toggleFullscreen, flashSeek]);

  // Clear pending tap/flash timers on unmount.
  useEffect(() => () => {
    if (surfaceTapRef.current.timer) window.clearTimeout(surfaceTapRef.current.timer);
    if (seekFlashTimerRef.current) window.clearTimeout(seekFlashTimerRef.current);
  }, []);

  // Take focus back off YouTube after a click inside the iframe (Jacob 9/5).
  //
  // With YouTube's native controls on — the default since 8/9 — the click-catcher
  // deliberately isn't mounted, because YT's own play button, scrubber and
  // fullscreen live inside the frame and clicks have to reach them. Focus goes
  // with those clicks, and from that moment every keystroke belongs to YouTube's
  // document, not ours: ↑/↓ become volume, Esc and f and h never arrive. The
  // modal looked like it had simply lost its keyboard.
  //
  // A cross-origin frame tells us nothing directly, but it does make the TOP
  // window blur, and after that blur document.activeElement is the iframe
  // element itself — which is the whole signal. YouTube has already handled the
  // click by then, so pulling focus back costs the user nothing.
  //
  // Deferred ~250ms on purpose: a scrubber DRAG inside the frame is mousedown,
  // a stream of moves, then mouseup, and yanking focus on the mousedown would
  // cut it (the parent never sees pointer events from inside the frame, which
  // is why the blur is the only handle we have).
  useEffect(() => {
    if (!ytMode || !youtubeNativeControls) return;
    let timer: number | null = null;
    const ytFrame = (): HTMLIFrameElement | null => {
      try {
        const f = playerRef.current?.getIframe?.();
        if (f) return f;
      } catch { /* player destroyed mid-teardown */ }
      // The YT API replaces our #yt-player div with the iframe, keeping the id.
      const host = document.getElementById("yt-player");
      if (host instanceof HTMLIFrameElement) return host;
      return host?.querySelector("iframe") ?? null;
    };
    const onBlur = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const frame = ytFrame();
        // Only when focus really went INTO the player. A plain Cmd-Tab away
        // leaves activeElement wherever it was, so this stays a no-op.
        if (!frame || document.activeElement !== frame) return;
        frame.blur();
        dialogRef.current?.focus({ preventScroll: true });
      }, 250);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      if (timer) window.clearTimeout(timer);
    };
  }, [ytMode, youtubeNativeControls]);

  // Keep nativeFs in sync with the browser, and remember when we left so a
  // co-delivered Escape doesn't also close the modal.
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement) ?? null;
      const active = !!fsEl && fsEl === fsHostRef.current;
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

  // The modal's keyboard. Esc backs out of fullscreen first, then closes; "f"
  // fullscreens; everything else is routed by routeModalKey (the leaf module,
  // where the rules are unit-tested — VideoModal itself can't load under `node
  // --test`). Esc and f stay here rather than going through the module: they
  // carry fullscreen timing state (fsExitAtRef, the co-delivered Escape) the
  // module has no business knowing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The warn-past-halfway prompt is modal in its own right: Esc cancels
        // THE PROMPT, and leaves the post open. Before this it closed the whole
        // modal out from under the question it had just asked (Jacob 9/5).
        if (pendingSeek) { setPendingSeek(null); return; }
        if (fakeFs) { setFakeFs(false); return; }
        if (nativeFs) return;                                  // browser exits FS itself
        if (Date.now() - fsExitAtRef.current < 350) return;    // just left FS — swallow
        onClose("accidental");
        return;
      }
      // Enter confirms that same prompt — the keyboard twin of "Skip anyway".
      // Skipped when a button or link has focus, which owns Enter itself (Tab
      // to Cancel and press Enter and you get Cancel, not the skip).
      if (e.key === "Enter" && pendingSeek && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "BUTTON" || t.tagName === "A" || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        const run = pendingSeek.run;
        setPendingSeek(null);
        run();
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
      // Everything else: build the context, ask routeModalKey, act. ↓/↑ page the
      // post list, ←/→ keep the 9/4 routing (content first, Shift always pages),
      // Space/k play-pause, H peeks this post's headline, and m / j / l / 0-9
      // are the YouTube keys we take back by keeping focus out of the iframe.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const action = routeModalKey({
        // e.key is " " for the space bar everywhere modern, but e.code is the
        // reliable one when a layout remaps it.
        key: e.code === "Space" ? " " : e.key,
        shift: e.shiftKey,
        chord: e.metaKey || e.ctrlKey || e.altKey,
        repeat: e.repeat,
        // VIDEO is in this list on purpose: a focused native <video controls>
        // (the HLS path) already toggles itself on Space and seeks itself on
        // the arrows, so routing the same press would double-act.
        inTextEntry: !!t && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "VIDEO" || t.isContentEditable),
        onControl: !!t && (tag === "BUTTON" || tag === "A"),
        // hlsMode included: MLB/Reddit direct streams seek through the <video>
        // element (see seekBy), so ← → skip on them like they do on YouTube.
        canSeek: ytMode || hlsMode,
        galleryCanStep: isGallery && dir !== 0 && galAt + dir >= 0 && galAt + dir < galLen,
        hasPrev: !!onPrev,
        hasNext: !!onNext,
        hasHeadline: !!headline,
      });
      if (!action) return;
      // preventDefault ONLY once we've decided to act — an unhandled ↓ has to
      // stay the browser's (scroll), and Space has to stay the page's.
      e.preventDefault();
      switch (action) {
        case "gallery": stepGallery(dir); break;
        case "seek": seekBy(dir * SEEK_STEP); break;
        case "page-prev": goPrev(); break;
        case "page-next": goNext(); break;
        case "toggle-play": togglePlay(); break;
        case "peek-headline": toggleHeadlinePeek(); break;
        case "mute": toggleMute(); break;
        // j back, l forward — YouTube's own ∓10s, twice the arrows' step.
        case "seek-10": seekBy((e.key === "j" || e.key === "J" ? -1 : 1) * 10); break;
        // 1-9 jump to that tenth; 0 restarts. seekToPct already honours the 90%
        // spoiler cap and the warn-past-halfway prompt, so the keys inherit both.
        case "jump-pct": seekToPct(Number(e.key) * 10); break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, fakeFs, nativeFs, pendingSeek, toggleFullscreen, ytMode, hlsMode, seekBy, seekToPct, togglePlay, toggleMute, toggleHeadlinePeek, headline, onPrev, onNext, goPrev, goNext, stepGallery, isGallery, galAt, galLen]);

  // Focus management (WCAG 2.4.3), matching GameDetailModal / SettingsPanel /
  // WorldCupGroupsModal and the HomeContent dialogs — the treatment this modal,
  // the app's most-used overlay, was still missing. On open, seat focus on the
  // dialog CONTAINER (tabIndex=-1) so keyboard / screen-reader users land inside
  // the lightbox instead of being stranded on the thumbnail behind it; focusing
  // the container (not a control) keeps mouse users from seeing a stray focus
  // ring, and the first Tab reaches the Close button. On close, restore focus to
  // whatever opened it. And trap Tab so it can't wander into the page behind the
  // overlay: aria-modal="true" only marks that content inert to assistive tech,
  // it does NOT stop a sighted keyboard user Tabbing out. Focusables are queried
  // live per keypress (so per-mode controls — image / text / video — are always
  // current) and getClientRects() filters hidden ones. The modal mounts fresh per
  // open (the parent guards it), so this fires on every open/close — empty deps
  // capture the opener once. (Once focus enters the cross-origin YouTube iframe
  // the browser routes keydown to the iframe's own document, so the trap governs
  // the dialog's own controls, not the embed's internals — same as elsewhere.)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      // getClientRects().length, NOT offsetParent: offsetParent is null for
      // BOTH display:none elements AND any position:fixed element, so the earlier
      // offsetParent test silently dropped the desktop Prev/Next post chevrons
      // (rendered inside this dialog, `position:fixed`) from the trap — leaving
      // them visible but Tab-unreachable. getClientRects() is empty only when the
      // element is genuinely unrendered (display:none, incl. the off-breakpoint
      // pager variant), so it keeps hiding those while re-including the fixed one.
      ).filter((el) => el.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  // Lock body scroll while the modal is open — WITHOUT losing the user's place.
  // Plain `overflow:hidden` doesn't reliably lock scroll on iOS WebKit and, with
  // the news feed's relayout, drops you back to the TOP of the list on close
  // (and on rotation). The position:fixed + negative-top technique pins the body
  // at the current offset and restores it on cleanup, so closing a news video or
  // article returns you exactly where you were. The modal root is position:fixed,
  // so pinning the body underneath doesn't move the modal.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
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

  // Re-cover the title whenever the clip id changes (new open OR a fallback
  // swap) until onReady/PLAYING re-confirms the new clip's title is clean.
  useEffect(() => {
    setTitleSafe(false);
    setYtPaused(false);
    setYtAtEnd(false);
    endLatchRef.current = false;
  }, [currentId]);

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
    video.addEventListener("playing", clearAutoplayBlocked);
    // Native <video> load failure — a pulled/geo-blocked v.redd.it clip parses
    // its manifest but 403/404s the actual CMAF segment, so the element fires
    // "error" (or "stalled" with no data). On Safari this is the ONLY signal (it
    // takes the native-HLS branch below), so without it the clip spins forever.
    // Surface the fallback overlay instead. A "playing" event means it recovered.
    const isHls = /\.m3u8(\?|$)/i.test(playbackUrl);
    let hls: InstanceType<typeof import("hls.js").default> | null = null;
    let cancelled = false;
    let triedHlsJs = false;
    // hls.js path for Chrome/Firefox/etc. on .m3u8 only — also the rescue path
    // when the native attempt below fails (see onMediaError). Configured to
    // favor the top rendition from the first frame: these are short highlight
    // clips (MLB ~30-90s, v.redd.it), so the default ABR — which starts on a
    // low/mid level and ramps up over several segments — would often let the
    // clip end before it ever reached max quality.
    const startHlsJs = () => {
      if (cancelled || triedHlsJs) return;
      triedHlsJs = true;
      import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) { setMediaFailed(true); return; }
      const player = new Hls({
        // Don't let the (deliberately small) modal cap the level, and assume
        // broadband so the very first segment isn't fetched at a low rendition.
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 5_000_000,
      });
      hls = player;
      // Stop the SubtitleTrackController from auto-promoting a DEFAULT=YES
      // track. Setter, not config — this version's HlsConfig doesn't expose
      // subtitleDisplay. The enforce loop below is the real source of truth;
      // this just keeps hls.js from fighting it during init.
      try { player.subtitleDisplay = false; } catch {}
      // Fatal-error handling (Chrome/Firefox path). A pulled/geo-blocked clip
      // 403/404s its segments after the manifest parses; hls.js emits a fatal
      // networkError that would otherwise leave the spinner running forever. Try
      // hls.js's built-in recovery a bounded number of times for each fatal
      // class, then give up to the "Open on <source>" overlay rather than
      // spinning. (Non-fatal errors are routine buffer hiccups hls.js self-heals
      // — ignore them.) The caps stop a permanently-dead segment from looping
      // recover→fatal→recover forever without ever surfacing the fallback.
      let netRecoveries = 0;
      let mediaRecoveries = 0;
      player.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1;
          try { player.recoverMediaError(); return; } catch {}
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRecoveries < 2) {
          netRecoveries += 1;
          try { player.startLoad(); return; } catch {}
        }
        setMediaFailed(true);
      });
      player.loadSource(playbackUrl);
      player.attachMedia(video);
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        // Pin to the highest rendition. For these short clips we want max
        // quality immediately rather than waiting for ABR to climb to it
        // mid-clip; setting currentLevel disables auto-switching, which is
        // safe here — the clips are seconds-to-minutes long, not live streams.
        // (The longer ~10-min NHL condensed games go through Brightcove embeds,
        // not this path, so nothing here is long enough to risk a stall.)
        if (player.levels && player.levels.length > 0) {
          player.currentLevel = player.levels.length - 1;
        }
        video.play().catch(handleNativePlayError);
      });
      }).catch(() => { if (!cancelled) setMediaFailed(true); });
    };
    // Native <video> load failure. Two very different causes, so try the cheap
    // rescue before declaring the clip dead:
    //  1. canPlayType lied. It answers "maybe" for HLS on some Chromium builds
    //     (headless / Chrome for Testing) that can't actually decode it, so the
    //     native branch below grabs an .m3u8 it will always fail on. Hand off to
    //     hls.js once — that's the path those browsers should have taken.
    //  2. The clip really is gone (Reddit revokes segment access on pulled
    //     posts — the manifest still parses while the CMAF .mp4 403s). Common on
    //     r/soccer, whose goal clips rotate through fragile hosts and get pulled
    //     fast. Nothing can play it, so surface the "Open on <source>" overlay.
    // Safari is unaffected: its native HLS works, so this never fires there.
    const onMediaError = () => {
      if (isHls && !triedHlsJs) {
        video.removeAttribute("src");
        video.load();
        startHlsJs();
        return;
      }
      setMediaFailed(true);
    };
    const onMediaPlaying = () => setMediaFailed(false);
    video.addEventListener("error", onMediaError);
    video.addEventListener("playing", onMediaPlaying);
    // Plain MP4 / Safari native HLS — set src and play.
    if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
      video.play().catch(handleNativePlayError);
    } else {
      startHlsJs();
    }
    return () => {
      cancelled = true;
      video.textTracks.removeEventListener("addtrack", refreshHasCaptionTrack);
      video.removeEventListener("loadedmetadata", refreshHasCaptionTrack);
      video.removeEventListener("playing", clearAutoplayBlocked);
      video.removeEventListener("error", onMediaError);
      video.removeEventListener("playing", onMediaPlaying);
      if (hls) hls.destroy();
    };
  }, [hlsMode, playbackUrl, clearAutoplayBlocked, handleNativePlayError]);

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

  // YouTube caption enforcer — YouTube's IFrame API auto-shows captions when
  // the viewer's account/device has CC turned on, and no player var can force
  // them off (cc_load_policy only requests the default). The only reliable
  // knob is (un)loadModule, so we drive it off showCC (default OFF) — this is
  // what makes homepage highlights actually let you turn CC off. Poll briefly
  // because the captions module only exists once the player has loaded, and
  // re-apply after a fallback swap (currentId change rebuilds the player).
  useEffect(() => {
    if (!ytMode) return;
    const apply = () => {
      const p = playerRef.current;
      if (!p || typeof p.loadModule !== "function") return;
      try {
        if (showCC) {
          p.loadModule("captions");
          p.loadModule("cc");
          p.setOption?.("captions", "track", { languageCode: "en" });
          p.setOption?.("cc", "track", { languageCode: "en" });
        } else {
          p.unloadModule("captions");
          p.unloadModule("cc");
        }
      } catch { /* module not ready yet — the poll retries */ }
    };
    apply();
    const pollId = window.setInterval(apply, 250);
    const stopPoll = window.setTimeout(() => window.clearInterval(pollId), 3000);
    return () => { window.clearInterval(pollId); window.clearTimeout(stopPoll); };
  }, [ytMode, showCC, currentId]);

  // YouTube IFrame Player API. Recreates on currentId change (fallback retry swaps it).
  useEffect(() => {
    if (hlsMode || embedMode || imageMode || textMode) return; // HLS / iframe / image / text branches handle rendering instead
    // Captured for the cleanup, which runs after React has already detached the
    // ref on a real unmount. Clearing the host only actually matters on a
    // post-to-post step, where this is the same live node either way.
    const hostAtMount = ytHostRef.current;
    // Channels that refuse embeds on every upload (F1) can only end at the
    // "Watch on YouTube" card, so go there on the first frame instead of
    // mounting a player that will black-screen, error 150, and then walk a
    // fallback chain with nothing in it (Jacob 8/10). See
    // leadChannelBlocksEmbeds for how the list is verified and unwound.
    if (leadChannelBlocksEmbeds(strictFallbackChannels(fallbackUrl))) {
      setYtFailed(true);
      return;
    }
    setYtFailed(false); // fresh attempt (initial load or a fallback swap) — clear any prior failure
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";

    if (!window.YT) {
      document.head.appendChild(tag);
    }

    const tryFallback = async () => {
      if (retryingRef.current) return;
      retryingRef.current = true;
      try {
        if (new URL(fallbackUrl).searchParams.get("nss_no_fallback") === "1") {
          retryingRef.current = false;
          setYtFailed(true); // no alternate allowed → surface the YouTube fallback
          return;
        }
      } catch { /* non-URL fallback strings proceed through the normal path */ }
      const q = extractSearchQuery(fallbackUrl);
      if (!q) {
        retryingRef.current = false;
        setYtFailed(true); // a direct clip (no search query) can't re-search
        return;
      }
      // Mark current id as failed and ask the worker for an alternate
      const failed = [...failedIdsRef.current, currentId];
      failedIdsRef.current = failed;
      // Channel gate carried by the caller (nss_channels + nss_strict on the
      // fallback URL). Without it this retry re-searched UNSCOPED, which is how
      // a blocked FORMULA 1 embed got swapped for a fan reupload ("Final
      // Highlights Race | 2026 Belgian Grand Prix" by "John Maxwell", 7/19) —
      // the strict gate the caller paid for was silently dropped the moment the
      // official clip failed to play, i.e. exactly when it mattered. The retry
      // now walks the SAME allowed channels, strict, in order, and gives up to
      // the "Watch on YouTube" card rather than playing an unvetted upload.
      const strictChannels = strictFallbackChannels(fallbackUrl);
      const raceParam = raceFallbackParam(fallbackUrl);
      const weekParam = weekFallbackParam(fallbackUrl);
      const compParam = compFallbackParam(fallbackUrl);
      // Fail closed if a highlight caller ever forgets to carry its channel
      // contract. The old unscoped branch was how NFL (and every other league)
      // could resolve correctly, hit an embed error, then silently swap to a
      // video from a different uploader.
      if (!strictChannels.length) {
        retryingRef.current = false;
        setYtFailed(true);
        return;
      }
      try {
        const excl = encodeURIComponent(failed.join(","));
        let nextId: string | null = null;
        // Sequential, not parallel: the worker scrapes YouTube's results page
        // and rate-limits into empty responses under bursts (same reason
        // EventCard's UFC chain is sequential).
        for (const channel of strictChannels) {
          const res = await fetch(
            `${getApiBase()}/api/youtube?q=${encodeURIComponent(q)}&exclude=${excl}&channel=${encodeURIComponent(channel)}&strict=1${raceParam}${weekParam}${compParam}`
          );
          const data = res.ok ? await res.json() : null;
          if (data?.videoId && data.videoId !== currentId) { nextId = data.videoId; break; }
        }
        if (nextId) {
          setCurrentId(nextId); // an untried alternate — the effect resets ytFailed
        } else {
          setYtFailed(true); // exhausted alternates → show the "Watch on YouTube" card
        }
      } catch {
        setYtFailed(true); // network error fetching an alternate → same fallback
      } finally {
        retryingRef.current = false;
      }
    };
    tryFallbackRef.current = () => { void tryFallback(); };

    // Highest → lowest. Only request qualities we know YT advertises.
    const QUALITY_PREF = ["highres", "hd2160", "hd1440", "hd1080", "hd720"];
    const pickBest = (levels: string[]): string | null => {
      for (const q of QUALITY_PREF) if (levels.includes(q)) return q;
      return null;
    };
    const forceBest = (player: YTPlayer) => {
      const levels: string[] = player.getAvailableQualityLevels?.() || [];
      const best = pickBest(levels);
      if (best) player.setPlaybackQuality?.(best);
    };
    const initPlayer = () => {
      const YT = window.YT;
      if (!YT) return;
      // The iframe_api script can finish downloading AFTER the modal has closed
      // (fast Esc on a cold load). By then this effect's cleanup has run and the
      // host is gone, so building a player would throw. Bail if it went away.
      // Read the ref live rather than the captured node: this can fire long
      // after the effect that scheduled it, and isConnected is the direct
      // question the old `document.getElementById` guard was really asking —
      // is there still a mount point in the document to build into.
      const host = ytHostRef.current;
      if (!host || !host.isConnected) return;
      // ⛔ Never hand YT a node React rendered. The IFrame API REPLACES the
      // element it is given with its <iframe> (globals.css says so too, for the
      // styling half of the same fact) — but React's fiber goes on holding the
      // ORIGINAL div, which is now detached. Unmounting that subtree then calls
      // removeChild on a node that is no longer its parent's child:
      // `NotFoundError: The object can not be found here.`, DOMException code 8
      // — Sentry JAVASCRIPT-NEXTJS-NY-G (8/18) and NY-J (8/24), both iPhone,
      // both one tap on the pager while a ?v= YouTube post was open, stepping
      // to a post of another type so this whole branch unmounts. Paging YouTube
      // to YouTube never unmounts it, which is why it only showed twice.
      //
      // So: React owns `host` and never learns about the child. YT is free to
      // replace, and React only ever removes a node it really does own. The id
      // rides on the child because the CSS pins the iframe by it.
      host.textContent = "";
      const mount = document.createElement("div");
      mount.id = "yt-player";
      host.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId: currentId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
          widget_referrer: window.location.href,
          // controls:0 strips YouTube's bottom control bar — the red seek line
          // AND the elapsed/duration readout (e.g. 16:13 / 18:30), both of which
          // spoil how far through a highlight reel you are. It also disables
          // scrubbing (itself a spoiler vector). Mute/CC/fullscreen go with it:
          // we render our own subtle control strip below the video instead.
          // The "Show YouTube controls" setting (default off) opts back into
          // YouTube's native bar for users who want it (e.g. in fullscreen).
          controls: youtubeNativeControls ? 1 : 0,
          // Hide in-video annotations/cards — they can carry spoilers.
          iv_load_policy: 3,
          // Don't auto-load captions. cc_load_policy alone can't force them OFF
          // when the viewer's YouTube account/device has CC enabled, so the
          // real enforcement is the (un)loadModule effect below — this just
          // avoids the initial caption flash on a clean load.
          cc_load_policy: 0,
          // vq is deprecated but still hinted by some clients.
          vq: "hd1080",
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            event.target.playVideo();
            // A freshly-built player always autoplays muted — keep the custom
            // toggle in sync (covers fallback swaps after an unmute, too).
            setMuted(true);
            // Uncover the title bar only if the real YouTube title is spoiler-
            // free (getVideoData is undocumented but reliable; may be empty this
            // early, so we re-check on PLAYING below). Default stays covered.
            try {
              const t = event.target.getVideoData?.()?.title ?? "";
              if (t) setTitleSafe(!titleAlwaysMasked && !isScoreSpoiler(t));
            } catch { /* keep covered */ }
            // Watchdog: if we never reach PLAYING or BUFFERING within 10s
            // something is wrong — but WHAT is wrong decides the treatment,
            // and the two causes look identical from out here:
            //   • the browser refused muted autoplay (very common on a cold
            //     profile / fresh account with no media engagement, and
            //     YouTube's onAutoplayBlocked does NOT reliably fire), or
            //   • the iframe is stuck on a silent error screen (YT Error 153).
            // In BOTH cases the player parks in UNSTARTED (-1) / CUED (5).
            // Burning fallback ids on the first one is how a perfectly
            // embeddable NFL clip ended up behind "the league blocked embedded
            // playback" (Jacob 8/9) — the retry re-searched the same strict
            // channel, found nothing new, and painted the block card.
            // So: park state ⇒ treat it as autoplay-blocked and show the
            // tap-to-play prompt. Only if the user's own tap ALSO fails to
            // start it (the 8s confirm in resumeBlockedPlayback) do we go
            // hunting for an alternate id. A player that's missing entirely
            // (undefined state) is genuinely broken and still falls back now.
            if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
            watchdogRef.current = window.setTimeout(() => {
              if (autoplayBlockedRef.current) return;
              const state = playerRef.current?.getPlayerState?.();
              if (state === 1 || state === 3) return;
              // Discriminator between the two: a healthy clip that simply was
              // not allowed to start has still loaded its metadata, so
              // getDuration() is non-zero. A player parked on YouTube's silent
              // error screen never gets that far and reports 0.
              const loaded = (playerRef.current?.getDuration?.() ?? 0) > 0;
              if (loaded && (state === -1 || state === 5)) markAutoplayBlocked();
              else tryFallback();
            }, 10000);
          },
          // PLAYING (1) is the first state where getAvailableQualityLevels()
          // returns the real list — onReady gives []. setPlaybackQuality is
          // a deprecated suggestion, but it's the only knob we have.
          onStateChange: (event: YTPlayerEvent) => {
            // Drive the spoiler cover: PAUSED (2) and ENDED (0) are exactly the
            // states where YouTube paints its related-video overlays.
            if (event.data === 2 || event.data === 0) setYtPaused(true);
            else if (event.data === 1 || event.data === 3) { setYtPaused(false); setYtAtEnd(false); }
            // A real ENDED (0) is the other end-of-clip pause. The progress poll
            // normally gets there first and parks a second early, so this is the
            // belt-and-braces case: a clip short enough that the poll's d > 2
            // guard skipped it, or one that raced past the last sample.
            if (event.data === 0) setYtAtEnd(true);
            // Same two states, published on the dialog root (see
            // data-player-state) so play/pause is observable from outside the
            // cross-origin frame.
            if (event.data === 2 || event.data === 0) setPlayerState("paused");
            else if (event.data === 1 || event.data === 3) setPlayerState("playing");
            // Playback actually started — kill the watchdog.
            if (event.data === 1 || event.data === 3) {
              clearAutoplayBlocked();
              if (!hasStartedRef.current) {
                hasStartedRef.current = true;
                setHasStarted(true);
              }
              if (retryConfirmRef.current) {
                window.clearTimeout(retryConfirmRef.current);
                retryConfirmRef.current = null;
              }
              if (watchdogRef.current) {
                window.clearTimeout(watchdogRef.current);
                watchdogRef.current = null;
              }
            }
            if (event.data === 1) {
              trackVideoPlay();
              forceBest(event.target);
              // By PLAYING the title metadata is reliably populated — re-run the
              // spoiler check in case getVideoData() was empty at onReady.
              try {
                const t = event.target.getVideoData?.()?.title ?? "";
                if (t) setTitleSafe(!titleAlwaysMasked && !isScoreSpoiler(t));
              } catch { /* keep covered */ }
            }
          },
          // If YT auto-quality downgrades us, push back up to the best level.
          onPlaybackQualityChange: (event: YTPlayerEvent) => {
            const levels: string[] = event.target.getAvailableQualityLevels?.() || [];
            const best = pickBest(levels);
            if (best && event.data !== best) event.target.setPlaybackQuality?.(best);
          },
          // YT error codes 100 (removed), 101 / 150 (embed disabled),
          // 5 (HTML5 issue), 2 (bad param). Any of these → swap to next.
          onError: () => {
            tryFallback();
          },
          // Official IFrame API signal that browser policy — not the video —
          // prevented autoplay. Do not burn through alternate video IDs.
          onAutoplayBlocked: () => {
            markAutoplayBlocked();
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (watchdogRef.current) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      // Clear the pending API-ready callback if it's still ours, so a late
      // iframe_api load can't fire initPlayer (a stale closure over this now-
      // unmounted effect's currentId) against the removed #yt-player element.
      if (window.onYouTubeIframeAPIReady === initPlayer) {
        window.onYouTubeIframeAPIReady = undefined;
      }
      tryFallbackRef.current = null;
      if (playerRef.current?.destroy) playerRef.current.destroy();
      // Drop the reference to the just-destroyed instance so the position poll
      // (which re-subscribes on ytMode, not currentId) can't call methods on it
      // during a fallback swap before the replacement player is built.
      playerRef.current = null;
      // Whatever YT left in the host — its iframe, or our mount if it never got
      // that far — is ours to clear, and clearing it is safe precisely because
      // React is not tracking any of it. This also gives the next post a clean
      // host: the old code re-looked-up `#yt-player` after destroy() had already
      // removed it, found nothing, and silently built no player at all.
      hostAtMount?.replaceChildren();
    };
    // titleAlwaysMasked is derived from fallbackUrl (already a dep), so it can
    // never change on its own — listed to keep exhaustive-deps quiet.
  }, [currentId, fallbackUrl, titleAlwaysMasked, hlsMode, embedMode, imageMode, textMode, youtubeNativeControls, clearAutoplayBlocked, markAutoplayBlocked, trackVideoPlay]);

  // Shared sizing for the YT video region + control bar so both line up and,
  // in fullscreen, the video is capped to leave room for the bar underneath.
  // Space reserved below the fullscreen video for the control bar — drops to a
  // sliver when the controls are hidden so the video fills (mobile fullscreen).
  const FS_BAR_RESERVE = controlsHidden ? 8 : 64;
  // The YouTube path draws OUR control bar under the video, so it gives back
  // that strip. HLS/embed use the browser's native player chrome inside the
  // frame, so they take the whole screen.
  const fsMediaWidth = ytMode
    ? `min(100vw, calc((100vh - ${FS_BAR_RESERVE}px) * 16 / 9))`
    : `min(100vw, calc(100vh * 16 / 9))`;
  const btnBase = "flex items-center justify-center rounded-md text-white/55 hover:text-white transition-colors cursor-pointer";

  const hasPager = !!(onPrev || onNext);
  // Cap the media (image / HLS / YouTube alike) so the media + the headline /
  // byline / Open-on / Copy-link row + the pinned Prev/Next pager ALL fit the
  // viewport with no page scroll and nothing overlapping the pager (Jacob 7/7).
  // dvh tracks the real viewport under mobile browser chrome; the reserve grows
  // when the pager is present. This replaces the old per-mode 78vh/85vh/168px
  // caps that left too little room on short windows and clipped the footer.
  // imageMode reserves room for the Close row ABOVE the image plus the headline
  // (can wrap to 2+ lines) + byline + Copy-link row BELOW it, so nothing clips
  // the bottom edge (Jacob 7/11–13). imageMode has no bottom pager band anymore
  // (desktop uses side chevrons, mobile uses swipe), so the reserve is the same
  // whether or not paging is available.
  // imageMode used to ignore hasPager entirely, because image posts navigated
  // by swipe alone and had no pager band to clear. They show the same Prev/Next
  // buttons as everything else now, so a tall portrait shot — a screenshotted
  // Instagram story, say — has to give back the same room or it runs on past
  // the buttons and pushes the Open-on / Copy-link row off the bottom edge.
  // The reserve is capped as a SHARE of the viewport, not just a flat rem, so a
  // short window can't starve the media (Jacob 7/28). A flat 16.5rem is ~31% of
  // a 775px phone but ~65% of a 406px-tall landscape/resized window, which left
  // a postage-stamp image floating in black. Each `min(<rem>, <dvh>)` crosses
  // over at ~775px: at or above that height the hand-tuned rem still wins and
  // nothing changes, below it the reserve shrinks with the viewport so the
  // image keeps filling the screen. The wrapper scrolls if a wrapped headline
  // still needs more room than the shrunken reserve.
  const mediaMaxH = imageMode
    ? (hasPager ? "min(78vh, 100dvh - min(16.5rem, 34dvh))" : "min(82vh, 100dvh - min(12rem, 25dvh))")
    : (hasPager ? "min(78vh, 100dvh - min(15rem, 31dvh))" : "min(85vh, 100dvh - min(10rem, 21dvh))");
  const mediaFrameWidth = fsActive ? fsMediaWidth : `min(100%, calc(${mediaMaxH} * 16 / 9))`;
  const ytFrameWidth = mediaFrameWidth;

  // Before a YouTube clip has ever played, the ONLY thing that can start it is
  // a real click on YouTube's own play button inside the iframe (see
  // hasStarted). So in that window we must not put a clickable target of our
  // own over it — our button would eat the tap and hand it to playVideo(),
  // which is a postMessage with no user activation, and nothing would happen.
  // We render hint text only, pushed below centre and fully click-through, so
  // YouTube's red button stays the tap target.
  const ytTapThrough = ytMode && !hasStarted;

  // LIGHT, non-blocking autoplay hint (Jacob 7/16): when the browser blocks even
  // muted autoplay, show a translucent centered play button + a small pill hint —
  // NOT a full-screen dark cover that swallows the tap. The container is
  // pointer-events-none so tapping ANYWHERE on the video falls through to the
  // click-catcher and starts playback; the "playing" event then clears this
  // (see clearAutoplayBlocked). Only the play button itself catches a click,
  // and only once in-document playback is possible (HLS, or a YT clip that has
  // already played and is merely paused).
  const autoplayPrompt = autoplayBlocked ? (
    <div
      role="alert"
      className={`pointer-events-none absolute inset-0 z-40 flex flex-col items-center px-6 text-center ${ytTapThrough ? "justify-end pb-[18%]" : "justify-center gap-2"}`}
    >
      {!ytTapThrough && (
        <button
          type="button"
          onClick={resumeBlockedPlayback}
          aria-label="Play"
          className="pointer-events-auto inline-flex items-center justify-center rounded-full w-16 h-16 text-white shadow-lg transition-transform hover:scale-105 cursor-pointer"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,4 20,12 7,20" /></svg>
        </button>
      )}
      <span className="rounded-full px-3 py-1 text-[11px] font-medium text-white/90" style={{ background: "rgba(0,0,0,0.5)" }}>
        Tap to play — enable autoplay for HideScore to skip this
      </span>
    </div>
  ) : null;

  // News prev/next paging: phones keep labelled bottom buttons for thumb
  // reach; desktop gets subtle side chevrons so the footer links never overlap.
  const mobilePager = hasPager ? (
    <div className="fixed left-1/2 -translate-x-1/2 z-[60] flex sm:hidden items-center justify-center gap-2" style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={!onPrev} aria-label="Previous post" title="Previous post"
        className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold text-white/90 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.25)" }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Prev
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={!onNext} aria-label="Next post" title="Next post"
        className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold text-white/90 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.25)" }}>
        Next
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  ) : null;
  const desktopPager = hasPager ? (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); goPrev(); }}
        disabled={!onPrev}
        aria-label="Previous post"
        title="Previous post (↑)"
        aria-keyshortcuts="ArrowUp"
        className="hidden sm:flex fixed left-4 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        disabled={!onNext}
        aria-label="Next post"
        title="Next post (↓)"
        aria-keyshortcuts="ArrowDown"
        className="hidden sm:flex fixed right-4 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </>
  ) : null;

  return (
    <div
      // This is also the fullscreen host (see fsHostRef) — it outlives every
      // per-mode branch below, so fullscreen survives paging across a mixed
      // Reddit column of clips, images and text posts.
      ref={fsHostRef}
      // Media modes (image / video) are capped to fit the viewport, so they
      // never scroll — only a long Reddit text post scrolls (its card scrolls
      // internally, and the wrapper below can grow past the viewport for it).
      className={textMode ? "fixed inset-0 overflow-y-auto" : "fixed inset-0 overflow-hidden"}
      style={{ zIndex: 9999 }}
      onClick={() => onClose("accidental")}
    >
      {/* Backdrop — fixed so it stays covering the viewport while a tall post
          scrolls inside the container above it. */}
      <div className="fixed inset-0" style={{ background: "#000" }} />

      {/* Centring / scroll wrapper — min-h-full centres short posts, but when a
          post is taller than the viewport (long Reddit body → card hits
          max-h-[85vh], plus the byline / Open-on / Copy-link row) the wrapper
          grows past the viewport and the whole thing SCROLLS instead of
          overflowing symmetrically and bleeding the footer under the fixed
          pager. The bottom reserve keeps that footer clear of the pager band
          (Jacob 7/4). No reservation when there's no pager (e.g. highlights). */}
      <div
        // Wider side padding on desktop when a pager is present so the fixed
        // left/right chevrons sit in a gutter beside the media instead of on top
        // of it (Jacob 7/11–13). The bottom Prev/Next buttons need a bottom
        // reserve so the footer clears them — image posts included, now that
        // they get the buttons too.
        className={`relative flex min-h-full items-center justify-center p-4 ${hasPager ? "pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:px-24 sm:py-8" : "sm:p-8"}`}
      >
      {/* Content — clicks bubble to onClose so tapping the image, headline,
          or any whitespace around them dismisses. The video player and CC
          button stop propagation themselves so playback controls keep working. */}
      <div
        ref={dialogRef}
        // tabIndex=-1 makes the dialog programmatically focusable (see the
        // focus-management effect) without adding it to the tab order; outline
        // none suppresses the ring since it's focused only to seat assistive tech.
        tabIndex={-1}
        className="group relative w-full max-w-7xl focus:outline-none" /* PROTOTYPE 6/2: 6xl→7xl modal-width lever (Safari/iOS quality). Revert to max-w-6xl if the desktop trade-off isn't worth it. */
        style={{ zIndex: 1 }}
        role="dialog"
        aria-modal="true"
        // "playing" | "paused" | "none". Nothing about the clip leaks through
        // it — not the position, not the duration — and it is the only way to
        // read play state from outside a cross-origin YouTube iframe, which is
        // what makes the keyboard's Space testable (Jacob 9/5).
        data-player-state={ytMode || hlsMode ? playerState : "none"}
        // Keep the dialog's accessible name in sync with what it's actually
        // showing — this same modal also serves an image lightbox (imageMode)
        // and a Reddit text-post preview (textMode), so a static "Video player"
        // mislabels both for screen readers. Don't surface the headline here:
        // it's deliberately spoiler-blurred (PeekBlur) because it can carry a
        // score, and an accessible name would read it aloud unblurred.
        aria-label={imageMode ? "Image viewer" : textMode ? "Post" : "Video player"}
      >
        {/* News prev/next post paging now renders as a labelled row BELOW the
            media (see `pager`, inserted after the player) instead of overlaid on
            the video — keeps mobile footage/dismiss/seek zones clear. */}
        {/* Close affordances now live in-flow just above each content block
            (image / text card / video frame), aligned to that block's real
            right edge — see the per-mode Close rows below. */}

        {/* Player area — image lightbox (no aspect lock), YouTube (custom
            chrome), or 16:9 video for HLS/embed */}
        {/* imageMode's Close sits ON the image's top-right corner instead of in
            this row (see below), so it hugs the actual content for any aspect. */}
        {!ytMode && !textMode && !imageMode && (
          <div
            className="mx-auto mb-2 flex items-center justify-end gap-1.5"
            style={{ width: mediaFrameWidth }}
            onClick={(e) => e.stopPropagation()}
          >
            {hlsMode && hasCaptionTrack && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowCC((v) => !v); }}
                aria-pressed={showCC}
                aria-label={showCC ? "Hide captions" : "Show captions"}
                className="h-8 px-2.5 flex items-center justify-center rounded-full text-xs font-bold transition-colors cursor-pointer"
                style={{
                  color: showCC ? "white" : "rgba(255,255,255,0.7)",
                  background: showCC ? "var(--accent)" : "rgba(0,0,0,0.45)",
                  border: showCC ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.15)",
                }}
                title={showCC ? "Hide captions" : "Show captions"}
              >
                CC
              </button>
            )}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onClose("explicit"); }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white bg-black/45 hover:bg-black/65 border border-white/15 transition-colors cursor-pointer"
              aria-label="Close"
              title="Close (Esc)"
            >
              <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {imageMode ? (
          // The column hugs the RENDERED image (w-fit), so the Close row spans
          // the image's real width and lands just ABOVE its top-right corner —
          // never over the photo, for any aspect ratio (Jacob 7/13). Desktop adds
          // side chevrons in the gutter; mobile drops all buttons — swipe
          // left/right navigates and the image gets the full width.
          <div
            className="mx-auto w-fit max-w-full"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            {/* Close sits OUTSIDE the image — a right-aligned row the image's own
                width, so it hugs the top-right corner without covering content. */}
            <div className="mb-2 flex justify-end">
              <button type="button"
                onClick={(e) => { e.stopPropagation(); onClose("explicit"); }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white bg-black/45 hover:bg-black/65 border border-white/15 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div ref={containerRef} className="relative rounded-lg overflow-hidden bg-black leading-[0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                // Gallery frames come off Reddit at capture resolution (4000px+,
                // several MB each) — cap the delivered width at the proxy so a
                // phone isn't downloading 3.5 MB per swipe.
                src={proxyImage(isGallery ? gallery[galAt] : imageUrl!, 1400)}
                alt=""
                decoding="async"
                className="block max-w-full object-contain"
                style={{ maxHeight: mediaMaxH }}
                draggable={false}
                onError={() => setImgFailed(true)}
              />
              {isGallery && (
                <>
                  {/* Picture counter — the cue that there's more than one, which
                      the old single-image lightbox gave no hint of. Purely visual
                      ("2 / 3" reads as a bare "2 3" to a screen reader), so hide it
                      from AT and voice the position through the sr-only live region
                      below instead. */}
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none text-white"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    {galAt + 1} / {galLen}
                  </span>
                  {/* The gallery frames all carry alt="" (no per-image caption is
                      available), and the counter + dots above are aria-hidden, so
                      paging with the Prev/Next buttons gave a screen-reader user no
                      cue which picture they'd landed on. Voice the new position
                      through a dedicated sr-only live region (WCAG 4.1.3 Status
                      Messages), matching the same role="status" aria-live="polite"
                      pattern the copy-link confirmation and FeedbackBox already use.
                      Its text changes on every step, so each page is announced. */}
                  <span role="status" aria-live="polite" className="sr-only">
                    Picture {galAt + 1} of {galLen}
                  </span>
                  {/* On-image arrows: the fixed side chevrons page POSTS, so the
                      within-post controls have to live on the photo itself. */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stepGallery(-1); }}
                    disabled={galAt === 0}
                    aria-label="Previous picture"
                    title="Previous picture"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white disabled:opacity-0 disabled:cursor-default transition-opacity cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  >
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); stepGallery(1); }}
                    disabled={galAt === galLen - 1}
                    aria-label="Next picture"
                    title="Next picture"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white disabled:opacity-0 disabled:cursor-default transition-opacity cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  >
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5" aria-hidden="true">
                    {gallery.map((g, i) => (
                      <span
                        key={g}
                        className="block w-1.5 h-1.5 rounded-full"
                        style={{ background: i === galAt ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)" }}
                      />
                    ))}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : textMode ? (
          // Text-post preview card — Reddit headline-only posts (or any item
          // whose image failed to load) get a clean card layout instead of
          // an empty lightbox. Everything stays on hidescore until the user
          // hits the "Open on …" button at the bottom.
          // A tidy reading column (max-w-2xl) with the Close row just ABOVE the
          // card's top-right corner — same treatment as the image lightbox, so
          // the affordance is consistent for every post type (Jacob 7/13). The
          // card scrolls internally (maxHeight), so Close stays put; horizontal
          // swipe navigates between posts.
          <div
            className="mx-auto w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            <div className="mb-2 flex justify-end">
              <button type="button"
                onClick={(e) => { e.stopPropagation(); onClose("explicit"); }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white bg-black/45 hover:bg-black/65 border border-white/15 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div ref={containerRef} className="relative w-full rounded-lg p-6 sm:p-8 overflow-y-auto" style={{ maxHeight: mediaMaxH, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {sourceLabel && (
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>{sourceLabel}</p>
              )}
              {poster && (
                // External-link posts only carry Reddit's 140px preview crop, so
                // they land here rather than in the lightbox. Show it at its own
                // size — a link-card tile, never stretched into a blurry hero.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImage(poster)}
                  alt=""
                  decoding="async"
                  className="block rounded-md mb-3 max-w-full h-auto"
                  draggable={false}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              {headline && (
                <PeekBlur key={`h-${postKey}`} peek={headlinePeek} onToggle={toggleHeadlinePeek} keyShortcut="h" tag="h2" className="text-lg sm:text-2xl font-semibold leading-snug mb-3" style={{ color: "var(--text)" }}>{headline}</PeekBlur>
              )}
              <ArticleMeta byline={byline} published={published} className="text-xs sm:text-sm" style={{ color: "var(--text-muted)" }} />
              {body && (
                <PeekBlur
                  key={`b-${postKey}`}
                  className="text-sm sm:text-base leading-relaxed mt-4 pt-4"
                  style={{ color: "var(--text)", borderTop: "1px solid var(--border)" }}
                >
                  {renderRedditBody(body)}
                </PeekBlur>
              )}
            </div>
          </div>
        ) : ytMode ? (
          // YouTube clip. In fullscreen this wrapper spreads to cover the screen
          // (the mask + the control bar come along, so the title stays covered);
          // the element handed to the Fullscreen API is the modal root above.
          <div
            // A click on the dark margin BESIDE the centred video (target is this
            // wrapper itself, not a child) dismisses when not fullscreen; clicks
            // bubbling up from the player/controls still stop here so they keep
            // working. The video surface stops propagation in handleSurfaceTap.
            onClick={(e) => { if (!fsActive && e.target === e.currentTarget) onClose("accidental"); else e.stopPropagation(); }}
            // Non-fullscreen: pin the wrapper to the exact video width and centre
            // it. Without an explicit width this is a shrink-to-fit flex item, and
            // Safari resolves its width to the full viewport (not the video's) —
            // so the × row (min(100%, …)) came out NARROWER than the centred
            // video and the controls sprayed edge-to-edge ("doesn't fit / x
            // misaligned", Jacob 7/17). Pinning it makes the ×, video, and control
            // strip one coherent, height-capped, centred column in every browser.
            style={fsActive ? {
              position: "fixed", inset: 0, zIndex: 10000, background: "#000",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            } : { width: ytFrameWidth, marginLeft: "auto", marginRight: "auto" }}
          >
            {/* YouTube modal controls sit above the player, right-aligned, so they
                don't cover the iframe or collide with YouTube's own overlay. */}
            <div
              className="mb-2 flex items-center justify-end gap-1.5"
              style={{ width: ytFrameWidth }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowCC((v) => !v); }}
                aria-pressed={showCC}
                aria-label={showCC ? "Hide captions" : "Show captions"}
                className="h-8 px-2.5 flex items-center justify-center rounded-full text-xs font-bold transition-colors cursor-pointer"
                style={{
                  color: showCC ? "white" : "rgba(255,255,255,0.75)",
                  background: showCC ? "var(--accent)" : "rgba(0,0,0,0.5)",
                  border: showCC ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.16)",
                }}
                title={showCC ? "Hide captions" : "Show captions"}
              >
                CC
              </button>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); onClose("explicit"); }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/75 hover:text-white bg-black/50 hover:bg-black/70 border border-white/15 transition-colors cursor-pointer"
                aria-label="Close"
                title="Close (Esc)"
              >
                <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Video region — 16:9 in-flow, or capped to leave bar room in FS */}
            <div
              onMouseMove={bumpCursor}
              className="group relative mx-auto w-full overflow-hidden bg-black"
              style={fsActive
                ? { width: ytFrameWidth, aspectRatio: "16 / 9", borderRadius: 0 }
                : { width: ytFrameWidth, aspectRatio: "16 / 9", borderRadius: "0.5rem" }}
            >
              <div ref={ytHostRef} className="absolute inset-0 w-full h-full" />
              {/* Embed-blocked / unplayable fallback — covers YouTube's own
                  "Video unavailable" screen with a clean prompt + a Watch-on-
                  YouTube button (opens the YT app on native via openExternal). */}
              {ytFailed && (
                <div
                  className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center"
                  style={{ background: "#000" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg aria-hidden="true" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-white/85 text-sm sm:text-base font-medium max-w-xs leading-snug">This highlight can’t play here — the league blocked embedded playback.</p>
                  {/* One-tap jump to another version of the same game (e.g. the
                      Telemundo cut) — often embeddable when the FOX/FIFA one isn't.
                      Loading it swaps currentId; the player effect clears ytFailed
                      and re-attempts, so if it also blocks the overlay returns. */}
                  {embedAlternates.map((a) => (
                    <button
                      key={a.videoId}
                      type="button"
                      onClick={() => { failedIdsRef.current = [...failedIdsRef.current, currentId]; setCurrentId(a.videoId); }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-105 cursor-pointer"
                      style={{ background: "var(--accent)" }}
                    >
                      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                      Try {a.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => openExternal(sourceShareUrl || fallbackUrl)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                    style={embedAlternates.length
                      ? { color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }
                      : { color: "white", background: "var(--accent)" }}
                  >
                    Watch on YouTube
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                  </button>
                </div>
              )}
              {!ytFailed && autoplayPrompt}
              {/* Spoiler cover for YouTube's pause / endscreen overlays. Must be
                  fully OPAQUE — a dim or blur still leaves thumbnail faces and
                  "POST-FIGHT INTERVIEW" text readable, which is the whole leak.
                  pointer-events-none so the tap still falls through to the
                  click-catcher below (z-10) and resumes playback as before.

                  TWO different pauses, two different covers (Jacob 9/8, on a
                  Jomboy clip: "black screen"). Blacking the WHOLE player out for
                  an ordinary mid-clip pause is what reads as a broken player —
                  and it protects nothing, because the frame it hides is the one
                  that was on screen a moment earlier while the clip played. What
                  YouTube actually ADDS on a mid-clip pause, measured against the
                  live embed at 1280x720 and 398x224 with our own covers stripped
                  (9/8): its title bar at the top, and a "More videos" suggestion
                  card in the bottom strip. The suggestion card is the leak.
                    • mid-clip pause → cover the bottom strip only; the frozen
                      frame stays visible and the player still looks like a
                      player. In native-controls mode the strip stops above
                      YouTube's own bar (bottom-12) so its controls stay usable.
                    • end of clip → the full opaque cover, unchanged. Here the
                      last frame IS a spoiler (a highlight ends on the final
                      scoreboard) and the endscreen is a full grid, so nothing
                      short of the whole player will do. ytAtEnd marks it: the
                      progress poll parks the clip a second early precisely so
                      ENDED never fires and this cover, not YouTube's grid, is
                      what you see.
                  The title bar the mid-clip pause exposes is the "Cover video
                  title" mask's job, not this one's. */}
              {ytPaused && ytAtEnd && !ytFailed && !autoplayBlocked && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center ${youtubeNativeControls ? "bottom-12" : "bottom-0"}`}
                  style={{ background: "#000" }}
                >
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><polygon points="6,4 20,12 6,20" /></svg>
                </div>
              )}
              {ytPaused && !ytAtEnd && !ytFailed && !autoplayBlocked && (
                <>
                  {/* The suggestion strip, flush to the BOTTOM edge — not
                      bottom-12 like the end-of-clip cover. That offset exists so
                      YouTube's control bar stays usable underneath a full
                      blackout, but the "More videos" card sits in exactly the
                      48px it spares, so an offset strip floats above the very
                      thing it is there to hide (measured 9/8: card at 620-670px
                      in a 679px-tall player, strip ending at 620). Bottom-anchored
                      it also takes YouTube's control bar with it while paused —
                      acceptable, because the strip is pointer-events-none and a
                      click anywhere on the player resumes, which brings the bar
                      straight back.
                      clamp, because the card does NOT scale with the player: it
                      sits ~65px off the bottom of a 720px-tall frame and ~70px off
                      a 224px one, so the min does the work on a phone and the max
                      stops it eating a third of a desktop frame. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
                    style={{ height: "clamp(96px, 34%, 210px)", background: "#000" }}
                  />
                  {/* Paused badge — the frame is visible now, so the play glyph
                      needs its own scrim to stay legible over footage. */}
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <span className="flex items-center justify-center w-16 h-16 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)"><polygon points="6,4 20,12 6,20" /></svg>
                    </span>
                  </div>
                </>
              )}
              {/* Click-catcher over the whole player. A click anywhere on the
                  video toggles play/pause through the YT API instead of falling
                  through to the cross-origin iframe. This is what makes the
                  keyboard controls behave the same whether or not you've clicked
                  the video: a click on the iframe would move focus INTO it, after
                  which YouTube swallows every keystroke (Esc / f / ← → / Space)
                  and the modal's shortcuts go dead until you click back out. By
                  catching the click here, focus stays in this document and the
                  shortcuts keep working. controls:0 means there's nothing else to
                  click inside the iframe, so we lose nothing. Sits below the peek
                  buttons (z-20) so those still work; the masks are pointer-events:
                  none and pass their clicks down to here. */}
              {/* When YouTube's native controls are on, DON'T catch clicks —
                  let them reach the iframe so YT's own play/seek/fullscreen work.
                  ALSO don't catch them before the clip has ever played: until
                  then YouTube's own red play button is the only control that can
                  legally start playback (a postMessage playVideo() carries no
                  user gesture across the origin boundary), and swallowing that
                  first tap is what made WNBA/NFL clips sit on a dead play button
                  forever — MLB looked fine only because it's an in-document HLS
                  <video>, not an iframe (Jacob 8/9). The moment PLAYING lands we
                  mount the catcher and every existing behaviour — pause on tap,
                  double-tap seek, keyboard shortcuts staying in this document —
                  is back. */}
              {!youtubeNativeControls && hasStarted && (
                <div
                  aria-hidden
                  className={`absolute inset-0 z-10 touch-manipulation ${idleCursor ? "cursor-none" : "cursor-default"}`}
                  onClick={handleSurfaceTap}
                />
              )}
              {/* Double-tap-to-seek flash — a ∓5s badge on the tapped side. */}
              {seekFlash && (
                <div
                  key={seekFlash.n}
                  aria-hidden
                  className={`hs-seek-flash pointer-events-none absolute top-1/2 z-20 flex flex-col items-center gap-1 text-white ${seekFlash.side === "l" ? "left-[14%]" : "right-[14%]"}`}
                >
                  <span className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full" style={{ background: "rgba(0,0,0,0.5)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {seekFlash.side === "l"
                        ? (<><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></>)
                        : (<><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></>)}
                    </svg>
                  </span>
                  <span className="text-xs font-bold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>5s</span>
                </div>
              )}
              {/* Spoiler mask over YouTube's title chrome — always on (see note
                  by the state declarations), toggleable in Settings
                  (maskVideoTitle). pointer-events stay off so click-to-play/pause
                  keeps working. STRAIGHT BLACK, no gradient: a hard edge, so the
                  bar is the thinnest height that still hides the title and crops
                  the least footage.
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
                  NO BOTTOM BAR: controls:0 already strips YouTube's ENTIRE bottom
                  bar (no timeline/seek line exists), so nothing there needs
                  covering during playback. */}
              {/* titleAlwaysMasked OVERRIDES the setting (Jacob 9/8). "Cover
                  video title" went default-OFF the same day, and for most clips
                  that is fine — an MLB or NBA upload titles itself by matchup.
                  But the channels in TITLE_ALWAYS_MASKED_CHANNELS title
                  themselves by RESULT ("X knocks out Y in round 2"), which is
                  the whole fight given away in the one line the mask covers.
                  Leaving those to the default would have quietly reopened the
                  8/11 hole ("titles have spoilers") for every user who never
                  touched the toggle. So the pref governs ordinary clips and this
                  short list stays covered either way — the app's promise beats a
                  display preference. titleSafe is already forced false for these
                  channels (see the onReady/PLAYING handlers), so the second
                  condition is belt-and-braces, not the thing doing the work. */}
              {(maskVideoTitle || titleAlwaysMasked) && !titleSafe && (
                <div
                  aria-hidden
                  className="absolute top-0 inset-x-0 z-10 pointer-events-none"
                  style={{
                    height: "clamp(42px, 7%, 50px)",
                    background: "#000",
                  }}
                />
              )}
              {/* Bottom mask — a thin always-on black strip along the very bottom
                  edge to guarantee YouTube's red progress line never shows in the
                  spoiler-safe player (Jacob 7/4). controls:0 usually strips YT's
                  whole bottom bar, but this is belt-and-suspenders for the iOS
                  WKWebView, where the red line can still flash. Only in spoiler-
                  safe mode (native controls off) and when maskVideoBottom is on. */}
              {maskVideoBottom && !youtubeNativeControls && (
                <div
                  aria-hidden
                  className="absolute bottom-0 inset-x-0 z-10 pointer-events-none"
                  style={{ height: "6px", background: "#000" }}
                />
              )}
              {/* No top-bar peek button here: it overlapped the YouTube CC/close
                  controls and read as a stray eye under the X. */}
              {/* Hide/show the control chrome below the video to reclaim space
                  (great in mobile fullscreen). Stays pinned to the video corner
                  so you can bring the controls back. Nothing to toggle when
                  YouTube's native controls replace this chrome entirely. */}
              {!youtubeNativeControls && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setControlsHidden((v) => !v); }}
                aria-label={controlsHidden ? "Show controls" : "Hide controls"}
                title={controlsHidden ? "Show controls" : "Hide controls"}
                className="absolute bottom-1.5 right-1.5 z-20 w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white transition cursor-pointer opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                {controlsHidden ? (
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                ) : (
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                )}
              </button>
              )}
              {/* Warn-past-halfway confirm — shown only when the warnHalfway
                  pref is on and a click/jump targeted the second half from the
                  first. Holds the seek until confirmed so you don't drop into
                  late-game action by accident. z-30 (above masks + peek);
                  stopPropagation so taps here don't pause/close the modal. */}
              {pendingSeek && (
                <div
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-4 text-center"
                  style={{ background: "rgba(0,0,0,0.82)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-white text-sm sm:text-base font-medium max-w-xs">
                    Skip to about {pendingSeek.pct}%? That&apos;s past halfway — you might catch up to late-game action.
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setPendingSeek(null); }}
                      className="px-3 py-1.5 rounded-md text-sm font-medium text-white/80 hover:text-white cursor-pointer"
                      style={{ border: "1px solid rgba(255,255,255,0.3)" }}
                    >
                      Cancel
                    </button>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); const run = pendingSeek.run; setPendingSeek(null); run(); }}
                      className="px-3 py-1.5 rounded-md text-sm font-semibold text-white cursor-pointer"
                      style={{ background: "var(--accent)" }}
                    >
                      Skip anyway
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Control chrome (seek bar + strip) — collapsible via the corner
                toggle so the video can take the whole frame. Hidden entirely
                when YouTube's native controls are on (Settings says "instead
                of the spoiler-safe one" — showing both stacks two seek UIs). */}
            {!controlsHidden && !youtubeNativeControls && (<>
            {/* Seek bar — drag/tap to scrub. Sits BELOW the video (never over
                footage). Default is a BLANK track (no fill) so it never reveals
                how far through you are; the fill can be turned on (grey/white)
                in Settings. seekFromClientX caps the target at seekCap (90%
                unless "Allow seeking to the end" is on). The warn-halfway
                confirm is gated at pointer-DOWN so a drag isn't interrupted.
                Hidden when the user picks jumps-only in Settings. */}
            {seekControl !== "jumps" && (
              <div className="mt-2" style={fsActive ? { width: fsMediaWidth } : { width: "100%", maxWidth: 820, marginLeft: "auto", marginRight: "auto" }}>
                <div
                  ref={barRef}
                  role="slider"
                  aria-label={seekFill === "off" ? "Seek through the clip (position hidden to avoid spoilers)" : "Seek through the clip"}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(seekCap * 100)}
                  aria-valuenow={Math.round(Math.min(progress, seekCap) * 100)}
                  // When the fill is hidden to avoid spoilers, the numeric
                  // position must not leak through aria-valuenow either — a
                  // screen reader would announce the exact percentage the
                  // sighted track deliberately withholds. aria-valuetext takes
                  // precedence over aria-valuenow, so it's spoken instead while
                  // valuenow stays present for spec-valid relative nudging.
                  aria-valuetext={seekFill === "off" ? "Position hidden to avoid spoilers" : undefined}
                  tabIndex={0}
                  title="Tap or drag to seek"
                  onKeyDown={(e) => {
                    // A focusable role="slider" must be keyboard-operable (WCAG
                    // 2.1.1). ←/↓ nudge back, →/↑ nudge forward by the same ±5s
                    // step the on-screen buttons use — a slow, deliberate scrub
                    // that's deliberately exempt from the spoiler cap/warn (see
                    // seekBy). stopPropagation so the modal's global arrow
                    // handler doesn't ALSO fire (it would step to the prev/next
                    // post, or double-seek, instead of just nudging the bar).
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                      e.preventDefault(); e.stopPropagation(); seekBy(-SEEK_STEP);
                    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                      e.preventDefault(); e.stopPropagation(); seekBy(SEEK_STEP);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const clientX = e.clientX;
                    const frac = fracFromClientX(clientX);
                    const p = playerRef.current;
                    const d = p?.getDuration?.() ?? 0;
                    const cur = d > 0 ? (p?.getCurrentTime?.() ?? 0) / d : 0;
                    // Gate the press itself if it would land past halfway — don't
                    // start a drag, just hold the seek behind the confirm.
                    if (warnHalfway && frac > 0.5 && cur <= 0.5) {
                      setPendingSeek({ run: () => seekFromClientX(clientX), pct: Math.round(frac * 100) });
                      return;
                    }
                    draggingBarRef.current = true;
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    seekFromClientX(clientX);
                  }}
                  onPointerMove={(e) => { if (draggingBarRef.current) seekFromClientX(e.clientX); }}
                  onPointerUp={(e) => { e.stopPropagation(); draggingBarRef.current = false; }}
                  onPointerCancel={() => { draggingBarRef.current = false; }}
                  className="w-full cursor-pointer"
                  style={{ paddingTop: "7px", paddingBottom: "7px" }}
                >
                  {seekFill === "off" ? (
                    /* Blank track — no fill, so it never shows your position. */
                    <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
                  ) : (
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(progress, 1) * 100}%`, background: seekFill === "white" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.34)" }} />
                    </div>
                  )}
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
                : { width: "100%", maxWidth: 820, marginLeft: "auto", marginRight: "auto", gridTemplateColumns: "1fr auto 1fr" }}
            >
              {/* Mute toggle + volume slider. Autoplay starts muted, so the
                  slider sits at 0 with a muted icon until you raise it (or tap
                  the icon). The icon's waves reflect the level; the fill shows
                  the current volume. */}
              <div className="justify-self-start flex items-center gap-1.5 min-w-0">
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  title={muted ? "Sound on" : "Mute"}
                  className={`${btnBase} h-8 w-8 shrink-0`}
                >
                  {muted || volume === 0 ? (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5 6 9H2v6h4l5 4z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5 6 9H2v6h4l5 4z" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      {volume > 55 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                    </svg>
                  )}
                </button>
                <div
                  ref={volRef}
                  role="slider"
                  aria-label="Volume"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={muted ? 0 : volume}
                  tabIndex={0}
                  title="Volume"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    // Make the focusable role="slider" actually keyboard-operable
                    // (WCAG 2.1.1): ←/↓ lower and →/↑ raise by 5, Home/End jump to
                    // mute/full. Without this the slider takes focus but ignores keys.
                    const cur = muted ? 0 : volume;
                    let next: number | null = null;
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - 5;
                    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + 5;
                    else if (e.key === "Home") next = 0;
                    else if (e.key === "End") next = 100;
                    if (next === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setVolLevel(next);
                  }}
                  onPointerDown={(e) => { e.stopPropagation(); draggingVolRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setVolFromClientX(e.clientX); }}
                  onPointerMove={(e) => { if (draggingVolRef.current) setVolFromClientX(e.clientX); }}
                  onPointerUp={(e) => { e.stopPropagation(); draggingVolRef.current = false; }}
                  onPointerCancel={() => { draggingVolRef.current = false; }}
                  className="w-14 sm:w-20 cursor-pointer shrink-0"
                  style={{ paddingTop: "8px", paddingBottom: "8px" }}
                >
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                    <div className="h-full rounded-full" style={{ width: `${muted ? 0 : volume}%`, background: "rgba(255,255,255,0.6)" }} />
                  </div>
                </div>
              </div>

              {/* Center seek group: −5s / jump presets / +5s. The ±5s buttons
                  give touch users the same fine seek the ←/→ keys do. The %
                  presets shrink to QUARTERS on mobile (25/50/75) so the whole row
                  stays on ONE line — the full 10→90 set was wrapping to two rows
                  on phones — and expand to the full set on desktop. Hidden when
                  the user picks bar-only; the empty div keeps the 3-column grid
                  so the fullscreen button stays right-aligned. */}
              {seekControl !== "bar" ? (
                <div className="min-w-0 flex items-center justify-center gap-0.5 flex-nowrap">
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); seekBy(-SEEK_STEP); }}
                    aria-label="Back 5 seconds"
                    title="Back 5 seconds (←)"
                    className="flex items-center justify-center rounded-md transition-colors cursor-pointer h-8 w-8 text-white/55 hover:text-white"
                  >
                    {/* circular rewind arrow with "5" nested inside (YT/Firefox-PiP style) */}
                    <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><text x="12" y="15.5" fontSize="9" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">5</text></svg>
                  </button>
                  {/* Mobile + MEDIUM windows: quarter presets only. The full
                      10→90 set below needs ~600px of strip; on narrower windows
                      it squeezed the side cells until the fixed-width volume
                      slider overflowed into this row. Gate the full set on lg. */}
                  {[25, 50, 75].map((p) => (
                    <button type="button"
                      key={`m${p}`}
                      onClick={(e) => { e.stopPropagation(); seekToPct(p); }}
                      className="flex lg:hidden items-center justify-center rounded-md transition-colors cursor-pointer h-7 px-1.5 text-xs font-medium text-white/55 hover:text-white"
                      aria-label={`Jump to ${p}%`}
                      title={`Jump to ${p}%`}
                    >
                      {p}%
                    </button>
                  ))}
                  {/* Large windows: full 10→90 set (80/90 dimmed — nearest the ending) */}
                  <span className="hidden lg:inline text-[11px] text-white/35 mx-1 select-none">Skip to</span>
                  {JUMP_PCTS.map((p) => (
                    <button type="button"
                      key={`d${p}`}
                      onClick={(e) => { e.stopPropagation(); seekToPct(p); }}
                      className={`hidden lg:flex items-center justify-center rounded-md transition-colors cursor-pointer h-7 px-1.5 text-xs font-medium ${p >= 80 ? "text-white/25 hover:text-white/55" : "text-white/55 hover:text-white"}`}
                      aria-label={`Jump to ${p}%`}
                      title={`Jump to ${p}%`}
                    >
                      {p}%
                    </button>
                  ))}
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); seekBy(SEEK_STEP); }}
                    aria-label="Forward 5 seconds"
                    title="Forward 5 seconds (→)"
                    className="flex items-center justify-center rounded-md transition-colors cursor-pointer h-8 w-8 text-white/55 hover:text-white"
                  >
                    {/* circular forward arrow with "5" nested inside (YT/Firefox-PiP style) */}
                    <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><text x="12" y="15.5" fontSize="9" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">5</text></svg>
                  </button>
                </div>
              ) : <div />}

              {/* Fullscreen toggle */}
              <button type="button"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                aria-label={fsActive ? "Exit fullscreen" : "Fullscreen"}
                title={fsActive ? "Exit fullscreen (Esc)" : "Fullscreen (f)"}
                className={`${btnBase} justify-self-end h-8 w-8`}
              >
                {fsActive ? (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                )}
              </button>
            </div>
            </>)}
          </div>
        ) : (
          // Direct stream / third-party embed. Same fullscreen treatment as the
          // YouTube wrapper: in fullscreen this spreads over the padded, pager-
          // reserved layout so the frame really fills the screen rather than
          // sitting in the middle of it.
          <div
            onClick={(e) => e.stopPropagation()}
            style={fsActive ? {
              position: "fixed", inset: 0, zIndex: 10000, background: "#000",
              display: "flex", alignItems: "center", justifyContent: "center",
            } : undefined}
          >
          <div ref={containerRef} className="group relative mx-auto w-full rounded-lg overflow-hidden bg-black" style={{ width: mediaFrameWidth, aspectRatio: "16 / 9" }} onClick={(e) => e.stopPropagation()}>
            {hlsMode ? (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full"
                controls
                autoPlay
                muted
                playsInline
                onPlaying={trackVideoPlay}
                onPlay={() => setPlayerState("playing")}
                onPause={() => setPlayerState("paused")}
                // Spoiler-safe accessible name — matching the sibling <iframe>'s
                // title and the dialog's aria-label: the PeekBlur'd headline can
                // carry a score, so setting it as this focusable player's
                // aria-label announced the spoiler unblurred to screen readers on
                // the HLS path (MLB statsapi + Reddit clips, whose headlines
                // routinely state the result). Use the generic label instead.
                aria-label="Video player"
                // Spoiler-safe poster: a shareCard means this clip IS a game
                // recap (MLB.com recap / condensed), and MLB bakes the result
                // into its poster frame — a celebration still, a walk-off swing,
                // sometimes the linescore. autoPlay only paints the first video
                // frame once the stream decodes, so that poster FLASHES the
                // outcome for a beat before playback covers it, which is exactly
                // the spoiler this app exists to prevent. Drop it for game
                // recaps (the black frame beneath is spoiler-free and lasts a
                // few hundred ms) and keep it for news clips, whose posters are
                // the item's own picture and carry no result. This is the
                // no-extra-tap version of the reverted reveal overlay (5131079f
                // → f498eaf5): no gate to click, just no spoiler frame.
                poster={shareCard ? undefined : (proxyImage(poster) ?? undefined)}
              />
            ) : (
              <iframe
                ref={iframeRef}
                src={withAutoplay(embedUrl!)}
                // Spoiler-safe accessible name — see the <video> note above and
                // the dialog's aria-label: the PeekBlur'd headline can carry a
                // score, so an iframe `title` set to it would announce the
                // spoiler unblurred to screen readers. Use the generic label.
                title="Video player"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            )}
            {hlsMode && autoplayPrompt}
            {/* Direct-stream load failure — a pulled/geo-blocked clip (common on
                r/soccer, whose goal clips rotate through fragile external hosts
                and get taken down fast) 403/404s its segments while the manifest
                still parses, so the native player would just spin forever. Cover
                that with a clean prompt + a jump to the source, mirroring the
                YouTube ytFailed overlay. */}
            {hlsMode && mediaFailed && (
              <div
                className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center"
                style={{ background: "#000" }}
                onClick={(e) => e.stopPropagation()}
              >
                <svg aria-hidden="true" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p className="text-white/85 text-sm sm:text-base font-medium max-w-xs leading-snug">This clip can’t play here — it may have been removed or blocked at the source.</p>
                <button
                  type="button"
                  onClick={() => openExternal(sourceShareUrl || fallbackUrl)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-105 cursor-pointer"
                  style={{ background: "var(--accent)" }}
                >
                  {linkLabel}
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                </button>
              </div>
            )}
          </div>
          </div>
        )}
        {/* Footer — headline + source/copy actions. The pre-7/13 look Jacob
            wants (confirmed 7/14): normal-weight headline + bare underlined
            links, NOT the medium-weight + pill styling. The published-time note
            ("17h ago") is dropped — byline still shows where a source provides
            one (Reddit posts have none, so nothing renders). */}
        {!textMode && headline && (
          <div className="mt-3 text-center px-2">
            {/* Only the text itself swallows the click (so selecting the headline
                doesn't close); the surrounding strip stays a dismiss target. */}
            <PeekBlur key={`f-${postKey}`} peek={headlinePeek} onToggle={toggleHeadlinePeek} keyShortcut="h" tag="p" className="text-sm sm:text-base text-white/90 leading-snug">{headline}</PeekBlur>
            {byline && (
              <ArticleMeta byline={byline} published={null} className="text-xs text-white/40 mt-1" />
            )}
          </div>
        )}
        {!(ytMode && controlsHidden) && (
        <div className={`${textMode ? "mt-4" : "mt-3"} flex items-center justify-center gap-3`}>
          {/* Only render the source link when there's a real URL. For a text/
              image post with no YouTube id and no fallbackUrl, sourceShareUrl is
              "", and an href="#" + target="_blank" would open a useless blank
              tab. Guard it the same way the "Copy link" button below guards on
              shareUrl, so only the strictly-broken URL-less case is dropped. */}
          {sourceShareUrl && (
            <a
              href={sourceShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              // Route through handleExternalClick so a YouTube sourceShareUrl
              // deep-links into the installed YouTube app on native (matching
              // the sibling "Open on…" buttons above that already call
              // openExternal) instead of opening the in-app browser. The helper
              // still stopPropagation()s — so the click doesn't dismiss the
              // modal — and leaves modifier/middle-clicks to the browser.
              onClick={handleExternalClick(sourceShareUrl)}
              className="text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2"
            >
              {(hlsMode || embedMode || imageMode || textMode) ? linkLabel : "Watch on YouTube"}
            </a>
          )}
          {shareUrl && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); copyLink(); }}
                className="text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2 cursor-pointer"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              {/* The "Copied ✓" swap on the button above is a visual-only
                  confirmation — a screen reader activating "Copy link" gets no
                  cue the copy landed. Voice it through a dedicated sr-only live
                  region (WCAG 4.1.3 Status Messages), matching the same
                  role="status" aria-live="polite" pattern the news/video strips
                  and FeedbackBox already use. The region mounts empty with the
                  button (before any copy), so the text change is announced. */}
              <span role="status" aria-live="polite" className="sr-only">
                {copied ? "Link copied" : ""}
              </span>
            </>
          )}
        </div>
        )}

        {/* Image posts navigate by swipe on mobile (no bottom buttons) so the
            photo gets the full screen; video/text keep the labelled buttons. */}
        {/* Image posts used to page by swipe only, with nothing on screen to
            say so — an Instagram screenshot filled the phone and looked like a
            dead end. Swipe still works; the buttons just make it visible. */}
        {mobilePager}
        {desktopPager}
      </div>
      </div>
    </div>
  );
}
