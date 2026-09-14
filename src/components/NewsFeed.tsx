"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { NewsItem, proxyImage, formatPublished } from "@/lib/news";
import { getTimeZone } from "@/lib/etDay";
import { handleExternalClick } from "@/lib/openExternal";
import { isSensitiveNews, SensitiveCategory } from "@/lib/sensitiveNews";
import SensitiveHiddenNote from "@/components/SensitiveHiddenNote";
import {
  NewsSource,
  PlayHandler,
  PlayOpts,
  newsItemToPlayOpts,
  itemIsVideo,
  passesNewsFilters,
} from "@/components/NewsColumn";

// Vertical "Feed" view for the news section — a single Reddit-style scroll of
// full posts (inline image + headline + blurred top comments) instead of the
// default multi-column "Cards" board. Aggregates every visible column's sources
// into one time-sorted stream. Tapping a post's media opens the same lightbox
// (VideoModal) the Cards view uses, so playback / paging / share are unchanged.
//
// Spoiler model matches the rest of the app: HEADLINES are blurred (the global
// reveal toggle un-blurs them); COMMENTS are blurred and tap-to-reveal per post
// (they routinely state the score). Image/video previews can be blurred with
// the independent Media toolbar toggle.

interface NewsFeedProps {
  sources: NewsSource[];
  onPlay: PlayHandler;
  showTextPosts: boolean;
  // Reverse the merged feed so the oldest post is first (⇅ in the news header).
  oldestFirst?: boolean;
  videosOnly: boolean;
  // Settings → "Hide upsetting news". When on, items matching lib/sensitiveNews
  // are dropped from the merged feed and counted in a footer line; tapping its
  // Show link calls onShowSensitive, which lifts the filter for this session
  // only (the preference itself is untouched).
  // Categories switched on by the two Settings toggles; empty = filter off.
  hiddenCategories?: SensitiveCategory[];
  onShowSensitive?: () => void;
}

// Merge every source's items into one de-duped, time-sorted list. Dedupe by the
// permalink (or id) so a subreddit that appears in two columns (e.g. r/sports)
// isn't shown twice.
function useAggregatedFeed(sources: NewsSource[]) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  // Identity key for the source set so the effect refetches only when the actual
  // feed composition changes, not on every parent re-render (sources is rebuilt
  // inline each render in HomeContent).
  const key = sources.map((s) => s.label).join("|");
  useEffect(() => {
    let alive = true;
    setItems(null);
    if (sources.length === 0) { setItems([]); return; }
    // Merge INCREMENTALLY as each source resolves — never block the whole feed on
    // the slowest (or a hanging) source. De-dupe by permalink/id; re-sort on every
    // commit. Stays null ("Loading…") until either the first items arrive or every
    // source has settled empty (then [] → "No posts"), so there's no empty flash.
    const acc = new Map<string, NewsItem>();
    let settled = 0;
    const commit = (force: boolean) => {
      if (!alive || (acc.size === 0 && !force)) return;
      setItems(
        [...acc.values()].sort((a, b) => {
          // Coerce an unparseable timestamp to 0, not NaN. The `published ? … : 0`
          // guard alone only catches an EMPTY string — a present-but-malformed
          // date (feeds are heterogeneous; some emit non-ISO strings) makes
          // Date.parse return NaN, and `tb - ta` then evaluates NaN for every
          // comparison touching that item. NaN is an inconsistent comparator, so
          // V8 leaves the surrounding order undefined and the post lands at an
          // arbitrary spot. Number.isNaN → 0 sinks the bad item to the bottom,
          // matching the same guard in TeamView's sort and news.ts formatPublished.
          const ms = (s?: string) => {
            const t = s ? Date.parse(s) : 0;
            return Number.isNaN(t) ? 0 : t;
          };
          return ms(b.published) - ms(a.published);
        })
      );
    };
    sources.forEach((s) => {
      s.fetch()
        .catch(() => [] as NewsItem[])
        .then((list) => {
          if (!alive) return;
          for (const it of list) {
            const k = it.articleUrl || it.id;
            if (k && !acc.has(k)) acc.set(k, it);
          }
          settled += 1;
          commit(settled === sources.length);
        });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return items;
}

export default function NewsFeed({ sources, onPlay, showTextPosts, videosOnly, oldestFirst, hiddenCategories, onShowSensitive }: NewsFeedProps) {
  const items = useAggregatedFeed(sources);

  // Visible posts: the same passesNewsFilters rule the Cards view applies —
  // Videos only keeps only clip-bearing posts (and overrides Text posts, Jacob
  // 9/14); otherwise headline-only text posts hide unless Text posts is on.
  // How many posts the sensitive filter removed, so the feed can say so rather
  // than silently shrinking. Counted over the SAME post set the other filters
  // leave behind, so the number matches what would appear if it were off.
  const [visible, sensitiveHidden] = useMemo<[NewsItem[], number]>(
    () => {
      const preFilter = (items ?? []).filter((it) => passesNewsFilters(it, videosOnly, showTextPosts));
      const kept = hiddenCategories?.length ? preFilter.filter((it) => !isSensitiveNews(it, hiddenCategories)) : preFilter;
      // ⇅ Oldest first: the Feed is already time-sorted newest-first, so a plain
      // reverse IS chronological order here. Reverse a copy — `items` is shared.
      return [oldestFirst ? [...kept].reverse() : kept, preFilter.length - kept.length];
    },
    [items, showTextPosts, videosOnly, oldestFirst, hiddenCategories]
  );

  // Prebuild the paging payloads once so tapping any post opens the lightbox
  // with the whole feed as its ‹ prev / next › list.
  const playList: PlayOpts[] = useMemo(
    () => visible.map((it) => newsItemToPlayOpts(it)),
    [visible]
  );

  // The feed starts at items === null ("Loading feed…") and asynchronously
  // settles to the post list or an empty result ("No posts to show.") as each
  // source resolves. role=status + aria-live=polite voices that transition, so
  // an SR user who switches into the Feed view hears that it's loading / came
  // back empty instead of getting silence — matching the status lines in
  // TeamView / FeedbackBox / SettingsPanel (WCAG 4.1.3).
  if (items === null) {
    return (
      <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
        Loading feed…
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
        {/* Same copy as the Cards column's all-filtered state (NewsColumn), so
            an empty Videos-only feed says WHY it's empty and how to fix it
            instead of a bare "No posts to show." */}
        {videosOnly ? "No videos here right now." : "No posts to show."}
        {videosOnly && (
          <span className="block mt-1" style={{ opacity: 0.8 }}>
            Turn off Videos only, or widen Source in the filter menu.
          </span>
        )}
        {sensitiveHidden > 0 && (
          <span className="block mt-2">
            <SensitiveHiddenNote count={sensitiveHidden} onShow={onShowSensitive} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-16 flex flex-col gap-3">
      {visible.map((it, i) => (
        <FeedPost
          key={it.articleUrl || it.id}
          item={it}
          onOpen={() =>
            onPlay({ ...newsItemToPlayOpts(it), siblings: playList, index: i })
          }
        />
      ))}
      {sensitiveHidden > 0 && (
        <div className="pt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          <SensitiveHiddenNote count={sensitiveHidden} onShow={onShowSensitive} />
        </div>
      )}
    </div>
  );
}

function FeedPost({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  const [showComments, setShowComments] = useState(false);
  // Stable, SSR-safe id tying the comments disclosure button to the strip it
  // reveals. useId() (not a hard-coded id) keeps every FeedPost in the merged
  // scroll unique — many posts render this toggle at once, so a constant id
  // would emit duplicate ids and an ambiguous aria-controls across the feed.
  const commentsId = useId();
  const isReddit = !!item.section?.startsWith("r/");
  // Hero = a real picture (gallery cover / full-res image post). A thumbOnly
  // item has nothing but Reddit's 140px link-preview crop: stretched to card
  // width that's the blurry-smear bug, so it renders as a small tile instead.
  const gallery = item.images ?? [];
  const img = gallery[0] || item.imageFullUrl || (item.thumbOnly ? null : item.imageUrl);
  const tile = !img && item.imageUrl ? item.imageUrl : null;
  const isVideo = itemIsVideo(item);
  const hasMedia = !!img || !!tile || isVideo;
  const comments = item.comments ?? [];

  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Source + time */}
      <div className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        <span>{item.section || "News"}</span>
        {item.published && formatPublished(item.published) && <span aria-hidden="true">·</span>}
        {item.published && formatPublished(item.published) && (
          // Wrap the relative "3h ago" in a semantic <time dateTime> so assistive
          // tech and any crawler get the machine-readable ISO instant instead of
          // only the fuzzy relative text, with a title tooltip surfacing the exact
          // publish time (in the app's effective zone via getTimeZone(), matching
          // every other absolute-instant label). Mirrors VideoModal's ArticleMeta
          // and GameDetailModal's <time dateTime> treatment — this Feed timestamp
          // was the lone relative-time display still rendered in a bare <span>.
          // Visible text is unchanged.
          <time
            dateTime={item.published}
            title={new Date(item.published).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: getTimeZone() })}
            className="font-medium normal-case tracking-normal"
          >
            {formatPublished(item.published)}
          </time>
        )}
      </div>

      {/* ONE rule, shared with the Cards view (NewsColumn/TextRow): a headline
          click OPENS the post — never reveals it in place (Jacob 8/10). Peeking
          a single spoiler belongs to the modal (VideoModal's PeekBlur); the
          global Headlines chip is what un-blurs the feed where it stands. */}
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left px-4 pt-2 pb-3 cursor-pointer"
        title="Open post"
        // The only cue that this text is a spoiler is the CSS blur, which
        // assistive tech can't perceive — but the action is now plainly "open
        // post", same as the media preview below (WCAG 4.1.2).
        aria-label="Open post"
      >
        <h3 className="news-title text-base sm:text-lg font-semibold leading-snug" style={{ color: "var(--text)" }}>
          {item.headline}
        </h3>
      </button>

      {/* Media — tap opens the lightbox (image/video), same as Cards view */}
      {hasMedia && (
        <button
          type="button"
          onClick={onOpen}
          // min-h keeps this button a tappable black tile even when its only
          // child collapses to zero height — an image post whose proxied
          // thumbnail 404s hides the <img> (onError below), and a video post's
          // play overlay is absolute-positioned, so without a floor the button
          // (this is the ONLY in-app lightbox opener for the post — the headline
          // above is a peek toggle when hasMedia) shrinks to ~0px and can't be
          // tapped. Every other .news-media-preview sets its own w/h or
          // aspect-video; this full-width one was the lone reliant-on-content case.
          className="news-media-preview relative block w-full min-h-[3rem] cursor-pointer bg-black"
          // The tile's <img> is alt="", so this button's only accessible name is
          // this label. For a video post (isVideo) it's the inline play trigger,
          // yet a flat "Open post" gives no cue it PLAYS a clip and drops the
          // headline — the twin control in NewsColumn (Cards view) already names
          // it "Play highlight: {headline}". Mirror that here: name the action and
          // keep the visible headline in the label so "Label in Name" (WCAG 2.5.3)
          // holds and voice users can say the title to activate it.
          aria-label={isVideo ? `Play video: ${item.headline}` : `Open post: ${item.headline}`}
        >
          {img || tile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              // Cap the delivered width: a gallery cover is a multi-MB original.
              src={proxyImage((img || tile)!, 1200)}
              alt=""
              loading="lazy"
              decoding="async"
              className={img ? "block w-full max-h-[70vh] object-contain" : "block mx-auto max-h-32 w-auto"}
              draggable={false}
              // If the proxied thumbnail 404s (or the image proxy fails), hide the
              // broken-image glyph so the media button degrades cleanly to its black
              // tile instead of rendering a busted icon inside the tap target —
              // matching the onError guard every other remote <img> in the app uses
              // (NewsColumn's twin thumbnails, AlignedVideoStrip, GameCard, …).
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
              Video
            </div>
          )}
          {isVideo && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex items-center justify-center w-14 h-14 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>
                <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          )}
          {gallery.length > 1 && (
            // Multi-picture posts show only their cover here — say so, so the
            // other photos aren't invisible until you happen to tap in.
            <span
              className="absolute top-2 right-2 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none text-white"
              style={{ background: "rgba(0,0,0,0.6)" }}
            >
              1 / {gallery.length}
            </span>
          )}
        </button>
      )}

      {/* Top comments — spoiler-blurred, tap the strip to reveal (Jacob 7/14) */}
      {isReddit && comments.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            // Disclosure toggle: expose the open/closed state so assistive tech
            // announces that this button reveals the hidden comment strip below
            // (WCAG 4.1.2 Name, Role, Value), matching the aria-pressed peek
            // toggles elsewhere in this card.
            aria-expanded={showComments}
            // Point the toggle at the strip it reveals so screen readers can
            // follow the disclosure relationship (WCAG 4.1.2). Unconditional
            // here — unlike WorldCupMattersCard, whose panel unmounts while
            // collapsed (so it drops the attr to avoid dangling to a missing
            // id), this strip is always mounted, so commentsId always resolves.
            aria-controls={commentsId}
            className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {comments.length} top {comments.length === 1 ? "comment" : "comments"}
            <span style={{ opacity: 0.7 }}>{showComments ? "· hide" : "· tap to reveal (spoilers)"}</span>
          </button>
          <div id={commentsId} className="mt-2 flex flex-col gap-2">
            {comments.map((c, ci) => (
              <p
                key={ci}
                onClick={() => setShowComments(true)}
                // Operable by pointer AND keyboard — without role/tabIndex/onKeyDown
                // this clickable blurred comment would be invisible to keyboard and
                // screen-reader users (WCAG 2.1.1). Mirrors PeekBlur in VideoModal.
                role={showComments ? undefined : "button"}
                tabIndex={showComments ? undefined : 0}
                aria-label={showComments ? undefined : "Reveal comment (spoilers)"}
                onKeyDown={(e) => {
                  if (!showComments && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setShowComments(true);
                  }
                }}
                className="text-sm leading-snug rounded-md px-3 py-2 transition-[filter] duration-150"
                style={{
                  color: "var(--text)",
                  background: "var(--bg)",
                  filter: showComments ? "none" : "blur(6px)",
                  cursor: showComments ? "default" : "pointer",
                  userSelect: showComments ? "auto" : "none",
                }}
              >
                {c}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Actions — rendered only when the post has a real external URL. Link-less
          ESPN "now" items carry articleUrl="" (see parseArticle in lib/news.ts,
          which the React-key fallback there already accounts for); with the URL
          absent, href={articleUrl || undefined} dropped the attribute, leaving a
          visible "Open ↗" anchor that does nothing on click AND is skipped by the
          keyboard tab order (an href-less <a> isn't focusable) — WCAG 2.1.1 /
          4.1.2. Gate the whole row on the URL so that dead control never renders;
          the post is still openable via the headline/media button above. Mirrors
          the same href-less-anchor guard VideoModal already applies. */}
      {item.articleUrl && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-3">
          <a
            href={item.articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick(item.articleUrl)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            Open{isReddit && item.section ? ` on ${item.section}` : ""}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </a>
        </div>
      )}
    </article>
  );
}
