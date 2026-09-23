"use client";

import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sport } from "@/lib/types";
import { isSensitiveNews, SensitiveCategory } from "@/lib/sensitiveNews";
import SensitiveHiddenNote from "@/components/SensitiveHiddenNote";
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
  // Gallery posts: the full picture set, paged inside the lightbox.
  images?: string[] | null;
  fallbackUrl: string;
  poster?: string | null;
  sourceLabel?: string | null;
  headline?: string | null;
  byline?: string | null;
  published?: string | null;
  // Selftext body (Reddit text posts). Only populated when there's no media
  // — rendered in the modal's textMode card below the headline.
  body?: string | null;
  // The column/feed's other posts as ready-to-open payloads, plus this post's
  // index — lets the modal page ‹ prev / next › without closing.
  siblings?: PlayOpts[] | null;
  index?: number;
}
export type PlayHandler = (opts: PlayOpts) => void;

// What a source card actually put on screen. "hidden" = it fetched fine but the
// active toolbar filters removed every item, so it rendered nothing at all.
type SourceRenderState = "loading" | "hidden" | "shown";

// Build the modal payload for a news item. Single source of truth so TextRow
// (click) and HomeContent (prev/next paging) produce identical payloads.
// A "text post" is a headline-only item with no pic/video (no thumbnail,
// inline clip, YouTube id, or Brightcove embed). Blur is for pics/videos, so
// these are hidden-by-default and gated behind the "Show text posts" toggle
// (see .news-textpost / .show-text-posts in globals.css).
export function itemIsTextPost(item: NewsItem): boolean {
  return !(item.playbackUrl || item.videoUrl || item.imageFullUrl || item.imageUrl || item.youtubeVideoId || item.embedUrl);
}

// A post is a "video" when it carries any playable clip — an official YouTube
// highlight, a direct HLS/MP4, a Brightcove embed, OR a Reddit v.redd.it clip.
// The 🎥 Videos filter keeps these across ALL sources (so Reddit clips count,
// not just the Top-Videos highlight feeds).
export function itemIsVideo(item: NewsItem): boolean {
  return !!(item.youtubeVideoId || item.playbackUrl || item.videoUrl || item.embedUrl);
}

// The ONE item-level rule behind the toolbar's Videos only + Text posts chips,
// shared by every news surface (Cards, Feed, the aligned strip's ESPN tail) so
// a pref can't be honored on one surface and ignored on another.
//   - Videos only ON  → only clip-bearing items, full stop. It OVERRIDES Text
//     posts (Jacob 9/14): Text posts has defaulted ON since 8/9 and the funnel
//     defaults to Reddit-only, so the old "text posts still show if Text posts
//     is on" rule (7/16) made Videos only a no-op for every default user — the
//     chip lit up and the board didn't change.
//   - Videos only OFF → everything, minus headline-only text posts unless Text
//     posts is on.
export function passesNewsFilters(item: NewsItem, videosOnly: boolean, showTextPosts: boolean): boolean {
  if (videosOnly) return itemIsVideo(item);
  return showTextPosts || !itemIsTextPost(item);
}

export function newsItemToPlayOpts(item: NewsItem): PlayOpts {
  const isReddit = !!item.section?.startsWith("r/");
  const hasPlayableMedia = !!(item.playbackUrl || item.videoUrl || item.youtubeVideoId || item.embedUrl);
  return {
    playbackUrl: item.playbackUrl || item.videoUrl || null,
    embedUrl: item.embedUrl || null,
    videoId: item.youtubeVideoId || undefined,
    // Lightbox source = a REAL picture only. item.imageUrl is a 140px listing
    // thumbnail on external-link posts (thumbOnly), and blowing that up to
    // lightbox size is the blurry-postage-stamp bug — such posts open as a text
    // card with the thumbnail shown at its own size instead (Jacob 7/28).
    imageUrl: hasPlayableMedia ? null : (item.imageFullUrl || (item.thumbOnly ? null : item.imageUrl) || null),
    images: hasPlayableMedia ? null : (item.images ?? null),
    fallbackUrl: item.articleUrl,
    poster: item.imageUrl || null,
    sourceLabel: item.section || null,
    headline: item.headline,
    byline: isReddit ? null : (item.byline || null),
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
  swappableOptions?: { sport: Sport; label: string; offseason?: boolean; upcomingLabel?: string }[];
  // The 1-based column number each sport lives in — used to label already-
  // shown options "· col N" instead of greying them (see LeagueColumn).
  shownElsewhere?: { sport: Sport; col: number }[];
  selectedSport?: Sport;
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // Switch this column to the ESPN "Top news" headlines feed (see NewsColumnTitle).
  onPickEspn?: () => void;
  espnActive?: boolean;
  // What "Auto" resolves to for this column, so the switcher can mark it
  // "· default" instead of leaving Auto an opaque choice (Jacob 8/9).
  autoSport?: Sport;
  autoIsEspn?: boolean;
  // When true, the column renders only its source cards — the title row is
  // rendered separately above (e.g. as part of the page-level TitleStrip
  // that sits above AlignedVideoStrip). Keeps the league title above the
  // big-format video strip instead of buried below it.
  hideTitle?: boolean;
  // Override the default narrow column width (e.g. for single-column mode).
  // When omitted, falls back to the standard 225/280px max.
  widthClassName?: string;
  // Any news-card click → open the shared media/text modal. Receives the full
  // payload so the modal can choose video, image, embed, or text mode.
  onPlayVideo?: PlayHandler;
  // Forwarded to this column's own title (non-strip layout only) so HomeContent
  // can measure --news-titlebar-h from it — see NewsColumnTitle.measureRef.
  titleMeasureRef?: (el: HTMLDivElement | null) => void;
  // 🎥 Videos filter — when true, each source shows only its clip-bearing items
  // (highlights + Reddit clips) and video-less sources render nothing.
  videosOnly?: boolean;
  // Settings → "Hide upsetting news" (see lib/sensitiveNews). The column totals
  // what its sources dropped and prints one footer line; onShowSensitive lifts
  // the filter for this session (the preference itself is untouched).
  // Categories switched on by the two Settings toggles; empty = filter off.
  hiddenCategories?: SensitiveCategory[];
  onShowSensitive?: () => void;
  // Headline-only rows are independently hidden unless this is true.
  showTextPosts?: boolean;
  // Reverse each source's rendered order (oldest first) — the ⇅ news-header
  // control, so a feed can be read bottom-to-top.
  oldestFirst?: boolean;
  // Show the subtle × remove-column control on this column's title (see
  // NewsColumnTitle.removable) — set only when more than one column is visible.
  removable?: boolean;
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
  autoSport,
  autoIsEspn,
  measureRef,
  removable,
}: {
  title: string;
  swappableOptions?: { sport: Sport; label: string; offseason?: boolean; upcomingLabel?: string }[];
  shownElsewhere?: { sport: Sport; col: number }[];
  selectedSport?: Sport;
  onSwapLeague?: (sport: Sport | "empty" | undefined) => void;
  // When true (more than one column showing), render a subtle × on the title
  // row that drops this column — a one-tap "stick to 1-2 columns" for a clean
  // view, without digging into the swap dropdown's "Remove col" (Jacob 7/16).
  removable?: boolean;
  // Switch this column to the ESPN "Top news" headlines feed. Provided for
  // every news column so the feed is always one tap away, even after slot 3
  // was emptied (it reappears as the last column).
  onPickEspn?: () => void;
  espnActive?: boolean;
  // See NewsColumnProps — marks the option "Auto" would land on.
  autoSport?: Sport;
  autoIsEspn?: boolean;
  // Callback ref on the title's root so the parent can measure its height into
  // --news-titlebar-h. In the strip layout HomeContent measures a shared title
  // row; here the same ref rides one per-column title so the measurement also
  // happens in the NON-strip layout (columns render their own titles). Without
  // it --news-titlebar-h stays 0 in non-strip mode and every source header pins
  // at header-h — flush behind the black league title, clipping the first card.
  measureRef?: (el: HTMLDivElement | null) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const swapRef = useRef<HTMLDivElement>(null);
  const swapPanelRef = useRef<HTMLDivElement>(null);
  const [swapMaxH, setSwapMaxH] = useState<number>();
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

  // Same viewport cap the LeagueColumn switcher uses: the league list can run
  // past the bottom of a short window, and because the column header is sticky,
  // scrolling the page drags the panel down with it instead of revealing the
  // tail. Cap to the room left under the trigger and scroll inside.
  useEffect(() => {
    if (!swapOpen) return;
    const measure = () => {
      const el = swapPanelRef.current;
      if (!el) return;
      // The mobile view-mode tab bar is fixed to the bottom at z-40, above this
      // panel — without subtracting it the last few leagues scrolled into view
      // but sat *behind* the bar. Both variants are in the DOM (the inline
      // desktop one and the fixed mobile bar); only the fixed one blocks, so
      // pick by computed position rather than assuming.
      const nav = Array.from(document.querySelectorAll('nav[aria-label="View mode"]'))
        .find((n) => getComputedStyle(n).position === "fixed");
      const bottomBar = nav ? nav.getBoundingClientRect().height : 0;
      // 12px so the panel never sits flush against the bottom edge.
      const room = Math.max(160, window.innerHeight - bottomBar - el.getBoundingClientRect().top - 12);
      setSwapMaxH((prev) => (prev !== undefined && Math.abs(prev - room) < 1 ? prev : room));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [swapOpen]);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;
  return (
    <div
      ref={measureRef}
      className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30"
      style={{ background: "var(--bg)", paddingTop: "1.75rem" }}
    >
      <div className="relative flex items-center justify-center px-6 w-full">
        {isSwappable ? (
          <div ref={swapRef} className="relative">
            {/* Heading WRAPS the button (the WAI-ARIA disclosure pattern), not
                the reverse: a <button>'s content model is phrasing content, so an
                <h2> nested inside it is invalid HTML and assistive tech may drop
                the heading role. This keeps the swappable title a real <h2>
                heading — matching the non-swappable branch below — while the
                button stays the interactive trigger. The button inherits the
                heading's font + color, so it renders pixel-for-pixel unchanged. */}
            <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
              <button
                type="button"
                onClick={() => setSwapOpen(!swapOpen)}
                className="cursor-pointer transition-colors hover:opacity-80"
                title="Switch news league"
                aria-haspopup="dialog"
                aria-expanded={swapOpen}
              >
                {title}
              </button>
            </h2>
            {swapOpen && (
              <div
                // The toggle above declares aria-haspopup + aria-expanded, so
                // name the popover it opens and give it a role — otherwise it
                // surfaces to assistive tech as an anonymous, role-less region.
                // Matches the role="dialog" + aria-label pattern the rest of the
                // app's overlays use (see DateNav's calendar popover).
                role="dialog"
                aria-label="Switch news league"
                ref={swapPanelRef}
                className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 py-1 min-w-[120px] overflow-y-auto overscroll-contain"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", maxHeight: swapMaxH }}
              >
                {/* Auto reverts to the in-season default for this slot. */}
                <button
                  type="button"
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
                  const elsewhere = isCurrent ? undefined : shownElsewhere?.find((e) => e.sport === opt.sport);
                  // The league this column falls back to on Auto — bolded and
                  // tagged so the fallback is visible before you commit to it.
                  const isAutoDefault = !autoIsEspn && opt.sport === autoSport;
                  return (
                    <button
                      type="button"
                      key={opt.sport}
                      onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                      // The active league is otherwise signalled only by color +
                      // weight; aria-current voices it to screen readers (matches
                      // the DateNav day-pill pattern).
                      aria-current={isCurrent ? "true" : undefined}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{
                        color: isCurrent ? "var(--accent)" : opt.offseason ? "var(--text-muted)" : "var(--text)",
                        fontWeight: isCurrent || isAutoDefault ? 600 : 400,
                      }}
                      title={elsewhere ? `Already shown in column ${elsewhere.col} — pick to add a second` : opt.upcomingLabel ? `Season starts ${opt.upcomingLabel}` : isAutoDefault ? "What Auto picks for this column" : undefined}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {opt.label}
                      {opt.offseason && <em className="font-normal"> · offseason</em>}
                      {opt.upcomingLabel && <em className="font-normal"> · {opt.upcomingLabel}</em>}
                      {elsewhere && <em className="font-normal" style={{ color: "var(--text-muted)" }}> · col {elsewhere.col}</em>}
                      {isAutoDefault && !isCurrent && <em className="font-normal" style={{ color: "var(--text-muted)" }}> · default</em>}
                    </button>
                  );
                })}
                {/* Top news = ESPN's cross-sport headlines feed. Sits in its
                    own group so it reads as a distinct choice from the leagues
                    and is always reachable (re-adds the column if it was gone). */}
                {onPickEspn && (
                  <button
                    type="button"
                    onClick={() => { onPickEspn(); setSwapOpen(false); }}
                    aria-current={espnActive ? "true" : undefined}
                    className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                    style={{
                      color: espnActive ? "var(--accent)" : "var(--text)",
                      fontWeight: espnActive || autoIsEspn ? 600 : 400,
                      borderTop: "1px solid var(--border)",
                    }}
                    title={autoIsEspn ? "What Auto picks for this column" : "Show ESPN's top headlines in this column"}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Top news (ESPN)
                    {autoIsEspn && !espnActive && <em className="font-normal" style={{ color: "var(--text-muted)" }}> · default</em>}
                  </button>
                )}
                {/* Remove col hides the column entirely (matches the scores-view
                    behavior). User re-adds via the + button on scores or via
                    the focus pill. */}
                <button
                  type="button"
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
        {removable && onSwapLeague && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwapLeague("empty"); }}
            aria-label={`Remove ${title} column`}
            title="Remove this column"
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-opacity opacity-40 hover:opacity-100"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
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
            // Decode off the main thread so a heavy source mark can't block
            // scroll/paint as sticky headers come into view (loading="lazy"
            // defers the fetch, not the decode). Matches the decoding hint
            // already on this header's twin in AlignedVideoStrip.SourceHeader.
            decoding="async"
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

function TextSourceCard({ label, logoUrl, items, loading, onPlay, siblings, baseIndex }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler; siblings?: PlayOpts[] | null; baseIndex?: number | null }) {
  // The sibling list spans every source in the column. baseIndex is this card's
  // offset; a row's global index = baseIndex + its row index.
  const columnSiblings = baseIndex != null ? (siblings ?? null) : null;
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
        // Announce the resolved-empty result too, not just the loading state
        // above — the load swaps role=status "Loading headlines…" out for this
        // bare line, so without its own live region a screen-reader user heard
        // "Loading…" then silence, never learning the column came back empty.
        // role=status + aria-live matches the loading skeleton here and the
        // "No games found" empty state in TeamView (WCAG 4.1.3).
        <p role="status" aria-live="polite" className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No headlines</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => (
            <TextRow key={item.id} item={item} isFirst={idx === 0} onPlay={onPlay} siblings={columnSiblings} index={columnSiblings ? (baseIndex ?? 0) + idx : idx} />
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
  // NO per-row reveal gesture here. The list headline OPENS the post, full stop
  // (Jacob 8/10, reversing the tri-state toggle added earlier the same day):
  // "should only have that happen when I'm in a modal — not on the news
  // homepage, so I can open articles/videos by clicking them normally."
  // Show/hide-per-item lives in the modal (VideoModal's PeekBlur); the global
  // Headlines chip is what un-blurs the board in place.
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
  // Text-post visibility is independent from headline reveal. But a text-post
  // headline is itself a
  // spoiler ("can't believe they blew it"), so when shown it must stay blurred
  // like every other headline — same as the mobile Feed view (Jacob 7/15).
  // .news-textpost gates visibility; .news-title keeps the headline blurred
  // until the global reveal toggle un-blurs it or the row is tapped open.
  const isTextPost = itemIsTextPost(item);
  const rowCls = `flex items-start gap-2 px-3 py-2 text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)] sm:min-h-[7rem]${isTextPost ? " news-textpost" : ""}`;
  const titleCls = "news-title min-w-0 line-clamp-5";
  const rowStyle = { borderTop: isFirst ? "none" : "1px solid var(--border)", color: "var(--text)" };
  // Every news item opens the same modal; its source link remains available
  // inside, and modifier-click still opens that source directly in a new tab.
  const shouldPopModal = !!onPlay;
  const hasInlineMedia = !!(item.playbackUrl || item.videoUrl || item.imageFullUrl || item.youtubeVideoId || item.embedUrl);
  const showThumb = !!item.imageUrl && !imgFailed;
  const thumb = showThumb ? (
    <div
      className="news-media-preview relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded overflow-hidden"
      style={{ background: "var(--bg-card-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyImage(item.imageUrl!, 160)}
        alt=""
        loading="lazy"
        // decoding="async" moves the image decode off the main thread so a
        // heavy remote thumbnail can't block scroll/paint as news rows come
        // into view (loading="lazy" defers the fetch, not the decode).
        // Matches the AlignedVideoStrip thumbnails.
        decoding="async"
        className="w-full h-full object-cover"
        draggable={false}
        onError={() => setImgFailed(true)}
      />
      {hasInlineMedia && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
            {/* Pick the play triangle for ANY playable clip, not just
                videoUrl/youtubeVideoId: hasInlineMedia (above) also lets a
                direct-HLS (playbackUrl) or Brightcove-embed (embedUrl) item into
                this branch, and those play on tap too — so the old check drew the
                open-external/expand arrows over a video. Reuse itemIsVideo(), the
                same signal the NewsFeed twin and the 🎥 Videos filter use. */}
            {itemIsVideo(item) ? (
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
      className="news-media-preview relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded overflow-hidden flex items-center justify-center"
      style={{ background: "var(--bg-card-hover)" }}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
        {itemIsVideo(item) ? (
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
      // Decode off the main thread so this remote league mark can't block
      // scroll/paint as news cards come into view (loading="lazy" defers the
      // fetch, not the decode). Matches the decoding hint already on its twin
      // in AlignedVideoStrip's leagueLogo branch.
      decoding="async"
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
  // Only the 48/56px media tiles are a real tap target. The leagueLogo branch
  // renders an 18px mark, which is decoration, not a button — rows that fall
  // back to it get the chevron instead.
  const thumbIsTile = showThumb || hasInlineMedia;
  // ONE rule now: every clickable part of the row — thumbnail, headline,
  // chevron — opens the post. Modifier/middle-click still means "open the
  // source in a background tab" everywhere, so the split is only in the target,
  // never in what a plain click does.
  const openInNewTab = (e: ReactMouseEvent) => {
    if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return false;
    if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
    return true;
  };
  if (shouldPopModal) {
    const open = () => onPlay!({ ...newsItemToPlayOpts(item), siblings: siblings ?? undefined, index });
    return (
      <div
        className={`${rowCls} w-full text-left`}
        style={rowStyle}
      >
        {/* The thumbnail always opens the post — that's the escape hatch for a
            row whose headline is still blurred (and the same split the Feed
            view uses: headline peeks, media opens). */}
        {thumbIsTile ? (
          <button
            type="button"
            onClick={(e) => {
              // Cmd/Ctrl/Shift/middle-click → "open in background tab to read
              // later" — never blow away the currently-open modal. Without this
              // the button just re-pops the modal with new content and the user
              // loses the video/image they were watching.
              if (openInNewTab(e)) return;
              // Same payload via the shared helper, plus the column's siblings so the
              // modal can page prev/next across the full rendered column.
              open();
            }}
            onAuxClick={(e) => {
              // Middle-click fires onAuxClick, not onClick. Mirror the modifier
              // path so wheel-click also opens in a background tab.
              if (e.button === 1 && item.articleUrl) {
                window.open(item.articleUrl, "_blank", "noopener,noreferrer");
              }
            }}
            className="shrink-0 cursor-pointer"
            aria-label="Open post"
            title="Open post"
          >
            {thumb}
          </button>
        ) : thumb}
        <button
          type="button"
          onClick={(e) => {
            if (openInNewTab(e)) return;
            open();
          }}
          onAuxClick={(e) => {
            if (e.button === 1 && item.articleUrl) {
              window.open(item.articleUrl, "_blank", "noopener,noreferrer");
            }
          }}
          className="min-w-0 flex-1 text-left cursor-pointer"
          title="Open post"
          aria-label="Open post"
        >
          <span className={titleCls}>{item.headline}</span>
        </button>
        {/* Rows with no thumbnail (plain text posts — now shown by default)
            get a small chevron at the right edge as an explicit open
            affordance, without touching the row height the column alignment
            depends on. */}
        {!thumbIsTile && (
          <button
            type="button"
            onClick={(e) => {
              // Mirror the thumbnail/headline controls above: modifier-click
              // opens the source in a background tab instead of re-popping the
              // modal, honoring this row's "every clickable part" contract.
              if (openInNewTab(e)) return;
              open();
            }}
            onAuxClick={(e) => {
              // Middle-click fires onAuxClick, not onClick — mirror the modifier
              // path so wheel-click also opens in a background tab.
              if (e.button === 1 && item.articleUrl) {
                window.open(item.articleUrl, "_blank", "noopener,noreferrer");
              }
            }}
            className="shrink-0 self-start mt-0.5 w-6 h-6 -mr-1 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Open post"
            title="Open post"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )}
      </div>
    );
  }
  // An ESPN item can carry an empty articleUrl (news.ts falls back to ""), and
  // the click handlers here already no-op on a missing URL (handleExternalClick
  // / openInNewTab both guard `if (!item.articleUrl)`). The markup has to match:
  // an <a> with no href drops out of the tab order and leaves its
  // aria-label="Open post" on a role-less element that announces an action it
  // can't perform. So when there's nothing to open, render the same content
  // without the link wrapper (and drop the dead chevron affordance).
  const hasUrl = !!item.articleUrl;
  return (
    <div className={rowCls} style={rowStyle}>
      {thumbIsTile && hasUrl ? (
        <a
          href={item.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalClick(item.articleUrl)}
          className="shrink-0"
          aria-label="Open post"
        >
          {thumb}
        </a>
      ) : thumb}
      {/* No modal on this surface, so the headline is a real link to the
          source — same target as the thumbnail and chevron beside it, which
          keeps middle-click, keyboard, and "copy link" honest. */}
      {hasUrl ? (
        <a
          href={item.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalClick(item.articleUrl)}
          className="min-w-0 flex-1 text-left cursor-pointer"
          aria-label="Open post"
        >
          <span className={titleCls}>{item.headline}</span>
        </a>
      ) : (
        <span className="min-w-0 flex-1 text-left">
          <span className={titleCls}>{item.headline}</span>
        </span>
      )}
      {!thumbIsTile && hasUrl && (
        <a
          href={item.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalClick(item.articleUrl)}
          className="shrink-0 self-start mt-0.5 w-6 h-6 -mr-1 flex items-center justify-center rounded"
          style={{ color: "var(--text-muted)" }}
          aria-label="Open post"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </a>
      )}
    </div>
  );
}

function VideoSourceCard({ label, logoUrl, items, loading, onPlay, siblings, baseIndex }: { label: string; logoUrl?: string; items: NewsItem[]; loading: boolean; onPlay?: PlayHandler; siblings?: PlayOpts[] | null; baseIndex?: number | null }) {
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
        // Announce the resolved-empty result, mirroring the loading role=status
        // above and the TextSourceCard empty state — otherwise the load swaps
        // "Loading videos…" out for a silent line (WCAG 4.1.3).
        <p role="status" aria-live="polite" className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No videos</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => {
            const commonCls = "block w-full text-left transition-opacity hover:opacity-90 cursor-pointer";
            const commonStyle = { borderTop: idx === 0 ? "none" : "1px solid var(--border)" };
            const body = (
              <>
              {item.imageUrl && (
                <div className="news-media-preview relative w-full aspect-video" style={{ background: "var(--bg-card-hover)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxyImage(item.imageUrl)}
                    alt=""
                    loading="lazy"
                    // Decode off the main thread so this full-width 16:9 news
                    // thumbnail doesn't block scroll/paint as cards come into
                    // view (loading="lazy" defers the fetch, not the decode).
                    // Matches the AlignedVideoStrip thumbnails.
                    decoding="async"
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
            // Every item opens the shared modal, including image/text fallbacks.
            // The source article remains one tap away inside the modal.
            if (onPlay) {
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={(e) => {
                    // Modifier-click → open the source article in a background
                    // tab instead of replacing the currently-open modal.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
                      if (item.articleUrl) window.open(item.articleUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    onPlay!({
                      ...newsItemToPlayOpts(item),
                      // Keep URL-derived labels here ("Open on MLB.com" rather
                      // than the verbose source-card label).
                      sourceLabel: null,
                      siblings: siblings ?? undefined,
                      index: baseIndex != null ? baseIndex + idx : idx,
                    });
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1 && item.articleUrl) {
                      window.open(item.articleUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                  // The button wraps the thumbnail (alt="") + headline, so its
                  // accessible name is just the headline — a screen-reader/voice-
                  // control user hears the title but gets no cue what this control
                  // DOES. Name the action explicitly; the headline stays inside the
                  // label so "Label in Name" (WCAG 2.5.3) still holds and voice
                  // users can say the visible title to activate it. But this card
                  // isn't videos-only: with the Text posts toggle on it also holds
                  // clip-less text/image posts (the `shown` filter above keeps
                  // itemIsTextPost items), and those open a card rather than play —
                  // so branch the verb on itemIsVideo (WCAG 2.4.6 / 4.1.2, name must
                  // match function), matching the twin Play button in
                  // AlignedVideoStrip's VideoRow/CompactTailRow and NewsFeed's row.
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
                <a
                  key={item.id}
                  href={item.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleExternalClick(item.articleUrl)}
                  className={commonCls}
                  style={commonStyle}
                >
                  {body}
                </a>
              );
            }
            // No external URL (some ESPN "now" items carry articleUrl=""). Keeping
            // href={item.articleUrl || undefined} would drop the attribute, leaving
            // an href-less <a> that isn't keyboard-focusable and no-ops on click
            // (WCAG 2.1.1 / 4.1.2) while still showing commonCls's cursor-pointer.
            // Render a non-interactive wrapper instead — the row still shows, sans
            // dead control. Mirrors the href-less-anchor guard AlignedVideoStrip's
            // VideoRow and NewsFeed already document. (This branch only runs when
            // onPlay is absent; both production call sites pass onPlayVideo, so it
            // hardens the latent case rather than changing today's behavior.)
            return (
              <div key={item.id} className="block w-full text-left" style={commonStyle}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceSection({ source, onPlayVideo, onItemsLoaded, onRenderState, siblings, baseIndex, videosOnly, showTextPosts, oldestFirst, hiddenCategories, onSensitiveHidden }: { source: NewsSource; onPlayVideo?: PlayHandler; onItemsLoaded?: (label: string, items: NewsItem[]) => void; onRenderState?: (label: string, state: SourceRenderState) => void; siblings?: PlayOpts[] | null; baseIndex?: number | null; videosOnly?: boolean; showTextPosts?: boolean; oldestFirst?: boolean; hiddenCategories?: SensitiveCategory[]; onSensitiveHidden?: (label: string, count: number) => void }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Key the fetch on stable strings so parent re-renders that produce a new
  // `source` object with identical contents don't re-trigger the fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Guard the fetch: without a .catch a rejected source.fetch() would skip the
    // .then entirely, so setLoading(false) never fires and the card stays pinned
    // on its loading skeletons forever. Settle to [] on rejection so the card
    // degrades to its "No headlines"/"No videos" empty state instead — the same
    // .catch(() => []) guard NewsFeed and AlignedVideoStrip already put on the
    // identical source.fetch() call. Latent today (the built-in fetchers catch
    // internally and resolve []), so no happy-path change; this hardens the
    // rejection case (a future source, or a synchronous throw inside a fetch
    // closure, would otherwise hang the column).
    source.fetch()
      .catch(() => [] as NewsItem[])
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.label]);

  // 🎥 Videos filter: keep only clip-bearing items (includes Reddit v.redd.it
  // posts). Once loaded, a source with no videos renders nothing so the board
  // isn't full of empty cards.
  // [rendered items, how many the sensitive filter removed]. The count is kept
  // per source so the column can total it up in one footer line instead of
  // repeating a note on every card.
  const [shown, sensitiveHidden] = useMemo<[NewsItem[], number]>(
    // Videos only wins over Text posts (Jacob 9/14) — see passesNewsFilters.
    // (The 7/16 rule let Text posts re-admit headline-only rows under Videos
    // only; once Text posts defaulted ON on 8/9 that made Videos only a no-op.)
    () => {
      const preFilter = items.filter((item) => passesNewsFilters(item, !!videosOnly, !!showTextPosts));
      const kept = hiddenCategories?.length ? preFilter.filter((item) => !isSensitiveNews(item, hiddenCategories)) : preFilter;
      // Bottom-to-top reading order (the ⇅ control next to the funnel). Reverse
      // AFTER filtering so the flip is over what's actually on screen, and copy
      // first — items is the fetched array other memos also read.
      return [oldestFirst ? [...kept].reverse() : kept, preFilter.length - kept.length];
    },
    [items, videosOnly, showTextPosts, oldestFirst, hiddenCategories],
  );
  useEffect(() => { onSensitiveHidden?.(source.label, sensitiveHidden); }, [sensitiveHidden, source.label, onSensitiveHidden]);
  // Publish exactly what is rendered so modal prev/next never pages into a row
  // that the active Videos filter hid.
  useEffect(() => { onItemsLoaded?.(source.label, shown); }, [shown, source.label, onItemsLoaded]);
  // A source whose items all got filtered out renders nothing (see below). When
  // EVERY source in a column does that, the column body is blank with no
  // explanation — which reads as a broken app rather than an active filter
  // (Jacob 8/3: MLB looked empty because the funnel defaults to Reddit-only, so
  // the column held just r/baseball, and Videos hid it on a day with no clips).
  // Report the outcome up so NewsColumn can say so. `loading` is distinct from
  // `hidden` so the message can't flash before the fetches settle.
  const hidden = !loading && items.length > 0 && shown.length === 0;
  const renderState: SourceRenderState = loading ? "loading" : hidden ? "hidden" : "shown";
  useEffect(() => { onRenderState?.(source.label, renderState); }, [renderState, source.label, onRenderState]);
  if (hidden) return null;

  if (source.variant === "video") {
    return (
      <VideoSourceCard
        label={source.label}
        logoUrl={source.logoUrl}
        items={shown}
        loading={loading}
        onPlay={onPlayVideo}
        siblings={siblings}
        baseIndex={baseIndex}
      />
    );
  }
  return <TextSourceCard label={source.label} logoUrl={source.logoUrl} items={shown} loading={loading} onPlay={onPlayVideo} siblings={siblings} baseIndex={baseIndex} />;
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
  autoSport,
  autoIsEspn,
  hideTitle,
  widthClassName,
  onPlayVideo,
  titleMeasureRef,
  videosOnly,
  showTextPosts,
  oldestFirst,
  removable,
  hiddenCategories,
  onShowSensitive,
}: NewsColumnProps) {
  const widthCls = widthClassName ?? "flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]";

  // Collect each section's rendered items so one prev/next list spans the full
  // column, regardless of source type. Keyed by source.label (stable + unique).
  const [itemsBySource, setItemsBySource] = useState<Record<string, NewsItem[]>>({});
  const handleItemsLoaded = useCallback((label: string, items: NewsItem[]) => {
    setItemsBySource((prev) => (prev[label] === items ? prev : { ...prev, [label]: items }));
  }, []);

  // Per-source render outcome, so an all-filtered-out column can explain itself
  // instead of rendering a bare title over blank space (see SourceSection).
  const [stateBySource, setStateBySource] = useState<Record<string, SourceRenderState>>({});
  const handleRenderState = useCallback((label: string, state: SourceRenderState) => {
    setStateBySource((prev) => (prev[label] === state ? prev : { ...prev, [label]: state }));
  }, []);
  // Only once every source has settled AND every one of them was filtered away.
  // A column that is merely still loading, or that has a source rendering its
  // own "No headlines" card, must not show this.
  const allFiltered = sources.length > 0 && sources.every((s) => stateBySource[s.label] === "hidden");

  // How many items the "Hide upsetting news" filter removed, per source, so the
  // column prints ONE footer line rather than a note on every card.
  const [sensitiveBySource, setSensitiveBySource] = useState<Record<string, number>>({});
  const handleSensitiveHidden = useCallback((label: string, count: number) => {
    setSensitiveBySource((prev) => (prev[label] === count ? prev : { ...prev, [label]: count }));
  }, []);
  // Only count sources still mounted in this column — a swapped-out league must
  // not leave its tally behind.
  const sensitiveHidden = sources.reduce((n, s) => n + (sensitiveBySource[s.label] ?? 0), 0);

  // Walk sections in render order, append every post, and record where each
  // source starts in the shared modal list.
  const { siblings, baseIndexBySource } = useMemo(() => {
    const sib: PlayOpts[] = [];
    const base: Record<string, number> = {};
    for (const source of sources) {
      const its = itemsBySource[source.label];
      if (its && its.length) {
        base[source.label] = sib.length;
        for (const it of its) sib.push(newsItemToPlayOpts(it));
      }
    }
    return { siblings: sib, baseIndexBySource: base };
  }, [sources, itemsBySource]);

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
          autoSport={autoSport}
          autoIsEspn={autoIsEspn}
          measureRef={titleMeasureRef}
          removable={removable}
        />
      )}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {sources.map((source) => (
          <SourceSection
            key={source.label}
            source={source}
            onPlayVideo={onPlayVideo}
            onItemsLoaded={handleItemsLoaded}
            onRenderState={handleRenderState}
            siblings={siblings}
            baseIndex={baseIndexBySource[source.label] ?? null}
            videosOnly={videosOnly}
            showTextPosts={showTextPosts}
            oldestFirst={oldestFirst}
            hiddenCategories={hiddenCategories}
            onSensitiveHidden={handleSensitiveHidden}
          />
        ))}
        {allFiltered && (
          // role=status so a screen reader hears why the column went quiet,
          // matching the Feed view's "No posts to show." treatment.
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg px-3 py-6 text-center text-xs leading-relaxed"
            style={{ background: "var(--bg-card)", boxShadow: "inset 0 0 0 1px var(--border)", color: "var(--text-muted)" }}
          >
            {videosOnly ? "No videos here right now." : "Nothing to show with these filters."}
            <span className="block mt-1" style={{ opacity: 0.8 }}>
              {videosOnly
                ? "Turn off Videos only, or widen Source in the filter menu."
                : "Try widening Source in the filter menu."}
            </span>
          </div>
        )}
        {sensitiveHidden > 0 && (
          <div className="pt-1 pb-2 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
            <SensitiveHiddenNote count={sensitiveHidden} onShow={onShowSensitive} />
          </div>
        )}
      </div>
    </div>
  );
}
