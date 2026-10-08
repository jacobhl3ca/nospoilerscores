import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import NflPlayoffPanel from "@/components/NflPlayoffPanel";

// Shipped 2026-10-07 with /nfl-standings. Same pattern as the MLB postseason
// pages (/mlb-playoff-bracket header): the live panel leads, straight under the
// h1, and HomeContent never mounts, so no first-run league picker.
//
// Demand (plan 2026-10-07, ~/.claude/plans/we-have-seo-pages-rustling-quasar.md):
// "nfl playoff picture" climbs from Thanksgiving and peaks across Weeks 17-18,
// and it dwarfs every MLB postseason term. The page has to be indexed before
// late November, hence shipping in October. Not re-measured in Trends here.
//
// Dates are ESPN's NFL calendar (scoreboard leagues[0].calendar and the
// seasontype=3 events), read 2026-10-07: Week 18 Jan 9-10 2027, Wild Card
// Jan 16-18, Divisional Jan 23-24, conference championships Jan 31, Super Bowl
// LXI Feb 14 at SoFi Stadium. Baked in NFL_PLAYOFF_DATES (lib/nflPlayoffPicture).
//
// ⚠️ What the panel does: seeds come from ESPN's standings (records only, no
// points), opened uncovered — standings are a spoiler by nature and the
// visitor searched for them (the MLB pages' 9/23 "no cover" call). The Bracket
// reads no game results, so no winner ever appears on it.
const TITLE = "NFL Playoff Picture 2026: Seeds, Wild Card Race, Bracket | HideScore";
const DESC =
  "The 2026 NFL playoff picture as it stands right now: all 14 seeds, the AFC and NFC wild card race, who is in the hunt, and the Wild Card bracket those seeds make.";
const CANONICAL = "/nfl-playoff-picture";

const FAQ = [
  {
    q: "What is the NFL playoff picture right now?",
    a: "The panel at the top of this page draws it from ESPN's live standings: seven seeds in the AFC and seven in the NFC, then every club still in the hunt. It is the field as if the season ended today, and it changes after every game until Week 18 ends.",
  },
  {
    q: "How many teams make the NFL playoffs?",
    a: "Fourteen, seven from each conference. The four division winners are seeds 1 to 4, ordered by record, and the three best records among the other twelve clubs are seeds 5 to 7 as wild cards.",
  },
  {
    q: "Which team gets the bye?",
    a: "Only the 1 seed in each conference. It skips Wild Card weekend and hosts a Divisional round game the next week.",
  },
  {
    q: "When do the 2026 NFL playoffs start?",
    a: "Week 18 is the weekend of January 9 and 10, 2027. Wild Card weekend follows on January 16 to 18, the Divisional round on January 23 and 24, and both conference championships on Sunday, January 31. Super Bowl LXI is Sunday, February 14, 2027 at SoFi Stadium.",
  },
  {
    q: "Does the NFL reseed after the Wild Card round?",
    a: "Yes. The 1 seed hosts the lowest seed still left, and the other two Wild Card winners meet at the higher seed's stadium. That is why the Bracket tab says where the Divisional seats come from instead of drawing fixed lines.",
  },
  {
    q: "How are ties in the standings broken?",
    a: "By the NFL's tiebreakers. Inside a division the first steps are head-to-head, then division record, then record in common games. For a wild card spot the first steps are head-to-head, then conference record, then common games. The panel takes ESPN's seed order, which already applies them.",
  },
  {
    q: "Will looking at the playoff picture spoil a game I recorded?",
    a: "It can. A record moves after every game, so a club that went from 6-3 to 6-4 tells you how its last game ended. This page shows records and never points, but if you are behind on a game, watch it first. On HideScore's main board no score or record is printed at all.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nfl playoff picture",
    "nfl playoff picture 2026",
    "afc playoff picture",
    "nfc playoff picture",
    "nfl playoff seeds",
    "nfl wild card race",
    "nfl playoff bracket",
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

export default function NflPlayoffPicturePage() {
  return (
    <SeoLandingPage
      h1="NFL playoff picture 2026"
      subject="NFL playoff picture"
      lead={<NflPlayoffPanel initialTab="seeds" />}
      intro={[
        "Here is the 2026 NFL playoff picture for both conferences: the seven seeds in each, then every club still chasing a spot. It loads fresh from ESPN's standings each time you open the page.",
        "HideScore is a sports board that never prints a score, and this panel keeps to records: no points scored or allowed. Switch to Divisions for all eight division tables, or to Bracket for the Wild Card matchups the seeds make.",
      ]}
      sections={[
        {
          h: "How the 14-team field is built",
          p: "Each conference sends seven. The four division winners take seeds 1 to 4 by record, even when a wild card has the better record. The three best records among the rest take seeds 5 to 7. On Wild Card weekend the 2 seed hosts the 7, the 3 hosts the 6 and the 4 hosts the 5, while the 1 seed rests.",
        },
        {
          h: "In the hunt",
          p: "Under the seven seeds, each conference lists every club that is not yet out, best record first. Late in the season ESPN marks clinches and eliminations, and the panel shows them in words: Clinched bye, Clinched division or Clinched berth. A club that is out moves to a short Out line.",
        },
        {
          h: "The bracket those seeds make",
          p: "The Bracket tab draws the three Wild Card games in each conference, the Divisional round, the conference championships and Super Bowl LXI, with the dates of each round. It reads no results, so it never tells you who won a playoff game. The Divisional round reseeds, so its seats say where they come from rather than naming a club.",
        },
        {
          h: "Records, never points",
          p: "Points for, points against and point differential are left out on purpose: they are a step closer to a final score than a won-lost record is. Scores stay hidden on the board, where a finished game is a plain card with the result covered.",
        },
      ]}
      bullets={[
        "All 14 seeds, AFC and NFC, from ESPN's live standings.",
        "Every club still in the hunt, with clinches and eliminations in words.",
        "The Wild Card bracket the seeds make, with dates through Super Bowl LXI.",
        "Records only, no points scored or allowed.",
        "All eight divisions one tab over.",
      ]}
      ctaLabel="Open the spoiler-free board"
      links={[
        { href: "/nfl-standings", label: "NFL standings" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights without spoilers" },
        { href: "/teams#nfl", label: "NFL teams" },
        { href: "/today", label: "Today's games" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NFL playoff picture", "2026 NFL season", "NFL playoffs"]}
      teamLeague="nfl"
    />
  );
}
