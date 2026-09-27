import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-27 with the AFL column, the day after the 2026 Grand Final.
// Evergreen: the season is over, so the copy talks about how the board works
// and when the next season starts rather than about this week's games.
//
// Every fact below was read off ESPN's australian-football/afl/scoreboard feed
// on 2026-09-27: the 2026 season opened Thu Mar 5 at 3:30 am ET (Carlton at
// Sydney, SCG); round 21 ran from Fri Jul 31 at 6:10 am ET to Sun Aug 2 at
// 2:40 am ET, with evening games from 11:05 pm ET the night before; the Grand
// Final was Sat Sep 26 at 12:30 am ET at the MCG. ⛔ The page never names the
// Grand Final pairing or its result.
//
// Highlights: the league's own channel ("AFL"), 6/8 strict over the 2026
// finals, 0 wrong (lib/youtube.ts). AFLW posts from its own channel. Watch
// link: Watch AFL, the international pass. The 2027 fixture is not out yet, so
// the page says "March" for the next opener and names no date.
const TITLE = "AFL Without Spoilers: Scores Hidden, Highlights | HideScore";
const DESC =
  "Follow the AFL without spoilers: every game with its bounce time in Eastern, no score printed, and the AFL's own highlights for each match. Free.";
const CANONICAL = "/afl-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the AFL without spoilers?",
    a: "Yes. Add the AFL as a column and each game shows the two clubs, the bounce time in Eastern and whether it has finished, never the score. When the AFL posts its highlights for the match, the card gets a button that plays it with the title covered.",
  },
  {
    q: "What time are AFL games in the US?",
    a: "Overnight and early morning. In one August round of 2026 the Friday night game in Perth started at 6:10 am Eastern, the Saturday games ran from 11:05 pm Friday to 5:40 am Saturday, and the Sunday games from 11:10 pm Saturday to 2:40 am Sunday. The 2026 Grand Final started at 12:30 am Eastern on Saturday, September 26.",
  },
  {
    q: "When does the next AFL season start?",
    a: "The 2026 season opened on Thursday, March 5, and the 2027 season is expected to open in March too. The column is off the board in the off-season and comes back on its own when the new fixtures are published. You can add it now and it will wait.",
  },
  {
    q: "Where do the highlights come from?",
    a: "Only from the AFL's own YouTube channel, and only a video titled with both clubs for that season. In a test across the 2026 finals series it found six of eight games and none was the wrong match. The AFLW posts from a separate channel, so a women's game between the same clubs cannot be served by mistake.",
  },
  {
    q: "Does HideScore show the AFL ladder?",
    a: "No. The ladder is a list of results in another form, and in the AFL it carries percentage, which tells you by how much a club won or lost. There is no ladder view, and finals are shown by week, never by who advanced.",
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
    "afl without spoilers",
    "afl highlights without spoilers",
    "afl scores without spoilers",
    "spoiler free afl",
    "afl results hidden",
    "watch afl in the us without spoilers",
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

export default function AflWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="AFL without spoilers"
      intro={[
        "Yes, you can follow the AFL from the US without spoilers: HideScore never prints a score, and each finished game gets the AFL's own highlights with the title covered.",
        "Australian football is played on the other side of the world, so for a fan in America almost every game is on while you sleep. By morning the result is in your feeds and on the front of every sports app, and in a sport where a lead can swing by six goals in a quarter, one number gives away the whole story.",
        "Add the AFL as a column and each game shows the two clubs, the bounce time in Eastern and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished game also carries a mark for how close it was, without naming a winner.",
      ]}
      sections={[
        {
          h: "Almost every game is overnight in the US",
          p: "The 2026 season opened on Thursday, March 5, at 3:30 am Eastern at the SCG. In a typical August round, Friday night in Perth started at 6:10 am Eastern, Saturday's games ran from 11:05 pm on Friday to 5:40 am, and Sunday's from 11:10 pm on Saturday to 2:40 am. Only the late-evening starts are watchable live on the East Coast, and even those end after midnight.",
        },
        {
          h: "The finals give each other away",
          p: "Since 2026 the top ten clubs go to the finals, starting with a wildcard round, and each week's fixtures are set by the week before. Reading who plays in a preliminary final tells you who won the semi-finals, and the Grand Final pairing gives away both preliminary finals. HideScore shows each finals game as a fixture with its week and never lists who advanced.",
        },
        {
          h: "Highlights from the AFL only",
          p: "A highlight button uses only the AFL's own YouTube channel, and only a video titled with both clubs for this season. Its titles name the clubs and the round, such as Round 21, and do not carry the score. The clip plays with its title and progress covered, so a thumbnail showing a celebration cannot give the game away either.",
        },
        {
          h: "Ratings that never name a winner",
          p: "An AFL score is goals worth six and behinds worth one, so a two-goal lead is twelve points and can vanish in two minutes. The rating reads each game by quarter: how close it was at each break, how close at the end, and whether one side came back. It is shown as a word such as Great or Good, never as a margin.",
        },
        {
          h: "Watch live on Watch AFL",
          p: "Watch AFL is the league's own international streaming pass, with games live and on replay. Each card's watch link opens it rather than a scores page, so the way into the full game never passes a result on the way.",
        },
        {
          h: "In the off-season",
          p: "The 2026 Grand Final was played at the MCG at 12:30 am Eastern on Saturday, September 26. The column leaves the board in the off-season so it does not sit empty, and comes back when the 2027 fixtures are out. HideScore added the AFL in September 2026, so its first full season on the board starts in March.",
        },
      ]}
      bullets={[
        "No AFL score printed anywhere on the board.",
        "Bounce times in Eastern for every overnight game.",
        "Finals shown by week, never by who advanced.",
        "Highlights from the AFL's own channel, with the title covered.",
        "Optional ratings for finished games that never name a winner.",
        "Watch links to Watch AFL, not to a scoreboard.",
      ]}
      ctaLabel="Open the AFL without spoilers"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/nrl-highlights-without-spoilers", label: "NRL" },
        { href: "/rugby-without-spoilers", label: "Rugby union" },
        { href: "/cricket-highlights-without-spoilers", label: "Cricket" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights without spoilers" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["AFL without spoilers", "spoiler-free Australian football", "AFL highlights without spoilers"]}
    />
  );
}
