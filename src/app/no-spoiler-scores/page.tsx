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
const TITLE = "No Spoiler Scores: NFL, NBA, MLB, NHL & Soccer | HideScore";
const DESC =
  "Check every game with the score hidden until you tap. Excitement ratings tell you what is worth watching. NFL, NBA, MLB, NHL, soccer. Free, no account.";
const CANONICAL = "/no-spoiler-scores";

const FAQ = [
  {
    q: "What is a no-spoiler scoreboard?",
    a: "A scoreboard that shows you everything except the result. On HideScore you see the matchup, the league, the start time, and whether a game has finished — but the score stays covered until you tap it. It is the difference between knowing a game happened and knowing how it ended.",
  },
  {
    q: "How do I check scores without seeing who won?",
    a: "Open HideScore instead of a normal sports app. Every game arrives covered, so you can scan a full night across several leagues without a single final showing. When you want a result, you tap that one game and nothing else is revealed.",
  },
  {
    q: "Which sports and leagues are covered?",
    a: "The NBA, NFL, NHL, MLB, MLS, the Premier League, La Liga, Serie A, the Bundesliga, Ligue 1, Liga MX, the Champions League, the World Cup, cricket, tennis, golf, and more. Each league also has its own page with the detail for that sport.",
  },
  {
    q: "How do I know which games are worth watching if I cannot see the score?",
    a: "Every finished game carries a spoiler-free rating: it tells you the game was close, high-scoring, or decided in the final minutes, without naming the winner or the score. That is enough to pick the one game worth your evening out of a twelve-game night, and you still will not know how it ends when you press play.",
  },
  {
    q: "Are standings and league tables spoilers?",
    a: "Yes, and HideScore treats them that way. A table tells you how last night went as reliably as a box score does — if a team moved up two places, the result is out. Standings stay covered alongside scores.",
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
    a: "HideScore does. Scores are hidden by default on web, iOS and Android, and you reveal each game one tap at a time.",
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
      intro={[
        "No spoiler scores means a scoreboard that hides every result until you tap: HideScore does this for NFL, NBA, MLB, NHL and soccer, with an excitement rating so you know which games to watch.",
        "Every normal scoreboard is built to tell you the result as fast as it can. That is the right design if you are following live and the wrong one for everybody else — anyone watching on delay, anyone in the wrong time zone, anyone who wants to pick a replay worth an evening without being told how it ends first.",
        "HideScore inverts it. Scores are covered by default across every league it carries, so you can scan matchups, start times, and what has finished without learning a single result. When you want one, you tap that game — and only that game.",
        "A spoiler-free rating does the rest: it tells you a finished game was close, high-scoring, or decided late, so you can choose what to watch without the choice giving the ending away.",
      ]}
      sections={[
        {
          h: "A scoreboard for watching on delay",
          p: "Use it when you missed a game live, when you are avoiding notifications, or when you are deciding what to put on tonight. Everything you need to choose is visible — who played, what league, what time, whether it has ended. The one thing missing is the one thing that would ruin it.",
        },
        {
          h: "Every league on one board",
          p: "The NBA, NFL, NHL, MLB, MLS, the Premier League, La Liga, Serie A, the Bundesliga, Ligue 1, Liga MX, the Champions League, the World Cup, cricket, tennis and golf all sit on the same covered board. A night where three leagues overlap is exactly when a normal app spoils two of them while you watch the third.",
        },
        {
          h: "Ratings instead of scores",
          p: "The obvious problem with hiding results is choosing what to watch. A spoiler-free rating solves it: close, high-scoring, decided in the last minute, went to overtime — enough to pick the right game and never enough to know who won it. Skip three blowouts, find the one that was worth it.",
        },
        {
          h: "Standings are covered too",
          p: "A league table is a scoreboard wearing a different hat. If a team climbed two places since yesterday, you have just been told how their game went. Standings are treated with the same care as scores, so checking a title race does not cost you the match you were saving.",
        },
        {
          h: "Highlights that do not spoil themselves",
          p: "Most people get spoiled in the search box rather than in the game: the video title carries the scoreline, the thumbnail carries the celebration. HideScore filters clips whose titles give the result away and masks the title on the ones it keeps, so highlights open from a covered card instead.",
        },
        {
          h: "Free, no account, no tracking",
          p: "It works in any browser and as an iPhone or Android app, with no account and no tracking cookies. Signing in is optional and only syncs your league columns and preferences between devices.",
        },
      ]}
      bullets={[
        "Every score hidden until you tap it.",
        "NBA, NFL, NHL, MLB, soccer, cricket, tennis, golf and the World Cup on one board.",
        "Spoiler-free ratings so you can choose without knowing the result.",
        "Standings and tables treated as spoilers too.",
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
