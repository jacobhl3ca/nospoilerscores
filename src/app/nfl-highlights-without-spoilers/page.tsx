import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "NFL Highlights Without Spoilers: Find the Best Games | HideScore";
const DESC =
  "Watch NFL highlights without seeing the final score. Every game is rated for excitement first, so you pick the ones worth your time. Free, no account.";
const CANONICAL = "/nfl-highlights-without-spoilers";

// Answer-engine questions. Depth here is deliberate: this page ranked at
// position 8.9 on 373 impressions with a 2.1% CTR over the 90 days to
// 2026-08-31, while /premier-league-without-spoilers converted 24.2% from an
// effectively identical position (6.2) — the difference was specificity, not
// ranking. Every date, kickoff time, and network below is verified against
// ESPN's nfl/scoreboard feed for weeks 1-3 on 2026-09-02: the season opens
// Wednesday Sep 9 (NE at SEA, NBC), week 1 carries a Melbourne game on Netflix,
// and the Sunday slate is 8 games at 1:00 pm ET plus 4 at 4:25 pm ET.
const FAQ = [
  {
    q: "When does the 2026 NFL season start?",
    a: "The 2026 kickoff game is Wednesday, September 9, 2026 at 8:20 pm ET — New England at Seattle on NBC. That is a Wednesday rather than the usual Thursday. Week 1 then runs through Monday, September 14, when Denver plays at Kansas City at 8:15 pm ET on ESPN and ABC.",
  },
  {
    q: "Can I watch NFL highlights without spoilers?",
    a: "Yes. Every NFL game on HideScore starts with the score covered. You still see the matchup, the kickoff time, and whether the game has finished, so you can pick what to watch — the scoreline only appears when you tap it, and highlights open straight from the game's card without the result in the video title.",
  },
  {
    q: "How do I survive the Sunday 1:00 pm slate without getting spoiled?",
    a: "Week 1 puts eight games on at 1:00 pm ET and four more at 4:25 pm, so whichever one you are watching, eleven others are finishing around you. HideScore shows the whole slate as hidden cards, which means you can see what is still live and what has ended without any of the finals leaking while you decide what to put on next.",
  },
  {
    q: "Which NFL games are actually worth watching?",
    a: "A spoiler-free rating on each finished game tells you it was close, high-scoring, or decided late — without naming the winner or the score. That is the whole point: you can skip three blowouts and go straight to the one-score game, and still not know how it ended until you watch it.",
  },
  {
    q: "How do I watch the NFL Melbourne game without spoilers?",
    a: "San Francisco and the Los Angeles Rams play in Melbourne on Thursday, September 10 at 8:35 pm ET, streaming on Netflix. It kicks off Friday morning local time in Australia, so the two audiences are a full working day apart — the single easiest game of the season to have spoiled by a phone notification before you sit down with it.",
  },
  {
    q: "Where can I watch NFL games in the US in 2026?",
    a: "Week 1 splits across FOX and CBS for the Sunday afternoon windows (six games each), NBC for the Wednesday opener and Sunday Night Football, ESPN and ABC for Monday Night Football, and Netflix for the Melbourne game. HideScore's watch link points at the broadcaster rather than at a gamecast or box score that would spoil the result as the page loads.",
  },
  {
    q: "Does this work for Thursday, Sunday, and Monday night games?",
    a: "Yes, and prime-time games are where it matters most, because a game that ends near midnight ET is one most people watch the next morning. It works the same way through the playoffs and the Super Bowl, when the gap between kickoff and when you actually watch is widest.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and it works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
  {
    q: "Where can I see which NFL games were worth watching without the scores?",
    a: "On HideScore's board. Every finished game shows an excitement rating with the score hidden. Tap a game only when you want the result.",
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
    "how to watch nfl without spoilers",
    "when does the 2026 nfl season start",
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
        "Yes, you can watch NFL highlights without spoilers: HideScore shows every game with no score printed on it and an optional excitement rating, so you choose a game first and learn the result from the highlight itself.",
        "The NFL is built to spoil itself. Eight games kick off at once on a Sunday afternoon, RedZone cuts between all of them, fantasy apps buzz on every touchdown, and the moment a game ends its final score is a push alert, a group-chat message, and a thumbnail on every app you own. If you did not watch it live, the ending usually reaches you before the game does.",
        "HideScore is a starting point that will not do that. Every game card opens with the score covered, so you can see what has finished and what is still going without learning how any of it ended. A spoiler-free rating tells you whether a game was close or dramatic; it never tells you who won. When you pick one, the highlights open with the scoreline filtered out of the video title.",
        "The 2026 season kicks off on Wednesday, September 9 with New England at Seattle, and week 1 closes on Monday, September 14 with Denver at Kansas City.",
      ]}
      sections={[
        {
          h: "The Sunday slate, hidden by default",
          p: "Week 1 puts eight games on at 1:00 pm ET and four more at 4:25 pm. Whatever you are watching, eleven other games are ending around you, and every one of them is a spoiler waiting on your lock screen. HideScore shows the full slate as covered cards — matchups, kickoff times, and which games have gone final are all visible, and not one score is.",
        },
        {
          h: "Ratings that tell you which game to watch, not who won",
          p: "The hard part about catching up on a Sunday is choosing. A spoiler-free rating marks the games that were tight, high-scoring, or decided in the last drive, so you can skip the blowouts and spend your evening on the one that was worth it — while still not knowing the result when you press play.",
        },
        {
          h: "Highlights you can open without reading the score",
          p: "Searching for NFL highlights is where most people actually get spoiled: the video title carries the final score and the thumbnail carries the celebration. HideScore drops clips whose titles give the result away and masks the title on the ones it keeps, so a game's highlights are one tap from its card instead of one search away from the ending.",
        },
        {
          h: "Prime time, when the gap is widest",
          p: "A Sunday or Monday night game that ends near midnight ET is a game most people watch the next morning — the longest, most dangerous gap of the week between kickoff and when you sit down. The same is true of the Thursday night Melbourne game on September 10, which kicks off Friday morning in Australia and puts its two audiences a full working day apart.",
        },
        {
          h: "A route to the broadcaster, not to a box score",
          p: "Week 1 runs across FOX and CBS in the Sunday windows, NBC for the opener and Sunday Night Football, ESPN and ABC on Monday night, and Netflix for Melbourne. The watch link sends you toward the broadcaster rather than dropping you on a results page or a gamecast that spoils the game the instant it loads.",
        },
        {
          h: "Through the playoffs and the Super Bowl",
          p: "Everything above holds when it counts most. Wild card weekend stacks games the same way a September Sunday does, and a Super Bowl watched on delay is the single most spoiled event on the American calendar. The board stays covered until you decide otherwise.",
        },
      ]}
      bullets={[
        "No NFL score printed anywhere on the board.",
        "All 18 weeks, from the September 9 opener through the playoffs.",
        "Spoiler-free ratings for finished games — close, high-scoring, decided late.",
        "Highlights with the scoreline filtered out of video titles.",
        "The whole Sunday slate on one board without a single final showing.",
        "Watch links that point at a broadcaster, not a scoreboard.",
      ]}
      ctaLabel="Open the NFL without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/nba-scores-without-spoilers", label: "NBA" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/redzone-for-every-sport", label: "RedZone for every sport" },
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
