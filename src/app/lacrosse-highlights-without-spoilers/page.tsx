import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-10-13 with the PLL and NLL columns, after a "Major League
// Lacrosse" league request from the Android app.
//
// Facts read off ESPN's lacrosse/pll and lacrosse/nll scoreboards on
// 2026-10-13: the PLL Championship Series (sixes) ran Feb 27 to Mar 8 2026;
// the main season opened Fri May 8 and ended with the Championship on Sun
// Sep 20 2026 (ABC, 12:30 pm ET); the quarterfinals were Sat Aug 29 and the
// semifinals Mon Sep 7. The NLL 2025-26 Finals ended Sun May 17 2026; the
// 2026-27 season opens Sat Nov 28 2026. ⛔ The page never names a finalist or
// a champion.
//
// Highlights: the PLL is LIT behind its week gate (PR 2, 2026-10-13: the
// whole 2026 season through the gated worker read 51/51 right, 0 wrong); the
// NLL is DARK (lib/youtube.ts NO_HIGHLIGHT_FALLBACK). The copy says so; change
// it in the same PR that lights or darkens a league.
//
// ⚠️ WHAT THE APP ACTUALLY DOES: the score is parsed only to compute the
// rating and is never rendered. There is no standings view. Ratings are OPT-IN.
const TITLE = "Lacrosse Without Spoilers: PLL and NLL | HideScore";
const DESC =
  "Follow PLL and NLL lacrosse without spoilers: every game with its start time in Eastern, no score printed, playoff rounds shown without who advanced. Free.";
const CANONICAL = "/lacrosse-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I follow pro lacrosse without spoilers?",
    a: "Yes. Add the PLL or the NLL as a column and each game shows the two teams, the start time in Eastern, and whether it has finished, never the score. Playoff games show their round and hide who advanced until you tap to see the teams.",
  },
  {
    q: "What happened to Major League Lacrosse?",
    a: "Major League Lacrosse played its last season in 2020. In December 2020 it merged into the Premier Lacrosse League, which kept two MLL club names, the Boston Cannons and the Denver Outlaws. If you followed the MLL, the PLL is the league to add.",
  },
  {
    q: "When does the PLL season start?",
    a: "The PLL year has two parts. The Championship Series, a short sixes tournament, ran from February 27 to March 8 in 2026. The main season ran from May 8 to the Championship on September 20. Both columns stay in Settings all year, with the next start date shown in the offseason.",
  },
  {
    q: "When does the 2026-27 NLL season start?",
    a: "Saturday, November 28, 2026. The NLL plays indoor box lacrosse through the winter, with the playoffs in late April and May. The 2026 Finals ended on May 17.",
  },
  {
    q: "Is there a highlight button for lacrosse?",
    a: "For the PLL, yes. The PLL posts a cut of every game on its own channel, titled by week and not by date, and the same two teams meet two or three times a season. HideScore asks for that game's week, or its playoff round, so a rematch never fills the slot. Championship Series and All-Star games have no button. The NLL has no button yet, because its titles do not say highlights at all. A wrong clip is a spoiler, so no button is the safe answer there.",
  },
  {
    q: "Where can I watch the PLL and NLL live in the US?",
    a: "ESPN holds the US rights to both leagues. In 2026 most PLL games streamed on ESPN+, with some on ESPN2 and the Championship on ABC. NLL games stream on ESPN+ in the US. The watch link on each card opens ESPN's watch page, not a scores page.",
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
    "lacrosse without spoilers",
    "pll without spoilers",
    "nll without spoilers",
    "spoiler free lacrosse",
    "major league lacrosse",
    "pll scores no spoilers",
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

export default function LacrosseHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Lacrosse without spoilers"
      intro={[
        "Yes, you can follow pro lacrosse without spoilers: HideScore never prints a score, for the Premier Lacrosse League or the National Lacrosse League.",
        "Lacrosse is fast and high scoring, and most games are decided by a run of goals late in the fourth quarter. That is exactly what a score in a notification, a headline or a group chat gives away. If you watch on replay after work, the result usually finds you first.",
        "Add the PLL or the NLL as a column and each game shows the two teams, the start time in Eastern and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished game also carries a word for how close or dramatic it was, without naming a winner.",
        "Both leagues are opt-in, so nothing changes on your board until you add one.",
      ]}
      sections={[
        {
          h: "The PLL: field lacrosse in the summer",
          p: "The Premier Lacrosse League plays field lacrosse with eight teams. In 2026 its year started with the Championship Series, a sixes tournament from February 27 to March 8, then the main season from May 8 to September 20. Most fans watch on TV or on replay, often hours after the final whistle. The column follows both parts of the year and shows the next start date in between.",
        },
        {
          h: "The NLL: box lacrosse in the winter",
          p: "The National Lacrosse League plays indoor box lacrosse with teams in the US and Canada. Its season runs from late November to May, so it fills the months the PLL is off. The 2026-27 season starts on Saturday, November 28, 2026. Most games start between 6 and 10 pm Eastern, so a West Coast game ends after midnight on the East Coast and the result is waiting when you wake up.",
        },
        {
          h: "Playoff rounds without who advanced",
          p: "In both leagues the semifinal and final pairings are decided by the round before, so reading who plays in the final tells you who won the semifinals. HideScore shows those games with their round, such as Semifinals or Championship, and a Show teams button instead of the two names. The quarterfinals are seeded from the standings, so they show as normal. The NLL semifinals and Finals are best of three, and no card ever shows a series score.",
        },
        {
          h: "Major League Lacrosse lives on in the PLL",
          p: "Major League Lacrosse ran from 2001 to 2020 and merged into the PLL in December 2020. The Boston Cannons and the Denver Outlaws carried their MLL names into the PLL, and both are still playing. If you came here looking for the MLL, add the PLL column.",
        },
        {
          h: "Ratings that never name a winner",
          p: "Lacrosse goals come one at a time, and a typical pro game has about twenty to twenty-five of them. The rating reads each game the same way it reads every other sport: how close it was entering the fourth quarter, how close at the end, whether one team came back, and whether it went to sudden-death overtime. It is shown as a word such as Great or Good, never as a margin.",
        },
        {
          h: "PLL highlights by week, NLL not yet",
          p: "HideScore only shows a highlight button when it can find the right clip for that exact game every time. The PLL's own channel posts a cut of every game, titled by week and not by date, and the same two teams meet two or three times a season. So each PLL game asks for its own week, or its playoff round, and a cut from any other week is refused. Checked against every 2026 PLL game, that found the right cut each time and never a wrong one. The NLL's titles do not say highlights at all, so the NLL stays without a button until a full season of checks finds no mistakes.",
        },
      ]}
      bullets={[
        "No PLL or NLL score printed anywhere on the board.",
        "Start times in Eastern for every game.",
        "Semifinals and finals shown by round, never by who advanced.",
        "No series score on any NLL playoff card.",
        "Optional ratings for finished games that never name a winner.",
        "A PLL highlight button for each game, matched by week or playoff round.",
        "Watch links to ESPN's watch page, not to a scoreboard.",
      ]}
      ctaLabel="Open lacrosse without spoilers"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights without spoilers" },
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/afl-without-spoilers", label: "AFL" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["lacrosse without spoilers", "PLL without spoilers", "NLL without spoilers", "Major League Lacrosse"]}
    />
  );
}
