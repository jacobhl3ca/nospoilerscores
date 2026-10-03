// Every spoiler-free guide on the site, grouped by sport, for the /guides page
// (added 2026-09-28, replacing the homepage footer's "Guides" popup). Plain
// data with no imports, so the unit test can load it under node's type
// stripping. tests/guides-index.test.ts checks that every route here has a
// page.tsx, that every SeoLandingPage route is listed, and that the sitemap
// lists every route.

export type GuideLink = { href: string; label: string };
export type GuideGroup = { sport: string; guides: GuideLink[] };

export const GUIDE_GROUPS: GuideGroup[] = [
  {
    sport: "Football",
    guides: [
      { href: "/nfl-highlights-without-spoilers", label: "NFL highlights without spoilers" },
      { href: "/college-football-highlights-without-spoilers", label: "College football highlights without spoilers" },
      { href: "/cfl-without-spoilers", label: "CFL without spoilers" },
    ],
  },
  {
    sport: "Baseball",
    guides: [
      { href: "/mlb-highlights-without-spoilers", label: "MLB highlights without spoilers" },
      { href: "/mlb-playoff-bracket", label: "MLB playoff bracket" },
      { href: "/mlb-playoff-picture", label: "MLB playoff picture" },
      { href: "/mlb-wild-card-standings", label: "MLB wild card standings" },
    ],
  },
  {
    sport: "Basketball",
    guides: [
      { href: "/nba-highlights-without-spoilers", label: "NBA highlights without spoilers" },
      { href: "/nba-scores-without-spoilers", label: "NBA scores without spoilers" },
    ],
  },
  {
    sport: "Hockey",
    guides: [
      { href: "/nhl-highlights-without-spoilers", label: "NHL highlights without spoilers" },
      { href: "/nhl-scores-without-spoilers", label: "NHL scores without spoilers" },
    ],
  },
  {
    sport: "Soccer",
    guides: [
      { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights without spoilers" },
      { href: "/premier-league-without-spoilers", label: "Premier League without spoilers" },
      { href: "/la-liga-without-spoilers", label: "La Liga without spoilers" },
      { href: "/champions-league-without-spoilers", label: "Champions League without spoilers" },
      { href: "/europa-league-without-spoilers", label: "Europa League without spoilers" },
      { href: "/conference-league-without-spoilers", label: "Conference League without spoilers" },
      { href: "/nations-league-without-spoilers", label: "Nations League without spoilers" },
      { href: "/mls-highlights-without-spoilers", label: "MLS highlights without spoilers" },
      { href: "/liga-mx-scores-without-spoilers", label: "Liga MX scores without spoilers" },
      { href: "/worldcup", label: "2026 World Cup hub" },
      { href: "/watch-world-cup-without-spoilers", label: "How to watch the World Cup without spoilers" },
      { href: "/worldcup/teams", label: "World Cup teams without spoilers" },
    ],
  },
  {
    sport: "Motorsport",
    guides: [{ href: "/f1-without-spoilers", label: "F1 without spoilers" }],
  },
  {
    sport: "Rugby and Aussie rules",
    guides: [
      { href: "/nrl-highlights-without-spoilers", label: "NRL highlights without spoilers" },
      { href: "/rugby-without-spoilers", label: "Rugby without spoilers" },
      { href: "/afl-without-spoilers", label: "AFL without spoilers" },
    ],
  },
  {
    sport: "Combat sports",
    guides: [{ href: "/ufc-results-without-spoilers", label: "UFC results without spoilers" }],
  },
  {
    sport: "Climbing",
    guides: [{ href: "/climbing-replays-without-spoilers", label: "Climbing World Cup replays without spoilers" }],
  },
  {
    sport: "Cricket",
    guides: [{ href: "/cricket-highlights-without-spoilers", label: "Cricket highlights without spoilers" }],
  },
  {
    sport: "How-to and compare",
    guides: [
      { href: "/spoiler-free-sports", label: "Spoiler-free sports scores and highlights" },
      { href: "/how-to-watch-sports-highlights-without-spoilers", label: "How to watch sports highlights without spoilers" },
      { href: "/watch-sports-highlights-without-spoilers", label: "Watch sports highlights without spoilers" },
      { href: "/watch", label: "Watch any YouTube link without spoilers" },
      { href: "/best-spoiler-free-sports-sites", label: "The best spoiler-free sports sites and apps" },
      { href: "/redzone-for-every-sport", label: "Is there a RedZone for every sport?" },
      { href: "/no-spoiler-scores", label: "No-spoiler scores" },
      { href: "/teams", label: "Team schedules without spoilers" },
      { href: "/today", label: "Today's games, scores hidden" },
      { href: "/tomorrow", label: "Tomorrow's schedule" },
      { href: "/yesterday", label: "Yesterday's games, scores hidden" },
    ],
  },
];

export const GUIDE_ROUTES: string[] = GUIDE_GROUPS.flatMap((g) => g.guides.map((x) => x.href));
