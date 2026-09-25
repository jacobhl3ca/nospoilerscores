"use client";

// The "N posts hidden by your news filter" line. Deliberately quiet (muted,
// small) and deliberately PRESENT: a keyword filter will occasionally take out
// a post that was fine, and without this the only symptom is a feed that is
// silently short.
//
// Tapping the whole line opens SensitiveHiddenModal (Jacob 9/25) — a list of
// what got hidden, each row led by a spoiler-safe generic description with a
// Peek control and a per-row/all "Restore to feed" action, so the user can
// tell what was added and where. This used to just dump every hidden post
// back into the feed in one tap ("the Show just puts them into the feed and I
// don't know what was added and where") — the modal replaces that blind
// reveal rather than sitting alongside it.
export default function SensitiveHiddenNote({ count, onShow }: { count: number; onShow?: () => void }) {
  const label = `${count} ${count === 1 ? "post" : "posts"} hidden by your news filter`;
  if (!onShow) {
    return <span role="status" aria-live="polite">{label}</span>;
  }
  return (
    <span role="status" aria-live="polite">
      <button
        type="button"
        onClick={onShow}
        className="underline underline-offset-2 cursor-pointer hover:opacity-80"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </button>
    </span>
  );
}
