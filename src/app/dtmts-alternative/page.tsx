import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-10-05. Search Console, 90 days to Oct 3: HideScore already shows
// for "dont tell me the score" at position 2.7 and "don't tell me the score" at
// 4.8, with zero clicks, because the page Google picks for those queries
// (/nhl-highlights-without-spoilers) never names DTMTS. r/hockey has pointed
// people at DTMTS for twelve years, and "this is just DTMTS" is the first reply
// any HideScore post there gets. This page is the place those searches, and the
// answer engines repeating them, can land. Brand searches for DTMTS itself are
// navigational and will keep going to DTMTS; the angle here is people who like
// it and follow something it does not cover.
//
// ⚠️ DTMTS CLAIMS RE-VERIFIED ON 2026-10-05 against the live site, not carried
// over from /best-spoiler-free-sports-sites:
//   • dtmts.com — fetched / and /nhl. Title "DTMTS - Spoiler Free Highlights".
//     Nav is NBA / NFL / NHL / MLB and nothing else: no soccer, no F1, no UFC,
//     no college sport. No price, sign-in or subscription anywhere in the page.
//   • /nhl carries a youtubeId plus altVideoId1 and altVideoId2 per game, which
//     is the more-than-one-video-source feature. Its game data ran to
//     2026-10-05, so it is running.
// Re-verify before editing any sentence about DTMTS. Never write a competitor
// claim from memory on this page.
//
// HideScore claims checked against code the same day: 50+ competitions (the
// league list in /faq), ratings opt-in (showRatings: false in preferences.ts),
// team pages (/teams), iPhone and Android apps (store links in /faq), no score
// rendered anywhere (nothing outside GolfLeaderboard reads Team.score).
//
// ⛔ No claim that DTMTS is worse where it is not, and no reply to the
// "vibecoded" comment from the r/hockey thread in this copy.
const TITLE = "DTMTS Alternative for Soccer, UFC, F1 and More | HideScore";
const DESC =
  "Like DTMTS (Don't Tell Me The Score) but follow more than the NBA, NFL, NHL and MLB? HideScore covers 50+ competitions with no score shown. Free, no account.";
const CANONICAL = "/dtmts-alternative";

const FAQ = [
  {
    q: "What is DTMTS?",
    a: "DTMTS, short for Don't Tell Me The Score, is a free website for watching game highlights without seeing the result first. It has tabs for the NBA, NFL, NHL and MLB, and it attaches more than one video source to a game, so a broken embed does not end the attempt. Hockey fans in particular have recommended it for over a decade.",
  },
  {
    q: "Does DTMTS have soccer, Premier League, UFC or F1?",
    a: "No. Checked on October 5, 2026, DTMTS covers four leagues: the NBA, NFL, NHL and MLB. There is no soccer, no Premier League or Champions League, no UFC, no Formula 1 and no college sport. HideScore covers all of those, along with the four DTMTS leagues.",
  },
  {
    q: "Is DTMTS still running?",
    a: "Yes. On October 5, 2026 dtmts.com was live and free, with NHL games listed through that day.",
  },
  {
    q: "Is HideScore the same as DTMTS?",
    a: "No. They are separate sites run by different people, and neither is affiliated with the other. They share the idea of showing you a game without its result. DTMTS sticks to four North American leagues; HideScore covers more than 50 competitions on one board.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone and Android apps, and it works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "dtmts alternative",
    "dtmts",
    "don't tell me the score",
    "dont tell me the score",
    "don't tell me the score alternative",
    "sites like dtmts",
    "dtmts soccer",
    "spoiler free highlights",
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

export default function DtmtsAlternativePage() {
  return (
    <SeoLandingPage
      h1="A DTMTS alternative for every other sport"
      subject="DTMTS alternative"
      intro={[
        "DTMTS (Don't Tell Me The Score) is a good free site for catching up on NBA, NFL, NHL and MLB highlights without seeing who won. If you also follow soccer, UFC, F1, college sport or anything else, HideScore does the same job for more than 50 competitions on one board.",
        "HideScore is ours, so read this as an interested comparison. Every claim about DTMTS below was checked against its live site on October 5, 2026.",
      ]}
      sections={[
        {
          h: "What DTMTS does well",
          p: "DTMTS keeps it simple: four tabs, one per league, and a list of games with the highlights behind them. It attaches more than one video source to a game, so if one embed fails there is another to try. It is free, it needs no account, and it has been the default answer on r/hockey for years.",
        },
        {
          h: "If you only follow the NBA, NFL, NHL and MLB",
          p: "DTMTS is a good pick, and there is no reason to switch. Those four leagues are all it covers, and it covers them plainly.",
        },
        {
          h: "What HideScore adds",
          p: "More than 50 competitions sit on one board: the Premier League, Champions League, La Liga, MLS and Liga MX, F1, UFC, college football and basketball, the golf and tennis majors, cricket, rugby and more, along with the four DTMTS leagues. No score is printed anywhere and there is no standings table to walk into. An optional rating on each finished game tells you which one was worth watching without naming the winner; it is off until you turn it on in Settings. Every team has its own schedule page, and there are free iPhone and Android apps as well as the website.",
        },
        {
          h: "Where DTMTS is the better fit",
          p: "DTMTS shows more than one video source per game, which HideScore does not do for every league. Some HideScore competitions have no verified video source and show a card with a rating and no highlight button. If your sports are the four DTMTS leagues and nothing else, the smaller site may suit you better.",
        },
        {
          h: "Not affiliated",
          p: "HideScore and DTMTS are separate sites run by different people. HideScore is not affiliated with, endorsed by, or sponsored by DTMTS, or by any league, team or broadcaster.",
        },
      ]}
      bullets={[
        "DTMTS: NBA, NFL, NHL and MLB, free, more than one video source per game (checked October 5, 2026).",
        "HideScore: 50+ competitions, including soccer, UFC, F1 and college sport.",
        "No score printed anywhere, no standings table.",
        "Optional excitement ratings that never name the winner.",
        "Free on the web, iPhone and Android, no account needed.",
      ]}
      ctaLabel="Try HideScore"
      ctaHref="/today"
      links={[
        { href: "/best-spoiler-free-sports-sites", label: "All spoiler-free sites compared" },
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/ufc-results-without-spoilers", label: "UFC" },
        { href: "/f1-without-spoilers", label: "F1" },
        { href: "/teams", label: "Team pages" },
        { href: "/faq", label: "FAQ" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["DTMTS alternative", "Don't Tell Me The Score", "spoiler-free sports highlights"]}
    />
  );
}
