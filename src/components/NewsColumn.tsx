"use client";

import { useEffect, useRef, useState } from "react";
import { Sport } from "@/lib/types";
import { NewsItem, proxyImage } from "@/lib/news";
import { handleExternalClick } from "@/lib/openExternal";

export interface NewsSource {
  label: string;
  fetch: () => Promise<NewsItem[]>;
  logoUrl?: string;
  variant?: "text" | "video";
  youtubeChannel?: string;
}

// Single source of truth for the modal-trigger payload — used by TextRow,
// VideoSourceCard, AlignedVideoStrip, and HomeContent so adding a field
// doesn't require fanning out a 6-place rename.
export interface PlayOpts {
  videoId?: string;
  playbackUrl?: string | null;
  // Brightcove iframe URL (NHL videos) — modal renders it in embedMode.
  embedUrl?: string | null;
  imageUrl?: string | null;
  fallbackUrl: string;
  poster?: string | null;
  sourceLabel?: string | null;
  headline?: string | null;
  byline?: string | null;
  published?: string | null;
  // Selftext body (Reddit text posts). Only populated when there's no media
  // — rendered in the modal's textMode card below the headline.
  body?: string | null;
  // For Reddit columns: the column's other posts as ready-to-play payloads, plus
  // this post's index — lets the modal page ‹ prev / next › without closing.
  // Unset for non-Reddit sources (so the arrows only show in Reddit columns).
  siblings?: PlayOpts[] | null;
  index?: number;
}
export type PlayHandler = (opts: PlayOpts) => void;

// Build the modal payload for a news item. Single source of truth so TextRow
// (click) and HomeContent (prev/next paging) produce identical payloads.
// A "text post" is a headline-only item with no pic/video (no thumbnail,
// inline clip, YouTube id, or Brightcove embed). Blur is for pics/videos, so
// these are hidden-by-default and gated behind the "Show text posts" toggle
// (see .news-textpost / .show-text-posts in globals.css).
export function itemIsTextPost(item: NewsItem): boolean {
  return !(item.videoUrl || item.imageFullUrl || item.imageUrl || item.youtubeVideoId || item.embedUrl);
}

export function newsItemToPlayOpts(item: NewsItem): PlayOpts {
  const isReddit = !!item.section?.startsWith("r/");
  return {
    playbackUrl: item.videoUrl || null,
    videoId: item.youtubeVideoId || undefined,
    imageUrl: (item.videoUrl || item.youtubeVideoId) ? null : (item.imageFullUrl || (isReddit && item.imageUrl) || null),
    fallbackUrl: item.articleUrl,
    poster: item.imageUrl || null,
    sourceLabel: item.section || null,
    headline: item.headline,
    byline: item.byline || null,
    published: item.published || null,
    body: item.body || null,
  };
}

interface NewsColumnProps {
  title: string;
  sources: NewsSource[];
  // League swap selector — click the title to pick a different league.
  // Callback receives undefined for Auto (revert to default) and "empty" to
  // hide the column entirely.
  swappableOptions?: { sport: Sport; label: string }[];
  shownElsewhere?: Sport[];
  selectedSport?: Sport;
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // Switch this column to the ESPN "Top news" headlines feed (see NewsColumnTitle).
  onPickEspn?: () => void;
  espnActive?: boolean;
  // When true, the column renders only its source cards — the title row is
  // rendered separately above (e.g. as part of the page-level TitleStrip
  // that sits above AlignedVideoStrip). Keeps the league title above the
  // big-format video strip instead of buried below it.
  hideTitle?: boolean;
  // Override the default narrow column width (e.g. for single-column mode).
  // When omitted, falls back to the standard 225/280px max.
  widthClassName?: string;
  // Video card click → open inline player modal. Called only when the item
  // has either a direct HLS stream (MLB) or a prebake-validated YouTube ID.
  // Receives the full playback payload so the modal can pick the right player.
  onPlayVideo?: PlayHandler;
}

// Sticky league title (with optional swap dropdown for the 3rd column).
// Extracted so HomeContent can render a row of these above AlignedVideoStrip
// — keeps "MLB / NBA / News" above the big video strip instead of below it.
export function NewsColumnTitle({
  title,
  swappableOptions,
  shownElsewhere,
  selectedSport,
  onSwapLeague,
  onPickEspn,
  espnActive,
}: {
  title: string;
  swappableOptions?: { sport: Sport; label: string }[];
  shownElsewhere?: Sport[];
  selectedSport?: Sport;
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // Switch this column to the ESPN "Top news" headlines feed. Provided for
  // every news column so the feed is always one tap away, even after slot 3
  // was emptied (it reappears as the last column).
  onPickEspn?: () => void;
  espnActive?: boolean;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const swapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!swapOpen) return;
    const onAway = (e: MouseEvent) => {
      if (swapRef.current && !swapRef.current.contains(e.target as Node)) {
        setSwapOpen(false);
      }
    };
    // Keyboard parity with the app's other dropdowns/modals: Escape dismisses
    // the popup the swap button promises via aria-haspopup.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwapOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [swapOpen]);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;
  return (
    <div
      className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30"
      style={{ background: "var(--bg)", paddingTop: "1.75rem" }}
    >
      <div className="relative flex items-center justify-center px-6 w-full">
        {isSwappable ? (
          <div ref={swapRef} className="relative">
            <button
              type="button"
              onClick={() => setSwapOpen(!swapOpen)}
              className="cursor-pointer transition-colors hover:opacity-80"
              style={{ color: "var(--text)" }}
              title="Switch news league"
              aria-haspopup="true"
              aria-expanded={swapOpen}
            >
              <h2 className="text-base sm:text-lg font-bold tracking-wide">{title}</h2>
            </button>
            {swapOpen && (
              <div
                className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                {/* Auto reverts to the in-season default for this slot. */}
                <button
                  onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                  className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Auto
                </button>
                {swappableOptions!.map((opt) => {
                  const isCurrent = opt.sport === selectedSport;
                  const isElsewhere = !isCurrent && !!shownElsewhere?.includes(opt.sport);
                  return (
                    <button
                      key={opt.sport}
                      onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{
                        color: isCurrent ? "var(--accent)" : isElsewhere ? "var(--text-muted)" : "var(--text)",
                        fontWeight: isCurrent ? 600 : 400,
                      }}
                      title={isElsewhere ? "Already shown in another column" : undefined}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {/* Top news = ESPN's cross-sport headlines feed. Sits in its
                    own group so it reads as a distinct choice from the leagues
                    and is always reachable (re-adds the column if it was gone). */}
                {onPickEspn && (
                  <button
                    onClick={() => { onPickEspn(); setSwapOpen(false); }}
                    className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                    style={{
                      color: espnActive ? "var(--accent)" : "var(--text)",
                      fontWeight: espnActive ? 600 : 400,
                      borderTop: "1px solid var(--border)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Top news (ESPN)
                  </button>
                )}
                {/* Remove col hides the column entirely (matches the scores-view
                    behavior). User re-adds via the + button on scores or via
                    the focus pill. */}
                <button
                  onClick={() => { onSwapLeague!("empty"); setSwapOpen(false); }}
                  className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    borderTop: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Remove col
                </button>
              </div>
            )}
          </div>
        ) : (
          <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
            {title}
          </h2>
        )}
      </div>
      <span
        className="text-[9px] sm:text-[10px] italic mt-0.5 block"
        style={{ color: "transparent" }}
      >
        {"\u00A0"}
      </span>
    </div>
  );
}

function SourceHeader({ label, logoUrl }: { label: string; logoUrl?: string }) {
  const mobileLabel = stripLeaguePrefixForMobile(label);
  return (
    // Outer wrapper carries sticky + page bg so the corner triangles outside
    // the inner div's rounded-t-lg curve fill with var(--bg) (matching the
    // title row above) instead of showing scrolling content through. At
    // non-sticky state the card's rounded-lg overflow-clip masks the wrapper
    // corners so the page bg never bleeds into the card visual.
    <div
      className="news-source-sticky-top sticky z-20"
      style={{ background: "var(--bg)" }}
    >
      {/* borderTop renders the pinned-bar top edge once the parent card's own
          borderTop has scrolled off-screen. At natural state both borderTops
          stack adjacent — 2px line on a faint rgba(...,0.1) border, accepted
          as the lesser evil vs. an unbordered pinned bar at scroll. */}
      <div
        className="rounded-t-lg px-3 py-2.5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wide"
        style={{ color: "var(--text)", background: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            loading="lazy"
            width={24}
            height={24}
            className="w-6 h-6 object-contain shrink-0"
            draggable={false}
            // These source marks are remote (ESPN CDN + Wikimedia hotlinks for
            // NCAA/ITF), so a 404 or blocked hotlink would otherwise leave the
            // browser's broken-image glyph in the sticky header. Hide it so the
            // header degrades to its always-present label text, matching the
            // thumbnail onError guards elsewhere in this file.
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        {mobileLabel !== label ? (
          <>
            <span className="sm:hidden">{mobileLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </div>
  );
}

// Strip league/network tokens from the source label on narrow screens so the
// logo + remaining text isn't redundant. Repeats so "ESPN NBA" → "" → keep
// original. Empty after strip falls back to the full label.
function stripLeaguePrefixForMobile(label: string): string {
  let s = label;
  for (let i = 0; i < 3; i++) {
    const m = s.match(/^(?:NBA|MLB|NHL|NFL|EPL|MLS|UCL|UEL|NCAAM|NCAAW|NCAAF|ESPN|GOLF|TENNIS|F1|WNBA)\s+/i);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  s = s.trim();
  return s || label;
}

function TextSourceCard({ label, logoUrl, items, loading, onPlay }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler }) {
  // Reddit columns get prev/next paging — precompute every post's payload once
  // so each row hands the modal its siblings without rebuilding N× per row.
  const redditSiblings = items[0]?.section?.startsWith("r/") ? items.map(newsItemToPlayOpts) : null;
  // When every row is a text post (e.g. an all-text ESPN/MLB.com headlines
  // card), collapse the whole card while text posts are hidden — otherwise a
  // bare header with no rows would sit there. Mixed cards keep the header and
  // just hide their individual text rows.
  const allText = items.length > 0 && items.every(itemIsTextPost);
  return (
    // overflow-clip (not overflow-hidden) so position: sticky on SourceHeader
    // pins to the window, not to this card. overflow-hidden establishes a
    // scroll container; overflow-clip doesn't.
    // box-shadow inset (not actual borders) so the SourceHeader's rounded-t-lg
    // + borderTop overlaps the parent's top edge as a single 1px line —
    // real borders push the inner 1px inward, creating nested curves at top.
    <div
      className={`rounded-lg overflow-clip${allText ? " news-card-alltext" : ""}`}
      style={{ background: "var(--bg-card)", boxShadow: "inset 0 0 0 1px var(--border)" }}
    >
      <SourceHeader label={label} logoUrl={logoUrl} />
      {loading ? (
        // Screen readers get an announced loading status; the pulsing row
        // placeholders are purely decorative (empty styled divs), so they're
        // aria-hidden and only the sr-only text is voiced (WCAG 4.1.3, matching
        // the role=status skeleton in HomeContent's games column).
        <div role="status" aria-live="polite" className="flex flex-col">
          <span className="sr-only">Loading headlines…</span>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} aria-hidden="true" className="px-3 py-2 animate-pulse" style={{ borderTop: i === 1 ? "none" : "1px solid var(--border)" }}>
              <div className="h-3 w-full rounded" style={{ background: "var(--bg-card-hover)" }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No headlines</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => (
            <TextRow key={item.id} item={item} isFirst={idx === 0} onPlay={onPlay} siblings={redditSiblings} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

// One row in a TextSourceCard — encapsulated so it can hold an image-failed
// useState. When the thumbnail fails to load (Firefox + Reddit
// external-preview image is the live offender — Reddit serves WebP with
// `Content-Type: image/jpeg` and Firefox sometimes refuses to render the
// mismatch) we drop the thumb container entirely so the row degrades to
// clean text instead of showing an empty grey placeholder box.
function TextRow({ item, isFirst, onPlay, siblings, index }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler; siblings?: PlayOpts[] | null; index?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  // sm:min-h-[7rem] forces a uniform row height across every text source card
  // — Reddit, MLB.com, NBA.com, ESPN-league. With identical row heights AND
  // identical item counts (each prebake caps at 12), card N ends at the same
  // vertical position in every column, giving the row-by-row alignment Jacob
  // asked for. 7rem ≈ 5 text-sm lines (line-clamp-5 cap) + py-2 padding, so a
  // max-length headline fits without truncation while shorter ones sit at the
  // top with a small blank below.
  // No min-height on phones: mobile is a single merged feed, so the
  // cross-column row alignment the floor buys is moot — it just leaves a tall
  // empty box under short headlines. Let rows hug their text on mobile; keep
  // the floor at sm+ where the 3 columns align. text-sm (not text-xs) on
  // mobile too — the phone is the primary surface, so size headlines for
  // readability rather than to pack the narrow desktop column.
  // Text posts (no pic/video) are hidden while headlines are blurred and shown
  // (readable, unblurred) once "Show text posts" is on — so they carry the
  // .news-textpost marker and their headline skips the .news-title blur.
  const isTextPost = itemIsTextPost(item);
  const rowCls = `flex items-start gap-2 px-3 py-2 text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)] sm:min-h-[7rem]${isTextPost ? " news-textpost" : ""}`;
  const titleCls = `${isTextPost ? "" : "news-title "}min-w-0 line-clamp-5`;
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)" };
  // Reddit posts always pop the modal so the user can read the post (and any
  // attached photo / video) without leaving hidescore. Other sources (ESPN
  // top headlines, MLB.com etc.) only pop the modal when there's actual
  // media — text-only article rows still anchor straight to the source.
  const isReddit = !!item.section?.startsWith("r/");
  const hasMedia = !!(item.videoUrl || item.imageFullUrl || item.imageUrl);
  const shouldPopModal = !!onPlay && (isReddit || hasMedia);
  const hasInlineMedia = !!(item.videoUrl || item.imageFullUrl || item.youtubeVideoId);
  const showThumb = !!item.imageUrl && !imgFailed;
  const thumb = showThumb ? (
    <div
      className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded overflow-hidden"
      style={{ background: "var(--bg-card-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyImage(item.imageUrl!)}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        draggable={false}
        onError={() => setImgFailed(true)}
      />
      {hasInlineMedia && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
            {(item.videoUrl || item.youtubeVideoId) ? (
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  ) : hasInlineMedia ? (
    // Video/embed with NO poster (r/soccer goal clips resolve a playable videoUrl
    // but redlib/the clip host often gives no thumbnail). Without this they fell
    // through to the tiny league logo and read as plain text — so the clips looked
    // "missing" even though they play on tap (Jacob 6/18). Render a play-badge tile
    // so a posterless video still clearly reads as a video.
    <div
      className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded overflow-hidden flex items-center justify-center"
      style={{ background: "var(--bg-card-hover)" }}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
        {(item.videoUrl || item.youtubeVideoId) ? (
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        ) : (
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </div>
    </div>
  ) : item.leagueLogo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.leagueLogo}
      alt=""
      loading="lazy"
      width={18}
      height={18}
      className="w-[18px] h-[18px] object-contain shrink-0 mt-px"
      draggable={false}
      // Remote league mark (ESPN CDN); a 404/blocked hotlink would otherwise
      // leave the browser's broken-image glyph. Hide it so the card degrades to
      // its label text, matching SourceHeader's logoUrl onError guard above.
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  ) : null;
  if (shouldPopModal) {
    return (
      <button
        onClick={(e) => {
          // Cmd/Ctrl/Shift/middle-click → "open in background tab to read
          // later" — never blow away the currently-open modal. Without this
          // the button just re-pops the modal with new content and the user
          // loses the video/image they were watching.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
            if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
            return;
          }
          // Same payload via the shared helper, plus the column's siblings so the
          // modal can page prev/next (Reddit columns only — siblings is null else).
          onPlay!({ ...newsItemToPlayOpts(item), siblings: siblings ?? undefined, index });
        }}
        onAuxClick={(e) => {
          // Middle-click fires onAuxClick, not onClick. Mirror the modifier
          // path so wheel-click also opens in a background tab.
          if (e.button === 1 && item.articleUrl) {
            window.open(item.articleUrl, "_blank", "noopener,noreferrer");
          }
        }}
        className={`${rowCls} w-full text-left cursor-pointer`}
        style={rowStyle}
      >
        {thumb}
        <span className={titleCls}>{item.headline}</span>
      </button>
    );
  }
  return (
    <a
      href={item.articleUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleExternalClick(item.articleUrl)}
      className={rowCls}
      style={rowStyle}
    >
      {thumb}
      <span className={titleCls}>{item.headline}</span>
    </a>
  );
}

function VideoSourceCard({ label, logoUrl, items, loading, onPlay }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler }) {
  return (
    // overflow-clip — see TextSourceCard for why (sticky SourceHeader needs
    // window as the scroll container). box-shadow inset for the card outline
    // (see TextSourceCard for the alignment rationale).
    <div
      className="rounded-lg overflow-clip"
      style={{ background: "var(--bg-card)", boxShadow: "inset 0 0 0 1px var(--border)" }}
    >
      <SourceHeader label={label} logoUrl={logoUrl} />
      {loading ? (
        // See TextSourceCard: sr-only status is announced, decorative pulse
        // placeholders are aria-hidden (WCAG 4.1.3, matching HomeContent).
        <div role="status" aria-live="polite" className="flex flex-col gap-px" style={{ background: "var(--border)" }}>
          <span className="sr-only">Loading videos…</span>
          {[1, 2, 3].map((i) => (
            <div key={i} aria-hidden="true" className="animate-pulse" style={{ background: "var(--bg-card)" }}>
              <div className="w-full aspect-video" style={{ background: "var(--bg-card-hover)" }} />
              <div className="px-3 py-2">
                <div className="h-3 w-4/5 rounded" style={{ background: "var(--bg-card-hover)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No videos</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => {
            const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
            const commonStyle = { borderTop: idx === 0 ? "none" : "1px solid var(--border)" };
            const body = (
              <>
              {item.imageUrl && (
                <div className="relative w-full aspect-video" style={{ background: "var(--bg-card-hover)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxyImage(item.imageUrl)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    draggable={false}
                    // A 404'd thumbnail would otherwise show the browser's
                    // broken-image glyph; hide it so the card degrades to the
                    // bg-card-hover placeholder + play overlay (a sibling),
                    // matching NewsCard's onError guard and AlignedVideoStrip's
                    // VideoRow. Rows are keyed by item.id, so this node is never
                    // reused for another item — display:none can't leak onto a
                    // later valid thumbnail.
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4))" }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
                    >
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
              {/* minHeight 2.5rem floors each row at ~2 lines so first cards
                  line up across columns; line-clamp-3 lets long headlines
                  use a third line instead of truncating. */}
              <div className="news-title px-3 py-2 text-sm leading-snug line-clamp-3" style={{ color: "var(--text)", minHeight: "2.5rem" }}>
                {item.headline}
              </div>
              </>
            );
            // Fire the in-app modal when we have a direct HLS stream (MLB), a
            // Brightcove embed (NHL), OR a prebake-validated YouTube ID on the
            // league's official channel. HLS/embed are preferred since they
            // play the exact source clip. Otherwise fall through to a plain
            // anchor to the source URL.
            const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.videoUrl || !!item.embedUrl || !!item.youtubeVideoId);
            if (canPlayInline) {
              return (
                <button
                  key={item.id}
                  onClick={(e) => {
                    // Modifier-click → open the source article in a background
                    // tab instead of replacing the currently-open modal.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
                      if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    onPlay!({
                      videoId: item.youtubeVideoId || undefined,
                      playbackUrl: item.playbackUrl || item.videoUrl || null,
                      embedUrl: item.embedUrl || null,
                      fallbackUrl: item.articleUrl,
                      poster: item.imageUrl || null,
                      // No sourceLabel — URL-derived label gives "Open on MLB.com",
                      // "Open on NBA.com", "Open on ESPN" which is what we want
                      // here. Passing item.section would show the verbose column
                      // label ("MLB Most Popular") which Jacob doesn't want.
                      headline: item.headline,
                      byline: item.byline || null,
                      published: item.published || null,
                    });
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1 && item.articleUrl) {
                      window.open(item.articleUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className={commonCls}
                  style={commonStyle}
                >
                  {body}
                </button>
              );
            }
            return (
              <a
                key={item.id}
                href={item.articleUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalClick(item.articleUrl)}
                className={commonCls}
                style={commonStyle}
              >
                {body}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceSection({ source, onPlayVideo }: { source: NewsSource; onPlayVideo?: PlayHandler }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Key the fetch on stable strings so parent re-renders that produce a new
  // `source` object with identical contents don't re-trigger the fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    source.fetch().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.label]);

  if (source.variant === "video") {
    return (
      <VideoSourceCard
        label={source.label}
        logoUrl={source.logoUrl}
        items={items}
        loading={loading}
        onPlay={onPlayVideo}
      />
    );
  }
  return <TextSourceCard label={source.label} logoUrl={source.logoUrl} items={items} loading={loading} onPlay={onPlayVideo} />;
}

export default function NewsColumn({
  title,
  sources,
  swappableOptions,
  shownElsewhere,
  selectedSport,
  onSwapLeague,
  onPickEspn,
  espnActive,
  hideTitle,
  widthClassName,
  onPlayVideo,
}: NewsColumnProps) {
  const widthCls = widthClassName ?? "flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]";
  return (
    <div className={`${widthCls} min-h-[60vh]`}>
      {!hideTitle && (
        <NewsColumnTitle
          title={title}
          swappableOptions={swappableOptions}
          shownElsewhere={shownElsewhere}
          selectedSport={selectedSport}
          onSwapLeague={onSwapLeague}
          onPickEspn={onPickEspn}
          espnActive={espnActive}
        />
      )}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {sources.map((source) => (
          <SourceSection key={source.label} source={source} onPlayVideo={onPlayVideo} />
        ))}
      </div>
    </div>
  );
}
