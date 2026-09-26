import { TEAM_PAGES, type TeamPage, type TeamPageLeague } from "@/lib/teamPages";

// Per-league facts for the /teams pages (added 2026-09-26). The team list
// itself is generated (src/lib/teamPages.ts); this file is the hand-written
// half: labels, the league's own SEO page, and the schema.org sport name.
export type TeamPageLeagueMeta = {
  league: TeamPageLeague;
  label: string;
  // The league's spoiler-free guide. Doubles as the "League" crumb in each
  // team page's breadcrumb: it is the one real page that represents the league.
  guide: string;
  schemaSport: string;
  schemaLeague: string;
  // Season shape, for the FAQ. Month names only, never a date that goes stale.
  season: string;
};

export const TEAM_PAGE_LEAGUES: TeamPageLeagueMeta[] = [
  { league: "nfl", label: "NFL", guide: "/nfl-highlights-without-spoilers", schemaSport: "American Football", schemaLeague: "National Football League", season: "September to February" },
  { league: "nba", label: "NBA", guide: "/nba-highlights-without-spoilers", schemaSport: "Basketball", schemaLeague: "National Basketball Association", season: "October to June" },
  { league: "nhl", label: "NHL", guide: "/nhl-highlights-without-spoilers", schemaSport: "Ice Hockey", schemaLeague: "National Hockey League", season: "October to June" },
  { league: "mlb", label: "MLB", guide: "/mlb-highlights-without-spoilers", schemaSport: "Baseball", schemaLeague: "Major League Baseball", season: "March to October" },
  { league: "premier-league", label: "Premier League", guide: "/premier-league-without-spoilers", schemaSport: "Soccer", schemaLeague: "Premier League", season: "August to May" },
];

export function leagueMeta(league: string): TeamPageLeagueMeta | undefined {
  return TEAM_PAGE_LEAGUES.find((l) => l.league === league);
}

export function teamsInLeague(league: TeamPageLeague): TeamPage[] {
  return TEAM_PAGES.filter((t) => t.league === league);
}

export function getTeamPage(league: string, slug: string): TeamPage | undefined {
  return TEAM_PAGES.find((t) => t.league === league && t.slug === slug);
}

export function teamPagePath(t: Pick<TeamPage, "league" | "slug">): string {
  return `/teams/${t.league}/${t.slug}`;
}

// "the New York Giants" / "the Athletics", but plain "Arsenal": English club
// names do not take the article.
export function teamWithArticle(t: Pick<TeamPage, "league" | "name">): string {
  return t.league === "premier-league" ? t.name : `the ${t.name}`;
}
