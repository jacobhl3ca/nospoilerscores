"use client";

import { useEffect } from "react";
import type { KeyLegendRow } from "@/lib/modalKeyLegend";

// The post modal's key legend, bottom-right (Jacob 9/8).
//
// The modal has grown a real keyboard — Space, ←/→, J/L, 0-9, M, F, H, ↑/↓,
// Shift+←/→ — and none of it was written down anywhere you'd find it while
// watching a clip. This prints the live ones in the corner, and then gets out
// of the way permanently the first time you say so.
//
// Three states, because "dismiss" and "gone" aren't the same thing:
//   open → the panel
//   undo → the panel is gone, a small Undo sits where it was
//   gone → the corner is empty
// The Undo is the whole reason the ✕ can be a single unconfirmed click. It
// expires on its own (UNDO_MS) so the corner ends up clear either way: take it
// back, or don't and the zone clears itself off the video.
//
// "?" is the way back after that, which is why the legend lists "?" as one of
// its own rows — you read how to return it before you ever remove it.
//
// Desktop only. These are keys; a phone has none, and the corner is where the
// mobile Prev/Next buttons and the thumb live.

/** How long the Undo sits there before the corner clears itself. */
export const UNDO_MS = 6000;

const LS_KEY = "hs.keyHintsOff";

export type KeyHintsState = "open" | "undo" | "gone";

/** "gone" when this browser has dismissed the legend before, else "open". */
export function initialKeyHintsState(): KeyHintsState {
  if (typeof window === "undefined") return "open";
  try {
    return localStorage.getItem(LS_KEY) === "1" ? "gone" : "open";
  } catch {
    return "open";
  }
}

/** Remember the choice across clips and sessions. Storage may be blocked. */
export function persistKeyHintsOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(LS_KEY, "1");
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

export default function ModalKeyHints({
  state,
  rows,
  onDismiss,
  onRestore,
  onUndoExpire,
}: {
  state: KeyHintsState;
  rows: KeyLegendRow[];
  /** ✕ — hand the corner over to the Undo. */
  onDismiss: () => void;
  /** Undo — bring the panel back and forget the dismissal. */
  onRestore: () => void;
  /** The Undo timed out; clear the corner for good. */
  onUndoExpire: () => void;
}) {
  // The Undo's own clock. Keyed on `state` so re-opening and re-dismissing
  // restarts it rather than inheriting the previous run's remainder.
  useEffect(() => {
    if (state !== "undo") return;
    const t = window.setTimeout(onUndoExpire, UNDO_MS);
    return () => window.clearTimeout(t);
  }, [state, onUndoExpire]);

  if (state === "gone") return null;

  // Click-through except for its own two buttons. The corner lands ON the video
  // in a normal desktop window — over the last stretch of the scrubber, as it
  // happens — and a passive legend that swallowed those clicks would make the
  // end of the seek bar dead while it was up. So pointer-events stay off all
  // the way down to the ✕ and the Undo.
  const wrapper =
    "hidden sm:block fixed z-[60] pointer-events-none select-none";
  const wrapperStyle = {
    right: "calc(env(safe-area-inset-right) + 1rem)",
    bottom: "calc(env(safe-area-inset-bottom) + 1rem)",
  } as const;

  if (state === "undo") {
    return (
      <div className={wrapper} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRestore(); }}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
          style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.18)" }}
          title="Bring the key list back"
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className={wrapper} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      <div
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
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            aria-label="Hide keyboard shortcuts"
            // The tooltip carries the way back, for the moment you're about to
            // remove the row that says the same thing.
            title="Hide these — ? brings them back"
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
