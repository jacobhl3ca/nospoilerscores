import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "MLB Highlights Without Spoilers | HideScore";
const DESC =
  "Watch MLB highlights and catch up on baseball games without seeing the final score first. HideScore prints no result anywhere on the board.";
const CANONICAL = "/mlb-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch MLB highlights without seeing the score?",
    a: "Yes. HideScore lets you start from a hidden-score game card instead of a normal video list or scoreboard that exposes the result.",
  },
  {
    q: "Does HideScore help with condensed baseball games?",
    a: "Yes. It is useful when you want to choose a condensed game or highlight package without knowing whether it was a blowout, walk-off, or pitchers' duel.",
  },
  {
    q: "Can I avoid MLB app and notification spoilers?",
    a: "HideScore cannot control other apps' notifications, but it gives you a safe place to check the slate after you have avoided alerts.",
  },
  {
    q: "Is MLB seasonal for HideScore?",
    a: "Yes. Baseball pages are most useful during the regular season, pennant race, and playoffs, when there are daily games to catch up on.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "mlb highlights without spoilers",
    "baseball highlights without spoilers",
    "spoiler free mlb highlights",
    "mlb scores no spoilers",
    "watch baseball highlights without score",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date routes. A page's openGraph replaces the parent's wholesale
    // (Next merges metadata per top-level field, not deep), so without this these
    // SEO landing pages emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage).
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

export default function MlbHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="MLB highlights without spoilers"
      intro={[
        "Baseball is a daily sport, which means there is always another final score waiting to spoil a game you planned to watch later.",
        "HideScore helps you catch up on MLB games from a hidden-score view first, then move into highlights, condensed games, or recaps after you choose.",
      ]}
      sections={[
        {
          h: "Find the walk-offs without seeing the winner",
          p: "A great baseball game might be a walk-off, a pitchers' duel, a late comeback, or extra innings. Ratings help you choose without exposing the final score.",
        },
        {
          h: "Useful every day of the season",
          p: "During the MLB regular season, there are too many games to watch live. HideScore helps you decide what to catch up on without opening a spoiler-heavy scoreboard.",
        },
      ]}
      bullets={[
        "No MLB score printed anywhere on the board.",
        "Spoiler-free ratings for completed baseball games.",
        "Safer path to highlights and condensed games.",
        "Useful for regular season, postseason, and next-morning catch-up.",
      ]}
      ctaLabel="Open MLB highlights"
      ctaHref="/yesterday"
      links={[
        { href: "/teams#mlb", label: "MLB teams" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/redzone-for-every-sport", label: "Big Inning and other whip-around shows" },
        { href: "/mlb-playoff-bracket", label: "MLB playoff bracket" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["MLB highlights without spoilers", "baseball scores without spoilers", "spoiler-free baseball highlights"]}
    />
  );
}
