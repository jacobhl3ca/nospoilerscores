// What shipped because a user asked for it, for the "Built from your requests"
// list on /contact#feedback (added 2026-10-09). Plain data with no imports, so
// the unit test can load it under node's type stripping
// (tests/requested-builds.test.ts checks dates, order, kinds and initials).
// The page renders rows in this file's order.
//
// `by` holds initials only ("K.K."), never a full name or an email. A row's
// initials go in only after the person agreed: Jacob ticks the mined rows, and
// from 10/9 the feedback form has its own optional initials field. A row with
// no initials still shows; it just has no "thanks" line.

export type RequestedBuildKind = "League" | "Fix" | "Feature";
export type RequestedBuild = { date: string; kind: RequestedBuildKind; title: string; by: string[] };

// Grouped by person (Jacob 10/9): each person's rows sit together, people with
// initials before the rows with none, and newest first inside each group. The
// order of the credited groups is this file's order (most credits first).
export const REQUESTED_BUILDS: RequestedBuild[] = [
  { date: "2026-10-07", kind: "Feature", title: "Android home-screen widget with your teams' next games", by: ["K.K."] },
  { date: "2026-10-05", kind: "Feature", title: "Scroll columns: up to 5 columns on phones and tablets", by: ["K.K."] },
  { date: "2026-09-14", kind: "League", title: "NCAA women's hockey", by: ["K.K."] },
  { date: "2026-09-12", kind: "League", title: "NCAA men's hockey", by: ["K.K."] },
  { date: "2026-10-04", kind: "Fix", title: "Game times follow your own time zone", by: ["I.R."] },
  { date: "2026-09-13", kind: "League", title: "CFL", by: [] },
  { date: "2026-08-12", kind: "League", title: "Rugby Nations Championship", by: [] },
  { date: "2026-08-03", kind: "League", title: "La Liga, Serie A, Bundesliga and Ligue 1", by: [] },
];

// The person a row belongs to, for the grouping above ("" = no initials).
export function requestedBuildGroup(r: RequestedBuild): string {
  return r.by.join(", ");
}

// The list shows this many rows; the rest sit behind a native <details>.
export const REQUESTED_BUILDS_SHOWN = 10;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-07" → "Oct 7". Read from the string, not a Date: a Date parses the
// ISO day as UTC midnight and prints the day before west of UTC.
export function requestedBuildDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
