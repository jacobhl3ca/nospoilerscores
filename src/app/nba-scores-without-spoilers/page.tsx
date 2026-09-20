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
//
// Refreshed 2026-09-20 alongside the new /nba-highlights-without-spoilers
// route. Two changes: the opening-night carriers are now stated (re-verified
// against basketball/nba/scoreboard dates=20261020/21/22 — all three October 20
// games carry NBC in the broadcasts array, and ESPN has Minnesota at Miami and
// Golden State at the Lakers on the 21st plus both October 22 games), and this
// page now links to its highlights sibling. Keep the two pages on separate
// ground: THIS one is the board itself, the highlights page is the recap
// pipeline. No paragraph may be shared between them — the highlights section
// that used to sit here was removed on 2026-09-20 for that reason, along with
// the "nba highlights without spoilers" keyword, which now belongs to the
// sibling route and was competing with it from here.
//
// Two facts corrected 2026-09-20 against the same feed: October 21 carries
// ELEVEN games, not twelve, and Boston at Detroit is the afternoon game on
// opening night, not a 7:00 pm one — only Philadelphia at New York tips at
// 7:00.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — there is no tap-to-reveal score and no
// standings view. Nothing outside GolfLeaderboard reads Team.score: the score
// is parsed only to compute the rating and is never rendered. Do not write
// "hidden until you tap" or "standings stay covered" on this page again.
const FAQ = [
  {
    q: "When does the 2026-27 NBA season start?",
    a: "Opening night is Tuesday, October 20, 2026, and NBC carries all three games: Boston at Detroit in the afternoon, Philadelphia at New York at 7:00 pm ET, then Oklahoma City at San Antonio at 9:30 pm ET. The full league is in action by Wednesday, October 21, with eleven games including Golden State at the Lakers at 10:00 pm ET on ESPN.",
  },
  {
    q: "Can I check NBA scores without seeing who won?",
    a: "Yes. An NBA card on HideScore carries the matchup, the tip time, the broadcaster and whether the game has finished. It does not carry a scoreline, and there is no button anywhere that produces one — the result is not covered up, it is never written down. So you can plan an evening of replays without a single final leaking.",
  },
  {
    q: "How do I avoid NBA spoilers on a West Coast game?",
    a: "A 10:00 pm ET tip finishes after midnight on the East Coast, which means most people watch it the next morning — the longest gap of the night between the final buzzer and when you actually see it. That is the window where a push alert, a group chat, or a thumbnail reaches you first, and it is exactly what a covered board is for.",
  },
  {
    q: "Which NBA games were actually worth watching?",
    a: "A spoiler-free rating on each finished game tells you it was close, high-scoring, or decided in the last minute — without naming the winner or the score. On an eleven-game Wednesday that is the difference between watching the one that went to overtime and watching a twenty-point blowout.",
  },
  {
    q: "Are NBA standings a spoiler?",
    a: "Yes, and that is why HideScore has no standings view at all. A conference table gives away last night as reliably as a box score does — if a team jumped two spots, you know how their game ended. The one place a league position appears is on a game that has not been played yet, and it comes off the card the moment that game is final.",
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
    a: "Open HideScore instead of a news app. No game on the board carries a score, and the optional excitement rating tells you which ones to watch.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nba scores without spoilers",
    "spoiler free nba scores",
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
        "Yes, you can follow NBA scores without spoilers: HideScore shows every game without printing the result at all, and can rate it for excitement, so you pick a game before you learn who won.",
        "The NBA plays almost every night for six months, and on a normal Wednesday eleven games finish inside four hours of each other. If you are not watching live, the results arrive anyway — a push alert, a fantasy app, a highlight thumbnail, someone's reaction in a group chat. By the time you sit down with the game you wanted, you usually already know how it ended.",
        "HideScore is a scoreboard built the other way around. No score is printed on any card, so you can scan the whole night — who played, what has finished, what is still on — without learning a single result. Switch Ratings on in Settings and a spoiler-free mark tells you which games were close or dramatic; it never tells you who won.",
        "The 2026-27 season opens on Tuesday, October 20, 2026 with a tripleheader, and the league is fully in action the following night.",
      ]}
      sections={[
        {
          h: "A full night of basketball, none of it scored",
          p: "An eleven-game Wednesday is eleven chances to get spoiled before you have watched one of them. HideScore shows the entire slate as plain cards — matchups, tip times, broadcasters, and which games have gone final are all visible, and not one score is. Nothing on the page will produce one, so there is no slip to make.",
        },
        {
          h: "West Coast games, where the gap is widest",
          p: "A 10:00 pm ET tip on the West Coast ends after midnight in the East. Almost nobody watches those live, which makes them the most reliably spoiled games on the schedule — a result that has had eight hours to reach you before you press play. This is the case the covered board was built for.",
        },
        {
          h: "Ratings that tell you which game to watch, not who won",
          p: "The hard part about catching up is choosing. Turn Ratings on in Settings and a spoiler-free mark picks out the games that were tight, high-scoring, or decided in the final minute, so you can skip the blowouts and spend the evening on the one that was worth it — while still not knowing the result when it starts. You have to enable that first: no game is marked until you do, and on the default setting none is marked before noon Eastern.",
        },
        {
          h: "No standings table, on purpose",
          p: "A conference table tells you how last night went as plainly as a box score does. If a team moved two spots, the result is out. So there is no table here to read — the only league position the app will show you sits on a fixture that has not been played, and it comes off the card as soon as that game goes final.",
        },
        {
          h: "Checking a result and picking a replay are two jobs",
          p: "This page is the board: the whole night at a glance, nothing scored. Choosing what to actually watch from the recaps afterward is a different problem with a different answer, and it has its own page — NBA highlights without spoilers, linked below.",
        },
        {
          h: "Through the playoffs and the Finals",
          p: "Playoff basketball is the hardest thing on the calendar to watch late. Games run past midnight, and in a seven-game series every result spoils the stakes of the next one. The same covered board carries through the postseason and the Finals.",
        },
      ]}
      bullets={[
        "No NBA score printed anywhere on the board.",
        "The whole night's slate on one page with no finals showing.",
        "Optional spoiler-free ratings — close, high-scoring, decided late.",
        "No standings table, because a table is last night's result restated.",
        "Opening night and every date through the Finals.",
        "Watch links that point at a broadcaster, not a box score.",
      ]}
      ctaLabel="Open the NBA without spoilers"
      ctaHref="/yesterday"
      links={[
        // Added 2026-09-20. The highlights sibling is the most important link
        // on this page: the two routes split one league's demand between
        // checking a result and picking something to watch, and each needs the
        // other's inbound link to be crawled early.
        { href: "/nba-highlights-without-spoilers", label: "NBA highlights" },
        { href: "/nhl-scores-without-spoilers", label: "NHL scores" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/redzone-for-every-sport", label: "Is there a RedZone for the NBA?" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NBA scores without spoilers", "spoiler-free NBA", "NBA standings without spoilers"]}
    />
  );
}
