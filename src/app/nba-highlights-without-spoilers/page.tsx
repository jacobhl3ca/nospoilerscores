import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. GSC had "nba highlights no spoilers" / "nba no spoilers"
// sitting around position 10 with the only NBA route on the site being
// /nba-scores-without-spoilers — a SCORES page. The two intents are different
// (check a result vs. pick a recap to watch), and the NHL pair already proves
// the split works. This page must NOT restate the scores page: that one is
// about the covered board and the standings, this one is about the recap
// pipeline (the league's own uploads, titles, thumbnails) and about choosing
// among eleven recaps at once.
//
// Every date, tip time and network below is verified against ESPN's
// basketball/nba/scoreboard feed on 2026-09-20 (dates=20261020, 20261021,
// 20261022): opening night is Tuesday Oct 20 2026, three games, all on NBC;
// Wednesday Oct 21 widens to ELEVEN (counted from the feed — the older copy on
// /nba-scores-without-spoilers said twelve and was wrong; eight clubs play only
// on the 20th and the 22nd, leaving 22 teams and therefore 11 games), with
// Golden State at the Lakers at 10:00 pm ET on ESPN; Thursday Oct 22 is an ESPN
// doubleheader.
//
// The feed puts Boston at Detroit at 3:00 pm ET on opening night. That reads
// like an ESPN placeholder rather than a real tip time, so no time is quoted
// for that game here — only the two the feed gives a plausible one for.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — never write "the score appears when you tap
// it". It does not. Nothing outside GolfLeaderboard reads Team.score; the score
// is parsed to compute the rating and is never rendered, so there is no covered
// score to reveal, and no series scoreline either. Ratings are OPT-IN:
// `showRatings: false` in preferences.ts, and the default "auto" mode forces
// them off before noon ET (HomeContent.tsx).
const TITLE = "NBA Highlights Without Spoilers: Recaps With No Score | HideScore";
const DESC =
  "Open NBA recaps and highlights without reading the final score in the title. Ratings pick the game worth replaying. Free, no account.";
const CANONICAL = "/nba-highlights-without-spoilers";

const FAQ = [
  {
    q: "How do I watch NBA highlights without spoilers?",
    a: "Start from a covered game card rather than from a search box. The league uploads its own recap within about an hour of the final buzzer, and the upload is labeled with the result — so the listing page spoils the game before the video begins. HideScore removes that step: the card shows you the matchup, you press the highlight button, and the recap opens with its title masked.",
  },
  {
    q: "When is NBA opening night 2026-27?",
    a: "Tuesday, October 20, 2026. NBC carries all three games: Boston at Detroit, Philadelphia at New York at 7:00 pm ET, and Oklahoma City at San Antonio at 9:30 pm ET. The following night, Wednesday October 21, jumps to eleven games, and Thursday October 22 is an ESPN doubleheader with Cleveland at Philadelphia and Denver at Oklahoma City.",
  },
  {
    q: "Eleven games finished last night. Which recap should I open?",
    a: "That is what the rating is for. Switch Ratings on in Settings and each finished game carries a mark for how competitive it was — tight, high-scoring, decided in the closing seconds — with no mention of who won or by how much. On a Wednesday like October 21 that turns eleven unlabeled recaps into a ranked shortlist, and you still learn nothing about any of them until you press play. Ratings are off until you ask for them, and by default they stay off through the morning.",
  },
  {
    q: "Why do NBA recap titles and thumbnails give the result away?",
    a: "Because the upload is built to be clicked from a feed, not saved for later. The title normally carries both team names and the final margin, the still frame is usually the closing celebration or a dejected bench, and the sidebar fills with clips from the same night. Reading any one of those costs you the game.",
  },
  {
    q: "What about top plays and mixtape compilations?",
    a: "Those leak more than a straight recap does. A compilation reorders the night by how loud a play was, so the clip order itself reveals which team finished strong, and the running clock in the corner tells you how much of the game was left. A per-game recap opened from a covered card keeps the sequence intact.",
  },
  {
    q: "How do I avoid spoilers on a West Coast game I want to watch tomorrow?",
    a: "A 10:00 pm ET tip on the coast — Golden State at the Lakers on October 21, say — finishes near 1:00 am in the east. Hardly anyone sees that live, so the recap becomes a morning job, and the result has had eight hours of push alerts and group chats to find you first. That overnight gap is the exact case this page exists for.",
  },
  {
    q: "Does this work for the play-in, the playoffs and the Finals?",
    a: "Yes. Postseason recaps are the riskiest of all, because a series score is itself a spoiler: the state of a series restates the two nights that produced it. Neither a game score nor a series score is printed anywhere on the board.",
  },
  {
    q: "Do I need an account to use it?",
    a: "No. Everything on the board works signed out, in a browser or in the iPhone and Android apps. Signing in with Apple or Google only carries your league columns and favorite teams between devices.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and it works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nba highlights no spoilers",
    "nba highlights without spoilers",
    "nba no spoilers",
    "spoiler free nba highlights",
    "nba recap without score",
    "watch nba highlights without knowing the score",
    "when is nba opening night 2026",
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

export default function NbaHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NBA highlights without spoilers"
      intro={[
        "Yes, you can watch NBA highlights without spoilers: open the recap from its card on HideScore instead of from a search results page, and the final never reaches you on the way in.",
        "The league is very good at publishing recaps and very bad at hiding them. An official cut of every game appears within about an hour of the buzzer, labeled with the two teams and the margin, and the still frame is whatever moment settled it. Anyone catching up the next morning has to walk past that label to reach the video underneath it.",
        "HideScore changes where the walk starts. Each game sits on the board with the matchup, the tip time and whether it has finished, and no score on it anywhere — not covered over, never printed. The highlight button on that card goes straight to the recap with its title masked, and clips whose titles announce the result are dropped before they are ever offered.",
        "The 2026-27 season begins Tuesday, October 20, 2026 with three games on NBC, and the schedule widens to eleven games the very next night.",
      ]}
      sections={[
        {
          h: "Choosing between eleven recaps at once",
          p: "Wednesday, October 21 puts eleven games on the calendar, which by breakfast is eleven recaps competing for one free evening. Without help you either open them at random or read enough of each listing to choose — and reading is what spoils you. An excitement mark on each finished game does the sorting instead, naming how close the game was and never who came out ahead. It is a setting you switch on, not something the board does to you.",
        },
        {
          h: "What the upload title actually costs you",
          p: "A recap title is written for a scrolling feed: both clubs, the margin, sometimes a player's point total. The thumbnail adds the reaction shot. Between them they hand over the ending, the manner of it, and often the star of it, in the half second before your cursor lands. Masking the title and skipping the search page removes all three at once.",
        },
        {
          h: "Compilations leak more than recaps do",
          p: "Top-ten reels and mixtapes feel safer because they are not tied to one game, but they are ordered by drama, and that order is a summary of the night. A late fourth-quarter sequence sitting at the top of the reel says who finished strongest before a single basket is shown. Sticking to the per-game cut keeps events in the order they happened.",
        },
        {
          h: "Late tips become tomorrow's homework",
          p: "Games that start at 10:00 or 10:30 pm ET end after midnight on the east coast. Golden State at the Lakers on October 21 is the obvious one. Those are the games most people save, and the ones with the longest head start on you: a result with eight unguarded hours to arrive by notification, by thumbnail or by somebody's reply in a group chat.",
        },
        {
          h: "Where the watch link goes",
          p: "National coverage in 2026-27 runs across NBC, ESPN and ABC, Prime Video and NBA TV, with regional networks on everything else. When you want the whole game rather than the recap, the link aims at whoever carried it — not at a gamecast or a results table that would settle the question the moment it renders.",
        },
        {
          h: "Play-in, playoffs and the Finals",
          p: "In a series the arithmetic is the spoiler. A scoreline of three games to two summarizes two nights you had not watched yet, so the postseason needs this more than the regular season does, not less. Series state is treated exactly like a score: it is not printed.",
        },
      ]}
      bullets={[
        "NBA recaps opened from a covered card, not from a search page.",
        "Clips filtered when the title announces the result; titles masked on the rest.",
        "Optional excitement ratings — tight, high-scoring, decided late — no winner named.",
        "The whole night's slate visible with no score written on any card.",
        "Built for late West Coast tips watched the next morning.",
        "Works the same through the play-in, the playoffs and the Finals.",
      ]}
      ctaLabel="Open NBA highlights without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/teams#nba", label: "NBA teams" },
        { href: "/nba-scores-without-spoilers", label: "NBA scores" },
        { href: "/nhl-highlights-without-spoilers", label: "NHL highlights" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/best-spoiler-free-sports-sites", label: "Compare the apps" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NBA highlights without spoilers", "spoiler-free NBA highlights", "NBA recaps without the score"]}
    />
  );
}
