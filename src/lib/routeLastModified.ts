import { execFileSync } from "node:child_process";

// When a route's own source last changed, from git. Build-time only: the two
// callers (sitemap.ts and SeoLandingPage) are statically rendered, so this runs
// once per route during `next build` and never in a browser.
//
// Added 2026-09-24. The sitemap used to stamp every URL with the build time,
// so all 37 claimed "changed today" on every deploy. Crawlers learn to ignore a
// lastmod that is always new, which throws away the one re-crawl hint the file
// carries. The date of the last commit to the route's folder is the honest one.
//
// Returns null when git cannot answer. A shallow clone (actions/checkout's
// default depth of 1) would report the same last commit for every route — the
// exact always-new signal this replaces — so a shallow repo gets no date at all
// rather than a wrong one. deploy.yml checks out full history for this reason.

let shallow: boolean | undefined;
const cache = new Map<string, Date | null>();

export function routeLastModified(route: string): Date | null {
  const hit = cache.get(route);
  if (hit !== undefined) return hit;
  let result: Date | null = null;
  try {
    if (shallow === undefined) {
      shallow =
        execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() !== "false";
    }
    if (!shallow) {
      // Files directly in the route's folder only (glob `*` does not cross a
      // slash), so /worldcup is not re-dated by an edit to /worldcup/teams/[team].
      const iso = execFileSync(
        "git",
        ["log", "-1", "--format=%cI", "--", `:(glob)src/app${route}/*`],
        { encoding: "utf8" },
      ).trim();
      if (iso) result = new Date(iso);
    }
  } catch {
    result = null;
  }
  cache.set(route, result);
  return result;
}

// When a route's page was first committed (2026-09-25, for the Article node's
// datePublished on SeoLandingPage). Same shallow-clone rule as above: no date
// rather than a wrong one.
const firstCache = new Map<string, Date | null>();
export function routeFirstPublished(route: string): Date | null {
  const hit = firstCache.get(route);
  if (hit !== undefined) return hit;
  let result: Date | null = null;
  try {
    if (shallow === undefined) {
      shallow =
        execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() !== "false";
    }
    if (!shallow) {
      const lines = execFileSync(
        "git",
        ["log", "--format=%cI", "--", `src/app${route}/page.tsx`],
        { encoding: "utf8" },
      ).trim().split("\n");
      const iso = lines[lines.length - 1];
      if (iso) result = new Date(iso);
    }
  } catch {
    result = null;
  }
  firstCache.set(route, result);
  return result;
}

// "September 24, 2026", in New York time — the day the board itself runs on.
// `short` = "Sep 24, 2026", for the article byline.
export function formatUpdated(date: Date, month: "long" | "short" = "long"): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month,
    day: "numeric",
    year: "numeric",
  });
}
