import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Deliberately does NOT say "Highlights": the highlights queries that reach hockey
// ("nhl highlights no spoilers", "spoiler free nhl highlights") have their own
// route at /nhl-highlights-without-spoilers, and two pages competing on one phrase
// splits the signal instead of doubling it. This page keeps the scores intent.
//
// Rebuilt 2026-09-03. It was 267 words converting 1.8% from position 13.9, against
// /premier-league-without-spoilers at 734 words and 24.2% from 6.2 — the gap is
// substance, not ranking. Opening-night dates, times and networks verified against
// ESPN's hockey/nhl scoreboard on 2026-09-03: the 2026-27 regular season opens
// Tuesday Sep 29 2026 with five games, and national coverage runs across
// TNT/truTV and ESPN/ESPN+/Hulu/Disney+.
const TITLE = "NHL Scores Without Spoilers | HideScore";
const DESC =
  "Check the NHL schedule and playoff picture without seeing who won. HideScore prints no hockey result anywhere, so you can pick a game worth watching first.";
const CANONICAL = "/nhl-scores-without-spoilers";

// ⚠️ Corrected 2026-09-20. This page claimed a tap-to-reveal scoreline and a
// covered standings table. Neither exists: nothing outside GolfLeaderboard
// reads Team.score, and the app ships no standings view. Ratings are opt-in
// (showRatings: false in preferences.ts; the default "auto" mode holds them off
// before noon ET).

const FAQ = [
  {
    q: "When does the 2026-27 NHL season start?",
    a: "Opening night is Tuesday, September 29, 2026, with five games: Florida at Carolina at 5:00 pm ET, Montreal at Toronto at 7:00, the Rangers at Boston at 8:00, Vancouver at Edmonton at 10:00, and Chicago at Vegas at 10:30. The schedule widens to eight games on Thursday, October 1.",
  },
  {
    q: "Can I check NHL scores without seeing the final?",
    a: "Yes. An NHL game on HideScore shows the matchup, the puck-drop time, the broadcaster and whether it has ended. No scoreline is written on the card, and no control on the page will write one, so you can look at the whole night without learning how any of it went.",
  },
  {
    q: "How do I avoid spoilers on a late West Coast game?",
    a: "Opening night alone has puck drops at 10:00 and 10:30 pm ET. Those games end around 1:00 am in the East, so almost nobody watches them live — which makes them the most reliably spoiled games on the schedule. A covered board is what lets you come to one the next morning without knowing the result.",
  },
  {
    q: "Which hockey games were actually worth watching?",
    a: "Switch Ratings on in Settings and each finished game is marked tight, high-scoring, or gone to overtime — never with the winner or the score. Hockey rewards this more than most sports: an overtime nail-biter and a one-sided rout look identical on an unscored card until the rating tells you which was which. Ratings start off, and the default setting holds them back until noon Eastern.",
  },
  {
    q: "Do the standings give the result away?",
    a: "Yes, which is why the app ships no standings view. In a league decided by two or three points over a season, a division table tells you exactly how last night ended. The only league position you will see rides on a game nobody has played yet, and it comes off the card once that game is final.",
  },
  {
    q: "Where can I watch NHL games in the US in 2026-27?",
    a: "National coverage runs mainly across TNT and truTV, and ESPN with its streaming side on ESPN+, Hulu, and Disney+, with regional networks carrying the rest. HideScore's watch link points you at the broadcaster rather than at a gamecast or a results page that spoils the game the moment it loads.",
  },
  {
    q: "Is this useful for the Stanley Cup playoffs?",
    a: "It is the best fit on the calendar. Playoff hockey runs late, overtime can add an hour with no warning, and in a seven-game series every result changes the stakes of the next one. Fans watching on delay or on a condensed replay are exactly who this is built for.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nhl scores without spoilers",
    "spoiler free nhl scores",
    "nhl without spoilers",
    "hockey scores without spoilers",
    "nhl no spoilers",
    "check nhl scores without seeing who won",
    "when does the 2026-27 nhl season start",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
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
        "Hockey has a scheduling problem that no other league quite matches: a normal night runs from a 5:00 pm Eastern puck drop to a 10:30 pm one out west, so the games finish across an eight-hour span. If you are following more than one team, something has always already ended by the time you sit down — and the result reaches you by push alert, ticker, or group chat long before the game does.",
        "HideScore is a scoreboard built the other way around. Every game opens with the score covered, so you can scan the whole night — who played, what has finished, what is still on — without learning a single result. A spoiler-free rating tells you which games were tight or went to overtime; it never tells you who won.",
        "The 2026-27 season opens on Tuesday, September 29, 2026 with five games, widening to eight on Thursday, October 1.",
      ]}
      sections={[
        {
          h: "A full night of hockey, all of it covered",
          p: "Matchups, puck-drop times, and which games have gone final are all visible on a HideScore board. The scores are not. That is enough to plan what to watch and nothing that tells you how any of it ended — including the games that finished while you were watching a different one.",
        },
        {
          h: "The 10:30 pm puck drop, where the gap is widest",
          p: "A late western game ends around 1:00 am Eastern. Almost nobody watches those live, which makes them the most reliably spoiled games on the schedule — a result that has had all night to reach you before you press play the next morning. This is the case the covered board exists for.",
        },
        {
          h: "Overtime is the whole point of not knowing",
          p: "Hockey punishes spoilers more than most sports, because so much of it is decided in the last two minutes or after them. A spoiler-free rating marks the games that were tight, high-scoring, or went to overtime, so you can find the one worth your evening — and still not know how it ends when it starts.",
        },
        {
          h: "The standings give it away too",
          p: "In a league where a season comes down to two or three points, a division table is a scoreboard by another name. If a team moved up a spot, last night's result is out. So there is no table here to open — the only league position the app shows sits on a game that has not been played, and it leaves the card as soon as it has.",
        },
        {
          h: "A route to the broadcaster, not to a box score",
          p: "National coverage runs across TNT and truTV, and ESPN with ESPN+, Hulu, and Disney+, with regional networks on the rest. The watch link sends you toward whoever is carrying the game rather than dropping you on a results page that spoils it as it loads.",
        },
        {
          h: "Through the Stanley Cup playoffs",
          p: "Postseason hockey is the hardest thing on the calendar to watch on delay: games run late, overtime can add an hour without warning, and every result in a seven-game series reframes the next one. The same covered board carries all the way through the Final.",
        },
      ]}
      bullets={[
        "No NHL score printed anywhere on the board.",
        "The whole night on one board, from the 5:00 pm start to the 10:30 pm one.",
        "Optional spoiler-free ratings — tight, high-scoring, went to overtime.",
        "No standings table, because a table restates last night's result.",
        "Watch links that point at a broadcaster, not a box score.",
        "Works the same through the Stanley Cup playoffs.",
      ]}
      ctaLabel="Open the NHL without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/nba-scores-without-spoilers", label: "NBA scores" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NHL scores without spoilers", "spoiler-free NHL", "hockey scores without spoilers"]}
    />
  );
}
