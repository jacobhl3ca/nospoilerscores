import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-08-15. This route exists because "spoiler free nhl highlights"
// was pulling 149 impressions/mo at position 6.9 with ZERO clicks, and the page
// Google was serving for it was the HOMEPAGE — whose title leads with scores and
// lists five leagues, so it answers the query only incidentally. MLB, NFL,
// soccer and cricket already had dedicated highlights routes; NHL, the query
// with the most demand of the lot, did not. /nhl-scores-without-spoilers is a
// SCORES page and stays separate: "scores" and "highlights" are different
// intents (check a result vs. pick something to watch).
//
// Deepened 2026-09-03. By then the query was at 367 impressions / 90d, still
// position 6.9, still zero clicks — and Google had never once crawled this page
// (coverage "Discovered - currently not indexed", lastCrawlTime never), because
// two of its four inbound links came from pages Google had not crawled either.
// Fixed by Request Indexing plus a homepage link, and the page brought up to the
// depth that makes /premier-league-without-spoilers convert at 24.2%. Season
// dates and networks verified against ESPN's hockey/nhl scoreboard 2026-09-03.
//
// Refreshed 2026-09-20, nine days before the season opens, because the page was
// still at 210 impressions and ZERO clicks. What it was missing was not depth
// but precision: it named the five opening-night games and no puck-drop times,
// which is exactly the specificity gap that separated the NFL page from the
// Premier League page. Times and carriers re-verified against ESPN's
// hockey/nhl/scoreboard on 2026-09-20, one date at a time — Sep 29: Florida at
// Carolina 5:00 pm ET (ESPN), Montreal at Toronto 7:00, the Rangers at Boston
// 8:00 pm (ESPN), Vancouver at Edmonton 10:00, Chicago at Vegas 10:30 pm
// (ESPN). Sep 30: Pittsburgh at Philadelphia and the Islanders at Toronto both
// 7:30 pm, Los Angeles at Colorado 10:00 pm, with TNT and truTV on the two
// national games. Oct 1 confirmed at eight games, 7:00 pm to 10:00 pm ET.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — there is no tap-to-reveal score. Nothing
// outside GolfLeaderboard reads Team.score: the score is parsed only to compute
// the rating and is never rendered, so there is no covered score and nothing to
// uncover. Ratings are OPT-IN too (showRatings: false in preferences.ts, and
// the default "auto" mode forces them off before noon ET). The "hidden until
// you tap" wording was removed from this page on 2026-09-20; do not put it
// back.
// Retitled 2026-09-26. Search Console, 28 days to Sep 24: "spoiler free nhl
// highlights" = 220 impressions, 0 clicks, position 4.5. That is a title
// problem, not a ranking one: the query's own words "spoiler free" were not in
// the old title ("NHL Highlights Without Spoilers: Find the Best Games"). Title
// and description now lead with them. The H1 did not change.
const TITLE = "Spoiler-Free NHL Highlights: No Score in the Title | HideScore";
const DESC =
  "Spoiler-free NHL highlights: no score printed, no winner named. An optional rating on each finished game tells you which recap to watch first. Free, no account.";
const CANONICAL = "/nhl-highlights-without-spoilers";

const FAQ = [
  {
    q: "How do I watch NHL highlights without spoilers?",
    a: "Open them from a covered game card instead of from a search box. Searching is where people actually get spoiled: the video title carries the final score and the thumbnail carries the celebration. HideScore drops clips whose titles give the result away and masks the title on the ones it keeps, so a game's highlights are one tap from its card.",
  },
  {
    q: "When does the 2026-27 NHL season start?",
    a: "Opening night is Tuesday, September 29, 2026, and it runs from late afternoon to nearly midnight: Florida at Carolina at 5:00 pm ET on ESPN, Montreal at Toronto at 7:00, the Rangers at Boston at 8:00 pm on ESPN, Vancouver at Edmonton at 10:00, and Chicago at Vegas at 10:30 pm on ESPN. The schedule widens to eight games on Thursday, October 1.",
  },
  {
    q: "How do I find the good hockey games without learning who won?",
    a: "Switch Ratings on in Settings and each finished game is marked tight, high-scoring, or gone to overtime — without naming the winner or the score. Hockey needs this more than most sports: on a covered board a 2-1 overtime classic and a 6-1 blowout look exactly the same until the rating separates them.",
  },
  {
    q: "Why do YouTube highlights spoil the game before I press play?",
    a: "Because the scoreline is usually in the title, and often in the thumbnail as well. Even a careful search result spoils the game in the preview text. Starting from a game card rather than a search means the first thing you see is the matchup, not the ending.",
  },
  {
    q: "Can I watch condensed games and recaps this way too?",
    a: "Yes. Condensed games and recaps are the format most people use to catch up on a night they missed, and they carry the same spoiler risk in their titles. They open the same way — from the covered card, with the result still hidden.",
  },
  {
    q: "Does this work for late West Coast games?",
    a: "That is where it helps most. A 10:30 pm ET puck drop finishes around 1:00 am in the East, so almost nobody watches it live — the result has all night to reach you before you get to the highlights the next morning.",
  },
  {
    q: "Does it work through the Stanley Cup playoffs?",
    a: "Yes, and the postseason is the hardest case on the calendar. Games run late, overtime can add an hour without warning, and in a seven-game series every result reframes the next one. The board stays covered all the way through the Final.",
  },
  // Added 2026-09-20 with the opening-night refresh. Both answer a dated
  // question a reader has in the week before the season starts, which is the
  // kind of entry that earns a click rather than an impression.
  {
    q: "Which 2026-27 opening-night games are on national TV?",
    a: "ESPN has three of the five on Tuesday, September 29: Florida at Carolina at 5:00 pm ET, the Rangers at Boston at 8:00, and Chicago at Vegas at 10:30. TNT and truTV pick it up the following night with Pittsburgh at Philadelphia at 7:30 pm ET and Los Angeles at Colorado at 10:00.",
  },
  {
    q: "Opening night ends at 1:00 am. When can I watch the highlights?",
    a: "As soon as they are posted, which is the point of starting from a covered card. A 10:30 pm ET puck drop in Vegas is a next-morning job for almost everyone in the east, and a board that shows the game as finished without showing how tells you there is something to watch before anything tells you what happened in it.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
  {
    q: "Where can I view upcoming NHL matchups without seeing scores from earlier games?",
    a: "On HideScore. The schedule and the finished games sit on one board, and no score is printed on either.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "nhl highlights without spoilers",
    "spoiler free nhl highlights",
    "hockey highlights without spoilers",
    "nhl highlights no spoilers",
    "watch nhl highlights without score",
    "nhl condensed games without spoilers",
    "how to watch hockey highlights without spoilers",
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

export default function NhlHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NHL highlights without spoilers"
      intro={[
        "Yes, you can see upcoming and finished NHL games without seeing earlier scores: HideScore never prints a result at all, and can rate each game for excitement.",
        "Hockey highlights are almost impossible to search for safely. Type the matchup into YouTube and the top result tells you the final score in its title, the thumbnail shows whoever scored the winner celebrating, and the preview text underneath finishes the job. You wanted to watch the game; you have already been told how it went.",
        "HideScore fixes the starting point. You open highlights from a covered game card instead of from a search box — the matchup is visible, the result is not, and clips whose titles give the score away are filtered out before they reach you. The ones that remain have their titles masked.",
        "The 2026-27 season opens on Tuesday, September 29, 2026 with five games running from 5:00 pm to 10:30 pm ET, three of them on ESPN, and widens to eight on Thursday, October 1.",
      ]}
      sections={[
        {
          h: "The search box is the problem, not the highlights",
          p: "Nearly everyone who gets spoiled on a hockey game gets spoiled in the two seconds between typing the team name and pressing play. Titles carry the scoreline, thumbnails carry the celebration, and sidebar recommendations carry both. Starting from a game card removes that step entirely.",
        },
        {
          h: "Ratings tell you which night was worth replaying",
          p: "Turn Ratings on in Settings and the games that were tight, high-scoring, or went to overtime are marked as such — never with the winner. No game is marked until you turn that on, and the default setting withholds it until noon Eastern. Hockey rewards this more than most sports, because so many games turn in the last two minutes or after them. On a covered board an overtime classic and a blowout look identical until the rating separates them.",
        },
        {
          h: "Condensed games and recaps, same protection",
          p: "The condensed game is how most people actually catch up on a night they missed, and it carries exactly the same spoiler risk in its title and thumbnail. Recaps and condensed replays open from the same covered card, and that card carries no scoreline either.",
        },
        {
          h: "Late games are the ones you will watch tomorrow",
          p: "A 10:30 pm Eastern puck drop ends around 1:00 am. Almost nobody watches that live, so it becomes a next-morning highlights job — which is the longest and most dangerous gap on the schedule between a game ending and you seeing it.",
        },
        {
          h: "A route to the broadcaster, not to a box score",
          p: "When a full replay is what you want, national coverage runs across TNT and truTV, and ESPN with ESPN+, Hulu, and Disney+, with regional networks on the rest. The watch link sends you toward whoever carried the game rather than onto a results page that spoils it as it loads.",
        },
        {
          h: "Through the Stanley Cup playoffs",
          p: "Postseason highlights are the hardest to reach safely, because the result of one game is a spoiler for the stakes of the next. Everything above holds through the playoffs and the Final.",
        },
      ]}
      bullets={[
        "NHL highlights opened from a covered card, not a search box.",
        "Clips filtered when the title gives the score away; titles masked on the rest.",
        "Optional spoiler-free ratings — tight, high-scoring, went to overtime.",
        "Condensed games and recaps protected the same way.",
        "Built for late West Coast games watched the next morning.",
        "Works the same through the Stanley Cup playoffs.",
      ]}
      ctaLabel="Open NHL highlights without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/nhl-scores-without-spoilers", label: "NHL scores" },
        // Added 2026-09-20: the NBA now has a highlights route of its own, and
        // this is its closest sibling — same split between a scores page and a
        // highlights page for the same league.
        { href: "/nba-highlights-without-spoilers", label: "NBA highlights" },
        { href: "/nba-scores-without-spoilers", label: "NBA scores" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NHL highlights without spoilers", "spoiler-free NHL highlights", "hockey highlights without spoilers"]}
    />
  );
}
