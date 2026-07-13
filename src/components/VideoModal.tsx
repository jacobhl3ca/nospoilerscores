"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/youtube";
import { formatPublished, proxyImage } from "@/lib/news";
import { isScoreSpoiler } from "@/lib/spoilers";
import { shareCardUrl, buildHighlightShareUrl, type ShareCardMeta } from "@/lib/shareCard";
import { getTimeZone } from "@/lib/etDay";

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
  // Reddit news only: page to the previous / next post in the same column
  // without closing the modal. Absent means no pager controls.
  onPrev?: () => void;
  onNext?: () => void;
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
    elementId: string,
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
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
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
function PeekBlur({ tag = "div", className, style, children }: {
  tag?: "div" | "h2" | "p";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [peek, setPeek] = useState(false);
  const Tag = tag as React.ElementType;
  const cls = `news-title${peek ? " peek" : ""}${className ? ` ${className}` : ""}`;
  const toggle = () => setPeek((p) => !p);
  return (
    <Tag
      className={cls}
      style={style}
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
      title={peek ? "Tap to blur" : "Tap to reveal"}
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

export default function VideoModal({ videoId, fallbackUrl, onClose, playbackUrl, poster, imageUrl, embedUrl, sourceLabel, headline, byline, published, body, shareCard, maskVideoTitle = true, maskVideoBottom = true, youtubeNativeControls = false, seekControl = "both", seekFill = "off", allowEnd = false, warnHalfway = false, onPrev, onNext }: VideoModalProps) {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Horizontal swipe on the image lightbox → prev/next post (mobile parity with
  // the bottom Prev/Next buttons and the desktop ← → keys).
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
    if (dx < 0) onNext?.(); else onPrev?.();
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
  const linkLabel = sourceLabel ? `Open on ${sourceLabel}` : sourceLabelFromUrl(fallbackUrl);
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
    const p = playerRef.current;
    const d = p?.getDuration?.() ?? 0;
    const cur = d > 0 ? (p?.getCurrentTime?.() ?? 0) / d : 0;
    if (warnHalfway && targetFrac > 0.5 && cur <= 0.5) {
      setPendingSeek({ run, pct: Math.round(targetFrac * 100) });
      return;
    }
    run();
  }, [warnHalfway]);

  // Jump to a fraction of the clip. Works off the YouTube player's reported
  // duration so no timeline is ever revealed.
  const seekToPct = useCallback((pct: number) => {
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
  }, [seekCap, guardSeek]);

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
    const p = playerRef.current;
    if (!p?.getDuration || !p?.seekTo) return;
    const d = p.getDuration();
    if (!d || d <= 0) return;
    const t = p.getCurrentTime?.() ?? 0;
    const target = delta >= 0 ? Math.min(t + delta, d) : Math.max(0, t + delta);
    p.seekTo(target, true);
    p.playVideo?.();
    setProgress(Math.min(1, target / d));
  }, []);

  // Toggle play/pause on the YouTube player — drives both the Space/k keys and a
  // click anywhere on the video (via the click-catcher overlay). We do it through
  // the API rather than letting the click reach the iframe so that focus never
  // enters the cross-origin frame; if it did, every later keystroke (Esc, f, the
  // arrows, Space) would be swallowed by YouTube instead of reaching this modal.
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p?.getPlayerState) return;
    const PLAYING = (window as unknown as { YT?: { PlayerState?: { PLAYING?: number } } }).YT?.PlayerState?.PLAYING ?? 1;
    if (p.getPlayerState() === PLAYING) p.pauseVideo?.();
    else p.playVideo?.();
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

  // Persist the volume level so it carries across clips and sessions.
  useEffect(() => {
    try { localStorage.setItem("hs.videoVolume", String(volume)); } catch { /* ignore */ }
  }, [volume]);
  // Clear the idle-cursor timer on unmount.
  useEffect(() => () => { if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current); }, []);

  // Toggle mute on the YouTube player. Un-muting restores the slider's level
  // (or 100 if it was dragged to 0).
  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) {
      const v = volume > 0 ? volume : 100;
      p.unMute?.(); p.setVolume?.(v); setVolume(v); setMuted(false);
    } else {
      p.mute?.(); setMuted(true);
    }
  }, [muted, volume]);

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

  // Toggle fullscreen. For YouTube we expand the WRAPPER (so the spoiler mask
  // and control bar ride along and the title stays hidden); native element
  // fullscreen first, CSS-overlay fallback on iOS where it's unavailable.
  // HLS/embed keep plain element fullscreen — those have no spoiler title.
  const toggleFullscreen = useCallback(() => {
    if (!ytMode) {
      if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
      const el = (hlsMode ? videoRef.current : embedMode ? iframeRef.current : null) as
        (HTMLElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void }) | null;
      if (!el) return;
      if (typeof el.requestFullscreen === "function") el.requestFullscreen().catch(() => {});
      else if (typeof el.webkitEnterFullscreen === "function") el.webkitEnterFullscreen();
      else if (typeof el.webkitRequestFullscreen === "function") el.webkitRequestFullscreen();
      return;
    }
    if (fakeFs) { setFakeFs(false); return; }
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    const wrap = fsWrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!wrap) return;
    if (typeof wrap.requestFullscreen === "function") {
      wrap.requestFullscreen().catch(() => setFakeFs(true));
    } else if (typeof wrap.webkitRequestFullscreen === "function") {
      wrap.webkitRequestFullscreen();
    } else {
      setFakeFs(true); // iOS Safari / WKWebView — no element fullscreen
    }
  }, [ytMode, hlsMode, embedMode, fakeFs]);

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

  // Keep nativeFs in sync with the browser, and remember when we left so a
  // co-delivered Escape doesn't also close the modal.
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement) ?? null;
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
      // ←/→: step to the previous/next video when sibling navigation is
      // available (Reddit news columns pass onPrev/onNext — same as the on-screen
      // side arrows). Otherwise they skip ±5s on the YouTube player. Don't steal
      // arrows from text entry or modified chords.
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
        else if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
        else if (ytMode) { e.preventDefault(); seekBy(e.key === "ArrowLeft" ? -SEEK_STEP : SEEK_STEP); }
      }
      // Space (or "k", YouTube's own key) toggles play/pause on the YT clip.
      // preventDefault stops Space from scrolling the page. Skip text entry and
      // any focused button/link so Space still activates them normally.
      if ((e.key === " " || e.code === "Space" || e.key === "k" || e.key === "K") && ytMode && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "A" || t.isContentEditable)) return;
        e.preventDefault();
        togglePlay();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, fakeFs, nativeFs, toggleFullscreen, ytMode, seekBy, togglePlay, onPrev, onNext]);

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
    let hls: InstanceType<typeof import("hls.js").default> | null = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return;
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
          return;
        }
      } catch { /* non-URL fallback strings proceed through the normal path */ }
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
      // #yt-player mount is gone, so `new YT.Player("yt-player", …)` would build
      // against a missing element and throw. Bail if the mount is no longer there.
      if (!document.getElementById("yt-player")) return;
      playerRef.current = new YT.Player("yt-player", {
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
              if (t) setTitleSafe(!isScoreSpoiler(t));
            } catch { /* keep covered */ }
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
          onStateChange: (event: YTPlayerEvent) => {
            // Playback actually started — kill the watchdog.
            if ((event.data === 1 || event.data === 3) && watchdogRef.current) {
              window.clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            if (event.data === 1) {
              forceBest(event.target);
              // By PLAYING the title metadata is reliably populated — re-run the
              // spoiler check in case getVideoData() was empty at onReady.
              try {
                const t = event.target.getVideoData?.()?.title ?? "";
                if (t) setTitleSafe(!isScoreSpoiler(t));
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
      if (playerRef.current?.destroy) playerRef.current.destroy();
      // Drop the reference to the just-destroyed instance so the position poll
      // (which re-subscribes on ytMode, not currentId) can't call methods on it
      // during a fallback swap before the replacement player is built.
      playerRef.current = null;
    };
  }, [currentId, fallbackUrl, hlsMode, embedMode, imageMode, textMode, youtubeNativeControls]);

  // Shared sizing for the YT video region + control bar so both line up and,
  // in fullscreen, the video is capped to leave room for the bar underneath.
  // Space reserved below the fullscreen video for the control bar — drops to a
  // sliver when the controls are hidden so the video fills (mobile fullscreen).
  const FS_BAR_RESERVE = controlsHidden ? 8 : 64;
  const fsMediaWidth = `min(100vw, calc((100vh - ${FS_BAR_RESERVE}px) * 16 / 9))`;
  const btnBase = "flex items-center justify-center rounded-md text-white/55 hover:text-white transition-colors cursor-pointer";

  const hasPager = !!(onPrev || onNext);
  // Cap the media (image / HLS / YouTube alike) so the media + the headline /
  // byline / Open-on / Copy-link row + the pinned Prev/Next pager ALL fit the
  // viewport with no page scroll and nothing overlapping the pager (Jacob 7/7).
  // dvh tracks the real viewport under mobile browser chrome; the reserve grows
  // when the pager is present. This replaces the old per-mode 78vh/85vh/168px
  // caps that left too little room on short windows and clipped the footer.
  // imageMode no longer has a Close row above the media (Close overlays the
  // image), but its headline can wrap to 2+ lines and sits above the byline +
  // Copy-link row + the pager — so reserve enough below that the footer never
  // clips off the bottom edge (Jacob 7/11). A touch more when a pager is present.
  const mediaMaxH = imageMode
    ? (hasPager ? "min(80vh, 100dvh - 13rem)" : "min(88vh, 100dvh - 8rem)")
    : (hasPager ? "min(78vh, 100dvh - 15rem)" : "min(85vh, 100dvh - 10rem)");
  const mediaFrameWidth = fsActive ? fsMediaWidth : `min(100%, calc(${mediaMaxH} * 16 / 9))`;
  const ytFrameWidth = mediaFrameWidth;

  // Reddit prev/next paging: phones keep labelled bottom buttons for thumb
  // reach; desktop gets subtle side chevrons so the footer links never overlap.
  const mobilePager = hasPager ? (
    <div className="fixed left-1/2 -translate-x-1/2 z-[60] flex sm:hidden items-center justify-center gap-2" style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={(e) => { e.stopPropagation(); onPrev?.(); }} disabled={!onPrev} aria-label="Previous post" title="Previous post"
        className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold text-white/90 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.25)" }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Prev
      </button>
      <button onClick={(e) => { e.stopPropagation(); onNext?.(); }} disabled={!onNext} aria-label="Next post" title="Next post"
        className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold text-white/90 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.25)" }}>
        Next
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  ) : null;
  const desktopPager = hasPager ? (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
        disabled={!onPrev}
        aria-label="Previous post"
        title="Previous post"
        className="hidden sm:flex fixed left-4 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onNext?.(); }}
        disabled={!onNext}
        aria-label="Next post"
        title="Next post"
        className="hidden sm:flex fixed right-4 top-1/2 -translate-y-1/2 z-[60] w-11 h-11 items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </>
  ) : null;

  return (
    <div
      // Media modes (image / video) are capped to fit the viewport, so they
      // never scroll — only a long Reddit text post scrolls (its card scrolls
      // internally, and the wrapper below can grow past the viewport for it).
      className={textMode ? "fixed inset-0 overflow-y-auto" : "fixed inset-0 overflow-hidden"}
      style={{ zIndex: 9999 }}
      onClick={onClose}
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
        // of it (Jacob 7/11). Mobile keeps its bottom Prev/Next buttons, so no
        // side gutter needed there.
        className={`relative flex min-h-full items-center justify-center p-4 ${hasPager ? "sm:px-20 sm:py-8" : "sm:p-8"}${hasPager ? " pb-[calc(env(safe-area-inset-bottom)+4.5rem)]" : ""}`}
      >
      {/* Content — clicks bubble to onClose so tapping the image, headline,
          or any whitespace around them dismisses. The video player and CC
          button stop propagation themselves so playback controls keep working. */}
      <div
        className="group relative w-full max-w-7xl" /* PROTOTYPE 6/2: 6xl→7xl modal-width lever (Safari/iOS quality). Revert to max-w-6xl if the desktop trade-off isn't worth it. */
        style={{ zIndex: 1 }}
        role="dialog"
        aria-modal="true"
        // Keep the dialog's accessible name in sync with what it's actually
        // showing — this same modal also serves an image lightbox (imageMode)
        // and a Reddit text-post preview (textMode), so a static "Video player"
        // mislabels both for screen readers. Don't surface the headline here:
        // it's deliberately spoiler-blurred (PeekBlur) because it can carry a
        // score, and an accessible name would read it aloud unblurred.
        aria-label={imageMode ? "Image viewer" : textMode ? "Post" : "Video player"}
      >
        {/* Reddit prev/next post paging now renders as a labelled row BELOW the
            media (see `pager`, inserted after the player) instead of overlaid on
            the video — keeps mobile footage/dismiss/seek zones clear. */}
        {/* Text posts can be taller than the viewport, so keep their close affordance
            pinned. Media modes render their controls in-flow above the frame below. */}
        {textMode && <button
          onClick={onClose}
          className="fixed z-[70] w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white bg-black/45 hover:bg-black/65 border border-white/15 transition-colors cursor-pointer"
          style={{ top: "calc(env(safe-area-inset-top) + 0.6rem)", right: "0.75rem" }}
          aria-label="Close"
          title="Close (Esc)"
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>}

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
              <button
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
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
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
          // Container hugs the rendered image (w-fit) so the Close button and the
          // rounded frame sit on the ACTUAL content edges for any aspect ratio —
          // no black margin between the chrome and a portrait/landscape photo.
          <div
            ref={containerRef}
            className="relative mx-auto w-fit max-w-full rounded-lg overflow-hidden bg-black"
            style={{ maxHeight: mediaMaxH }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyImage(imageUrl!)}
              alt=""
              decoding="async"
              className="block max-w-full object-contain"
              style={{ maxHeight: mediaMaxH }}
              draggable={false}
              onError={() => setImgFailed(true)}
            />
            {/* Close pinned to the image's own top-right corner. */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white bg-black/50 hover:bg-black/70 border border-white/20 transition-colors cursor-pointer"
              aria-label="Close"
              title="Close (Esc)"
            >
              <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : textMode ? (
          // Text-post preview card — Reddit headline-only posts (or any item
          // whose image failed to load) get a clean card layout instead of
          // an empty lightbox. Everything stays on hidescore until the user
          // hits the "Open on …" button at the bottom.
          <div ref={containerRef} className="relative w-full rounded-lg p-6 sm:p-8 overflow-y-auto" style={{ maxHeight: mediaMaxH, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {sourceLabel && (
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>{sourceLabel}</p>
            )}
            {headline && (
              <PeekBlur tag="h2" className="text-lg sm:text-2xl font-semibold leading-snug mb-3" style={{ color: "var(--text)" }}>{headline}</PeekBlur>
            )}
            <ArticleMeta byline={byline} published={published} className="text-xs sm:text-sm" style={{ color: "var(--text-muted)" }} />
            {body && (
              <PeekBlur
                className="text-sm sm:text-base leading-relaxed mt-4 pt-4"
                style={{ color: "var(--text)", borderTop: "1px solid var(--border)" }}
              >
                {renderRedditBody(body)}
              </PeekBlur>
            )}
          </div>
        ) : ytMode ? (
          // YouTube clip. The wrapper is what we fullscreen (so the mask + the
          // control bar come along and the title stays covered in fullscreen).
          <div
            ref={fsWrapRef}
            // A click on the dark margin BESIDE the centred video (target is this
            // wrapper itself, not a child) dismisses when not fullscreen; clicks
            // bubbling up from the player/controls still stop here so they keep
            // working. The video surface stops propagation in handleSurfaceTap.
            onClick={(e) => { if (!fsActive && e.target === e.currentTarget) onClose(); else e.stopPropagation(); }}
            style={fsActive ? {
              position: "fixed", inset: 0, zIndex: 10000, background: "#000",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            } : undefined}
          >
            {/* YouTube modal controls sit above the player, right-aligned, so they
                don't cover the iframe or collide with YouTube's own overlay. */}
            <div
              className="mb-2 flex items-center justify-end gap-1.5"
              style={{ width: ytFrameWidth }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
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
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
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
              <div id="yt-player" className="absolute inset-0 w-full h-full" />
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
                  let them reach the iframe so YT's own play/seek/fullscreen work. */}
              {!youtubeNativeControls && (
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
              {maskVideoTitle && !titleSafe && (
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
              <button
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
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingSeek(null); }}
                      className="px-3 py-1.5 rounded-md text-sm font-medium text-white/80 hover:text-white cursor-pointer"
                      style={{ border: "1px solid rgba(255,255,255,0.3)" }}
                    >
                      Cancel
                    </button>
                    <button
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
                <button
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
                  <button
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
                    <button
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
                    <button
                      key={`d${p}`}
                      onClick={(e) => { e.stopPropagation(); seekToPct(p); }}
                      className={`hidden lg:flex items-center justify-center rounded-md transition-colors cursor-pointer h-7 px-1.5 text-xs font-medium ${p >= 80 ? "text-white/25 hover:text-white/55" : "text-white/55 hover:text-white"}`}
                      aria-label={`Jump to ${p}%`}
                      title={`Jump to ${p}%`}
                    >
                      {p}%
                    </button>
                  ))}
                  <button
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
              <button
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
          <div ref={containerRef} className="group relative mx-auto w-full rounded-lg overflow-hidden bg-black" style={{ width: mediaFrameWidth, aspectRatio: "16 / 9" }} onClick={(e) => e.stopPropagation()}>
            {hlsMode ? (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full"
                controls
                autoPlay
                muted
                playsInline
                aria-label={headline || "Video player"}
                poster={proxyImage(poster) ?? undefined}
              />
            ) : (
              <iframe
                ref={iframeRef}
                src={withAutoplay(embedUrl!)}
                title={headline || "Video player"}
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
            {/* Only the text itself swallows the click (so selecting the headline
                doesn't close); the surrounding whitespace strip stays a dismiss
                target, so a tap just below the video exits instead of dead-zoning. */}
            <PeekBlur tag="p" className="text-sm sm:text-base text-white/90 leading-snug">{headline}</PeekBlur>
            <ArticleMeta byline={byline} published={published} className="text-xs text-white/40 mt-1" />
          </div>
        )}

        {/* Direct link + copy — branded per source so users know where the
            link goes; the copy button gives iOS the same grab-the-URL that
            the browser's right-click menu does on the web. Hidden with the rest
            of the chrome when the YT controls are collapsed. */}
        {!(ytMode && controlsHidden) && (
        <div className={`${textMode ? "mt-4" : "mt-3"} flex items-center justify-center gap-3`}>
          <a
            href={sourceShareUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-white/40 hover:text-white/60 transition-colors underline underline-offset-2"
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
        )}

        {mobilePager}
        {desktopPager}
      </div>
      </div>
    </div>
  );
}
