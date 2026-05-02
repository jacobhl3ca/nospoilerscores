"use client";

import { useEffect, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";
import { NewsSource, PlayHandler } from "./NewsColumn";

interface Props {
  sources: NewsSource[];
  onPlay?: PlayHandler;
  // Optional text-row tail for one column. ESPN top headlines slot in here
  // when col 3 is the generic cascade — fills the empty subgrid pad rows
  // beneath col 3's shorter video count without a separate ESPN card. All
  // tail items render (no cap); the entire tail is wrapped in one grid item
  // that spans the available pad rows so 9 compact text items can fit in
  // the vertical area normally taken by 2 video rows.
  tailFetch?: () => Promise<NewsItem[]>;
  tailColIdx?: number;
}

// 3-column video strip — CSS subgrid so video N is the same height in every
// column. Outer grid declares row tracks; each col card inherits them via
// gridTemplateRows: subgrid. Per-row height = tallest headline at that row,
// shorter cells anchor align-self: start so blank space sits at the bottom.
// Headlines stay un-clamped so long titles wrap fully (Jacob 2026-05-02).
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
    return () => { cancelled = true; };
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

  const allLoaded = colItems.every(Boolean);
  const tailHasItems = tailColIdx !== undefined && !!tailItems && tailItems.length > 0;
  // Reserve 2 pad rows in the tail col so the ESPN-top tail always has somewhere
  // to span — otherwise when the tail col's video count ties the others (e.g.
  // ESPN videos = MLB videos = 10) padCount drops to 0 and the tail disappears.
  const TAIL_RESERVE_ROWS = 2;
  const maxItems = allLoaded
    ? Math.max(
        ...colItems.map((c, idx) => {
          if (tailHasItems && idx === tailColIdx) return 0;
          return c?.length || 0;
        }),
        tailHasItems ? TAIL_RESERVE_ROWS + 1 : 1,
      )
    : 5;
  // header (1) + every item row. Subgrid inherits these tracks.
  const totalRows = maxItems + 1;

  return (
    // 691px = 3×225 + 2×8 (gap-2). 872px xl: = 3×280 + 2×16 (gap-4).
    <div
      className="grid gap-2 sm:gap-4 mb-1.5 sm:mb-2 mx-auto w-full max-w-[691px] xl:max-w-[872px]"
      style={{
        gridTemplateColumns: `repeat(${sources.length}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, auto)`,
      }}
    >
      {sources.map((source, colIdx) => {
        const items = colItems[colIdx];
        const isTailCol = tailHasItems && colIdx === tailColIdx;
        const capped = isTailCol
          ? Math.min(items?.length || 0, Math.max(0, maxItems - TAIL_RESERVE_ROWS))
          : Math.min(items?.length || 0, maxItems);
        const itemCount = items === null ? 0 : capped;
        const padCount = Math.max(0, maxItems - itemCount);
        const tail = isTailCol && tailItems ? tailItems : [];
        const hasTail = tail.length > 0 && padCount > 0;
        return (
          <div
            key={source.label}
            // overflow-clip (not overflow-hidden) so the sticky SourceHeader
            // below pins to window scroll instead of being trapped inside this
            // card. See feedback_overflow_clip_for_sticky.md.
            // Full 4-side border so the rounded-lg curve closes cleanly at
            // the top corners — with only left+right+bottom the borders
            // curved up and ended mid-air, leaving visible 1px stubs.
            className="rounded-lg overflow-clip grid"
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
              : items.slice(0, itemCount).map((item, rowIdx) => (
                  <VideoRow key={item.id} item={item} isFirst={rowIdx === 0} onPlay={onPlay} />
                ))}
            {hasTail ? (
              // One spanning grid item that occupies col 3's empty pad rows.
              // Inside, render every ESPN top item in flex-col so 9 compact
              // text rows fit in roughly 2 video rows of height.
              <div
                style={{ gridRow: `${itemCount + 2} / span ${padCount}`, borderTop: "1px solid var(--border)" }}
                className="flex flex-col h-full overflow-hidden"
              >
                {tail.map((item, i) => (
                  <CompactTailRow key={`tail-${item.id}`} item={item} isFirst={i === 0} onPlay={onPlay} />
                ))}
              </div>
            ) : (
              // Pad short cols with empty cells so subgrid rows align across.
              items !== null && padCount > 0 && Array.from({ length: padCount }).map((_, i) => (
                <div key={`pad-${i}`} style={{ borderTop: "1px solid var(--border)" }} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceHeader({ label, logoUrl }: { label: string; logoUrl?: string }) {
  return (
    // See NewsColumn.SourceHeader for the wrapper rationale.
    <div
      className="news-source-sticky-top sticky z-20"
      style={{ background: "var(--bg)" }}
    >
      {/* No borderTop here — the parent card now provides a full 4-side
          border, so adding one here would render a 2px doubled line at
          natural state. When pinned to viewport, bg contrast (var(--bg)
          outside the rounded-t-lg curve vs var(--bg-card) inside) is what
          delineates the top edge. */}
      <div
        className="rounded-t-lg px-3 py-2.5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wide"
        style={{ color: "var(--text)", background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
      >
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0" draggable={false} />
        )}
        <span>{label}</span>
      </div>
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
      {/* Un-clamped — subgrid sizes the row to the tallest headline at that
          row across cols, so a 3-line title in col 3 makes col 1+2 the same
          row height with align-self: start anchoring shorter cells up top. */}
      <div className="px-3 py-2 text-xs sm:text-sm leading-snug" style={{ color: "var(--text)" }}>
        {item.headline}
      </div>
    </>
  );
  const canPlayInline = !!onPlay && (!!item.playbackUrl || !!item.youtubeVideoId);
  const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
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

// Compact text row for the col 3 tail (ESPN top headlines). Larger padding +
// thumb than the older 9px-thumb version so the tail visually fills the col 3
// pad-row space rather than ending with blank tail at the bottom — when fewer
// items than reserved rows, taller rows distribute the available height.
function CompactTailRow({ item, isFirst, onPlay }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler }) {
  const hasMedia = !!(item.videoUrl || item.imageFullUrl || item.imageUrl);
  const shouldPopModal = !!onPlay && hasMedia;
  const thumb = item.imageUrl ? (
    <div
      className="relative w-11 h-11 shrink-0 rounded overflow-hidden"
      style={{ background: "var(--bg-card-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={proxyImage(item.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
    </div>
  ) : item.leagueLogo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.leagueLogo}
      alt=""
      loading="lazy"
      width={20}
      height={20}
      className="w-5 h-5 object-contain shrink-0 mt-0.5"
      draggable={false}
    />
  ) : null;
  // flex-1 + items-center spreads the rows vertically when we have fewer
  // items than the pad-row budget, so the tail card fills col 3's space.
  const rowCls = "flex flex-1 items-center gap-2.5 px-3 py-2 text-xs sm:text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)] w-full text-left";
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
