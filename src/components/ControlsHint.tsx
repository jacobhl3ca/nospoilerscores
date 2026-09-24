"use client";

import { useEffect, useRef, useState } from "react";

// A subtle "what can I press" card, parked in the bottom-right corner of the
// page (Jacob 9/8, after Shift+←/→ turned out not to work on a video: "a guide
// to the controls to scroll on bottom right of page subtle im thinking. and an
// option to turn that off in settings, plus an x out button down there too").
//
// The app grew a real keyboard by 9/5 — ↓/↑ page posts, ←/→ scrub, Shift+←/→
// page, H peeks a headline, m/j/l/0-9 drive the player — and nothing on screen
// ever said so. This is that sign. Collapsed it is one low-contrast pill; open
// it is the list. The ✕ next to the pill retires it for good (a pref, so it
// stays retired across sessions and devices), and Settings → "Keyboard
// shortcuts" brings it back.
//
// POINTER GATE: a phone has no keys to press, so the whole thing renders only
// where a real keyboard is likely — the same (hover:hover)+(pointer:fine) test
// the rest of the app uses for hover-only affordances. Done in CSS, not in JS,
// so it costs no hydration mismatch and follows a window resize.

export type ControlsHintProps = {
  /** false = the user turned it off (✕ or Settings). */
  enabled: boolean;
  /** Persist the ✕. */
  onDismiss: () => void;
  /** True while the post modal is open. The modal prints its own keys then
   *  (ModalKeyHints, above its ‹ › ✕ cluster), so this steps aside. */
  modalOpen: boolean;
};

type Row = { keys: string[]; what: string };

// The board/news view. The page's own keyboard is thin — three rows and they
// are all "Tab to it" — so on its own it would be a card not worth opening.
// What someone actually wants here is the preview of what the keys do ONCE a
// post is open, which is the half nobody discovers. So the closed-modal card
// shows both: these, then the four post keys worth knowing in advance.
const BOARD_ROWS: Row[] = [
  { keys: ["Tab"], what: "Move through cards" },
  { keys: ["↵"], what: "Open the focused card" },
  { keys: ["Esc"], what: "Close what's open" },
];

const BOARD_PREVIEW_ROWS: Row[] = [
  { keys: ["↓", "↑"], what: "Next / previous post" },
  { keys: ["←", "→"], what: "Skip 5s in a video" },
  { keys: ["Space"], what: "Play / pause" },
  { keys: ["F"], what: "Fullscreen" },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[1.4rem] px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        fontFamily: "inherit",
      }}
    >
      {children}
    </kbd>
  );
}

function RowLine({ row }: { row: Row }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1">
        {row.keys.map((k) => (k === "–" ? (
          <span key={k} className="text-[10px]" style={{ color: "var(--text-muted)" }}>–</span>
        ) : (
          <Key key={k}>{k}</Key>
        )))}
      </span>
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{row.what}</span>
    </li>
  );
}

export default function ControlsHint({ enabled, onDismiss, modalOpen }: ControlsHintProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Esc closes the card, not the page behind it — but only while it's open, so
  // this never competes with the modal's own Esc handler.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    // Capture, so it runs before the post modal's document-level handler and
    // one Esc doesn't both close this card AND the modal underneath it.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Click away closes it. Pointerdown (not click) so it lands before a card
  // underneath opens something.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // With the post modal open, its own legend (ModalKeyHints) owns the corner:
  // it is built from the same flags the key router uses, and two key lists
  // stacked over the ‹ › ✕ cluster read as clutter. This used to swap to a
  // hand-kept copy of the modal keys instead.
  if (!enabled || modalOpen) return null;

  const rows = BOARD_ROWS;
  const previewRows = BOARD_PREVIEW_ROWS;

  return (
    <div
      ref={rootRef}
      // zIndex 10000 keeps it above the app's overlays. The post modal (9999)
      // is the exception: it hides this and prints its own keys (see above).
      // Fixed to the viewport corner, above the iOS home indicator.
      className="hs-controls-hint fixed flex flex-col items-end gap-2"
      style={{
        zIndex: 10000,
        right: "max(0.75rem, env(safe-area-inset-right))",
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="rounded-xl p-3 pt-2 shadow-lg"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            minWidth: 236,
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Controls
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close shortcuts"
              className="w-5 h-5 flex items-center justify-center rounded-full cursor-pointer transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
            </button>
          </div>
          <ul className="space-y-1.5">
            {rows.map((r) => <RowLine key={r.what + r.keys.join()} row={r} />)}
          </ul>
          {previewRows.length > 0 && (
            <>
              <div className="mt-2.5 mb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider"
                   style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
                In a post
              </div>
              <ul className="space-y-1.5">
                {previewRows.map((r) => <RowLine key={r.what + r.keys.join()} row={r} />)}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); onDismiss(); }}
            className="mt-2.5 w-full text-[11px] underline underline-offset-2 cursor-pointer transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            Don&apos;t show this again
          </button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Keyboard shortcuts"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-opacity opacity-45 hover:opacity-100 focus-visible:opacity-100"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
          Keys
        </button>
        {/* The ✕ Jacob asked for, right there in the corner: retire the hint
            without having to open it first. */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide the keyboard shortcuts hint"
          title="Hide this — Settings brings it back"
          className="w-5 h-5 flex items-center justify-center rounded-full cursor-pointer opacity-30 hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      </div>
    </div>
  );
}
