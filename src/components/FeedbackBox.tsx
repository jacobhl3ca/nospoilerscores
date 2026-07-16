"use client";

import { useState } from "react";

// Minimal inline feedback line that lives inside the footer. Submits on Enter
// (no button) straight to the same Formspree endpoint the jacobhl.com contact
// form uses, so notes land in the same inbox — no extra service or account.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mkgqkgyr";

export default function FeedbackBox() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setSent(true); // optimistic — the box is throwaway, no error UI needed
    setOpen(false);
    setText("");
    try {
      await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message, _subject: "HideScore feedback", source: "hidescore.com" }),
      });
    } catch {
      /* throwaway box — nothing to recover */
    }
  };

  if (!open && !sent) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline underline-offset-2 cursor-pointer hover:opacity-80"
        style={{ color: "var(--text-muted)" }}
      >
        Feedback
      </button>
    );
  }

  return (
    <div className="inline-flex items-center justify-center">
      {sent ? (
        // role=status/aria-live so screen readers hear the optimistic
        // confirmation — the submit gives no other feedback (matches the
        // SettingsPanel ZIP-status pattern).
        <div role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
          <span>Thanks</span>
          <button
            type="button"
            onClick={() => { setSent(false); setOpen(true); }}
            aria-label="Add more feedback"
            title="Add more feedback"
            className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none cursor-pointer transition-opacity hover:opacity-70"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            +
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="inline-flex items-center gap-1.5">
          <label htmlFor="hs-feedback-input" className="sr-only">Feedback</label>
          <input
            id="hs-feedback-input"
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            // Escape dismisses the open input back to the "Feedback" link — the
            // expected way out of an expandable inline field. Without it a
            // keyboard user who opened the box (or opened it by mistake) had no
            // way to collapse it short of submitting or reloading the page.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setText("");
                setOpen(false);
              }
            }}
            placeholder="Feedback"
            // The form submits on Enter, so label the mobile keyboard's return
            // key "Send" to match. autoComplete off keeps the browser's name/
            // email autofill dropdown from covering this tiny footer field
            // (autocorrect/autocapitalize stay on — feedback is free prose, not
            // a team-name filter). No behavior change on desktop.
            enterKeyHint="send"
            autoComplete="off"
            className="w-36 text-xs px-2 py-1 leading-none rounded outline-none"
            style={{ background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border-hover)" }}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send feedback"
            title="Send feedback"
            className="flex items-center justify-center rounded-full transition-opacity enabled:hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: 18, height: 18, background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
