"use client";

import { useEffect, useRef } from "react";

// "Are you sure" before an ESPN front page label's News button opens News
// (Jacob 10/10).
// HomeContent mounts it only while it is still early (src/lib/newsOkDay.ts);
// after the cutoff hour, 5 s of News, a highlight, or one "Open News" today,
// the button goes straight through. Same box as WorldCupGroupsModal's bracket
// warning: inline role="dialog", focus trapped between the two buttons, focus
// back to the opener on close. "Not yet" holds focus first, so Enter or
// Escape never opens News by accident.
export default function NewsSpoilerConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      const box = boxRef.current;
      if (e.key !== "Tab" || !box) return;
      const focusable = Array.from(box.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === box) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-confirm-title"
        aria-describedby="news-confirm-body"
        data-news-confirm
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
        style={{ background: "var(--bg)", border: "2px solid var(--accent)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 id="news-confirm-title" className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>
          News shows scores
        </h3>
        <p id="news-confirm-body" className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
          It&apos;s still early. News headlines and clips can show today&apos;s results before you&apos;ve watched. Open it anyway?
        </p>
        <div className="flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-news-confirm-cancel
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
          >
            Not yet
          </button>
          <button
            type="button"
            data-news-confirm-open
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
          >
            Open News
          </button>
        </div>
      </div>
    </div>
  );
}
