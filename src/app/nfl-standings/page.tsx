import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import NflPlayoffPanel from "@/components/NflPlayoffPanel";

// Shipped 2026-10-07 with /nfl-playoff-picture; same panel, opened on the
// Divisions tab. See that route's header for the demand note, the dates and
// what the panel does and does not show (records only, no points, no results).
const TITLE = "NFL Standings 2026: All 8 Divisions and Playoff Seeds | HideScore";
const DESC =
  "The 2026 NFL standings for all eight divisions, AFC and NFC: won-lost records, win percentage and games back, plus the seven playoff seeds in each conference.";
const CANONICAL = "/nfl-standings";

const FAQ = [
  {
    q: "What are the NFL standings right now?",
    a: "The panel at the top of this page lists all eight divisions from ESPN's live standings, four in the AFC and four in the NFC. Each row has the club's record, its win percentage and how many games it trails its division leader.",
  },
  {
    q: "What does GB mean in the NFL standings?",
    a: "Games back: how far a club trails the leader of its own division. It is the leader's lead in wins plus its lead in losses, divided by two. The leader shows a dash.",
  },
  {
    q: "How do the standings turn into playoff seeds?",
    a: "Each division winner is a playoff team and takes one of seeds 1 to 4 in its conference, by record. The three best records among the other twelve clubs in the conference take seeds 5 to 7. The Seeds tab shows that order, and each division row carries its club's current seed when it has one.",
  },
  {
    q: "Why are there no points for and against?",
    a: "Because they are close to a score. HideScore is built for people who watch games later, and points scored are left out on purpose. Records are shown because they are what the standings are.",
  },
  {
    q: "When does the 2026 NFL regular season end?",
    a: "Week 18 is the weekend of January 9 and 10, 2027. Wild Card weekend starts on January 16.",
  },
  {
    q: "Will the standings spoil a game I have not watched?",
    a: "They can, since a record changes after every game. If you are behind on a game, watch it first, or use HideScore's main board, where no score or record is printed.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nfl standings",
    "nfl standings 2026",
    "afc standings",
    "nfc standings",
    "nfl division standings",
    "nfl standings playoff seeds",
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

export default function NflStandingsPage() {
  return (
    <SeoLandingPage
      h1="NFL standings 2026"
      subject="NFL standings"
      lead={<NflPlayoffPanel initialTab="divisions" />}
      intro={[
        "These are the 2026 NFL standings for all 32 clubs, by division, loaded fresh from ESPN each time you open the page.",
        "HideScore is a sports board that never prints a score, so this table keeps to records: no points scored or allowed. The Seeds tab turns the same standings into the playoff picture, and Bracket draws the Wild Card games it makes.",
      ]}
      sections={[
        {
          h: "Eight divisions, four clubs each",
          p: "The AFC and the NFC each have an East, North, South and West division. Each table lists its four clubs best record first, with ties broken in ESPN's order, which applies the NFL tiebreakers. A club holding a playoff seed today shows it after its name.",
        },
        {
          h: "Records, win percentage and games back",
          p: "A tie counts as half a win and half a loss in win percentage. Games back is measured against the division leader only, because a division title is the surest way into the playoffs. Seeds 1 to 4 belong to the four division winners in each conference.",
        },
        {
          h: "No points on purpose",
          p: "Points for, points against and point differential are left out: they are a step closer to a final score than a won-lost record. Scores stay hidden on the board too, where a finished game is a plain card.",
        },
      ]}
      bullets={[
        "All 32 clubs in their eight divisions, from ESPN's live standings.",
        "Record, win percentage and games back for each club.",
        "Each club's current playoff seed, when it holds one.",
        "No points scored or allowed.",
        "The playoff picture and bracket one tab over.",
      ]}
      ctaLabel="Open the spoiler-free board"
      links={[
        { href: "/nfl-playoff-picture", label: "NFL playoff picture" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights without spoilers" },
        { href: "/teams#nfl", label: "NFL teams" },
        { href: "/today", label: "Today's games" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NFL standings", "2026 NFL season", "NFL divisions"]}
      teamLeague="nfl"
    />
  );
}
