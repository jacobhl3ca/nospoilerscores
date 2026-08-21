"use client";

// The "N upsetting posts hidden — Show" line. Deliberately quiet (muted, small)
// and deliberately PRESENT: a keyword filter will occasionally take out a post
// that was fine, and without this the only symptom is a feed that is silently
// short. Show lifts the filter for the session; the Settings toggle is the
// permanent control.
export default function SensitiveHiddenNote({ count, onShow }: { count: number; onShow?: () => void }) {
  return (
    <span role="status" aria-live="polite">
      {count} {count === 1 ? "post" : "posts"} hidden by your news filter
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
