import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import PlayoffPictureModal from "@/components/PlayoffPictureModal";

// Shipped 2026-09-23 with /mlb-playoff-bracket and /mlb-playoff-picture. See
// /mlb-playoff-bracket's header for why these pages lead with the live panel
// and skip HomeContent (no first-run league picker before the panel).
//
// Demand, Google Trends US, 2025-09-01 to 2025-11-05, relative to "mlb playoff
// picture" = 1: "wild card standings" 2.0x and "mlb wild card standings" 1.4x,
// the biggest bracket-or-picture term after "mlb bracket". Like "picture" it
// is a September term, so the page's payoff is the last weeks of each regular
// season.
//
// This page opens the Odds tab on the SEED sort, the one view with the bye
// line and the "still alive" list (the default playoff-% sort is one flat
// list). Seeds come from buildPicture, which orders by record and does NOT
// apply MLB's tiebreakers, so never claim the panel settles a tie. The games-
// back line is StatsAPI wildCardGamesBack, shown only with "Show games back"
// ticked. It is measured from the THIRD wild card (checked 2026-09-23: WC1
// "+9.0", WC3 "-", first club out "3.0"), so a seat holder's "N up" is its lead
// over the third wild card, not over the first club out.
const TITLE = "MLB Wild Card Standings 2026 (AL and NL Race) | HideScore";
const DESC =
  "The 2026 MLB wild card race in seed order. The three wild-card seats in each league, the clubs still alive behind them, and each club's odds of getting in.";
const CANONICAL = "/mlb-wild-card-standings";

const FAQ = [
  {
    q: "What are the MLB wild card standings right now?",
    a: "Uncover the panel above. It opens in seed order for both leagues, so seeds 4, 5 and 6 are the three wild-card seats, and every club listed under still alive is chasing them. Each row carries that club's chance of taking a wild card.",
  },
  {
    q: "How many wild card teams are there in MLB?",
    a: "Six in all, three per league. They are the three best records in each league among the clubs that do not win a division.",
  },
  {
    q: "How does the MLB Wild Card Series work?",
    a: "It is a best-of-three series with every game at the higher seed's park. The 4 seed hosts the 5 seed, and the 3 seed, the lowest division winner, hosts the 6 seed. The winners go on to face the 1 and 2 seeds in the Division Series.",
  },
  {
    q: "How are ties in the wild card race broken?",
    a: "By formula. MLB dropped tiebreaker games after 2021, so there is no Game 163. A tie for a seat is settled on paper, starting with the head-to-head record between the clubs involved. HideScore orders clubs by record, so for a dead heat on the final day check MLB's announced seeding.",
  },
  {
    q: "What does games back mean in the wild card race?",
    a: "How far a club trails the club holding the last wild-card seat, counted in games. Tick Show games back on the panel to add it. A club outside the six shows how many games it trails the third wild card by, and the first two wild cards show how many games they lead the third by.",
  },
  {
    q: "When is the 2026 Wild Card Series?",
    a: "Tuesday, September 29 through Thursday, October 1, on NBC and Peacock. The regular season ends on Sunday, September 27, so the wild-card field is set that night.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "mlb wild card standings",
    "wild card standings",
    "mlb wild card standings 2026",
    "mlb wild card race",
    "al wild card standings",
    "nl wild card standings",
    "mlb wild card standings today",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
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

export default function MlbWildCardStandingsPage() {
  return (
    <SeoLandingPage
      h1="MLB wild card standings 2026"
      lead={<PlayoffPictureModal variant="page" initialTab="odds" initialSort="seed" />}
      intro={[
        "These are the 2026 American League and National League wild card standings, laid out in seed order. MLB's standings feed and ESPN's odds load fresh with the page, so the race updates as the last weekend of the season is played.",
        "Like everything on HideScore, the table is covered until you tap it. A wild-card position is a running tally of results, and a glance at it can give away a game you meant to watch later.",
      ]}
      sections={[
        {
          h: "Three seats in each league",
          p: "Only one club per division can win it, and the three best records among the rest become the wild cards. They take seeds 4, 5 and 6. None of them gets a bye. The 4 seed hosts the 5 in a best-of-three Wild Card Series, and the 6 seed travels to the 3 seed, the division winner with the weakest record. Every game of that round is played at the higher seed's park, so the fight for the 4 seed is also a fight for three home games.",
        },
        {
          h: "Reading the race in seed order",
          p: "This page opens the table sorted by seed. The top two rows are the bye seeds, then a divider, then seeds 3 to 6. Below the six sits a still alive list, every club outside a playoff place that can still reach one, ordered by its chance of getting in. Each row shows three percentages, for the playoffs, the division and a wild card, and a status such as Clinched wild card when a club has locked in its place.",
        },
        {
          h: "Games back, when you want it",
          p: "Tick Show games back at the top of the panel to add each club's distance from the last wild-card seat. A chasing club reads 2 back or 1.5 back. The first two wild cards read how far they are up on the third, which is the seat a chaser actually takes. The figure is off by default because it moves with every result, which makes it the part of the table closest to a score.",
        },
        {
          h: "No more Game 163",
          p: "Until 2021 a tie for a wild card was played off in an extra game. Since 2022 ties are settled on paper, starting with head-to-head record, so the last day of the season decides the field outright. HideScore orders clubs by record, and a dead heat is the one case where MLB's final seeding can differ from the table until the league announces it.",
        },
        {
          h: "After the final Sunday",
          p: "The regular season ends on Sunday, September 27 and the Wild Card Series starts on Tuesday, September 29, on NBC and Peacock. From that point the wild card standings stop moving and the question becomes the bracket, which is the next tab over in the same panel.",
        },
      ]}
      bullets={[
        "Both leagues' wild card races in seed order, bye line and cut line included.",
        "Every club still alive, with its chance of the playoffs, the division and a wild card.",
        "Games back of the last seat, one checkbox away.",
        "The Wild Card Series pairings one tab over, with the network for each round.",
        "A cover over the whole table until you choose to look.",
      ]}
      ctaLabel="Open the spoiler-free board"
      links={[
        { href: "/mlb-playoff-bracket", label: "MLB playoff bracket" },
        { href: "/mlb-playoff-picture", label: "MLB playoff picture and odds" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights without spoilers" },
        { href: "/today", label: "Today's games" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["MLB wild card standings", "MLB wild card race", "2026 MLB season"]}
    />
  );
}
