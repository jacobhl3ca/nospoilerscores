"use client";

import { useEffect, useRef, useState } from "react";

// The "this shows the score" confirm in front of a box score. A box score
// always carries the score, and it is the first path from a finished card to
// one, so the popup never opens it without this step unless the user ticked
// "Don't warn me again" (Settings → "Show box score warning" brings it back).
//
// Rendered INSIDE GameDetailModal's dialog, so it owns Escape and Tab while it
// is open: a capture-phase window listener runs before the popup's own Escape
// (window, bubble) and Tab trap (document) handlers, and stops them, so Escape
// closes only this confirm and Tab cycles only its three controls.
export default function BoxScoreDialog({
  isLive,
  showHere,
  onShowHere,
  onOpenEspn,
  onCancel,
  onSkipWarning,
}: {
  isLive: boolean;
  // A league we render ourselves (BOXSCORE_SPORTS): primary = show it here.
  showHere: boolean;
  onShowHere: () => void;
  onOpenEspn: () => void;
  onCancel: () => void;
  onSkipWarning: () => void;
}) {
  const [skip, setSkip] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The popup re-renders on every live score poll with a fresh onCancel; a ref
  // keeps the key effect (and its focus-on-open) from re-running each time.
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Land on Cancel: Enter on a warning should not reveal the score.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      e.stopPropagation();
      const focusable = Array.from(
        boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !boxRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !boxRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const confirm = (go: () => void) => () => {
    if (skip) onSkipWarning();
    go();
  };

  const title = isLive ? "This shows the current score" : "This shows the final score";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="boxscore-warning-title"
        aria-describedby="boxscore-warning-text"
        className="relative rounded-xl p-5 max-w-xs w-full shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="boxscore-warning-title" className="text-base font-semibold mb-1" style={{ color: "var(--text)" }}>
          {title}
        </h2>
        <p id="boxscore-warning-text" className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          A box score lists every run, point and goal.
        </p>
        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer select-none" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          Don&apos;t warn me again
        </label>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm(showHere ? onShowHere : onOpenEspn)}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {showHere ? "Show box score" : "Open ESPN"}
          </button>
          {showHere ? (
            <button
              type="button"
              onClick={confirm(onOpenEspn)}
              className="w-full py-1 text-sm underline underline-offset-2 cursor-pointer"
              style={{ color: "var(--accent)" }}
            >
              Open ESPN instead
            </button>
          ) : null}
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--bg-card-hover)", color: "var(--text)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
