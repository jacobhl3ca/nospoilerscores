"use client";

import { useEffect, useState } from "react";

// Minimal inline feedback line that lives inside the footer. Submits on Enter
// or via the send button straight to the same Formspree endpoint the
// jacobhl.com contact form uses, so notes land in the same inbox — no extra
// service or account.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mkgqkgyr";

// Loose shape check only — enough to catch a typo'd address before it's the
// only way back to someone, but never strict enough to reject a valid one.
// The field is optional, so a failed check downgrades to "send it anyway
// without the email" rather than blocking the message.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function FeedbackBox() {
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  const trimmedEmail = email.trim();
  // Only warn once it looks like the user has finished typing something that
  // still isn't an address — an empty field is a valid (and common) state.
  const emailLooksWrong = trimmedEmail.length > 0 && !EMAIL_RX.test(trimmedEmail);

  const close = () => {
    setText("");
    setEmail("");
    setOpen(false);
  };

  // Escape closes from anywhere in the dialog, not just the two inputs — the
  // backdrop and the send button are focusable targets too, and a modal that
  // only listens on its text fields traps a keyboard user who tabbed past them.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    const replyTo = EMAIL_RX.test(trimmedEmail) ? trimmedEmail : "";
    setSent(true); // optimistic — the box is throwaway, no error UI needed
    setOpen(false);
    setText("");
    setEmail("");
    try {
      await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          message,
          // Formspree sets the notification's Reply-To from `_replyto`, and
          // shows `email` in the submission body. Send both: without either,
          // every submission arrives anonymous and unanswerable (which is
          // exactly what happened to the 2026-08-03 leagues request).
          ...(replyTo ? { email: replyTo, _replyto: replyTo } : {}),
          _subject: replyTo ? `HideScore feedback from ${replyTo}` : "HideScore feedback",
          source: "hidescore.com",
        }),
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
        aria-expanded="false"
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
        <>
          {/* The trigger stays in the footer row; the form is a CENTERED MODAL
              rather than a panel floating above the row (Jacob 8/4). Anchored
              to the footer it collided with the scroll-to-top FAB in the same
              corner, and at 22rem it was cramped enough that the fields read as
              an afterthought. Fixed + centered also means it can never hang
              off-screen on a narrow phone, which the absolute version had to
              work around. */}
          <button
            type="button"
            onClick={close}
            aria-expanded="true"
            aria-controls="hs-feedback-form"
            className="underline underline-offset-2 cursor-pointer hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Feedback
          </button>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)" }}
            // Backdrop click closes. The check keeps a click that started
            // inside the form (e.g. a drag-select that ended on the backdrop)
            // from dismissing a half-typed message.
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          >
          <form
            id="hs-feedback-form"
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hs-feedback-title"
            className="w-[min(26rem,100%)] max-h-[90vh] overflow-y-auto flex flex-col items-stretch gap-2 text-left rounded-xl p-4 shadow-2xl"
            // --bg, not --bg-card: in dark mode --bg-card is
            // rgba(255,255,255,0.05), i.e. all but transparent — the page would
            // read straight through the fields. --bg is the only opaque
            // surface token.
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
          <div className="flex items-center justify-between gap-2">
            <h2 id="hs-feedback-title" className="text-sm font-bold" style={{ color: "var(--text)" }}>
              Send feedback
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close feedback"
              title="Close"
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-sm leading-none cursor-pointer transition-opacity hover:opacity-70"
              style={{ background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              ×
            </button>
          </div>
          <label htmlFor="hs-feedback-input" className="sr-only">Feedback</label>
          <input
            id="hs-feedback-input"
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            // Escape dismisses the open form back to the "Feedback" link — the
            // expected way out of an expandable inline field. Without it a
            // keyboard user who opened the box (or opened it by mistake) had no
            // way to collapse it short of submitting or reloading the page.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
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
            className="w-full text-sm px-3 py-2 rounded outline-none"
            style={{ background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border-hover)" }}
          />
          <div className="flex items-center gap-1.5">
            <label htmlFor="hs-feedback-email" className="sr-only">
              Your email (optional, only used to reply)
            </label>
            <input
              id="hs-feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                }
              }}
              placeholder="Email (optional, to get a reply)"
              // inputMode/autoComplete email so mobile offers the @ keyboard and
              // the browser's saved address — the opposite call from the message
              // field, where autofill was covering the input.
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              aria-describedby={emailLooksWrong ? "hs-feedback-email-hint" : undefined}
              className="flex-1 w-0 text-sm px-3 py-2 rounded outline-none"
              style={{
                background: "var(--bg-card-hover)",
                color: "var(--text)",
                // No --danger token in globals.css; this is the only place that
                // needs an error border, so keep the literal local.
                border: `1px solid ${emailLooksWrong ? "#d9534f" : "var(--border-hover)"}`,
              }}
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send feedback"
              title="Send feedback"
              className="shrink-0 flex items-center justify-center rounded-full transition-opacity enabled:hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ width: 32, height: 32, background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </div>
          {emailLooksWrong && (
            // Advisory only — the send button stays enabled and the message
            // still goes through, just without a reply address attached.
            <span id="hs-feedback-email-hint" className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
              That doesn&apos;t look like an email — the note will send without it.
            </span>
          )}
          </form>
          </div>
        </>
      )}
    </div>
  );
}
