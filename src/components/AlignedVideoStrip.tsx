"use client";

import { useEffect, useState } from "react";
import { NewsItem } from "@/lib/news";
import { NewsSource } from "./NewsColumn";

interface PlayOpts {
  videoId?: string;
  playbackUrl?: string | null;
  imageUrl?: string | null;
  fallbackUrl: string;
  poster?: string | null;
  sourceLabel?: string | null;
}

interface Props {
  sources: NewsSource[];
  onPlay?: (opts: PlayOpts) => void;
}

// Aligned 3-column video strip — each row across columns is sized to the
// tallest cell in that row so video N in every column is the same vertical
// size, even when one headline wraps to 3 lines and another fits on 1.
// Implemented with CSS subgrid: outer grid declares row tracks, each column
// inherits them via subgrid so direct children (header + items) participate
// in the parent rows.
export default function AlignedVideoStrip({ sources, onPlay }: Props) {
  const [colItems, setColItems] = useState<(NewsItem[] | null)[]>(() => sources.map(() => null));

  useEffect(() => {
    let cancelled = false;
    sources.forEach((source, idx) => {
      source.fetch().then((items) => {
        if (cancelled) return;
        // Defensive: drop items without a thumbnail so every cell in the strip
        // has consistent image+title content. Without this, a cell with just a
        // title (when one feed returns a no-thumb item) gets stretched to the
        // tallest sibling row's height, leaving big visual blank space.
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
    // Re-fetch only when the source identity changes (label is stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.label).join(",")]);

  const allLoaded = colItems.every(Boolean);
  const maxItems = allLoaded ? Math.max(...colItems.map((c) => c?.length || 0)) : 5;
  // gridRow span = header(1) + every item row. Subgrid inherits these tracks.
  const totalRows = maxItems + 1;

  return (
    // Width capped to match NewsColumn's max-w-[225px] xl:max-w-[280px] below
    // — without this the strip blows out to full container width while the
    // rest of the news view stays narrow, producing the size mismatch Jacob
    // flagged. 691px = 3×225 + 2×8 (gap-2). 872px xl: = 3×280 + 2×16 (gap-4).
    <div
      className="grid gap-2 sm:gap-4 mb-1.5 sm:mb-2 mx-auto w-full max-w-[691px] xl:max-w-[872px]"
      style={{
        gridTemplateColumns: `repeat(${sources.length}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, auto)`,
      }}
    >
      {sources.map((source, colIdx) => (
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
          {colItems[colIdx] === null
            ? Array.from({ length: maxItems }).map((_, i) => <SkeletonRow key={`s-${i}`} isFirst={i === 0} />)
            : (colItems[colIdx] || []).slice(0, maxItems).map((item, rowIdx) => (
                <VideoRow key={item.id} item={item} isFirst={rowIdx === 0} onPlay={onPlay} />
              ))}
          {/* Pad short columns with empty cells so subgrid rows align. */}
          {colItems[colIdx] !== null &&
            (colItems[colIdx]?.length || 0) < maxItems &&
            Array.from({ length: maxItems - (colItems[colIdx]?.length || 0) }).map((_, i) => (
              <div key={`pad-${i}`} style={{ borderTop: "1px solid var(--border)" }} />
            ))}
        </div>
      ))}
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

function VideoRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: (opts: PlayOpts) => void }) {
  const body = (
    <>
      {item.imageUrl && (
        <div className="relative w-full aspect-video" style={{ background: "var(--bg-card-hover)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
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
      <div className="px-3 py-2 text-xs sm:text-sm leading-snug" style={{ color: "var(--text)" }}>
        {item.headline}
      </div>
    </>
  );
  const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.youtubeVideoId);
  const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
  // align-self: start anchors content to the top of its (potentially taller)
  // grid row, leaving any extra space at the bottom — Jacob's spec.
  const commonStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", alignSelf: "start" as const };
  if (canPlayInline) {
    return (
      <button
        onClick={() =>
          onPlay!({
            videoId: item.youtubeVideoId || undefined,
            playbackUrl: item.playbackUrl || null,
            fallbackUrl: item.articleUrl,
            poster: item.imageUrl || null,
            // No sourceLabel — URL-derivation gives "Open on MLB.com" /
            // "Open on NBA.com" / "Open on ESPN" which is what we want here.
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
