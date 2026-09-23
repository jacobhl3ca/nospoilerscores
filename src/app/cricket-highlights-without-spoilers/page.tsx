import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Cricket Highlights Without Spoilers | HideScore";
// Deliberately does NOT promise an in-app highlight video: there is no
// trustworthy IPL uploader on YouTube (rights are exclusive to JioHotstar and
// geo-locked to India), so the cricket card ships a hidden scorecard, a chase
// rating and a watch link — see NO_HIGHLIGHT_FALLBACK in src/lib/youtube.ts.
// Keep the copy on this page matched to that, and re-check if the rights move.
const DESC =
  "Follow the IPL and catch up on cricket without seeing the result first. No score, wicket count, or chase total is printed anywhere.";
const CANONICAL = "/cricket-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the IPL without spoilers?",
    a: "Yes. HideScore keeps every IPL match card hidden — no runs, no wickets, no result — and hands you a watch link, so you get to the match without learning how the chase ended.",
  },
  {
    q: "Does HideScore play IPL highlights in the app?",
    a: "No, and that is deliberate. IPL highlight rights sit with JioHotstar and are geo-locked to India, so there is no official per-match highlight on YouTube — only fan re-uploads, which are exactly the kind of source that leaks a result in the title or serves the wrong match. Rather than play one of those, HideScore leaves the cricket card to the hidden scorecard, the chase rating and a link to the broadcast.",
  },
  {
    q: "Why is cricket so easy to spoil?",
    a: "The IPL is played in India, which puts almost every match in the middle of the night for viewers in North America and Europe. Nearly everyone watches on delay, and a single notification, ticker, or thumbnail gives away a result you have not seen yet.",
  },
  {
    q: "Do the match cards show the score?",
    a: "Only when you ask. A hidden card shows the two teams and the status. Tapping reveals the innings score in the usual runs-for-wickets form.",
  },
  {
    q: "Do ratings spoil the result?",
    a: "No. A cricket rating reflects how close the finish was — whether the chase came down to the last over, how many wickets were still standing, how big a total was defended — without ever naming the winner.",
  },
  {
    q: "Which cricket does HideScore cover?",
    a: "The Indian Premier League, across its full season from late March to the final at the end of May. Other competitions are not covered yet.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "cricket highlights without spoilers",
    "ipl highlights without spoilers",
    "spoiler free cricket",
    "ipl scores without spoilers",
    "watch ipl without spoilers",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // Matches the site-level Open Graph block in layout.tsx — Next merges
    // metadata per top-level field, not deeply, so a page-level openGraph
    // replaces the parent's wholesale and must restate og:locale.
    locale: "en_US",
    type: "website",
    // Brand card (og-image.png), not og-worldcup.png: the World Cup card reads
    // "Watch the World Cup" and points at hidescore.com/worldcup — a mismatched
    // unfurl for a cricket page (cricket isn't even the same sport), and stale
    // now the 2026 World Cup is over (ended Jul 19). og-image.png is the generic
    // HideScore card, matching the other single-sport pages (NBA/NHL/MLB/NFL/EPL).
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function CricketHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Cricket highlights without spoilers"
      intro={[
        "Cricket may be the sport most often ruined before you watch it. IPL matches are played in India, so for most of the world they finish overnight — which means almost everybody is watching a replay, and almost everybody has already been told how it ended.",
        "HideScore is built for exactly that gap. A match card carries the fixture and the start time and no score at all, and the optional ratings tell you whether a chase was worth your time without telling you who won it.",
      ]}
      sections={[
        {
          h: "Made for watching on delay",
          p: "A late-night finish in Mumbai is a morning catch-up somewhere else. HideScore assumes you have not seen the match yet and never shows a result you did not ask for.",
        },
        {
          h: "Ratings that understand a chase",
          p: "Cricket does not measure closeness the way other sports do. A side chasing a target stops the moment it passes it, so the run totals always finish a few apart even in a rout. HideScore rates a chase on what the batting side had left — wickets in hand and balls to spare — and rates a defended total on the runs it held out by. A one-wicket win off the final ball rates like the thriller it was; a ten-wicket stroll does not.",
        },
        {
          h: "News that will not give it away",
          p: "Cricket announces its results in language no other sport uses — bowled out, all out, chased down, defended, Super Over, a score written as runs for wickets. HideScore's spoiler filter reads all of it, so a headline in the news column will not hand you the result while you are still deciding what to watch.",
        },
      ]}
      bullets={[
        "No IPL score printed anywhere on the board.",
        "Ratings built on wickets in hand and balls to spare, never on the winner.",
        "Cricket-aware spoiler filtering on headlines and highlight titles.",
        "A watch link to the broadcast rather than to a scorecard.",
      ]}
      ctaLabel="Open cricket without spoilers"
      links={[
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/how-to-watch-sports-highlights-without-spoilers", label: "How it works" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["cricket highlights without spoilers", "IPL highlights without spoilers", "spoiler-free cricket"]}
    />
  );
}
