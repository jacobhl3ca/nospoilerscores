import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "NHL Scores Without Spoilers | HideScore";
const DESC =
  "Check NHL scores, playoff games, recaps, and highlights without spoilers. HideScore keeps hockey results hidden until you reveal them.";
const CANONICAL = "/nhl-scores-without-spoilers";

const FAQ = [
  {
    q: "Can I check NHL scores without seeing the final?",
    a: "Yes. HideScore keeps NHL scores and winners hidden until you reveal each game.",
  },
  {
    q: "Can I find good hockey games without spoilers?",
    a: "Yes. Competitiveness ratings help you spot tight games, overtime, and comeback-worthy matchups without seeing who won.",
  },
  {
    q: "Is this useful for Stanley Cup playoff games?",
    a: "Yes. Playoff games are one of the best fits because fans often watch late games or condensed replays on delay.",
  },
  {
    q: "Can I catch up on NHL highlights safely?",
    a: "HideScore lets you start from a spoiler-free game card before opening highlights or recaps.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nhl scores without spoilers",
    "nhl scores no spoilers",
    "spoiler free nhl scores",
    "nhl highlights without spoilers",
    "spoiler free nhl recaps",
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

export default function NhlScoresWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NHL scores without spoilers"
      intro={[
        "Hockey spoilers are brutal because one overtime goal or third-period comeback changes the entire night. Normal recaps and scoreboards reveal that instantly.",
        "HideScore keeps NHL scores hidden while you decide what to watch, then lets you reveal the result only when you are ready.",
      ]}
      sections={[
        {
          h: "Great for playoff catch-up",
          p: "During the Stanley Cup playoffs, late starts and overlapping games make spoiler-free catch-up especially useful. HideScore lets you pick the best games without seeing the final.",
        },
        {
          h: "Ratings before recaps",
          p: "Use ratings to decide whether a game was a close finish, an overtime watch, or a blowout before opening highlights or recaps.",
        },
      ]}
      bullets={[
        "NHL scores hidden until tap.",
        "Spoiler-free game ratings for finished hockey games.",
        "Highlights and recaps after you choose what to watch.",
        "Useful for regular season, playoffs, and late West Coast starts.",
      ]}
      ctaLabel="Open NHL scores"
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
      about={["NHL scores without spoilers", "NHL highlights without spoilers", "spoiler-free NHL recaps"]}
    />
  );
}
