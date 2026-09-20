import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. The Premier League route proved a single soccer
// competition can outrank and out-convert the general /soccer-highlights page
// (24.2% CTR from position 6.2), and the Champions League is the next one with
// standalone demand: "champions league highlights no spoilers" is searched on
// its own, and the midweek-afternoon kickoff problem is specific enough that
// the soccer page cannot answer it without becoming a UCL page.
//
// Fixtures, kickoff times and the US broadcaster below are verified against
// ESPN's soccer/uefa.champions/scoreboard feed on 2026-09-20, one date at a
// time (the feed rejects ranges). The 2026-27 league phase runs Sep 8-10,
// Oct 13-14, Oct 20-21, Nov 3-4, Nov 24-25 and Dec 8-9; matchdays split over
// two days at 12:45 pm and 3:00 pm ET, and the Oct 21 slate carries Paramount+
// in its broadcasts array.
const TITLE = "Champions League Without Spoilers | HideScore";
const DESC =
  "Follow the Champions League league phase without seeing results. Every match stays covered, with a rating that tells you which one to watch. Free, no account.";
const CANONICAL = "/champions-league-without-spoilers";

const FAQ = [
  {
    q: "Can I follow the Champions League without spoilers?",
    a: "Yes. Every Champions League fixture arrives on HideScore as a covered card. The tie, the kick-off time and whether it has finished are all shown; the scoreline is not, and appears only when you tap for it. That is enough to line up an evening of replays without learning how any of them ended.",
  },
  {
    q: "When are the 2026-27 Champions League matchdays?",
    a: "The league phase opened on September 8-10, 2026 and continues on October 13-14, October 20-21, November 3-4, November 24-25 and December 8-9, with the last two rounds in January. Each round is split across two days, nine ties per day from matchday two onward.",
  },
  {
    q: "Why is the Champions League so hard to watch late in the United States?",
    a: "Because the whole round lands in the middle of a working afternoon. Two ties kick off at 12:45 pm ET and the remaining seven go at 3:00 pm ET together, so by the time an American viewer is home the round has been over for two hours and every result has had a full commute to reach them.",
  },
  {
    q: "Seven matches kicked off at once. How do I pick one?",
    a: "By its rating rather than its scoreline. A finished tie is marked for how competitive it was — level late, a flurry of goals, settled by one moment — without naming which side came through. On October 21, with Arsenal at Bayern Munich, RB Leipzig at Real Madrid and five others starting together, that mark is the difference between picking well and picking blind.",
  },
  {
    q: "Is the league table a spoiler?",
    a: "Yes, and a bad one. A 36-club single table moves after every single tie, so one glance at where a side sits tells you how its midweek went. Positions are covered on the same terms as scorelines, which means you can look up the standings without paying for it with the match you were saving.",
  },
  {
    q: "How do I open Champions League highlights without reading the score?",
    a: "From the card, not from a search box. The US rights-holder posts an extended cut of each tie, and its title carries both clubs and the round; the listing page around it carries the scoreline and a thumbnail of the decisive goal. HideScore drops clips that state the result in the title and masks the title on the ones it keeps.",
  },
  {
    q: "Where can I watch the Champions League in the US in 2026-27?",
    a: "Paramount+ holds the United States rights, and ESPN's feed lists it as the carrier on every tie in the October rounds. The watch link on a card aims at the broadcaster rather than dropping you on a results page or a live table that gives the round away as it loads.",
  },
  {
    q: "Does this hold up for the knockout rounds and the final?",
    a: "Yes, and the knockouts need it most, because a two-legged tie makes the first leg a spoiler for the second. An aggregate score is treated as carefully as a single scoreline all the way to the final.",
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
    "champions league highlights no spoilers",
    "champions league without spoilers",
    "ucl without spoilers",
    "spoiler free champions league",
    "champions league scores without spoilers",
    "champions league matchday schedule 2026",
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

export default function ChampionsLeagueWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Champions League without spoilers"
      intro={[
        "Yes, you can follow the Champions League without spoilers: HideScore keeps every tie covered until you tap it, and rates the finished ones so you know which night is worth replaying.",
        "No competition is harder for an American to save for later. A round arrives on a Tuesday and a Wednesday afternoon, seven or eight matches start at the same minute, and all of them are over before the working day is. What reaches you between the final whistle and your sofa is a push alert, a table that has already moved, and a thumbnail of somebody's celebration.",
        "HideScore is somewhere to start that will not do that. Ties sit on the board as covered cards with the fixture, the kick-off time and the finished flag visible and nothing else. The excitement mark on a completed tie says it was close or dramatic; it never says who went through.",
        "The 2026-27 league phase opened on September 8, 2026 and runs through matchdays on October 13-14, October 20-21, November 3-4, November 24-25 and December 8-9.",
      ]}
      sections={[
        {
          h: "A whole round at 3:00 pm Eastern",
          p: "From matchday two the round is nine ties a day, and the shape never changes: two at 12:45 pm ET, then seven together at 3:00 pm. For anyone watching from North America that is the worst possible arrangement — a wall of simultaneous football finishing mid-afternoon, with the entire evening left for the results to find you before you have watched a minute of it.",
        },
        {
          h: "The single table moves on every result",
          p: "Thirty-six clubs in one league phase table means the standings redraw themselves after each round, and a club's position is a plain statement of how its last match went. Treating the table as public information while hiding the scoreline would be pointless, so both are covered and both reveal on the same tap.",
        },
        {
          h: "Ratings that rank the round without settling it",
          p: "With seven ties finishing at once, the useful question is not what happened but which one to give an evening to. A completed tie is marked for how level it stayed and how late it turned — Barcelona at Paris Saint-Germain on October 20, Arsenal at Bayern Munich the following afternoon — while the identity of the winner stays behind the same cover as the score.",
        },
        {
          h: "Extended highlights, opened from the card",
          p: "The American rights-holder publishes a long-form cut of every tie. The video itself is fine; the page it lives on is not, because the surrounding listings, the suggested next clips and the thumbnail all state the outcome. Opening from a covered card skips the listing entirely, and clips whose titles carry the result are filtered out before they can be offered.",
        },
        {
          h: "A link to Paramount+, not to a results page",
          p: "ESPN's feed names Paramount+ as the US carrier across the October rounds, so a card's watch link aims there. It deliberately does not aim at a gamecast, a live table or a round-up page, any of which would answer the question you were trying not to ask.",
        },
        {
          h: "Two-legged knockouts and the final",
          p: "From February the format turns every first leg into a spoiler for its second, and aggregate scores leak just as freely as ninety-minute ones. The cover holds through the play-off round, the last sixteen, the quarters and semis, and the final itself.",
        },
      ]}
      bullets={[
        "Champions League ties hidden until you tap.",
        "All six autumn matchdays, from September 8 through December 9.",
        "Ratings for finished ties — level late, high-scoring, settled by one moment.",
        "The 36-club league table treated as a spoiler, not as neutral information.",
        "Highlights with the scoreline filtered out of video titles.",
        "Watch links that point at Paramount+, not at a scoreboard.",
      ]}
      ctaLabel="Open the Champions League without spoilers"
      ctaHref="/today"
      links={[
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/la-liga-without-spoilers", label: "La Liga" },
        { href: "/mls-highlights-without-spoilers", label: "MLS highlights" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/liga-mx-scores-without-spoilers", label: "Liga MX" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["Champions League without spoilers", "spoiler-free Champions League", "Champions League highlights without spoilers"]}
    />
  );
}
