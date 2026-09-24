"use client";

import type { KeyLegendRow } from "@/lib/modalKeyLegend";

// The post modal's key legend, bottom-right (Jacob 9/8).
//
// The modal has grown a real keyboard — Space, ←/→, J/L, 0-9, M, F, H, ↑/↓,
// Shift+←/→ — and none of it was written down anywhere you'd find it while
// watching a clip. This prints the live ones in the corner.
//
// Closed until asked for (Jacob 9/23). It used to open by itself on every
// post until you ✕'d it once, per browser — so it showed "sometimes", and sat
// on the corner of the player the rest of the time. Now the "Keys" button in
// VideoModal's ‹ › ✕ cluster, or the "?" key, opens it; its ✕, the button or
// "?" again closes it. VideoModal owns the open/closed state: it holds while
// you page posts inside one modal and starts closed on the next open.
//
// Desktop only. These are keys; a phone has none.
//
// It stands directly on top of the modal's ‹ › ✕ cluster (VideoModal's
// controlCluster: 44px, 1rem off the corner), so the corner reads as one
// column: keys above, buttons below (Jacob 9/12).

export default function ModalKeyHints({
  open,
  id,
  rows,
  onClose,
}: {
  open: boolean;
  /** For the Keys button's aria-controls. */
  id: string;
  rows: KeyLegendRow[];
  /** ✕ — close the panel. `byPointer` is false for a keyboard press, so the
   *  modal can seat focus somewhere sensible once the ✕ unmounts. */
  onClose: (byPointer: boolean) => void;
}) {
  if (!open) return null;

  // Click-through except for its own ✕. The corner lands ON the video in a
  // normal desktop window — over the last stretch of the scrubber, as it
  // happens — and a passive legend that swallowed those clicks would make the
  // end of the seek bar unusable while it was up. So pointer-events stay off
  // all the way down to the ✕.
  return (
    <div
      className="hidden sm:block fixed z-[60] pointer-events-none select-none"
      style={{
        right: "calc(env(safe-area-inset-right) + 1rem)",
        bottom: "calc(env(safe-area-inset-bottom) + 1rem + 44px + 0.5rem)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        id={id}
        // A labelled group, not a dialog: it steals no focus and traps nothing.
        role="group"
        aria-label="Keyboard shortcuts"
        className="rounded-xl px-2.5 py-2 text-[11px] leading-none"
        style={{
          background: "rgba(0,0,0,0.72)",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          minWidth: "9.5rem",
        }}
      >
        <div className="flex items-center justify-between gap-3 pb-1.5">
          <span className="font-semibold tracking-wide text-white/45 text-[10px] uppercase">Keys</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(e.detail > 0); }}
            aria-label="Hide keyboard shortcuts"
            title="Hide these — Keys or ? opens them again"
            className="pointer-events-auto -mr-0.5 w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <dl className="m-0 flex flex-col gap-1.5">
          {rows.map((row) => (
            <div
              key={row.id}
              // Esc starts the housekeeping pair (Esc, ?) — a hairline separates
              // them from the keys that act on what's playing.
              className={`flex items-center justify-between gap-3 ${row.id === "esc" ? "mt-0.5 pt-1.5 border-t border-white/10" : ""}`}
            >
              <dt className="flex items-center gap-1">
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-semibold text-white/80"
                    style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)" }}
                  >
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="m-0 whitespace-nowrap text-white/55">{row.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
