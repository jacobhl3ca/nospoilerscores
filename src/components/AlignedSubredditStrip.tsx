"use client";

import { useEffect, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";
import { NewsSource, PlayHandler } from "./NewsColumn";

interface Props {
  sources: NewsSource[];
  onPlay?: PlayHandler;
}

// Aligned 3-column subreddit strip. Same pattern as AlignedVideoStrip but
// for text rows (Reddit posts): subgrid row tracks force post N in every
// column to share a single grid row, so a long headline in col 1 doesn't
// push col 2 out of sync. Headlines line-clamp to 2 lines with ellipsis
// so a single multi-line title can't blow out the whole row's height.
export default function AlignedSubredditStrip({ sources, onPlay }: Props) {
  const [colItems, setColItems] = useState<(NewsItem[] | null)[]>(() => sources.map(() => null));

  useEffect(() => {
    let cancelled = false;
    sources.forEach((source, idx) => {
      source.fetch().then((items) => {
        if (cancelled) return;
        setColItems((prev) => {
          const next = [...prev];
          next[idx] = items;
          return next;
        });
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.label).join(",")]);

  const allLoaded = colItems.every(Boolean);
  const maxItems = allLoaded ? Math.max(...colItems.map((c) => c?.length || 0)) : 8;
  // gridRow span = header(1) + every item row.
  const totalRows = maxItems + 1;

  return (
    <div
      className="grid gap-2 sm:gap-4 mb-1.5 sm:mb-2 mx-auto w-full max-w-[691px] xl:max-w-[872px]"
      style={{
        gridTemplateColumns: `repeat(${sources.length}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, auto)`,
      }}
    >
      {sources.map((source, colIdx) => {
        const items = colItems[colIdx];
        const itemCount = items?.length || 0;
        const padCount = Math.max(0, maxItems - itemCount);
        return (
          <div
            key={source.label}
            className="rounded-lg overflow-hidden grid"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              gridRow: `1 / span ${totalRows}`,
              gridTemplateRows: "subgrid",
            }}
          >
            <SourceHeader label={source.label} logoUrl={source.logoUrl} />
            {items === null
              ? Array.from({ length: maxItems }).map((_, i) => <SkeletonRow key={`s-${i}`} isFirst={i === 0} />)
              : items.slice(0, maxItems).map((item, rowIdx) => (
                  <SubredditRow key={item.id} item={item} isFirst={rowIdx === 0} onPlay={onPlay} />
                ))}
            {items !== null &&
              padCount > 0 &&
              Array.from({ length: padCount }).map((_, i) => (
                <div key={`pad-${i}`} style={{ borderTop: "1px solid var(--border)" }} />
              ))}
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
    <div className="px-3 py-2 animate-pulse" style={{ borderTop: isFirst ? "none" : "1px solid var(--border)" }}>
      <div className="h-3 w-4/5 rounded" style={{ background: "var(--bg-card-hover)" }} />
    </div>
  );
}

function SubredditRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showThumb = !!item.imageUrl && !imgFailed;
  const hasInlineMedia = !!(item.videoUrl || item.imageFullUrl);
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
  ) : null;
  // Reddit posts always pop the modal so the user can read post + media
  // without leaving hidescore.
  const rowCls = "flex items-start gap-2 px-3 py-2 text-xs sm:text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)] w-full text-left cursor-pointer";
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)", alignSelf: "start" as const };
  const isReddit = !!item.section?.startsWith("r/");
  if (onPlay) {
    return (
      <button
        onClick={() => onPlay({
          playbackUrl: item.videoUrl || null,
          imageUrl: item.videoUrl ? null : (item.imageFullUrl || (isReddit && item.imageUrl) || null),
          fallbackUrl: item.articleUrl,
          poster: item.imageUrl || null,
          sourceLabel: item.section || null,
          headline: item.headline,
          byline: item.byline || null,
          published: item.published || null,
        })}
        className={rowCls}
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
