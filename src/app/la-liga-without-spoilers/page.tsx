import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20, the day after La Liga's highlight channel was lit (#80).
// The route is deliberately "/la-liga-without-spoilers" and NOT
// "...-highlights-..." — see the laliga entry in youtube.ts: ESPN FC cuts the
// big-club fixtures and skips the rest (4 of 8 on the probed slate, 0 wrong),
// so roughly half a matchday has no highlight button. Naming the route after
// highlights would promise something the column only half delivers. The page
// leads with scores and ratings and describes highlights as partial, which is
// what gate 5 of the plan requires.
//
// La Liga is excludeFromAuto in ALL_LEAGUES, so the column is chosen in
// Settings rather than picked automatically.
//
// Kickoff windows and fixtures below are verified against ESPN's
// soccer/esp.1/scoreboard feed on 2026-09-20, one date at a time (the feed
// carries roughly a week of fixtures and rejects ranges). The September 18-20
// round ran Elche at Espanyol on the Friday, four matches on the Saturday and
// five on the Sunday, across four kickoff windows: 8:00 am, 10:15 am, 12:30 pm
// and 3:00 pm ET — ten matches over the three days, not nine.
//
// ⚠️ WHAT THE APP ACTUALLY DOES — no page may say "the score appears when you
// tap it". It does not. Nothing outside GolfLeaderboard reads Team.score; the
// score is parsed to compute the rating and never rendered, so there is no
// covered score to reveal. There is no standings table either, and the "#N"
// chip a card can carry comes off once the match is final (GameCard.tsx).
// Ratings are OPT-IN: `showRatings: false` in preferences.ts, and the default
// "auto" mode forces them off before noon ET (HomeContent.tsx).
const TITLE = "La Liga Without Spoilers | HideScore";
const DESC =
  "Follow La Liga without seeing results. No scoreline is printed anywhere, and an optional rating tells you which match was worth an evening. Free.";
const CANONICAL = "/la-liga-without-spoilers";

const FAQ = [
  {
    q: "Can I follow La Liga without spoilers?",
    a: "Yes. Add La Liga in Settings and every fixture lands on the board as a plain card: the match, the kickoff time, the broadcaster and whether it has finished. No scoreline is written on it and none can be summoned, so there is nothing there to slip. That is enough to plan a Sunday evening of replays from a round that finished at lunchtime.",
  },
  {
    q: "What time do La Liga matches kick off in the US?",
    a: "Early, and in four waves. The September 18-20, 2026 round is typical: 8:00 am ET, 10:15 am, 12:30 pm and 3:00 pm on both weekend days, with a single Friday night fixture at 3:00 pm ET. A ten-match round is therefore over by mid-afternoon on the American east coast, and before lunch on the west.",
  },
  {
    q: "Why is Spanish football so easy to get spoiled on in America?",
    a: "Because of that clock. The round is finished while most of the country is still starting its weekend, so anyone planning to watch in the evening spends eight or ten hours walking past the answer. It is the mirror image of the NFL problem: not too many games at once, but all of them over too early.",
  },
  {
    q: "Does HideScore have La Liga highlights?",
    a: "For some matches. The US rights-holder posts a per-match cut of the bigger fixtures and skips a good number of the rest, so the highlight button appears on the matches it actually covers and is absent on the others. That is deliberate: a missing button costs you nothing, while a re-upload with the score in its title would cost you the match.",
  },
  {
    q: "Is the La Liga table a spoiler?",
    a: "Yes, and an efficient one. Twenty clubs and a single table means a position tells you how a side's weekend went, and a two-place jump tells you more than that. HideScore therefore has no standings view, and the small position marker a fixture can carry before kickoff disappears from the card once the match is done.",
  },
  {
    q: "How do I know which match is worth watching?",
    a: "Turn Ratings on in Settings and a finished match carries a mark for how close and how eventful it was, with no mention of the result. On a ten-match round that turns an undifferentiated list into an order of preference — a goalless draw between two mid-table sides and a five-goal afternoon look identical on the board until the rating separates them. Nothing carries a mark until you switch the feature on, and the default holds it back through the morning.",
  },
  {
    q: "What about El Clasico and the Madrid derby?",
    a: "Those are the matches people most want to watch properly, and the hardest to protect, because they are on every front page within minutes. They sit on the board as covered cards like everything else — the September 20, 2026 round had Real Madrid at Atletico Madrid at 10:15 am ET, which is a long way from the evening most Americans would actually watch it.",
  },
  {
    q: "Where can I watch La Liga in the United States?",
    a: "ESPN holds the US rights, and its per-match cut is the source the highlight button uses when one exists. A card's watch link aims at the broadcaster rather than at a results page or a live table that would settle the match as the page loads.",
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
    "la liga highlights no spoilers",
    "la liga without spoilers",
    "spoiler free la liga",
    "la liga scores without spoilers",
    "laliga without spoilers",
    "watch la liga without knowing the score",
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

export default function LaLigaWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="La Liga without spoilers"
      intro={[
        "Yes, you can follow La Liga without spoilers: every Spanish fixture stays behind its cover on HideScore until you ask for it, with a rating on the completed ones to show where an evening is best spent.",
        "Spanish football's problem is not volume, it is timing. A round runs in four waves from 8:00 am Eastern, and by 5:00 pm on a Sunday the whole thing has been over for two hours. Anyone who wanted to watch after dinner has spent most of a day within reach of the answer, on a phone that has no reason to keep it quiet.",
        "The board is somewhere to look during those hours that will not tell you. Fixtures arrive with the match, the kickoff time and a finished flag and no scoreline at all; an optional rating says which matches were tight or eventful; and there is no league table anywhere, because a table says the same thing as a scoreline in fewer characters.",
        "The round of September 18 to 20, 2026 shows the shape of it: one Friday fixture, four on the Saturday, five on the Sunday, with Real Madrid at Atletico Madrid kicking off at 10:15 am ET.",
      ]}
      sections={[
        {
          h: "A round that finishes before your afternoon does",
          p: "Four windows, 8:00 am to 3:00 pm Eastern, both weekend days. For an American viewer that means the interesting part of the round happens between breakfast and mid-afternoon, and the evening you were going to spend on it comes after every result is already public. This is the exact gap the covered card is for.",
        },
        {
          h: "Twenty clubs, one table, no hiding place",
          p: "Every result moves the standings and every position is a summary of somebody's weekend. Showing a live table next to cards that carry no scoreline would give the whole thing away, so there is no table, and the position marker a fixture can wear beforehand is taken off the card the moment it finishes. A promoted side's climb stays as private as the match that caused it.",
        },
        {
          h: "Ratings for a round you cannot watch all of",
          p: "Nine or ten matches is more than anyone gives a weekend to. A finished fixture is marked for how close it stayed and how much happened in it, which narrows the round to the two or three worth your time and still leaves every result in front of you rather than behind you.",
        },
        {
          h: "Highlights on the matches that have them",
          p: "The American rights-holder cuts the bigger fixtures reliably and skips a fair share of the rest, so the highlight button appears on some cards and not others. That is on purpose. An absent button is a small disappointment; a re-uploaded clip with the score in its title is the failure the whole app exists to prevent, so nothing is served unless it comes from the verified source.",
        },
        {
          h: "The matches you least want ruined",
          p: "El Clasico and the Madrid derby reach further than any other fixture in Spain — front pages, group chats, notification banners from apps that do not otherwise mention football. They get no special treatment on the board and need none: the card looks exactly like the others, which is precisely the point.",
        },
        {
          h: "Adding the column",
          p: "La Liga is not one of the competitions picked for you automatically. Open Settings, add it, and it keeps its place on the board next to whatever else you follow — the Champions League and the Premier League included, each as its own column rather than folded into one soccer list.",
        },
      ]}
      bullets={[
        "No La Liga scoreline printed anywhere on the board.",
        "Every kickoff window, from the 8:00 am ET opener to the 3:00 pm close.",
        "Optional ratings for finished matches — tight, eventful, or a quiet afternoon.",
        "No league table, because a table is a result in another form.",
        "Highlights only from the verified rights-holder, or no button at all.",
        "Add the La Liga column from Settings and it stays on your board.",
      ]}
      ctaLabel="Open La Liga without spoilers"
      ctaHref="/today"
      links={[
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/mls-highlights-without-spoilers", label: "MLS highlights" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer highlights" },
        { href: "/liga-mx-scores-without-spoilers", label: "Liga MX" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["La Liga without spoilers", "spoiler-free La Liga", "La Liga scores without spoilers"]}
    />
  );
}
