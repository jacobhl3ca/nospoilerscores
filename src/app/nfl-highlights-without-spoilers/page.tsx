import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "NFL Highlights Without Spoilers | HideScore";
const DESC =
  "Watch NFL highlights and catch up on football games without seeing scores, winners, or spoiler headlines first. HideScore keeps results hidden until you tap.";
const CANONICAL = "/nfl-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch NFL highlights without spoilers?",
    a: "Yes. HideScore gives you a spoiler-free starting point for football games before you open highlights or recaps.",
  },
  {
    q: "Can I find which NFL games were worth watching?",
    a: "Yes. Competitiveness ratings help you spot close games, overtime, and comeback finishes without revealing the winner.",
  },
  {
    q: "Is this useful on Sundays?",
    a: "Yes. NFL Sundays have overlapping games, so HideScore helps you choose what to watch later without seeing the final scores first.",
  },
  {
    q: "Does this work for playoffs and prime-time games?",
    a: "Yes. It is especially useful for Monday night, Thursday night, international games, and playoff games watched on delay.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nfl highlights without spoilers",
    "football highlights without spoilers",
    "spoiler free nfl highlights",
    "nfl scores no spoilers",
    "watch nfl highlights without score",
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

export default function NflHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NFL highlights without spoilers"
      intro={[
        "NFL scores are everywhere on Sunday night: push alerts, tickers, fantasy apps, thumbnails, and headlines all race to tell you the ending.",
        "HideScore lets you catch up from a hidden-score board first, so you can choose which football highlights or replays to watch without the result being spoiled.",
      ]}
      sections={[
        {
          h: "Catch up after the Sunday slate",
          p: "When multiple games happen at once, you need a way to find the good ones without exposing every final. HideScore keeps the slate hidden until you reveal each game.",
        },
        {
          h: "Ratings for close games and comebacks",
          p: "A rating can tell you whether a game was competitive before you learn who won, which is exactly what you need for late-night highlights or next-day replays.",
        },
      ]}
      bullets={[
        "NFL scores hidden until tap.",
        "Spoiler-free ratings for completed football games.",
        "Safer entry point for highlights and recaps.",
        "Useful for Sundays, prime-time games, playoffs, and international windows.",
      ]}
      ctaLabel="Open NFL highlights"
      ctaHref="/yesterday"
      links={[
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NFL highlights without spoilers", "football scores without spoilers", "spoiler-free NFL highlights"]}
    />
  );
}
