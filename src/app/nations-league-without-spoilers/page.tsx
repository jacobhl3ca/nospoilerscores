import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-26 with the Nations League column (Jacob 9/26: "the different
// countries playing soccer"). The 2026-27 league phase was already running the
// day it shipped, so this page leads with the dates still to come.
//
// Fixtures, kickoff times and the US broadcaster below are verified against
// ESPN's soccer/uefa.nations/scoreboard feed on 2026-09-26, one date at a time
// (the feed rejects ranges). League phase: games every day Sep 24-29 and
// Oct 1-6, then Nov 12-17, 2026 — eight or ten a day. Kickoffs are 2:45 pm ET
// for most games, with earlier ones at 12:00 pm, 9:00 am on some weekend
// days, and 10:00 am for Kazakhstan's home games (Oct 2, Oct 6, Nov 16).
// Groups: League A-C four groups of four, League D two groups of three. ESPN names FS1 or FS2 on one to three games a day in the
// September/October window (Spain at England Sep 26 on FS2, Croatia at Spain
// Sep 29 on FS1, Czechia at Spain Oct 3 on FS2); the November slate has no
// broadcaster listed yet. Groups are named League A-D + group number ("Group
// A2"). ESPN lists no 2027 knockout fixture yet, so this page gives months,
// not dates, for the quarterfinals (March 2027) and Finals (June 2027); the
// 2024-25 edition ran them Mar 20-23 and Jun 4-8, 2025.
//
// Highlights are DARK (NO_HIGHLIGHT_FALLBACK in lib/youtube.ts): 10 fixtures
// probed, the best uploader found 3/10 and two others served the wrong match.
// No "#N" chip: nations is not in RANK_LEAGUES.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — do not write "the score appears when you tap
// it" on this or any page. It does not. No component outside GolfLeaderboard
// reads Team.score: the score is parsed only to compute the rating and is never
// rendered, so there is no covered score and nothing to reveal. There is no
// league table view either. And ratings are OPT-IN — `showRatings: false` in
// preferences.ts, and the default "auto" mode forces them off before noon ET
// (HomeContent.tsx), so a morning reader sees none until they turn them on.
const TITLE = "Nations League Without Spoilers | HideScore";
const DESC =
  "Follow the UEFA Nations League without seeing results: national-team games every day of each window, times in Eastern, rated for how good they were. Free.";
const CANONICAL = "/nations-league-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the Nations League without spoilers?",
    a: "Yes. Add the Nations League as a column and each game shows the two national teams, the kick-off time in Eastern, the broadcaster when there is one, and whether it has finished — never the scoreline. The column is opt-in, so it only appears once you pick it from a column's league switcher or in Settings.",
  },
  {
    q: "What is the UEFA Nations League?",
    a: "UEFA's competition for its national teams, played in the international breaks instead of friendlies. Teams are split into Leagues A to D by strength, and each league into groups of three or four. Group results decide promotion and relegation between the leagues, and the top of League A goes on to the quarterfinals and the Finals.",
  },
  {
    q: "When are the 2026-27 Nations League games?",
    a: "The league phase has games every day from September 24 to 29 and October 1 to 6, 2026, then from November 12 to 17. The quarterfinals and the promotion and relegation play-offs follow in March 2027, and the four-team Finals in June 2027.",
  },
  {
    q: "What time are Nations League games in the US?",
    a: "Most start at 2:45 pm Eastern. Most days also have a few earlier games at 12:00 pm, and some start as early as 9:00 or 10:00 am ET. A single day can hold ten games, so the whole slate is usually over by about 4:45 pm ET.",
  },
  {
    q: "Why is the Nations League easy to be spoiled on?",
    a: "Because it runs every day for a week at a time, and the players are the ones you follow for their clubs. A Nations League result shows up in your club's injury news, in the talk before the next league weekend and in every group table — and with promotion and relegation at stake, one result changes several tables at once.",
  },
  {
    q: "Does HideScore have Nations League highlights?",
    a: "Not yet, on purpose. A highlight button only goes on a card after the uploader finds the right match in at least four of five tries with no wrong ones. For the Nations League the best channel found three of ten, and two others served a different match — a women's game and an old meeting of the same two nations — so these cards show no video button.",
  },
  {
    q: "Where can I watch the Nations League in the US?",
    a: "FOX has the US rights. ESPN's feed names FS1 or FS2 on one to three games a day in the September and October window, such as Spain at England on September 26. A card shows the channel when the feed names one, and its watch link opens FOX Sports' Nations League page.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone and Android apps, and it works without an account. Signing in only syncs your columns and settings across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nations league without spoilers",
    "uefa nations league no spoilers",
    "spoiler free nations league",
    "nations league scores without spoilers",
    "nations league schedule 2026",
    "national team soccer without spoilers",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx. Next
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

export default function NationsLeagueWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Nations League without spoilers"
      intro={[
        "Yes, you can follow the UEFA Nations League without spoilers: HideScore never prints a scoreline, and it can rate the finished games so you know which national-team match is worth watching.",
        "The Nations League is Europe's national teams playing each other in the international breaks. In each window there are games every single day — eight or ten of them — and they finish in the middle of the American afternoon. That is a week of results arriving while you are at work.",
        "Add it as a column and each game shows the two nations, the kick-off time, the broadcaster when there is one, and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished game also carries a mark for how close or dramatic it was, without naming a winner.",
        "The 2026-27 league phase runs September 24-29 and October 1-6, then November 12-17, 2026.",
      ]}
      sections={[
        {
          h: "A game day, every day, for a week",
          p: "Club competitions give you one or two match nights a week. The Nations League gives you six days in a row, twice in this window: September 24 to 29 and October 1 to 6, then again from November 12 to 17. With eight to ten games a day, it is easy to lose track of which ones you have seen and which you are saving.",
        },
        {
          h: "Kick-offs from 9:00 am to 2:45 pm Eastern",
          p: "Most games start at 2:45 pm ET and finish before 5:00 pm. Most days also have earlier games at 12:00 pm, and some days start at 9:00 or 10:00 am ET — the 9:00 am starts fall on weekends. Every kick-off on the card is shown in Eastern, so you can plan the day without converting from European time.",
        },
        {
          h: "Groups, promotion and relegation",
          p: "Teams play in Leagues A to D, and each game's details name its group, such as Group A2. Every result moves a group table, and the tables decide promotion and relegation between the leagues and who reaches the spring quarterfinals. HideScore has no table view, because a table is a result in another form.",
        },
        {
          h: "Results that come through your club",
          p: "The players in these games are the ones you follow every weekend for their clubs. So a Nations League result arrives through club news — a fitness update, a manager's comment, a player's form story — before you ever looked for it. HideScore keeps the game itself covered, so you can check what is on and what has finished without learning how it ended.",
        },
        {
          h: "No highlight button yet — on purpose",
          p: "A highlight button only goes on a card after the uploader has found the right match in at least four of five tries with no wrong ones. For the Nations League the best channel found three of ten, and two others served a different match. Until a source passes that check, these cards show no video button.",
        },
        {
          h: "Watch on FOX",
          p: "FOX has the US rights. ESPN's feed names FS1 or FS2 on one to three games a day in the September and October window — Spain at England on September 26 is on FS2, Croatia at Spain on September 29 on FS1. The card shows that channel, and its watch link opens FOX Sports' Nations League page rather than a scores page.",
        },
      ]}
      bullets={[
        "No Nations League scoreline printed anywhere on the board.",
        "Every league-phase day: September 24-29, October 1-6 and November 12-17.",
        "Kick-off times in Eastern, from 9:00 am to 2:45 pm.",
        "Optional ratings for finished games that never name a winner.",
        "The group on each game's details, and no group tables.",
        "Watch links to FOX Sports, not to a scoreboard.",
      ]}
      ctaLabel="Open the Nations League without spoilers"
      ctaHref="/today"
      links={[
        { href: "/watch-world-cup-without-spoilers", label: "World Cup" },
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/europa-league-without-spoilers", label: "Europa League" },
        { href: "/conference-league-without-spoilers", label: "Conference League" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Nations League without spoilers", "spoiler-free UEFA Nations League", "national team soccer without spoilers"]}
    />
  );
}
