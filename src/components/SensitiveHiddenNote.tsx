"use client";

// The "N upsetting posts hidden — Show" line. Deliberately quiet (muted, small)
// and deliberately PRESENT: a keyword filter will occasionally take out a post
// that was fine, and without this the only symptom is a feed that is silently
// short. Show lifts the filter for the session; the Settings toggle is the
// permanent control.
export default function SensitiveHiddenNote({ count, onShow }: { count: number; onShow?: () => void }) {
  // The live region wraps ONLY the "N posts hidden" status text, not the Show
  // button: the count updates in place as the feed refreshes, and per the
  // WAI-ARIA APG a live region shouldn't contain an interactive control, or it
  // re-announces the button's own label as part of every status update ("… 5
  // posts hidden by your news filter — Show"). The button keeps its own
  // accessible name and stays a sibling outside the region, so the count change
  // is announced cleanly. Same fix already applied to NoTrackToggle.
  return (
    <span>
      <span role="status" aria-live="polite">
        {count} {count === 1 ? "post" : "posts"} hidden by your news filter
      </span>
      {onShow && (
        <>
          {" — "}
          <button
            type="button"
            onClick={onShow}
            className="underline underline-offset-2 cursor-pointer hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Show
          </button>
        </>
      )}
    </span>
  );
}
