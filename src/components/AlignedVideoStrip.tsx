"use client";

import { useEffect, useMemo, useState } from "react";
import { NewsItem, proxyImage } from "@/lib/news";
import { isSensitiveNews, SensitiveCategory } from "@/lib/sensitiveNews";
import { handleExternalClick } from "@/lib/openExternal";
import { NewsSource, PlayHandler, PlayOpts, newsItemToPlayOpts, passesNewsFilters, itemIsVideo } from "./NewsColumn";
import { isDemoModeActive } from "@/lib/demoMode";

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
  showTextPosts?: boolean;
  // 🎥 Videos only. Only the text tail needs it — the video cells are videos by
  // construction — but without it the ESPN headline tail ignored the chip.
  videosOnly?: boolean;
  // Settings → "Hide upsetting news" (lib/sensitiveNews). Filters both the video
  // cells and the ESPN text tail. No "N hidden" line here: the strip sits above
  // the news columns, which print that count for the same filter — two notes for
  // one filter reads like two different things were hidden.
  hiddenCategories?: SensitiveCategory[];
  // Reverse every column's cells AND the tail list (oldest first) — the ⇅
  // news-header control, applied here so the strip flips with the columns.
  oldestFirst?: boolean;
}

// 3-column video strip — CSS subgrid so video N is the same height in every
// column. Outer grid declares row tracks; each col card inherits them via
// gridTemplateRows: subgrid. Per-row height = tallest headline at that row,
// shorter cells anchor align-self: start so blank space sits at the bottom.
// Headlines stay un-clamped so long titles wrap fully (Jacob 2026-05-02).
export default function AlignedVideoStrip({ sources, onPlay, tailFetch, tailColIdx, showTextPosts, videosOnly, hiddenCategories, oldestFirst }: Props) {
  const [colItems, setColItems] = useState<(NewsItem[] | null)[]>(() => sources.map(() => null));
  const [tailItems, setTailItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Clear stale columns whenever the source SET changes (e.g. a league swap
    // relabels a column while this strip stays mounted — its key only bumps on a
    // news refresh, not on a swap). Without this reset the positional colItems
    // array keeps the OUTGOING league's thumbnails at that index and renders
    // them under the INCOMING league's header during the refetch gap; worse,
    // the stale (truthy) entry keeps `allLoaded` true so no skeleton shows. The
    // fresh null array (sized to the current sources) restores the loading
    // skeleton and guarantees the render only ever pairs a column's items with
    // its own header. Also resizes the array on add/remove.
    setColItems(sources.map(() => null));
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
      }).catch(() => {
        // A rejected fetch would leave this column null forever, so `allLoaded`
        // (below) never flips and the WHOLE subgrid stays pinned on skeletons
        // with no empty state or retry. Settle it empty — mirroring NewsFeed's
        // `.catch(() => [])` guard — so the strip renders with its other columns
        // instead of hanging. (Built-in fetchers swallow errors today, so this
        // only fires if a source ever rejects/throws.)
        if (cancelled) return;
        setColItems((prev) => {
          const next = [...prev];
          next[idx] = [];
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
    }).catch(() => {
      // Same guard as the column fetch above: a rejected tail fetch would leave
      // tailItems null (its "still loading" sentinel) permanently. Settle it
      // empty so the tail simply doesn't render instead of hanging.
      if (!cancelled) setTailItems([]);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailFetch ? "set" : "unset"]);

  const allLoaded = colItems.every(Boolean);
  // Apply the sensitive filter at RENDER, not in the fetch effect: the effect
  // only re-runs on a source-set change, so filtering there would leave the
  // already-fetched strip untouched when the Settings toggle flips mid-session.
  // Oldest first reverses each column AFTER the filter (copy — colItems is
  // state). The per-column `items` below, and so the modal's prev/next list,
  // read this reversed array, so paging stays in the on-screen order.
  const shownColItems = useMemo(
    () => colItems.map((c) => {
      if (!c) return c;
      const kept = hiddenCategories?.length ? c.filter((i) => !isSensitiveNews(i, hiddenCategories)) : c;
      return oldestFirst ? [...kept].reverse() : kept;
    }),
    [colItems, hiddenCategories, oldestFirst],
  );
  const keptTailItems = (tailItems ?? []).filter((item) => passesNewsFilters(item, !!videosOnly, !!showTextPosts) && !(hiddenCategories?.length && isSensitiveNews(item, hiddenCategories)));
  const visibleTailItems = oldestFirst ? [...keptTailItems].reverse() : keptTailItems;
  const tailHasItems = tailColIdx !== undefined && visibleTailItems.length > 0;
  // Reserve 2 pad rows in the tail col so the ESPN-top tail always has somewhere
  // to span — otherwise when the tail col's video count ties the others (e.g.
  // ESPN videos = MLB videos = 10) padCount drops to 0 and the tail disappears.
  const TAIL_RESERVE_ROWS = 2;
  const maxItems = allLoaded
    ? Math.max(
        ...shownColItems.map((c, idx) => {
          if (tailHasItems && idx === tailColIdx) return 0;
          return c?.length || 0;
        }),
        tailHasItems ? TAIL_RESERVE_ROWS + 1 : 1,
      )
    : 5;
  // header (1) + every item row. Subgrid inherits these tracks.
  const totalRows = maxItems + 1;

  return (
    // Max-width tracks the column count so the strip lines up with the title row
    // and the NewsColumns below (each col 225px / 280px xl, gaps 8 / 16):
    // 3-col = 691 / 872 (3×225+2×8 / 3×280+2×16); 2-col = 458 / 576.
    <div
      className={`grid gap-2 sm:gap-4 mb-1.5 sm:mb-2 mx-auto w-full ${
        sources.length === 2 ? "max-w-[458px] xl:max-w-[576px]" : "max-w-[691px] xl:max-w-[872px]"
      }`}
      style={{
        gridTemplateColumns: `repeat(${sources.length}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, auto)`,
      }}
    >
      {sources.map((source, colIdx) => {
        // The refetch effect resizes `colItems` to the current `sources` on
        // every source-set change, so colIdx normally has a matching slot. This
        // `?? null` stays as belt-and-suspenders for the one render between a
        // sources change and the effect firing (a new colIdx would otherwise
        // read `undefined`): normalize it to `null` so the `=== null` "still
        // loading" guards below (skeleton, pad count) catch it too — otherwise
        // `items.slice(...)` runs on `undefined` and throws, crashing the news
        // view for that render.
        const items = shownColItems[colIdx] ?? null;
        const isTailCol = tailHasItems && colIdx === tailColIdx;
        const capped = isTailCol
          ? Math.min(items?.length || 0, Math.max(0, maxItems - TAIL_RESERVE_ROWS))
          : Math.min(items?.length || 0, maxItems);
        const itemCount = items === null ? 0 : capped;
        const padCount = Math.max(0, maxItems - itemCount);
        const tail = isTailCol ? visibleTailItems : [];
        // Gate the tail on the column's OWN items having settled (items !== null),
        // not just on padCount. The tail column runs two fetches: its live
        // per-league video source (colItems[tailColIdx], slow ESPN API) AND the
        // static ESPN-top tailFetch (fast JSON). When the static tail resolves
        // first — the common case — items is still null so the skeleton branch
        // renders 5 SkeletonRows at rows 2..6, while padCount == maxItems (5) made
        // hasTail true and the tail <div> spanned `gridRow: itemCount+2 / span
        // padCount` == `2 / span 5`, painting the ESPN headlines directly on top
        // of those skeletons. The pad `else` branch below already guards items !==
        // null for the same reason; mirror it so the tail simply waits for the
        // column to load. Once items settle, this is byte-identical to before.
        const hasTail = items !== null && tail.length > 0 && padCount > 0;
        const modalItems = [...(items?.slice(0, itemCount) ?? []), ...(hasTail ? tail : [])];
        const siblings: PlayOpts[] = modalItems.map(newsItemToPlayOpts);
        return (
          <div
            // Composite key: the strip is fed one lead source per column
            // (stripCols.map((s) => s[0]) in HomeContent), and two columns CAN
            // share a label — e.g. the 3rd news column (prefs.newsThirdLeague)
            // set to a league already shown in the first two, giving sources
            // like [MLB, NBA, MLB]. A bare source.label key would then collide,
            // so React reconciles the wrong column's items under a header. This
            // whole component is already positional (colItems[colIdx], etc.), so
            // folding colIdx into the key restores unique, stable identity.
            key={`${source.label}-${colIdx}`}
            // overflow-clip (not overflow-hidden) so the sticky SourceHeader
            // below pins to window scroll instead of being trapped inside this
            // card. See feedback_overflow_clip_for_sticky.md.
            // box-shadow inset (not real borders) for the card outline so the
            // inner SourceHeader's rounded-t-lg + borderTop overlaps the
            // parent's top edge as a single 1px line — real borders on the
            // parent would push the inner 1px inward, producing a 2px nested-
            // curve at the top corners.
            className="rounded-lg overflow-clip grid"
            style={{
              background: "var(--bg-card)",
              boxShadow: "inset 0 0 0 1px var(--border)",
              gridRow: `1 / span ${totalRows}`,
              gridTemplateRows: "subgrid",
            }}
          >
            <SourceHeader label={source.label} logoUrl={source.logoUrl} />
            {items === null
              ? (
                  // Announce the loading state; the pulsing SkeletonRows are
                  // purely decorative (aria-hidden below), so only this sr-only
                  // status is voiced (WCAG 4.1.3, matching the role=status
                  // skeletons in NewsColumn + HomeContent's games column). The
                  // span is sr-only (position:absolute), so it stays out of the
                  // subgrid row flow and can't shift the skeleton layout.
                  <>
                    <span role="status" aria-live="polite" className="sr-only">Loading videos…</span>
                    {Array.from({ length: maxItems }).map((_, i) => <SkeletonRow key={`s-${i}`} isFirst={i === 0} />)}
                  </>
                )
              : items.slice(0, itemCount).map((item, rowIdx) => (
                  <VideoRow key={item.id} item={item} isFirst={rowIdx === 0} onPlay={onPlay} siblings={siblings} index={rowIdx} />
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
                  <CompactTailRow key={`tail-${item.id}`} item={item} isFirst={i === 0} onPlay={onPlay} siblings={siblings} index={itemCount + i} />
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
  const mobileLabel = stripLeaguePrefixForMobile(label);
  return (
    // See NewsColumn.SourceHeader for the wrapper rationale.
    <div
      className="news-source-sticky-top sticky z-20"
      style={{ background: "var(--bg)" }}
    >
      {/* borderTop here is what the user sees as the top edge when this bar
          is pinned to the viewport (parent card's borderTop has scrolled
          off-screen by then). At natural state it sits 1px below parent's
          borderTop — slight 2px-line visual on a faint var(--border), which
          is the lesser evil vs. an unbordered pinned bar. */}
      <div
        className="rounded-t-lg px-3 py-2.5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wide"
        style={{ color: "var(--text)", background: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        {logoUrl && !isDemoModeActive() && (
          // Same drop as NewsColumn.SourceHeader — a real league/broadcaster
          // mark used as app chrome under ?demo=1.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={24}
            height={24}
            className="w-6 h-6 object-contain shrink-0"
            draggable={false}
            // Remote source mark (ESPN CDN + Wikimedia hotlinks) — a 404 or
            // blocked hotlink would otherwise leave the browser's broken-image
            // glyph in the sticky header. Hide it so the header degrades to its
            // always-present label text, matching the identical guard on its
            // twin NewsColumn.SourceHeader (this one was missed when that landed).
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
// logo + remaining text isn't redundant ("MLB MLB MOST POPULAR" effect when
// the logo already conveys the league). Loops to peel stacked prefixes
// ("MLB NBA Videos" → "Videos"); each token only matches with trailing
// whitespace, so a bare trailing "NBA" is left intact. If stripping empties
// the label (e.g. "NBA "), fall back to the full original.
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

function SkeletonRow({ isFirst }: { isFirst: boolean }) {
  return (
    // Decorative pulse placeholder — the sibling sr-only role=status span voices
    // the loading state, so hide these empty styled divs from assistive tech.
    <div aria-hidden="true" className="animate-pulse" style={{ borderTop: isFirst ? "none" : "1px solid var(--border)" }}>
      <div className="w-full aspect-video" style={{ background: "var(--bg-card-hover)" }} />
      <div className="px-3 py-2">
        <div className="h-3 w-4/5 rounded" style={{ background: "var(--bg-card-hover)" }} />
      </div>
    </div>
  );
}

function VideoRow({ item, isFirst, onPlay, siblings, index }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler; siblings: PlayOpts[]; index: number }) {
  const body = (
    <>
      {item.imageUrl && (
        <div className="news-media-preview relative w-full aspect-video" style={{ background: "var(--bg-card-hover)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImage(item.imageUrl)}
            alt=""
            loading="lazy"
            // Full-width 16:9 thumbnail — the largest image in the strip. Decode
            // it off the main thread so a heavy frame doesn't block scroll/paint
            // as rows come into view (loading="lazy" defers the fetch, not the
            // decode). Purely a rendering hint: no visual or behavior change.
            decoding="async"
            className="w-full h-full object-cover"
            draggable={false}
            // A 404'd thumbnail would otherwise show the browser's broken-image
            // glyph; hide it so the row degrades to the bg-card-hover placeholder
            // + play overlay (a sibling), matching NewsColumn's onError guard.
            // Rows are keyed by item.id, so this node is never reused for another
            // item — display:none can't leak onto a later valid thumbnail.
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4))" }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      )}
      {/* Un-clamped — subgrid sizes the row to the tallest headline at that
          row across cols, so a 3-line title in col 3 makes col 1+2 the same
          row height with align-self: start anchoring shorter cells up top. */}
      <div className="news-title px-3 py-2 text-xs sm:text-sm leading-snug" style={{ color: "var(--text)" }}>
        {item.headline}
      </div>
    </>
  );
  const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
  const commonStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", alignSelf: "start" as const };
  if (onPlay) {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
            if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
            return;
          }
          onPlay!({ ...newsItemToPlayOpts(item), siblings, index });
        }}
        onAuxClick={(e) => {
          if (e.button === 1 && item.articleUrl) {
            window.open(item.articleUrl, "_blank", "noopener,noreferrer");
          }
        }}
        // The button wraps the thumbnail (alt="") + headline, so its accessible
        // name is just the headline — a screen-reader/voice-control user hears the
        // title but gets no cue this control acts on the item inline (vs. the
        // sibling <a> rows that open an article). Name the action explicitly. But
        // the strip only filters its sources to items WITH a thumbnail, not to
        // actual videos, so a non-video row opens a text/image card rather than
        // playing — announce the real action per item (WCAG 2.4.6 / 4.1.2, name
        // must match function), exactly like the CompactTailRow twin below. The
        // headline stays in the label so "Label in Name" (WCAG 2.5.3) still holds
        // and voice users can say the visible title to activate it.
        aria-label={itemIsVideo(item) ? `Play highlight: ${item.headline}` : `Open post: ${item.headline}`}
        className={commonCls}
        style={commonStyle}
      >
        {body}
      </button>
    );
  }
  if (item.articleUrl) {
    return (
      <a key={item.id} href={item.articleUrl} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick(item.articleUrl)} className={commonCls} style={commonStyle}>
        {body}
      </a>
    );
  }
  // No external URL (some ESPN "now" items carry articleUrl=""). href={url ||
  // undefined} would drop the attribute, leaving an href-less <a> that isn't
  // keyboard-focusable and no-ops on click (WCAG 2.1.1 / 4.1.2). Render a
  // non-interactive wrapper instead — the row still shows, sans dead control.
  // Mirrors the href-less-anchor guard NewsFeed already documents.
  return (
    <div key={item.id} className="block w-full text-left" style={commonStyle}>
      {body}
    </div>
  );
}

// Compact text row for the col 3 tail (ESPN top headlines). Larger padding +
// thumb than the older 9px-thumb version so the tail visually fills the col 3
// pad-row space rather than ending with blank tail at the bottom — when fewer
// items than reserved rows, taller rows distribute the available height.
function CompactTailRow({ item, isFirst, onPlay, siblings, index }: { item: NewsItem; isFirst: boolean; onPlay?: PlayHandler; siblings: PlayOpts[]; index: number }) {
  const shouldPopModal = !!onPlay;
  // Real article thumbs win when present; otherwise fall back to the league
  // sport-icon (mirrors TextRow's 18px badge) so cross-league rows always
  // have a visual anchor instead of a wall of plain text.
  const thumb = item.imageUrl ? (
    <div
      className="news-media-preview relative w-11 h-11 shrink-0 rounded overflow-hidden"
      style={{ background: "var(--bg-card-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={proxyImage(item.imageUrl)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }} />
    </div>
  ) : item.leagueLogo && !isDemoModeActive() ? (
    // Same drop as SourceHeader above — a real per-item league mark.
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.leagueLogo}
      alt=""
      loading="lazy"
      decoding="async"
      width={18}
      height={18}
      className="w-[18px] h-[18px] object-contain shrink-0 mt-px"
      draggable={false}
      // Remote league mark (ESPN CDN); a 404/blocked hotlink would otherwise
      // leave the browser's broken-image glyph in the strip. Hide it so the
      // row degrades cleanly, matching the thumbnail onError guard above.
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  ) : null;
  // flex-1 + items-center spreads the rows vertically when we have fewer
  // items than the pad-row budget, so the tail card fills col 3's space.
  const rowCls = "flex flex-1 items-center gap-2 px-2.5 py-2 text-[11px] sm:text-[13px] font-medium leading-snug transition-colors hover:bg-[var(--bg-card-hover)] w-full text-left";
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)" };
  if (shouldPopModal) {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
            if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
            return;
          }
          onPlay!({ ...newsItemToPlayOpts(item), siblings, index });
        }}
        onAuxClick={(e) => {
          if (e.button === 1 && item.articleUrl) {
            window.open(item.articleUrl, "_blank", "noopener,noreferrer");
          }
        }}
        // The thumb is alt="", so this button's only accessible name is this
        // label. But the col-3 tail is ESPN "top headlines" — mostly plain
        // ARTICLES that open a text/image card, with only the occasional clip
        // that actually plays. A flat "Play highlight: …" on every row (the old
        // wording) announced a play action most of these rows don't perform
        // (WCAG 2.4.6 / 4.1.2 — name must match function). Name the real action
        // per item, exactly like the mobile twin NewsFeed's FeedPost; the
        // headline stays in the label so "Label in Name" (WCAG 2.5.3) holds.
        aria-label={itemIsVideo(item) ? `Play highlight: ${item.headline}` : `Open post: ${item.headline}`}
        className={`${rowCls} cursor-pointer`}
        style={rowStyle}
      >
        {thumb}
        <span className="news-title min-w-0 line-clamp-2">{item.headline}</span>
      </button>
    );
  }
  if (item.articleUrl) {
    return (
      <a href={item.articleUrl} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick(item.articleUrl)} className={rowCls} style={rowStyle}>
        {thumb}
        <span className="news-title min-w-0 line-clamp-2">{item.headline}</span>
      </a>
    );
  }
  // No external URL — render a non-interactive wrapper rather than an href-less
  // <a> (unfocusable, no-op on click; WCAG 2.1.1 / 4.1.2), mirroring the VideoRow
  // twin above and NewsFeed's documented guard. Drop the hover affordance since
  // there's nothing to activate.
  const staticCls = rowCls.replace(" transition-colors hover:bg-[var(--bg-card-hover)]", "");
  return (
    <div className={staticCls} style={rowStyle}>
      {thumb}
      <span className="news-title min-w-0 line-clamp-2">{item.headline}</span>
    </div>
  );
}
