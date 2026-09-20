import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. College football is the biggest in-season sport on the
// board with no route of its own, and it is the one where the scale of a
// Saturday is the whole argument: 65 FBS games in a day, stacked in four
// windows, is a spoiler problem no other sport has.
//
// Ships now rather than in August because the highlight chain only became
// trustworthy on 2026-09-16 (collegeHighlights.ts): ESPN College Football is
// the primary uploader and skips anything on SEC Network+, BTN, FOX, CBS or
// the CW, so the card now walks a per-game chain through the two schools'
// conference channels and then the network that aired it, each request carrying
// a "football" title token so a basketball cut between the same schools cannot
// win. Coverage went from 23 to 57 of 80 games on the 9/17 board.
//
// Game count, kickoff windows, fixtures and AP ranks below are verified against
// ESPN's football/college-football/scoreboard feed on 2026-09-20
// (dates=20260926&groups=80): 65 FBS games that Saturday, 11 at 12:00 pm ET,
// 12 at 3:30 pm, and the evening split across 7:00, 7:30 and 7:45 pm.
//
// ⚠️ The AP rank on a card is NOT hidden, and that is deliberate — see
// pollRank.ts. ESPN's curatedRank is frozen at kickoff and survives on finished
// games, so it says what each team carried IN, never how the game went. Do not
// write copy here claiming rankings are covered the way league tables are.
const TITLE = "College Football Highlights Without Spoilers | HideScore";
const DESC =
  "Watch college football highlights without seeing the final. Every game on a 65-game Saturday stays covered, with a rating for which one to replay. Free.";
const CANONICAL = "/college-football-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch college football highlights without spoilers?",
    a: "Yes. Each game sits on HideScore as a covered card showing the matchup, the kickoff time and whether it is over. The highlight button on that card opens the game's cut with the title masked, so the first thing you see is the opening drive rather than a number.",
  },
  {
    q: "How many college football games are on a normal Saturday?",
    a: "More than anyone can track. ESPN's feed lists 65 FBS games for Saturday, September 26, 2026 alone: 11 kicking off at noon ET, 12 more at 3:30 pm, and the night split across 7:00, 7:30 and 7:45 pm. Even a viewer watching all day sees perhaps four of them live.",
  },
  {
    q: "Which games from Saturday are worth going back for?",
    a: "The rating on each finished game answers that and nothing else. It marks whether a game stayed level into the fourth quarter, turned into a shootout, or came down to one possession — it never names the side that came out ahead. Across 65 games that is the only practical way to build a shortlist.",
  },
  {
    q: "Are the AP rankings on the cards a spoiler?",
    a: "No, and this is worth explaining because it looks like one. The number beside a team is the ranking it carried into kickoff, frozen at the moment the game started, so it describes the matchup rather than the outcome. It is the new poll that gives Saturday away, and that is published on Sunday, away from the board.",
  },
  {
    q: "Why do college football highlights disappear for some games?",
    a: "Because no single channel posts all of them. ESPN's college football channel is the main source and skips plenty — anything that aired on a conference network, on FOX, on CBS or on the CW. For those the card looks instead to the two schools' conference channels and then to the network that carried the broadcast, so a Big Ten or SEC game finds its own cut rather than falling back on a stranger's re-upload.",
  },
  {
    q: "What about the noon and 3:30 windows overlapping?",
    a: "That overlap is the trap. Eleven games end around 3:00 pm while twelve more are starting, so the moment you look up from one, the scoring feed beside it has resolved the others. A board with every score covered lets you see what has finished and what is still live without any of the finals arriving with it.",
  },
  {
    q: "Does it cover the Playoff and the bowls?",
    a: "Yes. Bowl season is the hardest stretch of the calendar to watch on your own schedule — games run for two weeks at every hour of the day, most of them on a weekday afternoon — and the Playoff turns each round into a spoiler for the next. The cover holds through both.",
  },
  {
    q: "Does HideScore show the conference standings?",
    a: "Standings are treated as a spoiler in their own right, because a conference table is a readable summary of who won last weekend. They stay covered on the same terms as scores, and reveal on the same tap.",
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
    "college football highlights no spoilers",
    "college football highlights without spoilers",
    "cfb without spoilers",
    "spoiler free college football",
    "college football scores without spoilers",
    "watch college football highlights without the score",
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

export default function CollegeFootballHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="College football highlights without spoilers"
      intro={[
        "Yes, you can watch college football highlights without spoilers: HideScore covers every score on the Saturday board and opens each game's cut from the card, with the video title masked.",
        "No other sport hands you this much at once. ESPN lists 65 FBS games for Saturday, September 26, 2026, and they are not spread out — 11 start at noon Eastern, another 12 at 3:30, and the night stacks up again from 7:00. Whichever one is on your screen, a dozen others are ending beside it, and each of those endings is a banner, an alert or a friend's text.",
        "HideScore is built so the day survives contact with your evening. Games appear as covered cards carrying the matchup, the kickoff time, the ranking each team brought in, and whether the game has finished — and none of them carry the score.",
        "Saturday, September 26 is the shape of the problem: Texas at Tennessee at noon, Oklahoma at Georgia and Iowa at Michigan at 3:30 pm, then Texas A&M at LSU and Oregon at USC together at 7:30.",
      ]}
      sections={[
        {
          h: "Sixty-five games, four windows, one evening",
          p: "The noon window alone is eleven games. By the time it resolves, the afternoon window is already an hour old, and anyone checking a phone between the two has just learned eleven results they had not asked for. Covering the board keeps the useful information — who is playing, what is live, what is done — and removes the part that costs you the replay.",
        },
        {
          h: "A rating instead of a highlight reel",
          p: "Choosing among 65 games with nothing to go on means opening the ones with famous names and missing the one that went to four overtimes in Lubbock. Each finished game carries a mark for how close and how eventful it was, which sorts the day without settling any of it. Ole Miss at Florida might be the pick over a bigger name; you will not know which side won either way.",
        },
        {
          h: "The ranking on the card is safe. Sunday's poll is not",
          p: "The number next to a team is the one it carried into kickoff and it stays frozen there, so a finished card still reads as the matchup rather than the result. The poll that comes out the following day is a different thing entirely: a team climbing nine places is a plain statement about Saturday, which is why the new rankings live off the board.",
        },
        {
          h: "Finding the cut for a game nobody nationally televised",
          p: "College football's highlights are scattered across more channels than any other sport. The main national college channel skips games that aired on a conference network, on FOX, on CBS or on the CW, so the card looks to the two schools' own conference channels next and then to the network that broadcast it. Every one of those requests is pinned to football, so a basketball game between the same two schools cannot be served by mistake.",
        },
        {
          h: "Late kicks on the West Coast",
          p: "A 10:30 pm Eastern kickoff from the Pacific time zone finishes close to 2:00 am, which makes it a Sunday-morning job for most of the country. That is the longest unguarded gap in the sport, and the one where a covered card earns its keep, because the result has had all night to reach you.",
        },
        {
          h: "Bowls and the Playoff",
          p: "December and January are worse than any Saturday. Bowl games run across two weeks at every hour, often midweek and often while you are working, and in the Playoff the result of one round frames the whole of the next. Everything above carries through to the title game.",
        },
      ]}
      bullets={[
        "College football scores hidden until you tap.",
        "A full FBS Saturday on one board with no finals showing.",
        "Ratings for finished games — level late, high-scoring, one-possession.",
        "Highlights resolved through conference and network channels, not re-uploads.",
        "AP ranking shown as it stood at kickoff, so it never leaks the result.",
        "Works the same through bowl season and the Playoff.",
      ]}
      ctaLabel="Open college football without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
        { href: "/nba-highlights-without-spoilers", label: "NBA highlights" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/today", label: "Today" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["college football highlights without spoilers", "spoiler-free college football", "CFB highlights without spoilers"]}
    />
  );
}
