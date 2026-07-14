"use client";

import { useEffect, useMemo, useState } from "react";
import { NewsItem, proxyImage, formatPublished } from "@/lib/news";
import {
  NewsSource,
  PlayHandler,
  PlayOpts,
  newsItemToPlayOpts,
  itemIsTextPost,
} from "@/components/NewsColumn";

// Vertical "Feed" view for the news section — a single Reddit-style scroll of
// full posts (inline image + headline + blurred top comments) instead of the
// default multi-column "Cards" board. Aggregates every visible column's sources
// into one time-sorted stream. Tapping a post's media opens the same lightbox
// (VideoModal) the Cards view uses, so playback / paging / share are unchanged.
//
// Spoiler model matches the rest of the app: HEADLINES are blurred (the global
// reveal toggle un-blurs them, or tap one to peek); COMMENTS are blurred and
// tap-to-reveal per post (they routinely state the score). Images follow the
// app's existing behavior (shown — only titles are treated as the spoiler).

interface NewsFeedProps {
  sources: NewsSource[];
  onPlay: PlayHandler;
  revealTitles: boolean;
  showTextPosts: boolean;
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
    (async () => {
      const results = await Promise.all(
        sources.map((s) => s.fetch().catch(() => [] as NewsItem[]))
      );
      if (!alive) return;
      const seen = new Set<string>();
      const merged: NewsItem[] = [];
      for (const list of results) {
        for (const it of list) {
          const k = it.articleUrl || it.id;
          if (!k || seen.has(k)) continue;
          seen.add(k);
          merged.push(it);
        }
      }
      merged.sort((a, b) => {
        const ta = a.published ? Date.parse(a.published) : 0;
        const tb = b.published ? Date.parse(b.published) : 0;
        return tb - ta;
      });
      setItems(merged);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return items;
}

export default function NewsFeed({ sources, onPlay, revealTitles, showTextPosts }: NewsFeedProps) {
  const items = useAggregatedFeed(sources);

  // Visible posts: hide headline-only text posts unless revealed / opted-in
  // (matches the .news-textpost / .show-text-posts rule the Cards view uses).
  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (it) => !itemIsTextPost(it) || revealTitles || showTextPosts
      ),
    [items, revealTitles, showTextPosts]
  );

  // Prebuild the paging payloads once so tapping any post opens the lightbox
  // with the whole feed as its ‹ prev / next › list.
  const playList: PlayOpts[] = useMemo(
    () => visible.map((it) => newsItemToPlayOpts(it)),
    [visible]
  );

  if (items === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
        Loading feed…
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
        No posts to show.
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
    </div>
  );
}

function FeedPost({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  const [peek, setPeek] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isReddit = !!item.section?.startsWith("r/");
  const img = item.imageFullUrl || item.imageUrl;
  const isVideo = !!(item.youtubeVideoId || item.videoUrl || item.embedUrl);
  const hasMedia = !!img || isVideo;
  const comments = item.comments ?? [];

  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Source + time */}
      <div className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        <span>{item.section || "News"}</span>
        {item.published && <span aria-hidden="true">·</span>}
        {item.published && <span className="font-medium normal-case tracking-normal">{formatPublished(item.published)}</span>}
      </div>

      {/* Headline — blurred (global toggle) unless tapped to peek */}
      <button
        type="button"
        onClick={() => setPeek((v) => !v)}
        className="block w-full text-left px-4 pt-2 pb-3 cursor-pointer"
        title="Tap to reveal/hide this headline"
      >
        <h3 className={`news-title text-base sm:text-lg font-semibold leading-snug ${peek ? "peek" : ""}`} style={{ color: "var(--text)" }}>
          {item.headline}
        </h3>
      </button>

      {/* Media — tap opens the lightbox (image/video), same as Cards view */}
      {hasMedia && (
        <button
          type="button"
          onClick={onOpen}
          className="relative block w-full cursor-pointer bg-black"
          aria-label="Open post"
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImage(img)}
              alt=""
              loading="lazy"
              decoding="async"
              className="block w-full max-h-[70vh] object-contain"
              draggable={false}
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
        </button>
      )}

      {/* Top comments — spoiler-blurred, tap the strip to reveal (Jacob 7/14) */}
      {isReddit && comments.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {comments.length} top {comments.length === 1 ? "comment" : "comments"}
            <span style={{ opacity: 0.7 }}>{showComments ? "· hide" : "· tap to reveal (spoilers)"}</span>
          </button>
          <div className="mt-2 flex flex-col gap-2">
            {comments.map((c, ci) => (
              <p
                key={ci}
                onClick={() => setShowComments(true)}
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

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3">
        <a
          href={item.articleUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{ color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          Open{isReddit && item.section ? ` on ${item.section}` : ""}
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
        </a>
      </div>
    </article>
  );
}
