"use client";

import { useState } from "react";

// Minimal inline feedback line that lives inside the footer. Submits on Enter
// (no button) straight to the same Formspree endpoint the jacobhl.com contact
// form uses, so notes land in the same inbox — no extra service or account.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mkgqkgyr";

export default function FeedbackBox() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setSent(true); // optimistic — the box is throwaway, no error UI needed
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

  // The outer box has a fixed width (w-full) AND a fixed height, and the
  // states render in an absolutely-positioned layer on top — so the box's
  // footprint is completely independent of which state is showing. The
  // footer can't reflow on submit; nothing above or below moves.
  return (
    <div className="relative w-full" style={{ height: 18 }}>
      <div className="absolute inset-0 flex items-center justify-center">
      {sent ? (
        <div className="inline-flex items-center gap-1.5">
          <span>thanks for the feedback 🙏</span>
          <button
            type="button"
            onClick={() => setSent(false)}
            aria-label="Add more feedback"
            title="Add more feedback"
            className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none cursor-pointer transition-opacity hover:opacity-70"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            +
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="relative inline-flex items-center">
          {/* Caption sits absolutely to the left of the input (right-full) so
              it doesn't shift the bubble — the input stays dead-centered. */}
          <span className="absolute right-full mr-1.5 whitespace-nowrap">Feedback</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Feedback"
            className="w-36 text-xs px-2 py-0 leading-none rounded outline-none"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
          {/* Symmetric to the caption on the left — absolutely positioned so
              the input bubble stays dead-centered regardless of state. */}
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send feedback"
            title="Send feedback"
            className="absolute left-full ml-1.5 flex items-center justify-center rounded-full transition-opacity enabled:hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
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
    </div>
  );
}
