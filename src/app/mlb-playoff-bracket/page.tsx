import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import PlayoffPictureModal from "@/components/PlayoffPictureModal";

// Shipped 2026-09-23, one of three MLB postseason search pages (with
// /mlb-playoff-picture and /mlb-wild-card-standings). Each one leads with the
// live PlayoffPictureModal panel in its `variant="page"` form, straight under
// the h1, so a visitor from search lands on the bracket itself. None of them
// mounts HomeContent, so the board's first-run league picker never appears
// before the bracket.
//
// Demand, Google Trends US, 2025-09-01 to 2025-11-05, relative to "mlb playoff
// picture" = 1: "mlb bracket" 2.2x, "mlb playoff bracket" 1.3x, "mlb postseason
// bracket" and "world series bracket" 0.2x each. "Picture" peaks the last week
// of the regular season and falls away on the day the field is set. "Bracket"
// takes over from that day and holds through the LCS, so this page is the one
// of the three that earns traffic all October.
//
// Every date below is from StatsAPI /schedule/postseason/series?season=2026,
// read 2026-09-23: Wild Card Series Sep 29 - Oct 1, ALDS Oct 3 - 10, NLDS
// Oct 3 - 9, NLCS from Oct 11, ALCS from Oct 12, World Series Oct 23 - 31. The
// last regular-season games are Sunday Sep 27 (/schedule gameType=R). The TV
// lines are BROADCAST[2026] in lib/playoffPicture.
//
// ⚠️ WHAT THE PANEL ACTUALLY DOES. The Bracket tab draws seeds and pairings
// only. It never reads a series result, so later seats stay "ALDS winner" etc.
// all postseason (lib/playoffPicture buildBracket). Results show up ONLY as
// right/wrong marks in the Picks tab, behind its own second cover. Never write
// that this page shows who advanced. The whole panel starts blurred, and the
// reveal is remembered per season on the device (REVEAL_KEY).
const TITLE = "MLB Playoff Bracket 2026 (Seeds, Matchups, TV) | HideScore";
const DESC =
  "The 2026 MLB playoff bracket as it stands right now. All 12 seeds, every series pairing, who is still chasing a spot, and the TV channel for each round.";
const CANONICAL = "/mlb-playoff-bracket";

const FAQ = [
  {
    q: "What does the MLB playoff bracket look like right now?",
    a: "Tap Show the picture on the panel at the top of this page. It draws the bracket from MLB's live standings, six seeds in each league, the two wild-card pairings on each side and the Division Series seats waiting for their winners. Until the last day of the regular season it is the bracket as if the season ended today.",
  },
  {
    q: "When do the 2026 MLB playoffs start?",
    a: "The regular season ends on Sunday, September 27. The Wild Card Series starts on Tuesday, September 29 and runs through Thursday, October 1. Both Division Series open on Saturday, October 3.",
  },
  {
    q: "How many teams make the MLB playoffs?",
    a: "Twelve. Each league sends six, its three division winners and its three best remaining records as wild cards.",
  },
  {
    q: "Which teams get a bye in the MLB playoffs?",
    a: "Seeds 1 and 2 in each league. Those are the two division winners with the best records, and they skip the Wild Card Series and wait in the Division Series.",
  },
  {
    q: "Does MLB reseed the bracket after each round?",
    a: "No. The bracket is fixed on the final day of the regular season. The winner of 3 against 6 always meets the 2 seed, and the winner of 4 against 5 always meets the 1 seed, however the first round goes.",
  },
  {
    q: "When is the 2026 World Series?",
    a: "Game 1 is scheduled for Friday, October 23. A seventh game, if the series needs one, falls on Saturday, October 31. FOX has the World Series.",
  },
  {
    q: "Can I fill out an MLB playoff bracket here?",
    a: "Yes. The Picks tab in the same panel lets you choose a winner for every series, from the wild-card round to the World Series, and enter your bracket under a name on a shared leaderboard. Picks lock at the first pitch of the first wild-card game.",
  },
  {
    q: "Will looking at the bracket spoil a game I recorded?",
    a: "Only if you uncover it. The seed order is worked out from every result so far, so HideScore keeps the whole panel blurred until you tap it. After that it stays open on this device for the rest of the season.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "mlb playoff bracket",
    "mlb playoff bracket 2026",
    "mlb bracket",
    "mlb postseason bracket",
    "mlb playoff bracket right now",
    "mlb playoff bracket if the season ended today",
    "world series bracket 2026",
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

export default function MlbPlayoffBracketPage() {
  return (
    <SeoLandingPage
      h1="MLB playoff bracket 2026"
      lead={<PlayoffPictureModal variant="page" initialTab="bracket" />}
      intro={[
        "This is the 2026 MLB postseason bracket, drawn from MLB's own standings feed each time the page loads. Until the regular season ends on Sunday, September 27, it shows the field as if the season ended today, and the seeds move as the last games are played.",
        "HideScore is a sports board that never prints a score, so the bracket starts under a cover. Tap it when you want to see it. The Odds tab beside it has each club's chances, and the Picks tab lets you fill out a bracket of your own.",
      ]}
      sections={[
        {
          h: "How the 12-team bracket is built",
          p: "Six clubs from each league get in. The three division winners take seeds 1, 2 and 3, ordered by record, and the three best records among everyone else take seeds 4, 5 and 6 as wild cards. Seeds 1 and 2 skip the first round. In the best-of-three Wild Card Series the 3 seed hosts the 6 and the 4 seed hosts the 5, with every game at the higher seed's park. The 3-6 winner then plays the 2 seed and the 4-5 winner plays the 1 seed in a best-of-five Division Series. The two survivors meet in a best-of-seven League Championship Series, and the two pennant winners meet in a best-of-seven World Series.",
        },
        {
          h: "The 2026 postseason calendar",
          p: "All four Wild Card Series start on Tuesday, September 29, and a third game, where one is needed, is on Thursday, October 1. The ALDS and NLDS both begin on Saturday, October 3. The NLCS opens on Sunday, October 11 and the ALCS a day later on Monday, October 12. World Series Game 1 is Friday, October 23, and a Game 7 would be played on Saturday, October 31.",
        },
        {
          h: "Who carries each round on TV",
          p: "Each round's column in the bracket names its network, so you can see where a series airs without leaving the page. For 2026 the Wild Card Series is on NBC and Peacock in both leagues. The ALDS and ALCS are on TBS and HBO Max. The NLDS and NLCS are on FOX and FS1, and the World Series is on FOX.",
        },
        {
          h: "Seats that are still open",
          p: "While a seat has not been clinched, its card lists the clubs outside the six that can still take it, under a small Chasing this spot label, each with its own chance of making the playoffs. A club chases one seat, the division lead when that is its likelier road and otherwise the last wild card still open. A clinched club carries a check mark, and its seat takes no chasers. Empty seats further on say where they are filled from, such as the winner of a named wild-card pair.",
        },
        {
          h: "Why the bracket starts covered",
          p: "A seed looks harmless, but the order of the six is worked out from every game played so far. If your club dropped from the 4 seed to the 5 overnight, the bracket just told you how last night's game ended. So the whole panel stays blurred until you ask for it, the same cover the rest of HideScore puts over results. Nothing in the bracket fills in who won a series. Once the postseason starts it keeps showing the field and its pairings.",
        },
        {
          h: "Pick the whole bracket before it locks",
          p: "The Picks tab turns the same bracket into a pick sheet. Choose a winner for each series, enter a name, and your bracket joins a shared leaderboard. A right wild-card pick is worth 1 point, a Division Series pick 2, a League Championship pick 4 and the World Series 8, so the champion matters more than a perfect first round. Picks lock at the first pitch of the first wild-card game on September 29. Seeds can still move until the regular season ends, and a pick that a moved seed touches is cleared so you can make it again.",
        },
      ]}
      bullets={[
        "The full 2026 bracket for both leagues, drawn live from MLB's standings.",
        "Clubs still chasing an open seat, listed under that seat with their odds.",
        "The network for every round, from NBC's wild-card games to FOX's World Series.",
        "A Picks tab to call every series before the September 29 first pitch.",
        "One cover over all of it, so a bracket check never gives away last night.",
      ]}
      ctaLabel="Open the spoiler-free board"
      links={[
        { href: "/mlb-playoff-picture", label: "MLB playoff picture and odds" },
        { href: "/mlb-wild-card-standings", label: "MLB wild card standings" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights without spoilers" },
        { href: "/today", label: "Today's games" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["MLB playoff bracket", "2026 MLB postseason", "World Series"]}
    />
  );
}
