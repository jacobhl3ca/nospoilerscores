#!/usr/bin/env node
// Regenerates src/lib/teamPages.ts: the baked team list behind the static
// /teams/<league>/<slug> pages (NFL, NBA, NHL, MLB, Premier League).
//
// The list is BAKED, not fetched at build time, so a flaky ESPN answer can
// never drop a page out of the static export (dynamicParams is false, so a
// missing entry is a 404). Re-run only when a league changes shape: expansion,
// relocation, a rename, or the Premier League's promoted/relegated clubs each
// summer. Commit the regenerated file.
//
//   node scripts/build-team-pages.mjs
//
// Sources, per league:
//   • the team list — the same core endpoint fetchSportTeams reads
//     (sports.core.api.espn.com/v3/sports/<path>/teams?limit=1000);
//   • each team's home venue and city — this season's schedule (the venue of
//     its own non-neutral home games), falling back to the team record;
//   • its logo — the core v2 team record;
//   • its division and conference — the v2 group record the team points at.
// STATIC FACTS ONLY. No record, no standing, no rank and no result is read into
// the output (the site API's `standingSummary` — "2nd in NFC East" — is exactly
// what this script avoids), so the committed file can never spoil anything.
//
// Exits 1 if a league returns a different team count from the one expected.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "src/lib/teamPages.ts");

// `sport` is the app's Sport key (team ids are "${sport}-${rawId}"), `path`
// the ESPN sport/league path, `league` the URL segment.
const LEAGUES = [
  { sport: "nfl", league: "nfl", path: "football/nfl", expect: 32 },
  { sport: "nba", league: "nba", path: "basketball/nba", expect: 30 },
  { sport: "nhl", league: "nhl", path: "hockey/nhl", expect: 32 },
  { sport: "mlb", league: "mlb", path: "baseball/mlb", expect: 30 },
  { sport: "epl", league: "premier-league", path: "soccer/eng.1", expect: 20 },
];

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.replace(/^http:/, "https:"));
      if (res.ok) return await res.json();
    } catch {
      // retry below
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

const kebab = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ESPN's slug where it is already URL-shaped ("new-york-giants"); the soccer
// slugs are "eng.man_utd", so those fall back to the display name.
const slugFor = (t) => (t.slug && /^[a-z0-9-]+$/.test(t.slug) ? t.slug : kebab(t.displayName));

async function groupNames(ref, sport) {
  if (!ref) return {};
  try {
    const g = await getJson(ref);
    // Soccer's "group" is the season itself ("2026-27 English Premier
    // League"), which is not a division. Only real divisions carry
    // isConference === false.
    if (g.isConference !== false) return {};
    let division = g.name;
    let conference;
    if (g.parent?.$ref) {
      const p = await getJson(g.parent.$ref);
      conference = p.name;
    }
    // NBA divisions come back bare ("Atlantic"); NHL's already say "Division".
    if (division && sport === "nba" && !/Division$/.test(division)) division = `${division} Division`;
    return { division, conference };
  } catch {
    return {};
  }
}

// Names ESPN still carries under a retired sponsor, checked by hand
// 2026-09-26. A trailing "(Houston)"-style qualifier is stripped generically.
const VENUE_NAME_FIXES = {
  "Reliant Stadium": "NRG Stadium",
  "crypto.com Arena": "Crypto.com Arena",
};

// Regular season only (seasontype=2): in September the default answer is the
// preseason, whose neutral-site exhibitions (Boulder, Quebec City) outnumber
// a team's two or three real home dates.
async function homeVenue(path, rawId) {
  try {
    const d = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/teams/${rawId}/schedule?seasontype=2`);
    const counts = new Map();
    for (const e of d.events ?? []) {
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      if (String(home?.team?.id) !== rawId || !comp?.venue?.fullName || comp.neutralSite) continue;
      const hit = counts.get(comp.venue.fullName) ?? { n: 0, venue: comp.venue };
      hit.n++;
      counts.set(comp.venue.fullName, hit);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.venue;
  } catch {
    return undefined;
  }
}

const out = [];
for (const lg of LEAGUES) {
  const list = await getJson(`https://sports.core.api.espn.com/v3/sports/${lg.path}/teams?limit=1000`);
  const items = (list.items ?? []).filter((t) => t?.id && t?.displayName && t.active !== false && t.isActive !== false);
  if (items.length !== lg.expect) {
    console.error(`${lg.sport}: expected ${lg.expect} teams, got ${items.length}`);
    process.exit(1);
  }
  const [espnSport, espnLeague] = lg.path.split("/");
  const rows = await Promise.all(
    items.map(async (t) => {
      const rawId = String(t.id);
      const detail = await getJson(`https://sports.core.api.espn.com/v2/sports/${espnSport}/leagues/${espnLeague}/teams/${rawId}?lang=en&region=us`);
      // The venue on ESPN's team record is often years stale (Oracle Arena for
      // the Warriors, the Bradley Center for the Bucks, Atlanta for the Jets),
      // so the home venue is read off this season's schedule instead: the
      // venue the team's own home games are played at, most frequent first.
      // Only competitions[0].venue and homeAway are read — never a score.
      // The team record (then the site API's franchise, for MLB, whose core
      // record has none) is the fallback when the schedule has no home game.
      let v = await homeVenue(lg.path, rawId);
      if (!v?.fullName) v = detail.venue;
      if (!v?.fullName) {
        const site = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${lg.path}/teams/${rawId}`);
        v = site.team?.franchise?.venue;
      }
      const venue = v?.fullName ? (VENUE_NAME_FIXES[v.fullName] ?? v.fullName.replace(/\s*\([^)]*\)$/, "")) : undefined;
      const addr = v?.address ?? {};
      const city = addr.city ? [addr.city, addr.state].filter(Boolean).join(", ") : undefined;
      const logo = detail.logos?.find((l) => l.rel?.includes("default"))?.href ?? detail.logos?.[0]?.href;
      const { division, conference } = await groupNames(detail.groups?.$ref, lg.sport);
      return {
        sport: lg.sport,
        league: lg.league,
        slug: slugFor(t),
        rawId,
        name: t.displayName,
        shortName: t.shortDisplayName || t.name || t.displayName,
        abbreviation: t.abbreviation || "",
        ...(logo ? { logo } : {}),
        ...(venue ? { venue } : {}),
        ...(city ? { city } : {}),
        ...(division ? { division } : {}),
        ...(conference ? { conference } : {}),
      };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const slugs = new Set(rows.map((r) => r.slug));
  if (slugs.size !== rows.length) {
    console.error(`${lg.sport}: duplicate slugs`);
    process.exit(1);
  }
  out.push(...rows);
  console.log(`${lg.sport}: ${rows.length} teams`);
}

const header = `// GENERATED by scripts/build-team-pages.mjs — do not edit by hand.
// Baked ${new Date().toISOString().slice(0, 10)} from ESPN's core team records. Static facts
// only (name, venue, city, division): no record, standing or result. Re-run the
// script on expansion, relocation, a rename, or Premier League promotion and
// relegation, then commit this file. See the script header for the sources.

export type TeamPageLeague = "nfl" | "nba" | "nhl" | "mlb" | "premier-league";

export type TeamPage = {
  sport: "nfl" | "nba" | "nhl" | "mlb" | "epl";
  league: TeamPageLeague;
  slug: string;
  rawId: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo?: string;
  venue?: string;
  city?: string;
  division?: string;
  conference?: string;
};

export const TEAM_PAGES: TeamPage[] = `;

writeFileSync(OUT_FILE, `${header}${JSON.stringify(out, null, 2)};\n`);
console.log(`wrote ${out.length} teams to ${OUT_FILE}`);
