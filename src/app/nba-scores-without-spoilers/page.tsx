import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// 74 impressions / 0 clicks at position 11.5 (Search Console 2026-08-15). Same fix as
// the NHL page: the reaching queries are "nba no spoilers" / "nba spoiler free", and
// the phrase people actually scan for ("Highlights") was buried in the description.
const TITLE = "NBA Highlights and Scores Without Spoilers | HideScore";
const DESC =
  "Watch NBA highlights, recaps, and game ratings without spoilers. HideScore keeps basketball scores and winners hidden until you reveal them.";
const CANONICAL = "/nba-scores-without-spoilers";

const FAQ = [
  {
    q: "Can I check NBA scores without spoilers?",
    a: "Yes. HideScore keeps NBA scores hidden by default, so you can scan matchups and decide what to watch before revealing any final score.",
  },
  {
    q: "Can I find the best NBA games without seeing who won?",
    a: "Yes. HideScore's ratings help identify close games, comebacks, overtime games, and instant classics without exposing the winner.",
  },
  {
    q: "Does this work for NBA playoffs?",
    a: "Yes. HideScore is useful during the NBA regular season and playoffs, especially when games run late or you are watching on delay.",
  },
  {
    q: "Can I watch NBA highlights spoiler-free?",
    a: "HideScore links from spoiler-free game cards into highlights so you do not have to start from a spoiler-heavy video search page.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nba scores without spoilers",
    "nba scores no spoilers",
    "spoiler free nba scores",
    "nba highlights without spoilers",
    "nba game ratings",
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

export default function NbaScoresWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NBA scores without spoilers"
      intro={[
        "NBA nights are easy to ruin: a push alert, a box score, a YouTube thumbnail, or a group chat can give away the finish before you watch.",
        "HideScore keeps NBA results hidden until you tap, while still showing enough context to choose which games and highlights are worth your time.",
      ]}
      sections={[
        {
          h: "Find the best NBA game first",
          p: "Ratings help separate blowouts from close games, overtime finishes, and playoff-level drama without telling you who won.",
        },
        {
          h: "Built for late games and next-day catch-up",
          p: "West Coast tipoffs, doubleheaders, and playoff slates often end after you are asleep. HideScore lets you catch up the next morning without opening a full scoreboard.",
        },
      ]}
      bullets={[
        "NBA scores hidden until tap.",
        "Spoiler-free ratings for completed games.",
        "Highlights and recaps available after you choose what to watch.",
        "Useful for regular season, playoffs, and late-night games.",
      ]}
      ctaLabel="Open NBA scores"
      ctaHref="/yesterday"
      links={[
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NBA scores without spoilers", "NBA highlights without spoilers", "basketball game ratings"]}
    />
  );
}
