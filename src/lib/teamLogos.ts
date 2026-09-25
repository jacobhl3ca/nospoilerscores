// Team logos + which leagues the Settings team picker offers at all.
//
// Own leaf module (same reason as pollRank.ts / standingsRank.ts): lib/espn.ts
// is not importable from a node --test run, and every rule below came out of a
// team-by-team audit of the picker (2026-09-25) that should not quietly drift
// back. Measured that day, before this file existed:
//   - NCAAF (762 teams) and NCAAW (362) had NO logos at all — their sports were
//     missing from the school-logo case.
//   - All six rugby leagues, Little League (232) and IPL had none either.
//   - College baseball / softball: 94 of 437 and 112 of 446 blank.
//   - UFC, NASCAR, IndyCar, boxing and chess tabs listed nothing; F1 listed
//     constructors under names like "LP" and "JK".

import type { Sport } from "./types";

// Sports with no teams to favorite — every one is a field of individual
// competitors. ESPN has no team list for UFC / NASCAR / IndyCar, boxing and
// chess have no ESPN feed at all, and F1's list is constructors: a race card
// never carries a team, so a starred constructor would match nothing.
export const TEAM_PICKER_SKIP: readonly Sport[] = [
  "golf", "tennis", "poker", "chess", "boxing", "ufc", "f1", "nascar", "indycar",
];

// The six rugby competitions share ESPN's rugby team ids, so one path serves
// them all (Ireland = 3 in the Six Nations and in the World Cup).
const RUGBY: ReadonlySet<Sport> = new Set<Sport>([
  "sixnations", "rugbywc", "rugbychamp", "superrugby", "rugbytest", "nationschamp",
]);

// College diamond team ids are sport-specific (softball OU is 524), so the
// shared school logo has to be found by slug instead — see fetchSportTeams.
export function ncaaSchoolLogo(schoolId: string): string {
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${schoolId}.png`;
}

// Little League World Series: ESPN's own scoreboard draws a country flag, not a
// team logo — countries/500/<ISO3>.png for an international champion, usa.png
// for every US regional (whose abbreviation is a state, "N CA", "NCAL", "TXW").
// Curaçao has no flag on ESPN's CDN under any code (CUW / CUR / CW all 404, and
// its own 2024 scoreboard entry has no logo), so it gets none. "PR" is an older
// Puerto Rico abbreviation; the flag lives under PUR.
function llwsFlag(abbreviation: string): string | undefined {
  const a = abbreviation.trim().toUpperCase();
  if (!a || a === "TBD" || a === "CW" || a === "CUW" || a === "CUR") return undefined;
  const code = a === "PR" ? "PUR" : /^[A-Z]{3}$/.test(a) && !a.startsWith("TX") ? a : "usa";
  return `https://a.espncdn.com/i/teamlogos/countries/500/${code}.png`;
}

// ESPN CDN team-logo path conventions, verified empirically. The major US
// leagues use abbreviation; college uses the school id; soccer, cricket and
// rugby use the team id under their own path.
export function logoForTeam(sport: Sport, rawId: string, abbreviation: string, guid?: string): string | undefined {
  const abbr = abbreviation.toLowerCase();
  if (RUGBY.has(sport)) return `https://a.espncdn.com/i/teamlogos/rugby/teams/500/${rawId}.png`;
  switch (sport) {
    case "mlb":
    case "nba":
    case "wnba":
    case "nhl":
    case "nfl":
    // UFL follows the abbreviation convention (lou.png / bham.png answer 200,
    // checked 2026-09-14).
    case "ufl":
      return abbr ? `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png` : undefined;
    case "ncaam":
    case "ncaaw":
    case "ncaaf":
    case "ncaah":
    case "ncaawh":
    case "ncaavb":
      return ncaaSchoolLogo(rawId);
    // College baseball/softball team ids are sport-specific, NOT the ncaa/500
    // school ids — that path 404s for most of them (checked 2026-09-14: 5 of 6
    // softball ids, 2 of 8 baseball). The scoreboard event and the core teams
    // payload both carry a `guid`, and a.espncdn.com/guid/<guid>/logos/
    // default.png is the logo ESPN itself uses on the event. fetchSportTeams
    // prefers the school logo (matched by slug) over this; no guid and no
    // school match → no logo, never a broken image.
    case "ncaabase":
    case "ncaasoft":
      return guid ? `https://a.espncdn.com/guid/${guid}/logos/default.png` : undefined;
    case "llws":
      return llwsFlag(abbreviation);
    case "cricket":
      return `https://a.espncdn.com/i/teamlogos/cricket/500/${rawId}.png`;
    case "epl":
    case "mls":
    case "fifa":
    case "ucl":
    case "uel":
    case "laliga":
    case "seriea":
    case "bundesliga":
    case "ligue1":
    case "ligamx":
    case "nwsl":
    case "efl":
    case "libertadores":
    case "euro":
    case "afcon":
    case "saudi":
    case "uecl":
    case "facup":
    case "copadelrey":
    case "dfbpokal":
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${rawId}.png`;
    default:
      return undefined;
  }
}

// ESPN lists bracket placeholders as teams — "TBD" in college volleyball and
// the diamond sports, "TBD Home" / "TBD Away" in the Libertadores, with ids -1
// and -2. Nobody can favorite a placeholder.
export function isPlaceholderTeam(rawId: string, displayName: string): boolean {
  return rawId.startsWith("-") || /^TBD\b/i.test(displayName.trim());
}
