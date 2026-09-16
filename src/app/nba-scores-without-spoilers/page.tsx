import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "NBA Scores Without Spoilers: Find the Best Games | HideScore";
const DESC =
  "Follow NBA scores without seeing the result. Every game is rated for excitement first, so you know which ones to watch. Free, no account.";
const CANONICAL = "/nba-scores-without-spoilers";

// Rebuilt 2026-09-03. This page was the worst performer on the site with real
// demand: 288 words, 52 impressions and ZERO clicks at position 9.8 over the 28
// days to Aug 31. /premier-league-without-spoilers converts 24.2% from position
// 6.2 on 734 words, so the gap is substance, not ranking. Dates, tip times and
// networks below are verified against ESPN's basketball/nba scoreboard feed on
// 2026-09-03: the 2026-27 regular season opens Tuesday Oct 20 2026 with a
// tripleheader, and the national rights are split across NBC, ESPN/ABC, Prime
// Video and NBA TV.
const FAQ = [
  {
    q: "When does the 2026-27 NBA season start?",
    a: "Opening night is Tuesday, October 20, 2026. It is a tripleheader: Boston at Detroit and Philadelphia at New York earlier in the evening, then Oklahoma City at San Antonio at 9:30 pm ET. The full league is in action by Wednesday, October 21, with twelve games including Golden State at the Lakers.",
  },
  {
    q: "Can I check NBA scores without seeing who won?",
    a: "Yes. Every NBA game on HideScore opens with the score covered. You still see the matchup, the tip time, and whether the game has finished — the scoreline appears only when you tap it, so you can plan an evening of replays without a single final leaking.",
  },
  {
    q: "How do I avoid NBA spoilers on a West Coast game?",
    a: "A 10:00 pm ET tip finishes after midnight on the East Coast, which means most people watch it the next morning — the longest gap of the night between the final buzzer and when you actually see it. That is the window where a push alert, a group chat, or a thumbnail reaches you first, and it is exactly what a covered board is for.",
  },
  {
    q: "Which NBA games were actually worth watching?",
    a: "A spoiler-free rating on each finished game tells you it was close, high-scoring, or decided in the last minute — without naming the winner or the score. On a twelve-game Wednesday that is the difference between watching the one that went to overtime and watching a twenty-point blowout.",
  },
  {
    q: "Are NBA standings a spoiler?",
    a: "Yes, and they are treated that way. A conference table gives away last night as reliably as a box score does — if a team jumped two spots, you know how their game ended. Standings stay covered alongside scores.",
  },
  {
    q: "Where can I watch NBA games in the US in 2026-27?",
    a: "National games are split across NBC and NBCSN, ESPN and ABC, Prime Video, and NBA TV, with local broadcasts carrying the rest. HideScore's watch link points you toward the broadcaster rather than dropping you on a gamecast or a results page that spoils the game as it loads.",
  },
  {
    q: "Does this work for the playoffs and the Finals?",
    a: "Yes, and that is when it matters most. Playoff games run late, a seven-game series turns every result into a spoiler for the next one, and the Finals are the single most spoiled basketball games of the year. The board stays covered throughout.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
  {
    q: "How do I follow NBA scores on my phone without spoilers from headlines?",
    a: "Open HideScore instead of a news app. Every game is hidden until you tap, and the excitement rating tells you which ones to watch.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nba scores without spoilers",
    "spoiler free nba scores",
    "nba highlights without spoilers",
    "nba no spoilers",
    "spoiler free nba",
    "check nba scores without seeing who won",
    "when does the 2026-27 nba season start",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx — Next
    // merges metadata per top-level field, not deeply, so a page-level
    // openGraph replaces the parent's wholesale and must restate it.
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
        "Yes, you can follow NBA scores without spoilers: HideScore shows every game with the result hidden and rates it for excitement, so you pick a game before you learn who won.",
        "The NBA plays almost every night for six months, and on a normal Wednesday twelve games finish inside four hours of each other. If you are not watching live, the results arrive anyway — a push alert, a fantasy app, a highlight thumbnail, someone's reaction in a group chat. By the time you sit down with the game you wanted, you usually already know how it ended.",
        "HideScore is a scoreboard built the other way around. Every game opens with the score covered, so you can scan the whole night — who played, what has finished, what is still on — without learning a single result. A spoiler-free rating tells you which games were close or dramatic; it never tells you who won.",
        "The 2026-27 season opens on Tuesday, October 20, 2026 with a tripleheader, and the league is fully in action the following night.",
      ]}
      sections={[
        {
          h: "A full night of basketball, all of it covered",
          p: "A twelve-game Wednesday is twelve chances to get spoiled before you have watched one of them. HideScore shows the entire slate as covered cards — matchups, tip times, and which games have gone final are all visible, and not one score is. You choose what to reveal, and when.",
        },
        {
          h: "West Coast games, where the gap is widest",
          p: "A 10:00 pm ET tip on the West Coast ends after midnight in the East. Almost nobody watches those live, which makes them the most reliably spoiled games on the schedule — a result that has had eight hours to reach you before you press play. This is the case the covered board was built for.",
        },
        {
          h: "Ratings that tell you which game to watch, not who won",
          p: "The hard part about catching up is choosing. A spoiler-free rating marks the games that were tight, high-scoring, or decided in the final minute, so you can skip the blowouts and spend the evening on the one that was worth it — while still not knowing the result when it starts.",
        },
        {
          h: "The standings are a spoiler too",
          p: "A conference table tells you how last night went as plainly as a box score does. If a team moved two spots, the result is out. Standings are treated with the same care as scores, so checking where your team sits does not cost you the game you were saving.",
        },
        {
          h: "Highlights you can open without reading the score",
          p: "Searching for NBA highlights is where most people actually get spoiled: the video title carries the final and the thumbnail carries the celebration. HideScore drops clips whose titles give the result away and masks the title on the ones it keeps, so a game's highlights are one tap from its card instead of one search away from the ending.",
        },
        {
          h: "Through the playoffs and the Finals",
          p: "Playoff basketball is the hardest thing on the calendar to watch late. Games run past midnight, and in a seven-game series every result spoils the stakes of the next one. The same covered board carries through the postseason and the Finals.",
        },
      ]}
      bullets={[
        "NBA scores hidden until you tap.",
        "The whole night's slate on one board with no finals showing.",
        "Spoiler-free ratings — close, high-scoring, decided late.",
        "Standings treated as a spoiler, not as neutral information.",
        "Highlights with the scoreline filtered out of video titles.",
        "Watch links that point at a broadcaster, not a box score.",
      ]}
      ctaLabel="Open the NBA without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/nhl-scores-without-spoilers", label: "NHL scores" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NBA scores without spoilers", "spoiler-free NBA", "NBA highlights without spoilers"]}
    />
  );
}
