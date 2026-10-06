import { useEffect, useId, type RefObject } from "react";

// News "Hide seen" (Jacob 10/6): a post that sat on screen for SEEN_DWELL_MS
// counts as seen, and the header 👁 toggle drops seen posts from every news
// surface (Cards, Feed, the aligned strip). Device-local on purpose — what one
// screen has shown says nothing about another — so it lives in its own
// localStorage key, outside Preferences and its account sync.
//
// Key = item.articleUrl || item.id, the same value every card carries as
// data-news-key, so the tracker below can read it straight off the DOM.

export const NEWS_SEEN_STORAGE_KEY = "hs.newsSeen.v1";
export const SEEN_DWELL_MS = 1500;
export const SEEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const SEEN_MAX_ENTRIES = 3000;
// Share of the card that must be on screen. A Feed post can be taller than the
// viewport, so it can never reach this ratio — it counts once it fills the
// same share of the viewport instead (see the tracker).
const SEEN_VISIBLE_RATIO = 0.6;

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

// Watch every [data-news-key] under rootRef and mark a post seen once it has
// stayed on screen for SEEN_DWELL_MS. One IntersectionObserver for all cards;
// a MutationObserver picks up cards that mount later (columns fetch after
// paint, a league swap remounts a column). Nothing counts while the tab is in
// the background.
export function useNewsSeenTracker(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof IntersectionObserver === "undefined") return;

    const timers = new Map<Element, number>();
    const onScreen = new Set<Element>();

    const keyOf = (el: Element) => el.getAttribute("data-news-key") || "";
    const disarm = (el: Element) => {
      const t = timers.get(el);
      if (t !== undefined) {
        window.clearTimeout(t);
        timers.delete(el);
      }
    };
    const arm = (el: Element) => {
      if (timers.has(el) || document.hidden) return;
      const key = keyOf(el);
      if (!key || isSeen(key)) return;
      timers.set(el, window.setTimeout(() => {
        timers.delete(el);
        if (el.isConnected && onScreen.has(el) && !document.hidden) markSeen(key);
      }, SEEN_DWELL_MS));
    };

    const io = new IntersectionObserver((entries) => {
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      for (const entry of entries) {
        const visible = entry.isIntersecting && (
          entry.intersectionRatio >= SEEN_VISIBLE_RATIO
          || entry.intersectionRect.height >= viewportH * SEEN_VISIBLE_RATIO
        );
        if (visible) {
          onScreen.add(entry.target);
          arm(entry.target);
        } else {
          onScreen.delete(entry.target);
          disarm(entry.target);
        }
      }
    // Fine steps, not just 0.6: a post taller than the viewport only reaches
    // its viewport-share test between ratio crossings, so coarse thresholds
    // would skip it (a 2x-tall post never passes 0.5).
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });

    const observeTree = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.hasAttribute("data-news-key")) io.observe(node);
      node.querySelectorAll("[data-news-key]").forEach((el) => io.observe(el));
    };
    const forgetTree = (node: Node) => {
      if (!(node instanceof Element)) return;
      const els = node.hasAttribute("data-news-key") ? [node] : [];
      node.querySelectorAll("[data-news-key]").forEach((el) => els.push(el));
      for (const el of els) {
        io.unobserve(el);
        onScreen.delete(el);
        disarm(el);
      }
    };

    observeTree(root);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.removedNodes.forEach(forgetTree);
        r.addedNodes.forEach(observeTree);
      }
    });
    mo.observe(root, { childList: true, subtree: true });

    const onVisibility = () => {
      if (document.hidden) {
        for (const el of [...timers.keys()]) disarm(el);
      } else {
        onScreen.forEach(arm);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      mo.disconnect();
      io.disconnect();
      for (const el of [...timers.keys()]) disarm(el);
    };
  }, [rootRef, enabled]);
}
