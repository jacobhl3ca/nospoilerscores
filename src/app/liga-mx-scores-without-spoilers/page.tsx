import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Liga MX Scores Without Spoilers | HideScore";
const DESC =
  "Follow Liga MX — Apertura and Clausura, Liguilla and the final — without seeing scores, results, or the winner before you watch.";
const CANONICAL = "/liga-mx-scores-without-spoilers";

const FAQ = [
  {
    q: "Can I check Liga MX scores without spoilers?",
    a: "Yes. A Liga MX match card carries the fixture and the kickoff time and never a score, so you can line up a replay or the highlights first.",
  },
  {
    q: "Does HideScore cover both Apertura and Clausura?",
    a: "Yes. Liga MX plays two tournaments per year — Apertura from summer into December and Clausura from January into May — and HideScore covers both, including the Liguilla playoff rounds and the final.",
  },
  {
    q: "Why does Liga MX need a spoiler-free site more than most leagues?",
    a: "Liga MX matches kick off on Friday and Saturday nights and on Sunday afternoons, which is exactly when people are out. A push alert, a group chat, or a scrolling ticker gives the result away long before you sit down to watch.",
  },
  {
    q: "Where can I actually watch the match afterwards?",
    a: "Liga MX US rights are split by club, so HideScore points you at a place to watch rather than at a score-revealing gamecast page. ViX carries the largest share of clubs, with the rest on TUDN and Fox Deportes.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "liga mx scores without spoilers",
    "liga mx without spoilers",
    "spoiler free liga mx",
    "liga mx highlights without spoilers",
    "liguilla without spoilers",
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
    // unfurl for a Liga MX page, and stale now the 2026 World Cup is over
    // (ended Jul 19). og-image.png is the generic HideScore card, matching the
    // other single-league pages (NBA/NHL/MLB/NFL/EPL/cricket).
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function LigaMxScoresWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Liga MX scores without spoilers"
      intro={[
        "Liga MX is one of the most-watched soccer leagues in the United States, and it is one of the easiest to have ruined for you. Friday and Saturday night kickoffs land in the middle of everyone's weekend, so by the time you get to the replay a notification or a group chat has already told you how it ended.",
        "HideScore gives you a place to start that will not do that. Match cards carry no score at all, and the optional ratings tell you whether a game is worth your evening without telling you who won.",
      ]}
      sections={[
        {
          h: "Both tournaments, plus the Liguilla",
          p: "Liga MX runs two championships a year — the Apertura from summer through December and the Clausura from January through May — each ending in the Liguilla playoff and a two-legged final. HideScore follows the whole calendar, so the knockout rounds where spoilers hurt most are covered the same way as a regular matchday.",
        },
        {
          h: "Ratings without results",
          p: "A spoiler-free rating tells you a finished match was tight, high-scoring, or dramatic, and stops there. It never names the winner, never shows the scoreline, and never leaks the aggregate on a two-legged tie.",
        },
        {
          h: "A route to the match, not to a scoreboard",
          p: "Liga MX broadcast rights in the US are split club by club, so the watch link sends you toward a place to actually stream the match rather than dropping you on a results page that spoils it on load.",
        },
      ]}
      bullets={[
        "No Liga MX scoreline printed anywhere on the board.",
        "Apertura, Clausura, Liguilla, and the final.",
        "Spoiler-free ratings for finished matches.",
        "Watch links that point at a stream, not a scoreboard.",
      ]}
      ctaLabel="Open Liga MX without spoilers"
      links={[
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Liga MX scores without spoilers", "spoiler-free Liga MX", "Liguilla without spoilers"]}
    />
  );
}
