// Paid sponsors and Patreon patrons for /sponsors (built 2026-10-15, hidden
// until SUPPORT_LIVE_FROM in supportLinks.ts). Plain data with no imports, so
// the unit test can load it under node's type stripping (tests/sponsors.test.ts
// checks https links and no emails). The page renders entries in this order.
//
// Filled by hand from Patreon and email. Sponsors and patrons stay OFF
// /wall-of-fame: the wall is for people who asked for builds.

// `logo` is a path under /public or an https URL. `url` must be https.
export type Sponsor = { name: string; url: string; logo?: string; blurb: string };

export const SPONSORS: Sponsor[] = [];

// A name or initials, whichever the patron picked. Never an email.
export const PATRONS: string[] = [];
