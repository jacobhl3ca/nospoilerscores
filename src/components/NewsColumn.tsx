"use client";

import { useEffect, useState } from "react";
import { Sport } from "@/lib/types";
import { NewsItem, proxyImage } from "@/lib/news";

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
  imageUrl?: string | null;
  fallbackUrl: string;
  poster?: string | null;
  sourceLabel?: string | null;
  headline?: string | null;
  byline?: string | null;
  published?: string | null;
}
export type PlayHandler = (opts: PlayOpts) => void;

interface NewsColumnProps {
  title: string;
  sources: NewsSource[];
  // 3rd-column selector — same dropdown UX as the scores view.
  swappableOptions?: { sport: Sport; label: string }[];
  selectedThirdLeague?: Sport;
  onSwapLeague?: (sport: Sport | undefined) => void;
  // When true, the column renders only its source cards — the title row is
  // rendered separately above (e.g. as part of the page-level TitleStrip
  // that sits above AlignedVideoStrip). Keeps the league title above the
  // big-format video strip instead of buried below it.
  hideTitle?: boolean;
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
  selectedThirdLeague,
  onSwapLeague,
}: {
  title: string;
  swappableOptions?: { sport: Sport; label: string }[];
  selectedThirdLeague?: Sport;
  onSwapLeague?: (sport: Sport | undefined) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;
  return (
    <div
      className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30"
      style={{ background: "var(--bg)", paddingTop: "1.75rem" }}
    >
      <div className="flex items-center justify-center">
        <span className="text-sm invisible mr-1.5" aria-hidden="true">★</span>
        {isSwappable ? (
          <div className="relative">
            <button
              onClick={() => setSwapOpen(!swapOpen)}
              className="flex items-center gap-0.5 cursor-pointer transition-colors hover:opacity-80"
              style={{ color: "var(--text)" }}
              title="Switch news feed"
            >
              <h2 className="text-base sm:text-lg font-bold tracking-wide">{title}</h2>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform duration-150 ${swapOpen ? "rotate-180" : ""}`}
                style={{ color: "var(--text-muted)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {swapOpen && (
              <div
                className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <button
                  onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                  className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                  style={{
                    color: !selectedThirdLeague ? "var(--accent)" : "var(--text)",
                    fontWeight: !selectedThirdLeague ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Top Headlines
                </button>
                {swappableOptions!.map((opt) => (
                  <button
                    key={opt.sport}
                    onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                    className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                    style={{
                      color: opt.sport === selectedThirdLeague ? "var(--accent)" : "var(--text)",
                      fontWeight: opt.sport === selectedThirdLeague ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
            {title}
          </h2>
        )}
        <span className="text-sm invisible ml-1.5" aria-hidden="true">★</span>
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
  return (
    <div
      className="px-3 py-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"
      style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}
    >
      {logoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 object-contain shrink-0"
          draggable={false}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

function TextSourceCard({ label, logoUrl, items, loading, onPlay }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
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
  const rowCls = "flex items-start gap-2 px-3 py-2 text-xs sm:text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)]";
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
        onClick={() => onPlay!({
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
        })}
        className={`${rowCls} w-full text-left cursor-pointer`}
        style={rowStyle}
      >
        {thumb}
        <span className="min-w-0 line-clamp-2">{item.headline}</span>
      </button>
    );
  }
  return (
    <a
      href={item.articleUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={rowCls}
      style={rowStyle}
    >
      {thumb}
      <span className="min-w-0">{item.headline}</span>
    </a>
  );
}

function VideoSourceCard({ label, logoUrl, items, loading, onPlay }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
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
              {/* line-clamp-2 keeps each row a fixed 2-line height so the
                  first video card lines up vertically across columns even
                  when one headline is short and the next is long. */}
              <div className="px-3 py-2 text-xs sm:text-sm leading-snug line-clamp-2" style={{ color: "var(--text)", minHeight: "2.5rem" }}>
                {item.headline}
              </div>
              </>
            );
            // Fire the in-app modal when we have either a direct HLS stream
            // (MLB) OR a prebake-validated YouTube ID on the league's official
            // channel. HLS is preferred since it plays the exact source clip.
            // Otherwise fall through to a plain anchor to the source URL.
            const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.youtubeVideoId);
            if (canPlayInline) {
              return (
                <button
                  key={item.id}
                  onClick={() => onPlay!({
                    videoId: item.youtubeVideoId || undefined,
                    playbackUrl: item.playbackUrl || null,
                    fallbackUrl: item.articleUrl,
                    poster: item.imageUrl || null,
                    // No sourceLabel — URL-derived label gives "Open on MLB.com",
                    // "Open on NBA.com", "Open on ESPN" which is what we want
                    // here. Passing item.section would show the verbose column
                    // label ("MLB Most Popular") which Jacob doesn't want.
                    headline: item.headline,
                    byline: item.byline || null,
                    published: item.published || null,
                  })}
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
  selectedThirdLeague,
  onSwapLeague,
  hideTitle,
  onPlayVideo,
}: NewsColumnProps) {
  return (
    <div className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] min-h-[60vh]">
      {!hideTitle && (
        <NewsColumnTitle
          title={title}
          swappableOptions={swappableOptions}
          selectedThirdLeague={selectedThirdLeague}
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
