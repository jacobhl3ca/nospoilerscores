"use client";

import { useEffect, useRef, useState } from "react";
import { hsPlatform } from "@/lib/prefsSync";

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

// Stamped into the bundle by the deploy workflow (`NEXT_PUBLIC_BUILD_SHA:
// ${{ github.sha }}`). Every report used to arrive with no way to tell WHICH
// build it came from, so answering one started with a round-trip asking. A
// local `npm run build` has no SHA — that reads "dev", which is the honest
// answer rather than a stale hash from whenever the file was last touched.
const BUILD = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 8);

// `openSignal` lets a caller elsewhere in the tree pop this modal open — it is
// a COUNTER, not a boolean, because the box owns its own open/closed state and
// a boolean would fight it (close the modal and the parent's `true` would
// immediately reopen it). Bumping the counter means "open now"; the box closes
// itself normally afterwards. `prefill` seeds the message so a request that
// arrived from a specific place in the UI is identifiable in the inbox.
// `label` renames the collapsed trigger and `seed` starts the message when that
// trigger is tapped (2026-09-25: the articles' "Report an error" link seeds the
// page path, since a submission carries no URL of its own).
export default function FeedbackBox({
  openSignal,
  prefill,
  label = "Feedback",
  seed,
}: { openSignal?: number; prefill?: string; label?: string; seed?: string } = {}) {
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  // Seeded from the parent's initial value so the FIRST render is never treated
  // as a request to open — the box would otherwise pop open on page load.
  const [lastSignal, setLastSignal] = useState(openSignal);

  // The collapsed "Feedback" trigger, so focus can return to it when the modal
  // is dismissed (see the focus-return effect below).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  // The dialog <form>, so Tab can be trapped inside it (see the trap effect).
  const formRef = useRef<HTMLFormElement>(null);

  const trimmedEmail = email.trim();
  // Only warn once it looks like the user has finished typing something that
  // still isn't an address — an empty field is a valid (and common) state.
  const emailLooksWrong = trimmedEmail.length > 0 && !EMAIL_RX.test(trimmedEmail);

  const close = () => {
    setText("");
    setEmail("");
    setOpen(false);
  };

  // Adjusted DURING RENDER, not in an effect: React's documented pattern for
  // "reset state when a prop changes" (react.dev "You Might Not Need an
  // Effect"). An effect here would render the closed box, commit, then render
  // again with it open — a visible extra frame, and the lint rule that bans
  // setState-in-effect is pointing at exactly that.
  if (openSignal !== undefined && openSignal !== lastSignal) {
    setLastSignal(openSignal);
    // Clear "Thanks" too, so a second request from the same page opens the form
    // rather than sitting on the previous submission's confirmation.
    setSent(false);
    setText(prefill ?? "");
    setOpen(true);
  }

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
  }, [open]);

  // Trap Tab within the open dialog (WCAG 2.4.3) — the same pattern
  // GameDetailModal / WorldCupGroupsModal use. aria-modal="true" only marks the
  // page behind inert for ASSISTIVE TECH; it does NOT stop a sighted keyboard
  // user from Tabbing out of the overlay into the footer/board behind it. Wrap
  // focus at the first/last focusable control so Tab / Shift+Tab cycle inside
  // the form. autoFocus on the message field still handles focus-IN and the
  // existing effect below handles focus-return; this only contains the cycle
  // while open. Focusables are queried live per keypress so the send button's
  // disabled state (empty message) is honored via :not([disabled]), and
  // offsetParent-filtered so focus never lands on a hidden control.
  useEffect(() => {
    if (!open) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const form = formRef.current;
      if (!form) return;
      const focusable = Array.from(
        form.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === form) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => document.removeEventListener("keydown", onTab);
  }, [open]);

  // Return focus to the trigger when the modal is DISMISSED (Escape, backdrop,
  // the × / "Feedback" toggle) rather than leaving it stranded on <body> — the
  // WCAG 2.4.3 dialog-close behavior every other modal in the app already gets
  // for its opener. Scoped to cancel-closes: submit() sets `sent` (never calls
  // close()), so the effect skips it and doesn't steal focus into the now-hidden
  // trigger while the "Thanks" state renders. autoFocus already handles focus-IN
  // on open; this closes the round trip.
  useEffect(() => {
    if (wasOpenRef.current && !open && !sent) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open, sent]);

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
          // Which build, and whether this came from the app or a browser. The
          // server can't infer the latter — the Capacitor WebView's UA is
          // identical to mobile Safari (see hsPlatform).
          build: BUILD,
          platform: hsPlatform(),
          userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        }),
      });
    } catch {
      /* throwaway box — nothing to recover */
    }
  };

  if (!open && !sent) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (seed) setText(seed);
          setOpen(true);
        }}
        aria-expanded="false"
        className="underline underline-offset-2 cursor-pointer hover:opacity-80"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center justify-center">
      {sent ? (
        // role=status/aria-live so screen readers hear the optimistic
        // confirmation — the submit gives no other feedback. The live region
        // wraps ONLY the "Thanks" text, not the "Add more feedback" button:
        // per the WAI-ARIA APG a live region shouldn't contain an interactive
        // control, or it re-announces the button's own accessible name as part
        // of the status update ("Thanks, Add more feedback"). The button keeps
        // its own label and stays a sibling outside the region, so the
        // confirmation is announced cleanly. Same fix already applied to
        // SensitiveHiddenNote and NoTrackToggle; the wrapping flex container is
        // unchanged, so the layout renders byte-for-byte identically.
        <div className="inline-flex items-center gap-1.5">
          <span role="status" aria-live="polite">Thanks</span>
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
            // Matches the collapsed trigger: this button controls the open
            // role="dialog" form (aria-controls below), so it carries the same
            // aria-haspopup="dialog" the app's other dialog-openers do.
            aria-haspopup="dialog"
            aria-expanded="true"
            aria-controls="hs-feedback-form"
            className="underline underline-offset-2 cursor-pointer hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </button>
          <div
            // z-[70] clears Settings (z-[60]), the highest overlay in the app:
            // "Request a league" lives INSIDE Settings, so the form it opens has
            // to land on top of the panel that launched it rather than behind.
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)" }}
            // Backdrop click closes. The check keeps a click that started
            // inside the form (e.g. a drag-select that ended on the backdrop)
            // from dismissing a half-typed message.
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          >
          <form
            id="hs-feedback-form"
            ref={formRef}
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
            className="feedback-input w-full text-sm px-3 py-2 rounded outline-none"
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
              // Expose the malformed-address state programmatically, not just
              // via the red border + describedby hint below: without aria-invalid
              // a screen reader announces this as an ordinary email field even
              // while sighted users see it flagged. Mirrors emailLooksWrong so
              // the spoken state tracks the visual one exactly (WCAG 4.1.2).
              aria-invalid={emailLooksWrong || undefined}
              aria-describedby={emailLooksWrong ? "hs-feedback-email-hint" : undefined}
              className="feedback-input flex-1 w-0 text-sm px-3 py-2 rounded outline-none"
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
          {/* Advisory only — the send button stays enabled and the message
              still goes through, just without a reply address attached.
              role="status" makes this an aria-live="polite" region so the
              warning is ANNOUNCED the moment it appears while the email field
              already has focus (WCAG 4.1.3 Status Messages). aria-describedby
              alone is only read when the field GAINS focus, so a message that
              materialised mid-typing went unspoken until the user tabbed away
              and back. A live region must already exist in the DOM before its
              text changes to announce reliably, so the span is rendered
              unconditionally with the text toggled inside — an empty inline
              span adds no layout box, so there is no visual change. */}
          <span id="hs-feedback-email-hint" role="status" className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
            {emailLooksWrong ? "That doesn't look like an email — the note will send without it." : ""}
          </span>
          </form>
          </div>
        </>
      )}
    </div>
  );
}
