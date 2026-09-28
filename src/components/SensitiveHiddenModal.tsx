"use client";

import { useEffect, useRef, useState } from "react";
import { NewsItem, proxyImage, formatPublished } from "@/lib/news";
import { SensitiveCategory, describeHiddenPost } from "@/lib/sensitiveNews";

// Opened by tapping "N posts hidden by your news filter" (SensitiveHiddenNote)
// in either news surface — NewsColumn (Cards view) or NewsFeed. Replaces the
// old one-tap "Show", which dropped every hidden post back into the feed with
// no way to tell what was added or where (Jacob 9/13/9/25).
//
// Each row leads with a SPOILER-SAFE generic line (describeHiddenPost —
// source + media type + which filter category, never the real words). "Peek"
// reveals the real headline/thumbnail inline, in place, once the user asks
// for it. "Restore to feed" (per row, or "Restore all" at the bottom) un-hides
// the post — it then disappears from this list and reappears in the feed at
// its natural sorted spot, briefly flashed so it's obvious where it landed
// (see the caller's flashRestored — this modal only asks for the restore, the
// news surface owns finding/highlighting the row once it's back on screen).
//
// Chrome (backdrop, dialog shell, Escape, focus trap, scroll lock) mirrors
// EventDetailModal — the app's other list-style detail sheet — rather than
// VideoModal, which is built around a single playing item.

function keyOf(item: NewsItem): string {
  return item.articleUrl || item.id;
}

export default function SensitiveHiddenModal({
  items,
  enabledCategories,
  onRestoreOne,
  onRestoreAll,
  onClose,
}: {
  items: NewsItem[];
  enabledCategories: SensitiveCategory[];
  onRestoreOne: (item: NewsItem) => void;
  onRestoreAll: () => void;
  onClose: () => void;
}) {
  // Peeked = revealed real title/thumbnail inline, but NOT restored yet — the
  // user asked to see what it was without necessarily wanting it in the feed.
  const [peeked, setPeeked] = useState<Set<string>>(new Set());
  const togglePeek = (k: string) => setPeeked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus trap + restore-on-close — verbatim pattern from EventDetailModal /
  // GameDetailModal (WCAG 2.4.3).
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  // Body scroll lock — same position:fixed technique the other overlays use
  // (plain overflow:hidden doesn't stop iOS WebKit scrolling behind it).
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl max-h-[85vh] flex flex-col"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Posts hidden by your news filter"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <h2 className="text-base font-semibold mb-1 pr-6" style={{ color: "var(--text)" }}>
          Hidden by your news filter
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {items.length === 0
            ? "Nothing hidden right now."
            : `${items.length} ${items.length === 1 ? "post" : "posts"} — peek at what it was, or restore it to the feed.`}
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
          {items.map((item) => {
            const k = keyOf(item);
            const isPeeked = peeked.has(k);
            const thumb = item.imageUrl && !item.thumbOnly ? item.imageUrl : item.imageFullUrl;
            return (
              <div
                key={k}
                className="rounded-lg p-2.5"
                style={{ background: "var(--bg-card)", boxShadow: "inset 0 0 0 1px var(--border)" }}
              >
                {isPeeked ? (
                  <div className="flex items-start gap-2">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxyImage(thumb, 160)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-12 h-12 shrink-0 rounded object-cover"
                        style={{ background: "var(--bg-card-hover)" }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug break-words" style={{ color: "var(--text)" }}>
                        {item.headline}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {item.section}
                        {item.published && formatPublished(item.published) ? ` · ${formatPublished(item.published)}` : ""}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs leading-snug min-w-0 flex-1" style={{ color: "var(--text-secondary)" }}>
                      {describeHiddenPost(item, enabledCategories)}
                    </p>
                    <button
                      type="button"
                      onClick={() => togglePeek(k)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer"
                      style={{ color: "var(--text)", background: "var(--bg-card-hover)" }}
                    >
                      Peek
                    </button>
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRestoreOne(item)}
                    className="text-xs font-medium underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--accent)" }}
                  >
                    Restore to feed
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={onRestoreAll}
            className="mt-3 w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Restore all to feed
          </button>
        )}
      </div>
    </div>
  );
}
