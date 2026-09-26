import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-26, with the Nations League and Conference League routes.
// The Champions League route (2026-09-20) showed a single UEFA competition can
// stand on its own, and the Europa League has its own spoiler problem the UCL
// page cannot answer: it is a THURSDAY competition, it shares that afternoon
// with the Conference League, and its last league-phase round kicks off all
// eighteen ties at one minute.
//
// Fixtures, kickoff times and the US broadcaster below are verified against
// ESPN's soccer/uefa.europa/scoreboard feed on 2026-09-26, one date at a time
// (the feed rejects ranges). The 2026-27 league phase: matchday one split over
// Wed Sep 16 and Thu Sep 17 (nine ties each, two at 12:45 pm ET and seven at
// 3:00 pm ET), then eighteen-tie Thursdays on Oct 15, Oct 22, Nov 5, Nov 26,
// Dec 10 and Jan 21 (12:45 pm / 3:00 pm ET), and Jan 28 with all eighteen at
// 3:00 pm ET. Paramount+ is on every tie listed; CBS Sports Network also
// carries two a day on matchday one. Zero fixtures on Oct 1, Oct 14 and Dec 17.
//
// Highlights are LIT for this competition: "CBS Sports Golazo - Europe", 6/8
// strict on the MD1 slate (see the uel note in lib/youtube.ts). The ranked "#N"
// chip is on (uel is in RANK_LEAGUES) and comes off once a match is final.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — do not write "the score appears when you tap
// it" on this or any page. It does not. No component outside GolfLeaderboard
// reads Team.score: the score is parsed only to compute the rating and is never
// rendered, so there is no covered score and nothing to reveal. There is no
// league table view either; the one "#N" chip a card can carry is dropped the
// moment the match is final (GameCard.tsx, the `!effectivePastDate &&
// !isFinished` branch). And ratings are OPT-IN — `showRatings: false` in
// preferences.ts, and the default "auto" mode forces them off before noon ET
// (HomeContent.tsx), so a morning reader sees none until they turn them on.
const TITLE = "Europa League Without Spoilers | HideScore";
const DESC =
  "Follow the Europa League's Thursday rounds without seeing a result. Every tie stays covered, rated for how good it was, with highlights opened from the card. Free.";
const CANONICAL = "/europa-league-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the Europa League without spoilers?",
    a: "Yes. Each Europa League tie arrives on HideScore as a card with the two clubs, the kick-off time in Eastern, the broadcaster and whether it has finished. No scoreline is printed on it, and there is no button that produces one, so opening the board after work does not tell you how Thursday went.",
  },
  {
    q: "When are the 2026-27 Europa League matchdays?",
    a: "Matchday one was split over Wednesday September 16 and Thursday September 17, 2026. After that every round is a single Thursday with all eighteen ties: October 15, October 22, November 5, November 26 and December 10, then January 21 and January 28, 2027.",
  },
  {
    q: "What time do Europa League matches kick off in the US?",
    a: "At 12:45 pm and 3:00 pm Eastern. On a normal Thursday eight or nine ties go at 12:45 and the rest at 3:00, so the whole round is finished by about 5:00 pm ET — before most people can sit down to watch any of it.",
  },
  {
    q: "Why is the last league-phase round the hardest to avoid?",
    a: "Because all eighteen ties kick off together at 3:00 pm ET on January 28, and one table decides who goes straight to the last sixteen, who goes into the play-off round and who is eliminated. Every final whistle moves every other club, so the table, the draw talk and the push alerts all turn into results at once.",
  },
  {
    q: "Does the Conference League on the same Thursday cause problems?",
    a: "It can. The Conference League plays on the same Thursdays at the same two kick-off times, and the coverage around one competition regularly mentions the other. HideScore covers both the same way: add the Conference League as its own column and neither one prints a score.",
  },
  {
    q: "How do I watch Europa League highlights without seeing the score?",
    a: "Open them from the card. CBS posts an extended cut of each tie on its European soccer channel, and the page around a video — thumbnails, suggested clips, comments — is where the result leaks. HideScore opens the clip itself, drops any upload whose title gives the result, and masks the title of the ones it keeps.",
  },
  {
    q: "Where can I watch the Europa League in the US?",
    a: "Paramount+ holds the US rights, and ESPN's feed lists it on every tie of the 2026-27 league phase so far, with CBS Sports Network on two ties a day in matchday one. A card's watch link opens the Europa League page on Paramount+, not a scores page.",
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
    "europa league without spoilers",
    "europa league highlights no spoilers",
    "spoiler free europa league",
    "uel without spoilers",
    "europa league scores without spoilers",
    "europa league matchday schedule 2026",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx. Next
    // merges metadata per top-level field, not deeply, so a page-level
    // openGraph replaces the parent's wholesale and must restate it.
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

export default function EuropaLeagueWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Europa League without spoilers"
      intro={[
        "Yes, you can follow the Europa League without spoilers: HideScore never prints a scoreline, and it can rate the finished ties so you know which Thursday match to save for the evening.",
        "The Europa League is a working-day competition for anyone in the Americas. Its rounds are played on Thursday afternoons Eastern time, the whole slate is over by about five o'clock, and the Conference League is running on the same afternoon. By the time you are free, the result has had hours to reach you.",
        "HideScore shows each tie with the clubs, the kick-off time, the broadcaster and a finished flag — nothing else. The result is not hidden behind a tap; it is simply never written on the card. Turn Ratings on in Settings and a finished tie also carries a mark for how close or dramatic it was, without saying who won.",
        "The 2026-27 league phase opened on September 16-17, 2026 and continues on October 15, October 22, November 5, November 26 and December 10, then January 21 and 28, 2027.",
      ]}
      sections={[
        {
          h: "A Thursday competition, finished by five",
          p: "After the split opening matchday, every round is eighteen ties on one Thursday: eight or nine at 12:45 pm ET and the rest at 3:00 pm ET. That is a full round of European football played and finished inside the US working day, which is why a Europa League result so often arrives before the match does.",
        },
        {
          h: "Eighteen at once on January 28",
          p: "The last league-phase round puts all eighteen ties on at 3:00 pm ET, because one 36-club table decides who goes straight to the last sixteen, who plays off and who goes out. With every club's fate tied to every other result, the afternoon is one long stream of table changes. HideScore shows none of it: there is no table view, and the small position marker a card can carry before kick-off comes off when the tie is final.",
        },
        {
          h: "Ratings to pick one tie from eighteen",
          p: "When a whole round finishes together, the useful question is which match to watch, not what happened. With Ratings on, each finished tie carries a mark for how level it stayed and how late it turned, and nothing more. Ratings are off until you switch them on, and the default setting holds them back until noon Eastern.",
        },
        {
          h: "Extended highlights, opened from the card",
          p: "CBS posts an extended cut of each Europa League tie on its European soccer channel. HideScore opens that video from the covered card rather than from a search page, drops uploads whose titles give the result, and masks the title on the ones it plays.",
        },
        {
          h: "Watch on Paramount+",
          p: "ESPN's feed names Paramount+ on every tie of the 2026-27 league phase so far, with CBS Sports Network also carrying two ties a day on matchday one. The watch link on a card goes to the Europa League page on Paramount+, never to a match centre or a live table.",
        },
      ]}
      bullets={[
        "No Europa League scoreline printed anywhere on the board.",
        "All eight league-phase matchdays, September 16 through January 28.",
        "Kick-off times in Eastern: 12:45 pm and 3:00 pm.",
        "Optional ratings for finished ties that never name a winner.",
        "In-app extended highlights with result titles filtered out.",
        "Watch links to Paramount+, not to a scoreboard.",
      ]}
      ctaLabel="Open the Europa League without spoilers"
      ctaHref="/today"
      links={[
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/conference-league-without-spoilers", label: "Conference League" },
        { href: "/nations-league-without-spoilers", label: "Nations League" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Europa League without spoilers", "spoiler-free Europa League", "Europa League highlights without spoilers"]}
    />
  );
}
