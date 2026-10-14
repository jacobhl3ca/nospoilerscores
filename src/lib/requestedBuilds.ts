// What shipped because a user asked for it, for the wall of fame
// (/wall-of-fame; on /contact from 2026-10-09 to 10/11). Plain data with no
// imports, so the unit test can load it under node's type stripping
// (tests/requested-builds.test.ts checks dates, order, kinds and initials).
// The page renders rows in this file's order.
//
// `by` holds initials only ("K.K."), never a full name or an email. A row's
// initials go in only after the person agreed: Jacob ticks the mined rows, and
// from 10/9 the feedback form has its own optional initials field. A row with
// no initials still shows, under "Asked without a name". The repo is public:
// nothing that maps initials to a person goes in it.

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

// The rows cut into their groups, in file order: one section per person, then
// the rows with no initials (who = "").
export type RequestedBuildSection = { who: string; rows: RequestedBuild[] };
export function requestedBuildSections(rows: RequestedBuild[] = REQUESTED_BUILDS): RequestedBuildSection[] {
  const out: RequestedBuildSection[] = [];
  for (const r of rows) {
    const who = requestedBuildGroup(r);
    const last = out[out.length - 1];
    if (last && last.who === who) last.rows.push(r);
    else out.push({ who, rows: [r] });
  }
  return out;
}

// The people on the wall, most builds first. A tie keeps the file's order.
export function requestedBuildPeople(rows: RequestedBuild[] = REQUESTED_BUILDS): { who: string; count: number }[] {
  const count = new Map<string, number>();
  for (const r of rows) {
    const who = requestedBuildGroup(r);
    if (who) count.set(who, (count.get(who) ?? 0) + 1);
  }
  return [...count].map(([who, n]) => ({ who, count: n })).sort((a, b) => b.count - a.count);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-07" → "Oct 7". Read from the string, not a Date: a Date parses the
// ISO day as UTC midnight and prints the day before west of UTC.
export function requestedBuildDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// What "This was me" puts in the feedback form for a row with no initials. The
// note names the row; Jacob reads it and a chat edits this file by hand.
export function requestedBuildClaim(r: RequestedBuild): string {
  return `Claim: ${r.title} (asked ${requestedBuildDay(r.date)}). My initials: `;
}
