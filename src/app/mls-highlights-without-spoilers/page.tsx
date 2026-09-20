import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20, ahead of the playoffs. MLS is the one big domestic league
// with an in-house highlight source that has never had a route: OFFICIAL_CHANNELS
// maps mls to "Major League Soccer" (the full name — the abbreviation never
// matched), so per-match cuts resolve league-wide rather than club by club.
// That is why this route is named for highlights while the La Liga one is not.
//
// Schedule facts below are verified against ESPN's soccer/usa.1/scoreboard feed
// on 2026-09-20, one date at a time: Sat Sep 26 carries 14 matches at 7:30,
// 8:30, 9:30 and 10:30 pm ET; Sat Oct 17 carries 13 spread from 2:30 pm to
// 10:30 pm; and Sat Nov 7 is the final day — 15 matches, every one of the 30
// clubs, 8 at 4:00 pm ET and 7 at 7:00 pm. ESPN publishes nothing past Nov 7
// yet because the bracket is unseeded, so this page does NOT name playoff dates.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — never write "the score appears when you tap
// it". It does not. Nothing outside GolfLeaderboard reads Team.score; the score
// is parsed to compute the rating and is never rendered, so there is no covered
// score to reveal. There is no standings table, and the "#N" chip a card can
// carry comes off once the match is final (GameCard.tsx). Ratings are OPT-IN:
// `showRatings: false` in preferences.ts, and the default "auto" mode forces
// them off before noon ET (HomeContent.tsx).
const TITLE = "MLS Highlights Without Spoilers | HideScore";
const DESC =
  "Watch MLS highlights without seeing the result. A 14-match Saturday with no scoreline printed anywhere, and an optional rating for which one to replay. Free.";
const CANONICAL = "/mls-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch MLS highlights without spoilers?",
    a: "Yes. Open a match's highlights from its card on the board rather than from a search. The league posts its own cut of every match, so the video is easy to reach — the hard part is reaching it without reading the scoreline printed beside it, and starting from the card removes that step.",
  },
  {
    q: "How many MLS matches are on a Saturday?",
    a: "Thirteen or fourteen through the run-in. September 26, 2026 has fourteen, kicking off at 7:30, 8:30, 9:30 and 10:30 pm ET as the league works westward through the time zones. October 17 spreads thirteen matches from 2:30 pm all the way to 10:30 pm.",
  },
  {
    q: "When does the 2026 MLS regular season end?",
    a: "Saturday, November 7, 2026. All thirty clubs play that day — fifteen matches, eight at 4:00 pm ET and seven at 7:00 pm — so the entire table resolves inside one evening. It is the single most spoiled day of the MLS calendar and the one most worth watching properly.",
  },
  {
    q: "Why is a Saturday night MLS slate hard to avoid?",
    a: "Because it rolls rather than finishes. The eastern matches are over while the western ones are in their first half, so there is no clean moment when the night is done and you can safely look at a phone. A 10:30 pm ET kickoff from the Pacific coast ends past 12:30 am, by which point the rest of the league has been settled for hours.",
  },
  {
    q: "Which match should I go back and watch?",
    a: "Turn Ratings on in Settings and each finished card carries a mark for how close the match stayed and how much happened in it, without naming the side that won. Across fourteen matches that is the difference between spending your Sunday on a goalless draw and spending it on the one that turned in stoppage time. The marks only appear once you enable them, and on the default setting not before noon Eastern.",
  },
  {
    q: "Is the MLS table a spoiler?",
    a: "Yes. Position in a conference is a restatement of the weekend, and in the run-in it is a sharper one than usual, because a single result can move a club across the playoff line. HideScore shows no conference table for that reason, and the position marker a fixture can carry before kickoff is removed from the card once it finishes.",
  },
  {
    q: "Does it work through the playoffs and MLS Cup?",
    a: "Yes. The postseason is where a result stops being one night's news and starts framing the next round, so the cover matters more there than in August. Matches stay hidden the same way once the bracket is set.",
  },
  {
    q: "Where are MLS highlights from?",
    a: "The league's own channel, which posts a per-match cut across the whole competition rather than leaving it to individual clubs. That matters for consistency: a club channel would cover one team's matches and leave the other twenty-nine to an open search, which is where wrong videos and spoiling titles come from.",
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
    "mls highlights without spoilers",
    "mls highlights no spoilers",
    "mls without spoilers",
    "spoiler free mls",
    "mls scores without spoilers",
    "when does the mls regular season end 2026",
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

export default function MlsHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="MLS highlights without spoilers"
      intro={[
        "Yes, you can watch MLS highlights without spoilers: no match on HideScore carries a scoreline, and its highlights open straight from the card with the video title masked.",
        "An MLS Saturday is a rolling wall of football. Fourteen matches start in four staggered waves as the league moves west across the country, so the first results are public while the last kickoffs are still to come. There is never a clean point at which the night is over and it is safe to look at your phone again.",
        "The board is built for that shape. You can see which matches are live, which are done and who is playing, and no scoreline appears on any of them — not covered up, simply never printed. Switch Ratings on and each finished match also tells you whether it was tight or eventful, never who took the points.",
        "The regular season closes on Saturday, November 7, 2026, when all thirty clubs play across two windows and the whole table settles in a single evening.",
      ]}
      sections={[
        {
          h: "Four kickoff waves, one long night",
          p: "September 26, 2026 is the standard pattern: 7:30 pm ET on the east coast, 8:30 in the central zone, 9:30 in the mountains, 10:30 on the Pacific. By the time the last match kicks off, the whole eastern block is over and the central one is in its closing minutes. Keeping the whole slate covered is what lets you follow the night without it resolving itself around you.",
        },
        {
          h: "Decision day settles everything at once",
          p: "On November 7 every club is in action, eight matches at 4:00 pm Eastern and seven at 7:00. Conference places, playoff seeding and the last qualifying spots all land inside three hours. It is the day with the most to spoil and, for anyone who cannot watch live, the day a covered board is worth the most.",
        },
        {
          h: "Ratings that sort fourteen matches",
          p: "Nobody watches a full MLS Saturday. With Ratings switched on, a finished match says how competitive it stayed and how much happened, which turns an unreadable list of fourteen fixtures into a shortlist of two or three, with the results of all fourteen still ahead of you. They are off by default, and in the standard setting they stay off through the morning, which is when a careless glance does the most damage.",
        },
        {
          h: "One league channel, every match",
          p: "MLS posts its own cut of each match, which is why highlights here are consistent from Vancouver to Miami rather than good for the clubs with active channels and absent for the rest. The card resolves against that source by name, so it never has to fall back on an open search where a fan re-upload with the score in its title would win.",
        },
        {
          h: "Late western kickoffs are next-day viewing",
          p: "A 10:30 pm Eastern start on the west coast finishes after 12:30 am. Very few people on the east coast watch those live, so they become a Sunday-morning job — and they have had the entire close of the night, plus every other result, to leak before you get to them.",
        },
        {
          h: "Into the playoffs",
          p: "Once the bracket is set, one result changes what the next round means, and a series score carries as much as a scoreline. The same cover carries through the postseason to MLS Cup, so a round you missed does not give away the round you were saving.",
        },
      ]}
      bullets={[
        "No MLS scoreline printed anywhere on the board.",
        "A full 14-match Saturday on one board with no results showing.",
        "Optional ratings for finished matches — tight, eventful, or settled early.",
        "Highlights from the league's own per-match cut, not from an open search.",
        "Built for 10:30 pm ET western kickoffs watched the next morning.",
        "No conference table, because a table is a result in another form.",
      ]}
      ctaLabel="Open MLS without spoilers"
      ctaHref="/yesterday"
      links={[
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/la-liga-without-spoilers", label: "La Liga" },
        { href: "/liga-mx-scores-without-spoilers", label: "Liga MX" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["MLS highlights without spoilers", "spoiler-free MLS", "MLS scores without spoilers"]}
    />
  );
}
