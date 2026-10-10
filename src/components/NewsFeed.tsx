"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NewsItem, proxyImage, formatPublished } from "@/lib/news";
import type { Sport } from "@/lib/types";
import { getTimeZone } from "@/lib/etDay";
import { handleExternalClick } from "@/lib/openExternal";
import { frontendHref } from "@/lib/frontendLinks";
import { isSensitiveNews, SensitiveCategory } from "@/lib/sensitiveNews";
import SensitiveHiddenNote from "@/components/SensitiveHiddenNote";
import SensitiveHiddenModal from "@/components/SensitiveHiddenModal";
import { LeagueMark } from "@/components/LeagueMark";
import { dropSeen, useReportSeenHidden } from "@/lib/newsSeen";
import { AutoplayVideo, TapForSound } from "@/components/InlineVideoCard";
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

// One news column's worth of sources. The Feed tags each post with the league
// of the first group that brings it, and the chip row filters on the group id
// (Jacob 10/8: the merged scroll gave no way to tell NFL from NBA).
export interface FeedGroup {
  id: string;
  label: string;
  // undefined = Top news (no league mark).
  sport?: Sport;
  sources: NewsSource[];
}

interface NewsFeedProps {
  groups: FeedGroup[];
  // Pull-to-refresh counter. A bump refetches in place: the list stays on
  // screen, and posts that arrive while he is scrolled down wait behind the
  // "N new posts" pill instead of moving the page.
  refreshKey?: number;
  onPlay: PlayHandler;
  showTextPosts: boolean;
  // Reverse the merged feed so the oldest post is first (⇅ in the news header).
  oldestFirst?: boolean;
  videosOnly: boolean;
  // Settings → "Hide upsetting news". When on, items matching lib/sensitiveNews
  // are dropped from the merged feed and counted in a footer line; tapping it
  // opens SensitiveHiddenModal (peek + restore, per-item, session-only — the
  // preference itself is untouched). Categories switched on by the two
  // Settings toggles; empty = filter off.
  hiddenCategories?: SensitiveCategory[];
  // 👁 Hide seen snapshot (see NewsColumn's prop of the same name) and the
  // tooltip count it reports back. undefined = toggle off.
  hideSeenKeys?: Set<string>;
  onSeenHiddenCount?: (id: string, count: number) => void;
  // News Autoplay pill: the video post most in focus plays muted, inside its
  // media tile (InlineVideoCard). Tap still opens the modal with sound.
  autoplay?: boolean;
}

const keyOf = (item: NewsItem) => item.articleUrl || item.id;

// The merged list plus the group each post came from. The group lives in a
// side map so NewsItem itself stays the shared shape every surface uses.
interface FeedState {
  items: NewsItem[];
  groupOf: Map<string, string>;
}

// Coerce an unparseable timestamp to 0, not NaN. The `published ? … : 0`
// guard alone only catches an EMPTY string — a present-but-malformed date
// (feeds are heterogeneous; some emit non-ISO strings) makes Date.parse return
// NaN, and `tb - ta` then evaluates NaN for every comparison touching that
// item. NaN is an inconsistent comparator, so V8 leaves the surrounding order
// undefined and the post lands at an arbitrary spot. Number.isNaN → 0 sinks the
// bad item to the bottom, matching the same guard in TeamView's sort and
// news.ts formatPublished.
const publishedMs = (s?: string) => {
  const t = s ? Date.parse(s) : 0;
  return Number.isNaN(t) ? 0 : t;
};
const byNewest = (list: Iterable<NewsItem>) =>
  [...list].sort((a, b) => publishedMs(b.published) - publishedMs(a.published));

// A refresh's posts over the ones on screen: the fresh copy wins, and a post
// the refresh did not bring back (a source that failed this time) stays.
function mergeFeeds(base: FeedState | null, fresh: FeedState): FeedState {
  if (!base) return fresh;
  const byKey = new Map<string, NewsItem>();
  for (const it of fresh.items) byKey.set(keyOf(it), it);
  for (const it of base.items) if (!byKey.has(keyOf(it))) byKey.set(keyOf(it), it);
  const groupOf = new Map(fresh.groupOf);
  base.groupOf.forEach((g, k) => { if (!groupOf.has(k)) groupOf.set(k, g); });
  return { items: byNewest(byKey.values()), groupOf };
}

// Fetch every group's sources, merging INCREMENTALLY as each one resolves —
// never block the whole feed on the slowest (or a hanging) source. De-dupe by
// permalink/id so a subreddit that appears in two columns (e.g. r/sports)
// isn't shown twice; the first group that brings a post keeps it. `onCommit`
// gets a fresh sorted snapshot after each source, with `done` once all settle.
function fetchGroups(groups: FeedGroup[], isAlive: () => boolean, onCommit: (state: FeedState, done: boolean) => void) {
  const acc = new Map<string, NewsItem>();
  const groupOf = new Map<string, string>();
  const jobs = groups.flatMap((g) => g.sources.map((s) => ({ g, s })));
  if (jobs.length === 0) { onCommit({ items: [], groupOf }, true); return; }
  let settled = 0;
  // Every source starts at once, but a post is credited in group order, so a
  // post two columns share is tagged with the earlier column whichever
  // request lands first.
  const results: (NewsItem[] | undefined)[] = jobs.map(() => undefined);
  jobs.forEach(({ s }, i) => {
    s.fetch()
      .catch(() => [] as NewsItem[])
      .then((list) => {
        if (!isAlive()) return;
        results[i] = list;
        acc.clear();
        groupOf.clear();
        results.forEach((r, j) => {
          if (!r) return;
          for (const it of r) {
            const k = keyOf(it);
            if (k && !acc.has(k)) { acc.set(k, it); groupOf.set(k, jobs[j].g.id); }
          }
        });
        settled += 1;
        onCommit({ items: byNewest(acc.values()), groupOf: new Map(groupOf) }, settled === jobs.length);
      });
  });
}

function useAggregatedFeed(groups: FeedGroup[], refreshKey: number) {
  // null = first load still running ("Loading feed…").
  const [feed, setFeed] = useState<FeedState | null>(null);
  // A refresh's result, held aside until it is merged (see the pill below).
  const [incoming, setIncoming] = useState<FeedState | null>(null);
  // Identity key for the group set so the effect refetches only when the actual
  // feed composition changes, not on every parent re-render (groups is rebuilt
  // inline each render in HomeContent).
  const key = groups.map((g) => `${g.id}:${g.sources.map((s) => s.label).join(",")}`).join("|");
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  // Bumped by a composition change so an in-flight refresh of the old set
  // cannot land on the new one.
  const genRef = useRef(0);
  const handledRefreshRef = useRef(refreshKey);

  useEffect(() => {
    let alive = true;
    const gen = ++genRef.current;
    handledRefreshRef.current = refreshKey;
    setFeed(null);
    setIncoming(null);
    // Stays null until either the first items arrive or every source has
    // settled empty (then [] → "No posts"), so there's no empty flash.
    fetchGroups(groupsRef.current, () => alive && gen === genRef.current, (state, done) => {
      // Merge, not replace: a refresh pulled while a slow first-load source
      // is still out may already have merged posts this load lacks.
      if (state.items.length > 0 || done) setFeed((prev) => mergeFeeds(prev, state));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (refreshKey === handledRefreshRef.current) return;
    handledRefreshRef.current = refreshKey;
    let alive = true;
    const gen = genRef.current;
    fetchGroups(groupsRef.current, () => alive && gen === genRef.current, (state) => {
      setIncoming(state);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const applyIncoming = useCallback(() => {
    if (!incoming) return;
    setFeed((prev) => mergeFeeds(prev, incoming));
    setIncoming(null);
  }, [incoming]);

  return { feed, incoming, applyIncoming };
}

// Within this many px of the top a refresh merges at once; further down the
// new posts wait behind the pill so the page does not move under him.
const NEAR_TOP_PX = 200;

export default function NewsFeed({ groups, refreshKey = 0, onPlay, showTextPosts, videosOnly, oldestFirst, hiddenCategories, hideSeenKeys, onSeenHiddenCount, autoplay }: NewsFeedProps) {
  const { feed, incoming, applyIncoming } = useAggregatedFeed(groups, refreshKey);
  const items = feed?.items ?? null;
  const groupOf = feed?.groupOf;

  // League chip (All · NFL · NBA · Top news). Session-only component state,
  // not a pref. A chip whose column left the board falls back to All.
  const [chip, setChip] = useState("all");
  const chipInGroups = groups.some((g) => g.id === chip);
  const activeChip = chipInGroups ? chip : "all";
  // Forget a chip whose column left, so it does not come back on its own
  // when that column is added again (state adjusted during render, React's
  // pattern for state derived from props). Not while groups is empty: the
  // board passes none for a moment while the scores load.
  if (!chipInGroups && chip !== "all" && groups.length > 0) setChip("all");
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Session-only restore set + the modal it feeds — same idea as NewsColumn's
  // (see that file's comment for why this lives per-surface instead of lifted
  // to HomeContent). "Show" used to just dump every hidden post back into the
  // feed with no way to tell what changed (Jacob 9/13); now it opens
  // SensitiveHiddenModal, which lists the real hidden posts and restores them
  // one at a time (or all), each flashed into view where it lands.
  const [restoredKeys, setRestoredKeys] = useState<Set<string>>(new Set());
  const [hiddenModalOpen, setHiddenModalOpen] = useState(false);

  // The posts a list would show: the chip's league, then the same
  // passesNewsFilters rule the Cards view applies — Videos only keeps only
  // clip-bearing posts (and overrides Text posts, Jacob 9/14); otherwise
  // headline-only text posts hide unless Text posts is on. Then 👁 Hide seen
  // and the sensitive filter. hiddenItems is the actual list the sensitive
  // filter removed (minus any the user already restored this session), so the
  // modal can show real posts rather than just a count.
  const filterList = useCallback(
    (list: NewsItem[], groupMap: Map<string, string> | undefined): [NewsItem[], NewsItem[], number] => {
      const scoped = activeChip === "all" ? list : list.filter((it) => groupMap?.get(keyOf(it)) === activeChip);
      const passing = scoped.filter((it) => passesNewsFilters(it, videosOnly, showTextPosts));
      // 👁 Hide seen first, so a seen post never also counts as sensitive-hidden.
      const preFilter = dropSeen(passing, hideSeenKeys);
      const isRestored = (it: NewsItem) => restoredKeys.has(keyOf(it));
      const hidden = hiddenCategories?.length
        ? preFilter.filter((it) => isSensitiveNews(it, hiddenCategories) && !isRestored(it))
        : [];
      const kept = hiddenCategories?.length
        ? preFilter.filter((it) => !isSensitiveNews(it, hiddenCategories) || isRestored(it))
        : preFilter;
      return [kept, hidden, passing.length - preFilter.length];
    },
    [activeChip, showTextPosts, videosOnly, hiddenCategories, restoredKeys, hideSeenKeys]
  );
  const [visible, hiddenItems, seenHidden] = useMemo<[NewsItem[], NewsItem[], number]>(
    () => {
      const [kept, hidden, seen] = filterList(items ?? [], groupOf);
      // ⇅ Oldest first: the Feed is already time-sorted newest-first, so a plain
      // reverse IS chronological order here. Reverse a copy — `items` is shared.
      return [oldestFirst ? [...kept].reverse() : kept, hidden, seen];
    },
    [items, groupOf, filterList, oldestFirst]
  );
  const sensitiveHidden = hiddenItems.length;
  useReportSeenHidden(onSeenHiddenCount, seenHidden);

  // "N new posts ↑": refreshed posts not on screen yet that would pass every
  // filter above. Zero (only fresher copies of shown posts) merges silently.
  // ⇅ Oldest first puts new posts at the bottom, where they move nothing, so
  // that order always merges silently too.
  const newCount = useMemo(() => {
    if (!incoming || oldestFirst) return 0;
    const shown = new Set((items ?? []).map(keyOf));
    const [kept] = filterList(incoming.items.filter((it) => !shown.has(keyOf(it))), incoming.groupOf);
    return kept.length;
  }, [incoming, items, filterList, oldestFirst]);
  // Layout effect, so a merge near the top lands before paint: the pill must
  // not flash for one frame.
  useLayoutEffect(() => {
    if (!incoming) return;
    if (newCount === 0 || window.scrollY < NEAR_TOP_PX) applyIncoming();
  }, [incoming, newCount, applyIncoming]);
  // Scroll AFTER the merged list commits: a scroll started in the same tick
  // is cut short in WebKit when the new posts land above the viewport.
  const scrollTopAfterMergeRef = useRef(false);
  const showNewPosts = useCallback(() => {
    scrollTopAfterMergeRef.current = true;
    applyIncoming();
  }, [applyIncoming]);
  useLayoutEffect(() => {
    if (!scrollTopAfterMergeRef.current) return;
    scrollTopAfterMergeRef.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [items]);

  // Flash + scroll the restored row(s) into view — imperative DOM lookup by
  // data-news-key (set on FeedPost's <article>), same technique as NewsColumn.
  // Double rAF lets React commit the item's move from hiddenItems into
  // `visible` before we go looking for its element.
  const flashRestored = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const els = keys
          .map((k) => document.querySelector<HTMLElement>(`[data-news-key="${CSS.escape(k)}"]`))
          .filter((el): el is HTMLElement => !!el);
        els.forEach((el) => {
          el.classList.add("news-restore-flash");
          window.setTimeout(() => el.classList.remove("news-restore-flash"), 1800);
        });
        els[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }, []);
  const handleRestoreOne = useCallback((item: NewsItem) => {
    const k = keyOf(item);
    setRestoredKeys((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
    flashRestored([k]);
  }, [flashRestored]);
  const handleRestoreAll = useCallback(() => {
    const keys = hiddenItems.map(keyOf);
    if (keys.length === 0) return;
    setRestoredKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
    flashRestored(keys);
  }, [hiddenItems, flashRestored]);
  const hiddenModal = hiddenModalOpen ? (
    <SensitiveHiddenModal
      items={hiddenItems}
      enabledCategories={hiddenCategories ?? []}
      onRestoreOne={handleRestoreOne}
      onRestoreAll={handleRestoreAll}
      onClose={() => setHiddenModalOpen(false)}
    />
  ) : null;

  // Prebuild the paging payloads once so tapping any post opens the lightbox
  // with the whole (chip-filtered) feed as its ‹ prev / next › list.
  const playList: PlayOpts[] = useMemo(
    () => visible.map((it) => newsItemToPlayOpts(it)),
    [visible]
  );

  // Only with 2+ columns: one league has nothing to pick between. Same neutral
  // selected segment as the Cards / Feed switch in the news toolbar.
  const chipRow = groups.length >= 2 ? (
    <div className="flex justify-center px-3 sm:px-4 pt-1 pb-3">
      <div
        role="group"
        aria-label="Show league"
        className="inline-flex max-w-full overflow-x-auto rounded-full p-0.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {[{ id: "all", label: "All", sport: undefined as Sport | undefined }, ...groups].map((g) => {
          const on = activeChip === g.id;
          return (
            <button
              type="button"
              key={g.id}
              data-feed-chip={g.id}
              onClick={() => setChip(g.id)}
              aria-pressed={on}
              className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-sm font-semibold transition-colors cursor-pointer"
              style={{
                background: on ? "var(--bg-card-hover)" : "transparent",
                color: on ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {g.sport && <LeagueMark sport={g.sport} size={14} />}
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

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
      <>
        {chipRow}
        <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
          {/* Same copy as the Cards column's all-filtered state (NewsColumn), so
              an empty Videos-only feed says WHY it's empty and how to fix it
              instead of a bare "No posts to show." */}
          {seenHidden > 0
            ? `All ${seenHidden} seen — tap 👁 to show them.`
            : videosOnly ? "No videos here right now." : "No posts to show."}
          {videosOnly && seenHidden === 0 && (
            <span className="block mt-1" style={{ opacity: 0.8 }}>
              Set Posts to All, or widen Source in the filter menu.
            </span>
          )}
          {sensitiveHidden > 0 && (
            <span className="block mt-2">
              <SensitiveHiddenNote count={sensitiveHidden} onShow={() => setHiddenModalOpen(true)} />
            </span>
          )}
          {hiddenModal}
        </div>
      </>
    );
  }

  return (
    <>
      {chipRow}
      {newCount > 0 && (
        // Pinned under the news toolbar (same top as the Cards league titles).
        // Zero-height wrapper, so the pill floats over the posts and the list
        // does not shift when it appears.
        <div className="league-sticky-top sticky sticky-nolip z-30 h-0 flex items-start justify-center">
          <button
            type="button"
            data-testid="feed-new-posts"
            onClick={showNewPosts}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold shadow-lg cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            {newCount} new {newCount === 1 ? "post" : "posts"}
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      )}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-16 flex flex-col gap-3">
        {visible.map((it, i) => {
          const g = groupById.get(groupOf?.get(keyOf(it)) ?? "");
          return (
            <FeedPost
              key={keyOf(it)}
              item={it}
              group={g}
              autoplay={!!autoplay}
              onOpen={() =>
                onPlay({ ...newsItemToPlayOpts(it), siblings: playList, index: i })
              }
            />
          );
        })}
        {sensitiveHidden > 0 && (
          <div className="pt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            <SensitiveHiddenNote count={sensitiveHidden} onShow={() => setHiddenModalOpen(true)} />
          </div>
        )}
        {hiddenModal}
      </div>
    </>
  );
}

function FeedPost({ item, group, onOpen, autoplay }: { item: NewsItem; group?: FeedGroup; onOpen: () => void; autoplay: boolean }) {
  const [showComments, setShowComments] = useState(false);
  const [playing, setPlaying] = useState(false);
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
  const showSection = !group
    || (!!item.section && item.section.toLowerCase() !== group.label.toLowerCase());

  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      data-news-key={item.articleUrl || item.id}
      data-feed-group={group?.id}
    >
      {/* League + source + time. The league comes first: ESPN and YouTube
          posts carry a blank or generic section, so without it a merged
          NFL + NBA scroll gave no way to tell them apart (Jacob 10/8). The
          section is left out when it is blank or only repeats the league. */}
      <div className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {group && (
          <span data-feed-league="" className="inline-flex items-center gap-1.5" style={{ color: "var(--text)" }}>
            {group.sport && <LeagueMark sport={group.sport} size={14} />}
            {group.label}
          </span>
        )}
        {group && showSection && <span aria-hidden="true">·</span>}
        {showSection && <span>{item.section || "News"}</span>}
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
        data-news-open=""
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
          data-news-open=""
          onClick={(e) => { e.currentTarget.querySelector("video")?.pause(); onOpen(); }}
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
          {isVideo && <AutoplayVideo item={item} enabled={autoplay} fit="contain" onPlayingChange={setPlaying} />}
          {isVideo && playing && <TapForSound />}
          {isVideo && !playing && (
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
            href={frontendHref(item.articleUrl)}
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
