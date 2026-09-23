import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Soccer Highlights Without Spoilers | HideScore";
const DESC =
  "Watch soccer highlights, Premier League matches, MLS games, and World Cup recaps without seeing scores or winners first.";
const CANONICAL = "/soccer-highlights-without-spoilers";

// ⚠️ Corrected 2026-09-20. This page said scores "reveal only when you tap".
// They do not: nothing outside GolfLeaderboard reads Team.score, so a score is
// never rendered and there is nothing to uncover. Ratings are opt-in too
// (showRatings: false in preferences.ts; the default "auto" mode holds them off
// before noon ET).

const FAQ = [
  {
    q: "Can I watch soccer highlights without spoilers?",
    a: "Yes. HideScore lets you start from a match card that carries no scoreline before opening highlights, recaps, or match news.",
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
    a: "Yes. Switch Ratings on in Settings and they flag close, dramatic, or high-value matches without naming the winner or the final score. They start off, and the default setting holds them back until noon Eastern.",
  },
  {
    q: "Which soccer leagues does HideScore cover?",
    a: "The Premier League, MLS, Champions League and Europa League, La Liga, Serie A, Bundesliga and Ligue 1, plus Liga MX, the NWSL, the EFL Championship, Copa Libertadores and the Saudi Pro League. The Euros and the Africa Cup of Nations appear in their tournament years.",
  },
  {
    q: "Is women's soccer covered?",
    a: "Yes. The NWSL has its own spoiler-free column, handled the same way as every other league.",
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
    // Brand card (og-image.png), not og-worldcup.png: the World Cup card reads
    // "Watch the World Cup" and points at hidescore.com/worldcup — a mismatched
    // unfurl for a general soccer page (which spans the EPL, MLS, La Liga and
    // more, not just the World Cup), and stale now the 2026 World Cup is over
    // (ended Jul 19). og-image.png is the generic HideScore card, matching the
    // same fix applied to the Premier League, Liga MX and cricket pages.
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function SoccerHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Soccer highlights without spoilers"
      intro={[
        "Soccer spoilers travel fast across time zones. A single thumbnail, live table, push alert, or headline can tell you the score before you watch the match.",
        "HideScore gives you a spoiler-free place to start: a match card carries the fixture and the kickoff and no scoreline at all, and an optional rating helps you choose what to watch.",
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
        {
          h: "Beyond the big five",
          p: "Alongside the Premier League, La Liga, Serie A, Bundesliga and Ligue 1, HideScore covers Liga MX, the NWSL, the EFL Championship, Copa Libertadores and the Saudi Pro League — with the Euros and the Africa Cup of Nations appearing in their tournament years. No score is rendered for any of them.",
        },
      ]}
      bullets={[
        "No soccer scoreline printed on any card.",
        "Optional spoiler-free match ratings for completed games.",
        "A safer route to highlights, recaps, and match news.",
        "Dedicated World Cup pages for tournament catch-up.",
        "Liga MX, NWSL, Championship, Libertadores, and Saudi Pro League columns.",
      ]}
      ctaLabel="Open soccer highlights"
      ctaHref="/worldcup/highlights"
      links={[
        { href: "/worldcup", label: "World Cup" },
        { href: "/worldcup/tomorrow", label: "Tomorrow" },
        { href: "/worldcup/highlights", label: "World Cup highlights" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        // Added 2026-09-20 — the three new soccer competition routes.
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/la-liga-without-spoilers", label: "La Liga" },
        { href: "/mls-highlights-without-spoilers", label: "MLS" },
        { href: "/redzone-for-every-sport", label: "Is there a soccer RedZone?" },
        { href: "/liga-mx-scores-without-spoilers", label: "Liga MX" },
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
