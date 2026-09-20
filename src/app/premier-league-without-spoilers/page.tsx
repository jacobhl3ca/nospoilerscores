import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Premier League Without Spoilers | HideScore";
const DESC =
  "Follow the Premier League — every matchweek, the title race, and the relegation fight — without seeing scores, results, or the winner before you watch.";
const CANONICAL = "/premier-league-without-spoilers";

// Answer-engine questions. The first one is the reason this page exists: the
// 2026-27 season starts a week later than a normal year because of the World
// Cup, so "when does the Premier League start" is a real question this August
// rather than a fact everyone already has. Dates verified against ESPN's eng.1
// fixture list on 2026-08-08 — matchweek 1 is Fri Aug 21 to Mon Aug 24 2026,
// and the final round is Sun May 30 2027.
const FAQ = [
  {
    q: "When does the 2026-27 Premier League season start?",
    a: "Matchweek 1 opens on Friday, August 21, 2026, with Coventry City at Arsenal, and runs through Monday, August 24. That is about a week later than a typical season because the 2026 World Cup ran into late July. The season's final matchweek is Sunday, May 30, 2027.",
  },
  {
    q: "Can I check Premier League scores without spoilers?",
    a: "Yes. Every Premier League match card on HideScore starts with the score hidden. Fixtures, kickoff times, and which matches are finished are all visible; the scoreline only appears when you tap it, so you can line up a replay or the highlights first.",
  },
  {
    q: "How do I watch Premier League highlights without knowing the result?",
    a: "The problem with searching for highlights is the thumbnail and the video title, which usually carry the scoreline. HideScore filters out clips whose titles give the result away and masks the title on the ones it keeps, so you can open a match's highlights straight from its card without reading the score on the way in.",
  },
  {
    q: "Does HideScore cover the title race and relegation?",
    a: "Yes, and it covers them the same careful way. A spoiler-free rating tells you a finished match was tight or dramatic without naming the winner, and league position is treated as a spoiler in its own right — a table tells you who won last weekend just as plainly as a scoreline does.",
  },
  {
    q: "Where can I watch Premier League matches in the US?",
    a: "NBC holds the United States rights, so matches and full replays are on Peacock, USA Network, and NBC. HideScore's watch link points you at the broadcaster rather than at a gamecast or results page that would spoil the match as it loads.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free to use on the web and in the iPhone app, and works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "premier league without spoilers",
    "premier league scores without spoilers",
    "spoiler free premier league",
    "premier league highlights without spoilers",
    "epl without spoilers",
    "when does the premier league season start",
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
    // unfurl for a Premier League page, and stale now the 2026 World Cup is over
    // (ended Jul 19). og-image.png is the generic HideScore card and carries an
    // EPL badge, matching the other single-league pages (NBA/NHL/MLB/NFL).
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function PremierLeagueWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Premier League without spoilers"
      intro={[
        "The Premier League is the hardest league in the world to watch late. Saturday's 12:30 kickoff lands at 7:30 in the morning on the US East Coast, the 3pm block is a wall of simultaneous matches, and by the time most people sit down with the replay the result has already arrived by push alert, group chat, or a scrolling ticker on some other channel.",
        "HideScore is a place to start that will not do that to you. Match cards stay hidden, ratings tell you whether a match is worth your evening without telling you who won, and the score appears only when you tap it.",
        "The 2026-27 season kicks off on Friday, August 21, 2026 — later than usual, because the World Cup ran into late July.",
      ]}
      sections={[
        {
          h: "Every matchweek, hidden by default",
          p: "All ten matches of a Premier League matchweek show up as cards with the scoreline covered. You still see the fixture, the kickoff time, and whether a match has finished — everything you need to plan what to watch, and nothing that tells you how it ended.",
        },
        {
          h: "Highlights you can open without reading the score",
          p: "Searching for highlights is where most people get spoiled: the video title carries the scoreline and the thumbnail carries the celebration. HideScore drops clips whose titles give the result away and masks the title on the ones it keeps, so the match's highlights are one tap from its card.",
        },
        {
          h: "The table is a spoiler too",
          p: "League position gives away last weekend as reliably as a scoreline does, so standings are treated with the same care as scores. A spoiler-free rating still tells you a match was tight, high-scoring, or dramatic — it just never names the winner.",
        },
        {
          h: "A route to the match, not to a scoreboard",
          p: "NBC holds the US rights, so the watch link sends you toward Peacock, USA Network, or NBC rather than dropping you on a results page that spoils the match the moment it loads.",
        },
      ]}
      bullets={[
        "Premier League scores hidden until you tap.",
        "All 38 matchweeks, from the August 21 opener to the final day.",
        "Spoiler-free ratings for finished matches.",
        "Highlights with the scoreline filtered out of titles.",
        "Watch links that point at a broadcaster, not a scoreboard.",
      ]}
      ctaLabel="Open the Premier League without spoilers"
      links={[
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        // Added 2026-09-20 — the three new soccer competition routes. This page
        // is the best-converting one on the site, so it is also the most
        // valuable place to pass authority to its new siblings from.
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/la-liga-without-spoilers", label: "La Liga" },
        { href: "/mls-highlights-without-spoilers", label: "MLS" },
        { href: "/liga-mx-scores-without-spoilers", label: "Liga MX" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Premier League without spoilers", "spoiler-free Premier League", "Premier League highlights without spoilers"]}
    />
  );
}
