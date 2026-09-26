import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-26, with the Europa League and Nations League routes. The
// Conference League column itself has been live (opt-in) since 2026-09-14.
//
// Fixtures, kickoff times and the US broadcaster below are verified against
// ESPN's soccer/uefa.europa.conf/scoreboard feed on 2026-09-26, one date at a
// time (the feed rejects ranges). The 2026-27 league phase is SIX matchdays of
// eighteen ties, all Thursdays: Oct 15, Oct 22, Nov 5, Nov 26, Dec 10, Dec 17.
// Kickoffs are 12:45 pm and 3:00 pm ET, except Kairat Almaty's three home games
// (Oct 22 v Panathinaikos, Nov 26 v Mjällby, Dec 10 v CSU Craiova) at 10:30 am
// ET, and Dec 17 when all eighteen go at 3:00 pm ET. Every one of the 108 ties
// lists Paramount+. Zero fixtures on Oct 13, Oct 14, Oct 16 and Dec 18.
//
// Highlights are DARK for this competition (NO_HIGHLIGHT_FALLBACK in
// lib/youtube.ts: no uploader cleared the 4/5 gate, and the best candidate
// served the wrong leg of a tie). This page says so rather than promising a
// button the card does not have. No "#N" chip either: uecl is not in
// RANK_LEAGUES.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — do not write "the score appears when you tap
// it" on this or any page. It does not. No component outside GolfLeaderboard
// reads Team.score: the score is parsed only to compute the rating and is never
// rendered, so there is no covered score and nothing to reveal. There is no
// league table view either. And ratings are OPT-IN — `showRatings: false` in
// preferences.ts, and the default "auto" mode forces them off before noon ET
// (HomeContent.tsx), so a morning reader sees none until they turn them on.
const TITLE = "Conference League Without Spoilers | HideScore";
const DESC =
  "Follow the UEFA Conference League without seeing results: six Thursday matchdays from October 15, every tie covered, rated for how good it was. Free, no account.";
const CANONICAL = "/conference-league-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the Conference League without spoilers?",
    a: "Yes. Add the Conference League as a column and each tie shows the two clubs, the kick-off time in Eastern, the broadcaster and whether it has finished — never the scoreline. The column is opt-in, so it only appears once you pick it from a column's league switcher or in Settings.",
  },
  {
    q: "When are the 2026-27 Conference League matchdays?",
    a: "The league phase is six Thursdays: October 15, October 22, November 5, November 26, December 10 and December 17, 2026. Each one has all eighteen ties on the same afternoon. The knockout rounds follow in 2027.",
  },
  {
    q: "What time do Conference League games kick off in the US?",
    a: "Mostly at 12:45 pm and 3:00 pm Eastern. The exception is Kairat Almaty in Kazakhstan: its home games are evening kick-offs in Almaty, which is 10:30 am in New York. On December 17 all eighteen ties start together at 3:00 pm ET.",
  },
  {
    q: "Why does the Conference League need its own spoiler protection?",
    a: "Because it is the easiest European competition to be spoiled on by accident. Its clubs — Brighton, Atalanta, Ajax, Monaco, Getafe and Freiburg among them — are mostly followed as league sides, so a Conference League result tends to arrive through that club's domestic news, its league's highlights shows or a friend who supports the opponent, rather than from anywhere you chose to look.",
  },
  {
    q: "Does HideScore have Conference League highlights?",
    a: "Not yet, and that is on purpose. Before a highlight button goes on a card, the uploader has to find the right match in at least four of five tries with no wrong ones. No channel has passed for the Conference League — the best candidate served the first leg of a tie for the second — so its cards show the matchup, the rating and the watch link with no video button.",
  },
  {
    q: "Where can I watch the Conference League in the US?",
    a: "Paramount+. ESPN's feed lists it on every one of the 108 league-phase ties, and a card's watch link goes to Paramount+ rather than to a results page.",
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
    "conference league without spoilers",
    "uefa conference league no spoilers",
    "spoiler free conference league",
    "uecl without spoilers",
    "conference league scores without spoilers",
    "conference league schedule 2026",
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

export default function ConferenceLeagueWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Conference League without spoilers"
      intro={[
        "Yes, you can follow the UEFA Conference League without spoilers: HideScore never prints a scoreline, and it can rate the finished ties so you know which one is worth watching.",
        "The Conference League is UEFA's third club competition, and its 36 clubs play the league phase on six Thursday afternoons this autumn. It gets less attention than the Champions League or the Europa League, which is exactly why its results reach you sideways — through a club's league news, a weekend highlights show or a group chat.",
        "Add it as a column and each tie shows the clubs, the kick-off time, the broadcaster and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished tie also carries a mark for how close or dramatic it was, without naming a winner.",
        "The 2026-27 league phase runs on October 15, October 22, November 5, November 26, December 10 and December 17, 2026.",
      ]}
      sections={[
        {
          h: "Six Thursdays, not eight",
          p: "The Conference League's league phase is shorter than the other two UEFA competitions: six matchdays instead of eight, each club playing six different opponents. Every matchday is all eighteen ties on one Thursday, from October 15 to December 17, so there are only six afternoons to plan around.",
        },
        {
          h: "A 10:30 am kick-off from Almaty",
          p: "Most ties start at 12:45 pm or 3:00 pm ET. Kairat Almaty's home games are the exception: an evening kick-off in Kazakhstan is mid-morning in New York, so Panathinaikos on October 22, Mjällby on November 26 and CSU Craiova on December 10 all visit Almaty at 10:30 am ET. On the last matchday, December 17, all eighteen start together at 3:00 pm ET.",
        },
        {
          h: "Results that arrive through club news",
          p: "Brighton, Atalanta, Ajax, Monaco, Getafe and Freiburg are all in this season's league phase. Their fans mostly follow them through their domestic league, so a Thursday result tends to turn up in Saturday's league coverage, a manager's press conference or a rotation story. HideScore keeps the Thursday tie covered wherever you meet it first.",
        },
        {
          h: "No highlight button yet — on purpose",
          p: "A highlight button only goes on a card after the uploader has found the right match in at least four of five tries with no wrong ones. For the Conference League no channel has passed; the best candidate served the first leg of a tie for the second. So these cards show the matchup, the rating and the watch link, and no video until a trustworthy source exists.",
        },
        {
          h: "Watch on Paramount+",
          p: "ESPN's feed lists Paramount+ on every one of the 108 league-phase ties. The watch link on a card goes to Paramount+, never to a match centre or a table that would give the round away.",
        },
      ]}
      bullets={[
        "No Conference League scoreline printed anywhere on the board.",
        "All six league-phase Thursdays, October 15 through December 17.",
        "Kick-off times in Eastern, including the 10:30 am starts in Almaty.",
        "Optional ratings for finished ties that never name a winner.",
        "No highlight button until an uploader passes the right-match check.",
        "Watch links to Paramount+, not to a scoreboard.",
      ]}
      ctaLabel="Open the Conference League without spoilers"
      ctaHref="/today"
      links={[
        { href: "/europa-league-without-spoilers", label: "Europa League" },
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/nations-league-without-spoilers", label: "Nations League" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Conference League without spoilers", "spoiler-free UEFA Conference League", "Conference League scores without spoilers"]}
    />
  );
}
