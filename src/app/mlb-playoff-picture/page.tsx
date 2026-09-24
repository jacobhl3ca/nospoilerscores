import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import PlayoffPictureModal from "@/components/PlayoffPictureModal";

// Shipped 2026-09-23 with /mlb-playoff-bracket and /mlb-wild-card-standings.
// See /mlb-playoff-bracket's header for why these pages lead with the live
// panel and skip HomeContent (no first-run league picker before the panel).
//
// Demand, Google Trends US, 2025-09-01 to 2025-11-05, relative to "mlb playoff
// picture" = 1: "mlb playoff standings" 0.7x, "mlb magic number" 0.1x, "mlb
// playoff odds", "al playoff picture", "nl playoff picture" and "mlb playoff
// seeding" each under 0.1x. In 2025 "mlb playoff picture" rose from 3 to 100
// across September, peaked on the final Sunday of the regular season, and was
// back to 10 two days later. This page therefore earns most of its traffic in
// the last two weeks of September, every year.
//
// This page opens the Odds tab on its default sort (chance of the playoffs,
// best first). Magic N is the DIVISION magic number (StatsAPI magicNumber),
// shown only for a division leader. The four clinch labels are CLINCH_TEXT in
// PlayoffPictureModal. The odds are ESPN standings-feed fields; do not name a
// model or a site as their source on this page, the feed does not.
const TITLE = "MLB Playoff Picture 2026 (Odds, Seeds, Clinches) | HideScore";
const DESC =
  "The 2026 MLB playoff picture for both leagues. Each club's chance of the playoffs, the division and a wild card, plus magic numbers and who has clinched.";
const CANONICAL = "/mlb-playoff-picture";

const FAQ = [
  {
    q: "What is the MLB playoff picture right now?",
    a: "Tap Show the picture on the panel above. It lists every American League and National League club still in contention, sorted by its chance of reaching the postseason, with a status beside each one such as Clinched division or Magic 3. The data loads fresh from MLB and ESPN each time you open the page.",
  },
  {
    q: "What does the magic number mean in baseball?",
    a: "It is how many more wins by a division leader, or losses by the club in second, or any mix of the two, will clinch the division. A magic number of 3 is settled by three leader wins, three losses by the runner-up, or two of one and one of the other. The panel shows it as Magic followed by the number.",
  },
  {
    q: "What do the clinch labels mean?",
    a: "Clinched bye means a club has won its division and locked up one of the two seeds that skip the Wild Card Series. Clinched division means the division is won but the bye is not yet settled. Clinched berth means a playoff place is certain while its route is not. Clinched wild card means a club is in as a wild card.",
  },
  {
    q: "Where do the playoff odds come from?",
    a: "From ESPN's MLB standings feed, which publishes a chance for each club of making the playoffs, winning its division and taking a wild card. The seeds, magic numbers and clinch marks come from MLB's own StatsAPI standings.",
  },
  {
    q: "How many MLB teams make the playoffs?",
    a: "Twelve, six in each league. Three are division winners and three are wild cards, and the top two division winners in each league get a first-round bye.",
  },
  {
    q: "When is the last day of the 2026 MLB regular season?",
    a: "Sunday, September 27. The field is set that night, and the Wild Card Series begins two days later on Tuesday, September 29.",
  },
  {
    q: "Why is the playoff picture blurred?",
    a: "Because standings are a spoiler for anyone watching on delay. A club's odds and seed move with last night's result, so reading them can tell you how a game you saved ended. HideScore keeps the panel covered until you tap it, and then remembers that choice for the season on this device.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "mlb playoff picture",
    "mlb playoff picture 2026",
    "mlb playoff picture right now",
    "mlb playoff standings",
    "mlb playoff odds",
    "al playoff picture",
    "nl playoff picture",
    "mlb magic number",
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

export default function MlbPlayoffPicturePage() {
  return (
    <SeoLandingPage
      h1="MLB playoff picture 2026"
      lead={<PlayoffPictureModal variant="page" initialTab="odds" />}
      intro={[
        "Here is the 2026 MLB playoff picture for both leagues, with odds in place of won-lost records. It reloads from MLB and ESPN every time you open it, so it moves as the final week of the regular season is played.",
        "The panel stays blurred until you tap it, because a standings table tells a delayed viewer who won last night. Switch to the Bracket tab for the matchups the seeds produce, or to Picks to call every series before the postseason starts.",
      ]}
      sections={[
        {
          h: "What the table shows",
          p: "Each league gets its own table, American League first. A row names the club and gives three chances as percentages, of making the playoffs at all, of winning its division and of taking a wild card. The last column says where the club stands in words, such as Clinched bye, Leads division or Magic 4. The two tables sit side by side on a wide screen and stack on a phone, where the division and wild-card columns drop out to leave room for the names.",
        },
        {
          h: "Sort it the way you read it",
          p: "The table opens sorted by chance of the playoffs, highest first, which answers the question most people open it with. Click any column heading to sort by it, and click again to flip the order. The Seed sort shows the six current playoff clubs in seed order, with a line after seed 2 where the bye ends and a still alive list of every club that can still get in. Your choice of sort is kept for the next visit.",
        },
        {
          h: "Magic numbers and clinch marks",
          p: "A division leader's status reads Magic followed by a number until the division is won. That number drops by one for each leader win and for each loss by the club in second place, and the division is clinched when it reaches zero. Once a club has locked something up the status says exactly what, a bye, the division, a berth or a wild card, because a bare word like clinched means different things to different fans.",
        },
        {
          h: "Odds instead of a record",
          p: "A 91-66 record tells you how many games a club has won, and that total changes every night the club plays. HideScore shows odds instead, because they answer the question the picture is opened for, who is getting in. Games back is one checkbox away when you want it, under Show games back at the top of the panel. It is off by default because a games-back figure moves with each result.",
        },
        {
          h: "The final week of the 2026 season",
          p: "The regular season's final weekend runs from Friday, September 25 through Sunday, September 27, and seeds can change right up to the final out on Sunday. The Wild Card Series opens on Tuesday, September 29, so Monday is the only day with the full field known and nothing yet played. From then on the Bracket tab is the more useful view.",
        },
      ]}
      bullets={[
        "Both leagues' playoff odds in one panel, refreshed from MLB and ESPN on every visit.",
        "Magic numbers for each division leader and a plain label for every clinch.",
        "Sorting by seed, playoff odds, division odds or wild-card odds.",
        "The bracket those seeds produce, one tab over, with the TV network per round.",
        "A cover over all of it until you choose to look.",
      ]}
      ctaLabel="Open the spoiler-free board"
      links={[
        { href: "/mlb-playoff-bracket", label: "MLB playoff bracket" },
        { href: "/mlb-wild-card-standings", label: "MLB wild card standings" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights without spoilers" },
        { href: "/today", label: "Today's games" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["MLB playoff picture", "MLB playoff odds", "2026 MLB season"]}
    />
  );
}
