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
}
export type PlayHandler = (opts: PlayOpts) => void;

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
}: {
  title: string;
  swappableOptions?: { sport: Sport; label: string }[];
  shownElsewhere?: Sport[];
  selectedSport?: Sport;
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
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
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
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
              onClick={() => setSwapOpen(!swapOpen)}
              className="cursor-pointer transition-colors hover:opacity-80"
              style={{ color: "var(--text)" }}
              title="Switch news league"
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
                {/* Empty hides the column entirely (matches the scores-view
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
                  Empty
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
            width={24}
            height={24}
            className="w-6 h-6 object-contain shrink-0"
            draggable={false}
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
    const m = s.match(/^(?:NBA|MLB|NHL|NFL|EPL|MLS|NCAAM|NCAAF|ESPN|GOLF|TENNIS|F1|WNBA)\s+/i);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  s = s.trim();
  return s || label;
}

function TextSourceCard({ label, logoUrl, items, loading, onPlay }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler }) {
  return (
    // overflow-clip (not overflow-hidden) so position: sticky on SourceHeader
    // pins to the window, not to this card. overflow-hidden establishes a
    // scroll container; overflow-clip doesn't.
    // box-shadow inset (not actual borders) so the SourceHeader's rounded-t-lg
    // + borderTop overlaps the parent's top edge as a single 1px line —
    // real borders push the inner 1px inward, creating nested curves at top.
    <div
      className="rounded-lg overflow-clip"
      style={{ background: "var(--bg-card)", boxShadow: "inset 0 0 0 1px var(--border)" }}
    >
      <SourceHeader label={label} logoUrl={logoUrl} />
      {loading ? (
        <div className="flex flex-col">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-3 py-2 animate-pulse" style={{ borderTop: i === 1 ? "none" : "1px solid var(--border)" }}>
              <div className="h-3 w-full rounded" style={{ background: "var(--bg-card-hover)" }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No headlines</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => (
            <TextRow key={item.id} item={item} isFirst={idx === 0} onPlay={onPlay} />
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
function TextRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler }) {
  const [imgFailed, setImgFailed] = useState(false);
  // min-h-[6rem] sm:min-h-[7rem] forces a uniform row height across every text
  // source card — Reddit, MLB.com, NBA.com, ESPN-league. With identical row
  // heights AND identical item counts (each prebake caps at 12), card N ends
  // at the same vertical position in every column, giving the row-by-row
  // alignment Jacob asked for. 7rem ≈ 5 text-sm lines (line-clamp-5 cap) +
  // py-2 padding, so a max-length headline fits without truncation while
  // shorter ones sit at the top with a small blank below.
  const rowCls = "flex items-start gap-2 px-3 py-2 text-xs sm:text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)] min-h-[6rem] sm:min-h-[7rem]";
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)" };
  // Reddit posts always pop the modal so the user can read the post (and any
  // attached photo / video) without leaving hidescore. Other sources (ESPN
  // top headlines, MLB.com etc.) only pop the modal when there's actual
  // media — text-only article rows still anchor straight to the source.
  const isReddit = !!item.section?.startsWith("r/");
  const hasMedia = !!(item.videoUrl || item.imageFullUrl || item.imageUrl);
  const shouldPopModal = !!onPlay && (isReddit || hasMedia);
  const hasInlineMedia = !!(item.videoUrl || item.imageFullUrl);
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
            {item.videoUrl ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
          onPlay!({
            playbackUrl: item.videoUrl || null,
            // Prefer Reddit-hosted full-res, fall back to preview for image-bearing
            // posts. Text-only Reddit posts pass null and the modal renders its
            // text-card layout off the headline metadata below.
            imageUrl: item.videoUrl ? null : (item.imageFullUrl || (isReddit && item.imageUrl) || null),
            fallbackUrl: item.articleUrl,
            poster: item.imageUrl || null,
            sourceLabel: item.section || null,
            headline: item.headline,
            byline: item.byline || null,
            published: item.published || null,
            body: item.body || null,
          });
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
        <span className="min-w-0 line-clamp-5">{item.headline}</span>
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
      <span className="min-w-0 line-clamp-5">{item.headline}</span>
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
        <div className="flex flex-col gap-px" style={{ background: "var(--border)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse" style={{ background: "var(--bg-card)" }}>
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
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4))" }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
              {/* minHeight 2.5rem floors each row at ~2 lines so first cards
                  line up across columns; line-clamp-3 lets long headlines
                  use a third line instead of truncating. */}
              <div className="px-3 py-2 text-xs sm:text-sm leading-snug line-clamp-3" style={{ color: "var(--text)", minHeight: "2.5rem" }}>
                {item.headline}
              </div>
              </>
            );
            // Fire the in-app modal when we have a direct HLS stream (MLB), a
            // Brightcove embed (NHL), OR a prebake-validated YouTube ID on the
            // league's official channel. HLS/embed are preferred since they
            // play the exact source clip. Otherwise fall through to a plain
            // anchor to the source URL.
            const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.embedUrl || !!item.youtubeVideoId);
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
                      playbackUrl: item.playbackUrl || null,
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
