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

  if (sent) {
    return <span>thanks for the feedback 🙏</span>;
  }

  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1.5">
      <span className="shrink-0">feedback:</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Feedback"
        className="w-32 text-xs px-2 py-0.5 rounded-md outline-none"
        style={{ background: "#fff", color: "#111", border: "1px solid var(--border)" }}
      />
    </form>
  );
}
