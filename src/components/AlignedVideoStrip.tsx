"use client";

import { useEffect, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";
import { NewsSource, PlayHandler } from "./NewsColumn";

interface Props {
  sources: NewsSource[];
  onPlay?: PlayHandler;
  // Optional text-row tail for one column. ESPN top headlines live here when
  // col 3 is the generic cascade — fills the empty space beneath col 3's
  // shorter video count without a separate ESPN card. All tail items render
  // (no cap); compact text rows let 9-10 headlines fit in the area beneath
  // col 3's videos. Cols without a tail just stop at their last video.
  tailFetch?: () => Promise<NewsItem[]>;
  tailColIdx?: number;
}

// 3-column video strip — independent flex columns instead of CSS subgrid so
// col 3 can extend below its videos with ESPN top text rows without forcing
// cols 1+2 to grow with empty pad cells. Per-row alignment across cols comes
// from each VideoRow having a fixed-shape body (aspect-video image + 2-line
// clamped headline at minHeight 2.5rem), which produces identical per-row
// heights when the columns are equal width.
export default function AlignedVideoStrip({ sources, onPlay, tailFetch, tailColIdx }: Props) {
  const [colItems, setColItems] = useState<(NewsItem[] | null)[]>(() => sources.map(() => null));
  const [tailItems, setTailItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    sources.forEach((source, idx) => {
      source.fetch().then((items) => {
        if (cancelled) return;
        // Defensive: drop items without a thumbnail so every cell in the strip
        // has consistent image+title content.
        const filtered = items.filter((i) => !!i.imageUrl);
        setColItems((prev) => {
          const next = [...prev];
          next[idx] = filtered;
          return next;
        });
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.label).join(",")]);

  useEffect(() => {
    if (!tailFetch) {
      setTailItems(null);
      return;
    }
    let cancelled = false;
    tailFetch().then((items) => {
      if (!cancelled) setTailItems(items);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailFetch ? "set" : "unset"]);

  return (
    // Width capped to match NewsColumn's max-w-[225px] xl:max-w-[280px] below.
    // 691px = 3×225 + 2×8 (gap-2). 872px xl: = 3×280 + 2×16 (gap-4).
    // items-start so cols 1+2 stop at their last video instead of stretching
    // to col 3's height when col 3 carries an ESPN-top tail.
    <div className="flex flex-row gap-2 sm:gap-4 mb-1.5 sm:mb-2 mx-auto w-full max-w-[691px] xl:max-w-[872px] items-start">
      {sources.map((source, colIdx) => {
        const items = colItems[colIdx];
        const tail = colIdx === tailColIdx && tailItems ? tailItems : [];
        return (
          <div
            key={source.label}
            className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] rounded-lg overflow-hidden flex flex-col"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <SourceHeader label={source.label} logoUrl={source.logoUrl} />
            {items === null
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={`s-${i}`} isFirst={i === 0} />)
              : items.map((item, rowIdx) => (
                  <VideoRow key={item.id} item={item} isFirst={rowIdx === 0} onPlay={onPlay} />
                ))}
            {tail.length > 0 && (
              <>
                {/* Visual divider between videos and ESPN-top tail so it's
                    clear where the video block ends within col 3's card. */}
                <div style={{ borderTop: "2px solid var(--border)" }} />
                {tail.map((item, i) => (
                  <CompactTailRow key={`tail-${item.id}`} item={item} isFirst={i === 0} onPlay={onPlay} />
                ))}
              </>
            )}
          </div>
        );
      })}
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
        <img src={logoUrl} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0" draggable={false} />
      )}
      <span>{label}</span>
    </div>
  );
}

function SkeletonRow({ isFirst }: { isFirst: boolean }) {
  return (
    <div className="animate-pulse" style={{ borderTop: isFirst ? "none" : "1px solid var(--border)" }}>
      <div className="w-full aspect-video" style={{ background: "var(--bg-card-hover)" }} />
      <div className="px-3 py-2">
        <div className="h-3 w-4/5 rounded" style={{ background: "var(--bg-card-hover)" }} />
      </div>
    </div>
  );
}

function VideoRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler }) {
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
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      )}
      {/* line-clamp-2 + minHeight 2.5rem keeps every row a fixed two-line text
          block, which (combined with aspect-video on the image) gives identical
          per-row heights across cols without needing CSS subgrid. */}
      <div className="px-3 py-2 text-xs sm:text-sm leading-snug line-clamp-2" style={{ color: "var(--text)", minHeight: "2.5rem" }}>
        {item.headline}
      </div>
    </>
  );
  const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.youtubeVideoId);
  const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
  const commonStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)" };
  if (canPlayInline) {
    return (
      <button
        onClick={() =>
          onPlay!({
            videoId: item.youtubeVideoId || undefined,
            playbackUrl: item.playbackUrl || null,
            fallbackUrl: item.articleUrl,
            poster: item.imageUrl || null,
            headline: item.headline,
            byline: item.byline || null,
            published: item.published || null,
          })
        }
        className={commonCls}
        style={commonStyle}
      >
        {body}
      </button>
    );
  }
  return (
    <a key={item.id} href={item.articleUrl || undefined} target="_blank" rel="noopener noreferrer" className={commonCls} style={commonStyle}>
      {body}
    </a>
  );
}

// Compact text row for the col 3 tail (ESPN top headlines). Tighter padding +
// smaller thumb than NewsColumn's TextRow so 9-10 ESPN top items fit in
// roughly the vertical space of 2 video rows — keeping col 3's total height
// close to cols 1+2's video count without dropping headlines.
function CompactTailRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler }) {
  const hasMedia = !!(item.videoUrl || item.imageFullUrl || item.imageUrl);
  const shouldPopModal = !!onPlay && hasMedia;
  const showThumb = !!item.imageUrl;
  const thumb = showThumb ? (
    <div
      className="relative w-9 h-9 shrink-0 rounded overflow-hidden"
      style={{ background: "var(--bg-card-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={proxyImage(item.imageUrl!)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
    </div>
  ) : item.leagueLogo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.leagueLogo}
      alt=""
      loading="lazy"
      width={16}
      height={16}
      className="w-4 h-4 object-contain shrink-0 mt-0.5"
      draggable={false}
    />
  ) : null;
  const rowCls = "flex items-start gap-2 px-3 py-1.5 text-[11px] sm:text-xs leading-snug transition-colors hover:bg-[var(--bg-card-hover)] w-full text-left";
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)" };
  if (shouldPopModal) {
    return (
      <button
        onClick={() => onPlay!({
          playbackUrl: item.videoUrl || null,
          imageUrl: item.imageFullUrl || null,
          fallbackUrl: item.articleUrl,
          poster: item.imageUrl || null,
          sourceLabel: item.section || null,
          headline: item.headline,
          byline: item.byline || null,
          published: item.published || null,
        })}
        className={`${rowCls} cursor-pointer`}
        style={rowStyle}
      >
        {thumb}
        <span className="min-w-0 line-clamp-2">{item.headline}</span>
      </button>
    );
  }
  return (
    <a href={item.articleUrl || undefined} target="_blank" rel="noopener noreferrer" className={rowCls} style={rowStyle}>
      {thumb}
      <span className="min-w-0 line-clamp-2">{item.headline}</span>
    </a>
  );
}
