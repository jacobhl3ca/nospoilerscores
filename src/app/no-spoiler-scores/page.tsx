import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// The cross-league hub. Every per-league route answers one sport; this one
// answers the generic and brand-adjacent demand — "hide score", "hidden scores",
// "score hidden", "spoiler free scores", "best game recap app without spoilers"
// — and routes to the league pages from there.
//
// Rebuilt 2026-09-03. Fastest-growing page on the site: 3 -> 17 clicks and
// 164 -> 360 impressions over the 28 days to Aug 31 (+467% / +120%), with 13 of
// those clicks in the week of Aug 24 alone. It was also the thinnest page
// carrying that much traffic at 317 words, converting 4.7% from position 6.2
// while /premier-league-without-spoilers converted 24.2% from 6.2 on 734 words.
// Same rank, six times the click-through, and the only material difference was
// substance — so this is the page where depth was worth the most.
//
// ⚠️ Corrected 2026-09-20. This page described a tap-to-reveal score and a
// covered standings table. Neither exists. Nothing outside GolfLeaderboard
// reads Team.score — the score is parsed only to compute the excitement rating
// and is never rendered — and there is no standings view at all. Ratings are
// opt-in as well (showRatings: false in preferences.ts, and the default "auto"
// mode holds them off before noon ET). News HEADLINES do blur and un-blur on a
// tap; scores never did. Do not put "hidden until you tap" back on a score.
const TITLE = "No Spoiler Scores: NFL, NBA, MLB, NHL & Soccer | HideScore";
const DESC =
  "Check every game on a board that prints no score at all. Excitement ratings tell you what is worth watching. NFL, NBA, MLB, NHL, soccer. Free, no account.";
const CANONICAL = "/no-spoiler-scores";

const FAQ = [
  {
    q: "What is a no-spoiler scoreboard?",
    a: "A scoreboard that shows you everything except the result. On HideScore you see the matchup, the league, the start time, the broadcaster and whether a game has finished. The score is not written on the card, and no button on the page will write it — so the difference between knowing a game happened and knowing how it ended is built in, not left to your self-control.",
  },
  {
    q: "How do I check scores without seeing who won?",
    a: "Open HideScore instead of a normal sports app. Every game arrives without a scoreline, so you can scan a full night across several leagues without a single final showing. When you do want the result, you go to the broadcaster or the recap from that game's card — the app itself never states it.",
  },
  {
    q: "Which sports and leagues are covered?",
    a: "The NBA, NFL, NHL, MLB, MLS, the Premier League, La Liga, Serie A, the Bundesliga, Ligue 1, Liga MX, the Champions League, the World Cup, cricket, tennis, golf, and more. Each league also has its own page with the detail for that sport.",
  },
  {
    q: "How do I know which games are worth watching if I cannot see the score?",
    a: "Switch Ratings on in Settings and every finished game carries a spoiler-free mark: close, high-scoring, or decided in the final minutes, with no mention of the winner or the score. That is enough to pick the one game worth your evening out of a full slate, and you still will not know how it ends when you press play. The marks are off until you ask for them, and the default setting keeps them off through the morning.",
  },
  {
    q: "Are standings and league tables spoilers?",
    a: "Yes, which is why HideScore ships no standings view at all. A table tells you how last night went as reliably as a box score does — if a team moved up two places, the result is out. The one league position the app will show sits on a fixture nobody has played yet, and it leaves the card once that game is final.",
  },
  {
    q: "Can I watch highlights without the score in the title?",
    a: "Yes. Searching for highlights is where most people actually get spoiled, because the video title carries the final and the thumbnail carries the celebration. HideScore filters out clips whose titles give the result away and masks the title on the ones it keeps, so highlights open from a game card rather than a search box.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. HideScore works in any mobile browser and as an iPhone or Android app. About 60% of the people using it are on a phone, which is usually where the spoilers arrive in the first place.",
  },
  {
    q: "Is HideScore free, and does it track me?",
    a: "It is free, it works without an account, and it uses no tracking cookies. Signing in is optional and only syncs your league columns and preferences across devices.",
  },
  {
    q: "What apps let me browse fixtures and standings without showing live scores by default?",
    a: "HideScore does. On web, iOS and Android the fixture list is complete and no score appears on it, so there is nothing to switch off first.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "no spoiler scores",
    "sports scores without spoilers",
    "spoiler free scores",
    "hide score",
    "hidden scores",
    "score hidden",
    "check scores without seeing who won",
    "best app to check scores without spoilers",
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

export default function NoSpoilerScoresPage() {
  return (
    <SeoLandingPage
      h1="No spoiler scores for sports fans"
      subject="No-spoiler scores"
      intro={[
        "No spoiler scores means a scoreboard that never prints the result at all: HideScore does this for NFL, NBA, MLB, NHL and soccer, with an optional excitement rating so you know which games to watch.",
        "Every normal scoreboard is built to tell you the result as fast as it can. That is the right design if you are following live and the wrong one for everybody else — anyone watching on delay, anyone in the wrong time zone, anyone who wants to pick a replay worth an evening without being told how it ends first.",
        "HideScore inverts it. No score is rendered for any league it carries, so you can scan matchups, start times, and what has finished without learning a single result. There is no slip available to you, because there is no control that would produce one.",
        "An optional rating does the rest: turn it on and a finished game is marked close, high-scoring, or decided late, so you can choose what to watch without the choice giving the ending away.",
      ]}
      sections={[
        {
          h: "A scoreboard for watching on delay",
          p: "Use it when you missed a game live, when you are avoiding notifications, or when you are deciding what to put on tonight. Everything you need to choose is visible — who played, what league, what time, whether it has ended. The one thing missing is the one thing that would ruin it.",
        },
        {
          h: "Every league on one board",
          p: "The NBA, NFL, NHL, MLB, MLS, the Premier League, La Liga, Serie A, the Bundesliga, Ligue 1, Liga MX, the Champions League, the World Cup, cricket, tennis and golf all sit on the same unscored board. A night where three leagues overlap is exactly when a normal app spoils two of them while you watch the third.",
        },
        {
          h: "Ratings instead of scores",
          p: "The obvious problem with leaving results out is choosing what to watch. An optional rating solves it: close, high-scoring, decided in the last minute, went to overtime — enough to pick the right game and never enough to know who won it. Skip three blowouts, find the one that was worth it. You enable the marks in Settings, and the default setting withholds them until noon Eastern.",
        },
        {
          h: "No standings table either",
          p: "A league table is a scoreboard wearing a different hat. If a team climbed two places since yesterday, you have just been told how their game went. So the app carries no table to read — the only position it will show you rides on a fixture that has not happened, and it comes off the card the moment it has.",
        },
        {
          h: "Highlights that do not spoil themselves",
          p: "Most people get spoiled in the search box rather than in the game: the video title carries the scoreline, the thumbnail carries the celebration. HideScore filters clips whose titles give the result away and masks the title on the ones it keeps, so highlights open from an unscored card instead.",
        },
        {
          h: "Free, no account, no tracking",
          p: "It works in any browser and as an iPhone or Android app, with no account and no tracking cookies. Signing in is optional and only syncs your league columns and preferences between devices.",
        },
      ]}
      bullets={[
        "No score printed on any card, in any league.",
        "NBA, NFL, NHL, MLB, soccer, cricket, tennis, golf and the World Cup on one board.",
        "Optional spoiler-free ratings so you can choose without knowing the result.",
        "No standings or league table, because a table restates the result.",
        "Highlights with the scoreline filtered out of video titles.",
        "Free, no account required, no tracking cookies.",
      ]}
      ctaLabel="Open the spoiler-free scoreboard"
      links={[
        { href: "/nfl-highlights-without-spoilers", label: "NFL" },
        { href: "/nba-scores-without-spoilers", label: "NBA" },
        { href: "/nhl-scores-without-spoilers", label: "NHL scores" },
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer" },
        // Added 2026-09-20. F1 and UFC are the two routes in the new batch with
        // no other natural hub — neither is a highlights page and neither is
        // soccer — so this is their strongest inbound link.
        { href: "/f1-without-spoilers", label: "F1" },
        { href: "/ufc-results-without-spoilers", label: "UFC" },
        { href: "/college-football-highlights-without-spoilers", label: "College football" },
        { href: "/best-spoiler-free-sports-sites", label: "Compare the apps" },
        { href: "/faq", label: "FAQ" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["no spoiler scores", "sports scores without spoilers", "spoiler-free scoreboard"]}
    />
  );
}
