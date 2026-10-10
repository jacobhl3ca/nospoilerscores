import { useEffect, useId, type RefObject } from "react";

// News "Hide seen" (Jacob 10/6, 10/8): a post counts as seen when he opens it
// (the in-app modal, its ‹ prev / next › paging, or the source link), and the
// header 👁 toggle drops seen posts from every news surface (Cards, Feed, the
// aligned strip). Scrolling past a post does not count. Device-local on
// purpose — what one screen has opened says nothing about another — so it
// lives in its own localStorage key, outside Preferences and its account sync.
//
// Key = item.articleUrl || item.id, the same value every card carries as
// data-news-key, so the tracker below can read it straight off the DOM.

export const NEWS_SEEN_STORAGE_KEY = "hs.newsSeen.v1";
export const SEEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const SEEN_MAX_ENTRIES = 3000;

type SeenMap = Record<string, number>;

// In-memory copy so the filter memos never parse JSON per render. Loaded (and
// pruned) on first use, written through on every mark.
let cache: SeenMap | null = null;

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    // Safari private mode / blocked storage throws on access.
    return null;
  }
}

function load(): SeenMap {
  if (cache) return cache;
  let parsed: SeenMap = {};
  try {
    const raw = storage()?.getItem(NEWS_SEEN_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "number" && Number.isFinite(v)) parsed[k] = v;
      }
    }
  } catch {
    parsed = {};
  }
  cache = parsed;
  pruneSeen();
  return cache;
}

function save(merge: boolean): void {
  try {
    // Merge with what another open tab wrote since this one loaded, so two
    // tabs do not overwrite each other's marks. Not after a prune: that would
    // put the pruned entries straight back.
    const raw = merge ? storage()?.getItem(NEWS_SEEN_STORAGE_KEY) : null;
    const other = raw ? JSON.parse(raw) : null;
    if (cache && other && typeof other === "object" && !Array.isArray(other)) {
      for (const [k, v] of Object.entries(other)) {
        if (typeof v === "number" && Number.isFinite(v) && !(Object.hasOwn(cache, k) && cache[k] >= v)) cache[k] = v;
      }
    }
    storage()?.setItem(NEWS_SEEN_STORAGE_KEY, JSON.stringify(cache ?? {}));
  } catch {
    // Quota or blocked storage: the in-memory copy still works this session.
  }
}

export function markSeen(key: string, now: number = Date.now()): void {
  if (!key) return;
  const map = load();
  map[key] = now;
  save(true);
  // A long session keeps marking; prune here too once the cap is passed.
  if (Object.keys(cache ?? map).length > SEEN_MAX_ENTRIES) pruneSeen(now);
}

export function isSeen(key: string): boolean {
  return Object.hasOwn(load(), key);
}

// A COPY, so a snapshot taken now does not grow as more posts get seen.
export function seenKeys(): Set<string> {
  return new Set(Object.keys(load()));
}

// Drop entries older than SEEN_MAX_AGE_MS, then keep the newest
// SEEN_MAX_ENTRIES. Feeds turn over in days, so an old key only costs space.
export function pruneSeen(now: number = Date.now()): void {
  const map = cache ?? load();
  const fresh = Object.entries(map).filter(([, t]) => now - t <= SEEN_MAX_AGE_MS);
  fresh.sort((a, b) => b[1] - a[1]);
  const kept = fresh.slice(0, SEEN_MAX_ENTRIES);
  if (kept.length === Object.keys(map).length) return;
  cache = Object.fromEntries(kept);
  save(false);
}

// Test hook: forget the in-memory copy so the next call re-reads storage.
export function resetSeenCache(): void {
  cache = null;
}

type Keyed = { articleUrl?: string | null; id: string };

// The one filter every surface applies right after passesNewsFilters. No keys
// (toggle off) = the same array back, so memos downstream keep their identity.
export function dropSeen<T extends Keyed>(items: T[], keys: Set<string> | undefined): T[] {
  if (!keys || keys.size === 0) return items;
  return items.filter((item) => !keys.has(item.articleUrl || item.id));
}

// Each surface reports how many posts it dropped as seen, so the header 👁
// tooltip can say "(N hidden)". useId keys the report per mounted surface; the
// cleanup reports 0 so an unmounted column does not leave its count behind.
export function useReportSeenHidden(report: ((id: string, count: number) => void) | undefined, count: number): void {
  const id = useId();
  useEffect(() => { report?.(id, count); }, [report, id, count]);
  useEffect(() => () => report?.(id, 0), [report, id]);
}

// Mark a post seen when a control inside its card opens it: an <a href> (the
// source link, plain or cmd/ctrl/shift/middle-click to a new tab) or a button
// tagged data-news-open (the modal openers). One delegated listener pair on
// rootRef, capture phase, so card handlers that stopPropagation cannot hide
// the click. Peek, comments, swap and dismiss buttons carry no tag and do not
// count. Paging inside the modal is marked by HomeContent's stepVideo.
export function useNewsSeenTracker(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    const onActivate = (e: MouseEvent) => {
      if (e.type === "auxclick" && e.button !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      const opener = target?.closest("[data-news-open], a[href]");
      if (!opener || !root.contains(opener)) return;
      const key = opener.closest("[data-news-key]")?.getAttribute("data-news-key");
      if (key) markSeen(key);
    };

    root.addEventListener("click", onActivate, true);
    root.addEventListener("auxclick", onActivate, true);
    return () => {
      root.removeEventListener("click", onActivate, true);
      root.removeEventListener("auxclick", onActivate, true);
    };
  }, [rootRef, enabled]);
}
