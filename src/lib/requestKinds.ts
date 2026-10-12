// The kinds a note can carry, for the pills on /wall-of-fame and in the
// feedback form it opens (2026-10-11). The first three are the kinds a built
// row has (lib/requestedBuilds.ts). Kept apart from that file so the board,
// which mounts FeedbackBox, does not bundle the wall's rows.
// Colours per kind and theme: `.kind-pill[data-kind]` in globals.css.

export type RequestKind = "League" | "Feature" | "Fix" | "Other";
export const REQUEST_KINDS: RequestKind[] = ["League", "Feature", "Fix", "Other"];

export const KIND_PILL_CLASS = "kind-pill inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";
