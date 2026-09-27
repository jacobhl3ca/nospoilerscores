import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-27. The CFL column itself has been live since 2026-09-13
// (theScore via the /api/cfl worker route, since ESPN stopped serving the CFL);
// this is its landing page.
//
// Facts, read 2026-09-27 off /api/cfl and the CFL's 2026 schedule (the same
// sources as the ALL_LEAGUES row in lib/espn.ts): regular season Thu Jun 4 →
// Sat Oct 24, 21 weeks; division semi-finals Oct 31; division finals Nov 7;
// the 113th Grey Cup Sun Nov 15 in Calgary. Week 18: Fri Sep 25 at 8:00 pm ET
// (CBS Sports Network) and 10:30 pm ET, Sat Sep 26 at 3:00 and 7:00 pm ET;
// Week 19: Fri Oct 2 at 7:00 and 9:30 pm ET, Sat Oct 3 at 3:00 and 7:00 pm ET.
// Games not on CBS Sports Network list CFL+ as the US outlet.
//
// Highlights: TSN's channel, each title required to carry the week (the
// WEEK_TOKEN_REQUIRED_CHANNELS gate in the worker), so an older re-upload of
// the same pairing is never served. See OFFICIAL_CHANNELS.cfl in lib/youtube.ts.
const TITLE = "CFL Without Spoilers: Scores Hidden, Highlights | HideScore";
const DESC =
  "Follow the CFL without spoilers: every game with its kickoff in Eastern and its US channel, no score printed, and TSN highlights for each game. Free.";
const CANONICAL = "/cfl-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the CFL without spoilers?",
    a: "Yes. Add the CFL as a column and each game shows the two teams, the kickoff in Eastern, the US channel and whether it has finished, never the score. When the highlights are posted, the card gets a button that plays them with the title covered.",
  },
  {
    q: "When is the 2026 Grey Cup?",
    a: "The 113th Grey Cup is on Sunday, November 15, 2026, in Calgary. The division semi-finals are on October 31 and the division finals on November 7. HideScore shows each playoff game by its round and never lists who advanced.",
  },
  {
    q: "What time are CFL games in the US?",
    a: "Mostly in the evening. In Week 19 of 2026 the Friday games start at 7:00 and 9:30 pm Eastern and the Saturday games at 3:00 and 7:00 pm. A late game in the West ends after midnight on the East Coast, which is when a score most often reaches you first.",
  },
  {
    q: "Where can I watch the CFL in the US?",
    a: "Some games are on CBS Sports Network, and the rest stream on CFL+. Each card names the channel for that game, and its watch link opens the CFL's where-to-watch page rather than a scores page.",
  },
  {
    q: "Where do the highlights come from?",
    a: "From TSN's YouTube channel, and only from a video whose title names both teams and the week. TSN also re-posts highlights from earlier seasons with no week in the title, and those are never served.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone and Android apps, and it works without an account. Signing in only syncs your columns and settings across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "cfl without spoilers",
    "cfl highlights without spoilers",
    "cfl scores without spoilers",
    "grey cup without spoilers",
    "spoiler free cfl",
    "watch cfl in the us",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // Next merges metadata per top-level field, so a page-level openGraph must
    // restate the site-level locale.
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function CflWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="CFL without spoilers"
      intro={[
        "Yes, you can follow the CFL from the US without spoilers: HideScore never prints a score, and each finished game gets TSN's highlights with the title covered.",
        "Canadian football fits the US evening, which is exactly the problem. A Friday night game in the West ends after midnight on the East Coast, a Saturday afternoon game overlaps college football, and a result reaches your phone long before you get to the recording. One notification is enough to take the tension out of the fourth quarter.",
        "Add the CFL as a column and each game shows the two teams, the kickoff in Eastern, the US channel and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished game also carries a mark for how close it was, without naming a winner.",
      ]}
      sections={[
        {
          h: "When the games are",
          p: "The 2026 regular season runs 21 weeks, from Thursday, June 4, to Saturday, October 24. Most weeks have a Friday doubleheader and a Saturday doubleheader: in Week 19 the Friday games start at 7:00 and 9:30 pm Eastern and the Saturday games at 3:00 and 7:00 pm. The board shows every kickoff in your own time zone.",
        },
        {
          h: "The playoffs and the Grey Cup",
          p: "The division semi-finals are on Saturday, October 31, the division finals on Saturday, November 7, and the 113th Grey Cup on Sunday, November 15, in Calgary. Every playoff fixture is decided by the round before, so reading the next week's schedule tells you who won. HideScore shows each playoff game by its round and never lists who advanced.",
        },
        {
          h: "Which channel it is on",
          p: "In the US, some games are on CBS Sports Network and the rest stream on CFL+. Each card names the channel for that game, so you know where to find it before you start looking. The watch link opens the CFL's where-to-watch page, never a scoreboard.",
        },
        {
          h: "Highlights from TSN, checked by week",
          p: "A highlight button uses TSN's YouTube channel, and only a video whose title names both teams and the week of the season. The week matters: teams in a nine-team league meet two or three times a season, and TSN also re-posts older highlights of the same pairing. A title without the week is never served, so the clip is always the game on the card. It plays with its title and progress covered.",
        },
        {
          h: "Ratings that never name a winner",
          p: "A CFL game has three downs, a wide field and the single point, so leads change fast and a two-score game can be level in two drives. The rating reads each game by quarter: how close it was going into the fourth, how close at the end, and whether it went to overtime. It is shown as a word such as Great or Good, never as a margin.",
        },
        {
          h: "No standings, no margins",
          p: "HideScore has no standings view, because a table is a list of results in another form. In the CFL it is also the playoff picture: the crossover rule can send a fourth-place team from one division into the other division's bracket, so a glance at the table late in the season tells you who won the week.",
        },
      ]}
      bullets={[
        "No CFL score printed anywhere on the board.",
        "Kickoff times in Eastern and the US channel for every game.",
        "Playoff games shown by round, never by who advanced.",
        "TSN highlights matched by team and week, with the title covered.",
        "Optional ratings for finished games that never name a winner.",
      ]}
      ctaLabel="Open the CFL without spoilers"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/college-football-highlights-without-spoilers", label: "College football" },
        { href: "/afl-without-spoilers", label: "AFL" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights without spoilers" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["CFL without spoilers", "spoiler-free Canadian football", "Grey Cup without spoilers"]}
    />
  );
}
