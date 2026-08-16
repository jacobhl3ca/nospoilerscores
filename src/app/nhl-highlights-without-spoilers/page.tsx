import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-08-15. This route exists because "spoiler free nhl highlights"
// was pulling 149 impressions/mo at position 6.9 with ZERO clicks, and the page
// Google was serving for it was the HOMEPAGE — whose title leads with scores and
// lists five leagues, so it answers the query only incidentally. MLB, NFL,
// soccer and cricket already had dedicated highlights routes; NHL, the query
// with the most demand of the lot, did not. Same standalone-demand test the
// Liga MX / cricket / Premier League routes had to pass, and it clears it by a
// wide margin. /nhl-scores-without-spoilers is a SCORES page and stays separate:
// "scores" and "highlights" are different intents (check a result vs. pick
// something to watch), which is exactly the split the other leagues use.
const TITLE = "NHL Highlights Without Spoilers | HideScore";
const DESC =
  "Watch NHL highlights and catch up on hockey games without seeing scores, winners, or spoiler headlines first. HideScore keeps results hidden until you tap.";
const CANONICAL = "/nhl-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch NHL highlights without spoilers?",
    a: "Yes. HideScore gives you a spoiler-free starting point for hockey games before you open highlights, recaps, or a full replay.",
  },
  {
    q: "How do I find which NHL games were worth watching?",
    a: "Competitiveness ratings flag close games, overtime, and comeback finishes without revealing who won, so you can pick a game to watch on its merits.",
  },
  {
    q: "Does it help with late West Coast games?",
    a: "Yes. That is the main reason people use it. A 10pm Eastern puck drop finishes after most fans are asleep, and by morning the result is in push alerts, tickers, and thumbnails. HideScore keeps it hidden until you choose to look.",
  },
  {
    q: "Does this work for the playoffs and the Stanley Cup Final?",
    a: "Yes. Playoff hockey is where spoilers hurt most, because overtime games are the ones you most want to watch unspoiled and the ones most likely to be spoiled before you get to them.",
  },
  {
    q: "Will it tell me a game went to overtime?",
    a: "Only if you want it to. Game state is treated as part of the result, so it stays hidden alongside the score until you reveal it.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "spoiler free nhl highlights",
    "nhl highlights without spoilers",
    "hockey highlights without spoilers",
    "nhl scores no spoilers",
    "watch nhl highlights without score",
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

export default function NhlHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NHL highlights without spoilers"
      intro={[
        "Hockey is the sport spoilers ruin fastest. Games end late, half the league plays after midnight Eastern, and by the time you open your phone the final is already in a push alert, a ticker, a fantasy app, or a thumbnail.",
        "HideScore lets you catch up from a hidden-score board first, so you can choose which NHL highlights or replays to watch without the result being spoiled.",
      ]}
      sections={[
        {
          h: "Catch up on last night's games",
          p: "A full NHL slate can run a dozen games across four time zones. HideScore keeps every final hidden until you reveal it, so you can work through last night without one glance blowing up the game you actually saved.",
        },
        {
          h: "Ratings for overtime and comebacks",
          p: "A rating can tell you a game was tight, went the distance, or turned late, all without telling you who won. That is exactly what you need to pick a spoiler-free highlight package or a condensed replay.",
        },
        {
          h: "Built for the playoffs",
          p: "Stanley Cup overtime is the best hockey there is and the easiest to have ruined for you. Reveal each series game on your own schedule instead of racing the internet home from work.",
        },
      ]}
      bullets={[
        "NHL scores hidden until tap.",
        "Spoiler-free ratings for completed hockey games.",
        "Safer entry point for highlights, recaps, and condensed replays.",
        "Overtime and shootout results stay hidden with the score.",
        "Useful for late West Coast starts, back-to-backs, and the Stanley Cup Playoffs.",
      ]}
      ctaLabel="Open NHL highlights"
      ctaHref="/yesterday"
      links={[
        { href: "/nhl-scores-without-spoilers", label: "NHL scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NHL highlights without spoilers", "hockey scores without spoilers", "spoiler-free NHL highlights"]}
    />
  );
}
