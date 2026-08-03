"use client";

import { useState } from "react";

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
          {/* The trigger stays in the row, unchanged in width, while the form
              itself floats above it. Two stacked fields no longer fit inline:
              the old single w-36 input did, but message + email + send at a
              usable width blew the one-line footer past 390px and clipped
              "About" and "App Store" off both edges on a phone. Same escape
              hatch the About disclosure next door uses — absolute, anchored to
              the row (this wrapper is deliberately NOT `relative`, so the panel
              centers on the whole row rather than on the little trigger and
              can't hang off-screen). */}
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
          <form
            id="hs-feedback-form"
            onSubmit={submit}
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 w-[min(22rem,92vw)] flex flex-col items-stretch gap-1 text-left rounded-lg p-2 shadow-lg"
            // --bg, not --bg-card: in dark mode --bg-card is
            // rgba(255,255,255,0.05), i.e. all but transparent. A floating
            // panel filled with it let the announcement paragraph underneath
            // read straight through the fields. --bg is the only opaque
            // surface token, and the border + shadow still lift it off the page.
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
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
            className="w-full text-xs px-2 py-1 leading-none rounded outline-none"
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
              className="flex-1 w-0 text-xs px-2 py-1 leading-none rounded outline-none"
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
              style={{ width: 18, height: 18, background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </div>
          {emailLooksWrong && (
            // Advisory only — the send button stays enabled and the message
            // still goes through, just without a reply address attached.
            <span id="hs-feedback-email-hint" className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
              That doesn&apos;t look like an email — the note will send without it.
            </span>
          )}
          </form>
        </>
      )}
    </div>
  );
}
