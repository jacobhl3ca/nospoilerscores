import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Soccer Highlights Without Spoilers | HideScore";
const DESC =
  "Watch soccer highlights, Premier League matches, MLS games, and World Cup recaps without seeing scores or winners first.";
const CANONICAL = "/soccer-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch soccer highlights without spoilers?",
    a: "Yes. HideScore lets you start from a hidden-score match card before opening highlights, recaps, or match news.",
  },
  {
    q: "Does this help with time zones?",
    a: "Yes. Soccer is global, so many matches happen while you are at work or asleep. HideScore helps you catch up later without seeing the score first.",
  },
  {
    q: "Does HideScore cover the World Cup?",
    a: "Yes. HideScore has dedicated 2026 World Cup pages for spoiler-free schedules, tomorrow's matches, and highlights.",
  },
  {
    q: "Can ratings help with soccer matches?",
    a: "Yes. Ratings help flag close, dramatic, or high-value matches without revealing the winner or final score.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "soccer highlights without spoilers",
    "football highlights without spoilers",
    "spoiler free soccer highlights",
    "premier league highlights without spoilers",
    "world cup highlights without spoilers",
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
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: TITLE }],
  },
};

export default function SoccerHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Soccer highlights without spoilers"
      intro={[
        "Soccer spoilers travel fast across time zones. A single thumbnail, live table, push alert, or headline can tell you the score before you watch the match.",
        "HideScore gives you a spoiler-free place to start: match cards stay hidden, ratings help you choose what to watch, and scores reveal only when you tap.",
      ]}
      sections={[
        {
          h: "Built for global schedules",
          p: "Premier League, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Champions League, and international matches often happen while you are busy. HideScore helps you catch up without opening a result-first site.",
        },
        {
          h: "World Cup coverage has its own hub",
          p: "For the 2026 World Cup, HideScore already has dedicated routes for today's slate, tomorrow's schedule, and spoiler-free highlights.",
        },
      ]}
      bullets={[
        "Soccer scores hidden until tap.",
        "Spoiler-free match ratings for completed games.",
        "A safer route to highlights, recaps, and match news.",
        "Dedicated World Cup pages for tournament catch-up.",
      ]}
      ctaLabel="Open soccer highlights"
      ctaHref="/worldcup/highlights"
      links={[
        { href: "/worldcup", label: "World Cup" },
        { href: "/worldcup/tomorrow", label: "Tomorrow" },
        { href: "/worldcup/highlights", label: "World Cup highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["soccer highlights without spoilers", "World Cup highlights without spoilers", "spoiler-free soccer highlights"]}
    />
  );
}
