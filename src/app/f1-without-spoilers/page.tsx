import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. F1 had ZERO impressions over the prior 90 days for the
// simple reason that no page existed to earn them, and it is the sport with the
// strongest structural case for delayed viewing: the calendar is deliberately
// spread across every time zone, so much of it finishes while the US sleeps.
//
// ⚠️ WHAT THE F1 CARD ACTUALLY IS — read fetchLeagueEvent's racing branch in
// espn.ts before editing this copy. One card per Grand Prix, built from the
// RACE session (competition.type.id === "3"). It carries the race name, the
// circuit, the broadcaster, and a state of Race / Live / Final. It carries NO
// classification and NO championship table, so there is nothing to "reveal" —
// the right claim is that the result is never shown, not that it is hidden
// behind a tap. There is also NO excitement rating: ratings are computed from a
// score margin (marginCloseness.ts) and a Grand Prix has no score. Qualifying
// and sprint sessions do NOT get their own cards. Do not write copy implying
// any of those four things.
//
// Every race time below is the RACE session, read from the per-event
// competitions array on ESPN's racing/f1/scoreboard feed on 2026-09-20.
// ⚠️ Query the range from TODAY, not from the 1st of next month: the first pull
// used dates=20261001-20261231 and silently dropped the very next race, the
// Azerbaijan GP, whose weekend had already begun. The list is now built from
// dates=20260920-20261231: Azerbaijan Sat Sep 26 7:00 am ET (a Saturday race);
// Bahrain-in-Malaysia Sun Oct 4 3:00 am ET;
// Singapore Sun Oct 11 8:00 am ET; United States Sun Oct 25 4:00 pm ET; Mexico
// City Sun Nov 1 3:00 pm ET; Sao Paulo Sun Nov 8 12:00 pm ET; Las Vegas Sat
// Nov 21 11:00 pm ET; Qatar Sun Nov 29 11:00 am ET; Abu Dhabi Sun Dec 6
// 8:00 am ET. The feed's broadcasts array names Apple TV on every round.
//
// F1 is excludeFromAuto in ALL_LEAGUES, so the column is chosen in Settings
// rather than picked automatically — the copy says so rather than implying the
// board opens on it.
const TITLE = "F1 Without Spoilers: Watch the Race Before You See the Result | HideScore";
const DESC =
  "Follow Formula 1 without seeing the podium. HideScore shows every Grand Prix with no classification and no championship table. Free, no account.";
const CANONICAL = "/f1-without-spoilers";

const FAQ = [
  {
    q: "Can I follow F1 results without spoilers?",
    a: "Yes. A Grand Prix card names the race, the circuit, the broadcaster and whether it has run, and it carries no classification at all. Nothing on the board is a covered-up result waiting for a tap; there is no finishing order to look away from because it was never printed there in the first place.",
  },
  {
    q: "What time do the remaining 2026 races start in the US?",
    a: "They are all over the clock. Azerbaijan comes first, and unusually it races on a Saturday: 7:00 am ET on September 26. The Bahrain Grand Prix held in Malaysia then takes its start at 3:00 am ET on Sunday, October 4; Singapore is 8:00 am ET on October 11; Austin is a civilized 4:00 pm ET on October 25; Mexico City 3:00 pm ET on November 1; Sao Paulo noon ET on November 8; Las Vegas 11:00 pm ET on Saturday, November 21; Qatar 11:00 am ET on November 29; and the Abu Dhabi finale 8:00 am ET on Sunday, December 6.",
  },
  {
    q: "Why is Formula 1 the easiest sport to get spoiled on?",
    a: "Because the race is over before the American day starts and the result is instantly everywhere. A 3:00 am start finishes before dawn, so millions of people wake to a completed Grand Prix and a phone full of it: a podium photograph, a standings graphic, a headline naming the winner in four words. There is no gentle way back to the recording after that.",
  },
  {
    q: "Does HideScore show the drivers' championship table?",
    a: "No. A championship table redraws itself the moment the flag falls, so the gap at the top is a summary of the afternoon and often names the winner outright. The F1 column has no standings view for exactly that reason, and the details link on a card goes to the season schedule rather than to a results page.",
  },
  {
    q: "How do I watch the race highlights without reading the result first?",
    a: "Press the highlight button on the card. It resolves against the official Formula 1 channel and is pinned to that specific round, so it cannot serve you last week's reel, and the video title is masked on the way in. Searching for the same clip yourself means walking past a results page, a thumbnail of the podium and a row of suggested videos naming the winner.",
  },
  {
    q: "What about qualifying and sprint races?",
    a: "The card is built from the race session, so qualifying and the sprint do not appear as separate entries — which also means neither one can leak at you from the board. If you are watching a full weekend on delay, be aware that grid position is the single most spoiling fact about a race, so treat a qualifying result the same way you treat a finishing order.",
  },
  {
    q: "Where can I watch F1 in the United States in 2026?",
    a: "Apple TV carries the season in the US, and ESPN's feed lists it as the broadcaster on every remaining round. The card shows that broadcaster so you know where to go, without a classification sitting next to it.",
  },
  {
    q: "How do I add F1 to my board?",
    a: "Open Settings and pick F1 from the league list. It is not one of the columns chosen automatically, so it stays off until you ask for it, and it stays on once you have. The same list is where NASCAR and IndyCar live.",
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
    "f1 results without spoilers",
    "f1 without spoilers",
    "f1 race replay no spoilers",
    "spoiler free f1",
    "formula 1 without spoilers",
    "watch f1 replay without knowing the result",
    "f1 race start times et 2026",
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

export default function F1WithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="F1 without spoilers"
      intro={[
        "Yes, you can watch a Grand Prix without spoilers: on HideScore an F1 card tells you the race, the circuit, the broadcaster and whether it has run — and it prints no finishing order anywhere.",
        "Formula 1 is designed around a global audience, and that design is exactly what ruins it for anyone watching on delay. The calendar crosses every time zone, so a large part of the season finishes while North America is asleep. Azerbaijan races at 7:00 am Eastern on Saturday, September 26. The Bahrain round staged in Malaysia takes its flag at 3:00 am Eastern on Sunday, October 4. Abu Dhabi closes the year at 8:00 am Eastern on December 6.",
        "By the time an American fan is awake, the race is a finished story with a photograph attached. What is missing is somewhere to check which rounds have run, where they were, and who is showing them, that does not answer the one question you were avoiding. That is what this column is.",
        "Add F1 in Settings and it sits alongside the rest of your board through the remaining rounds: Azerbaijan, Malaysia, Singapore, Austin, Mexico City, Sao Paulo, Las Vegas, Qatar and Abu Dhabi.",
      ]}
      sections={[
        {
          h: "Races that finish before you wake up",
          p: "From the east coast of the United States, the Asian and Gulf rounds are pre-dawn starts. A race that ends at 5:00 am has a seven-hour head start on anybody planning to watch it after breakfast, and it spends those hours on every home screen in the country. That is the specific gap this column exists to close.",
        },
        {
          h: "Las Vegas is the other extreme",
          p: "The Las Vegas Grand Prix goes green at 11:00 pm Eastern on Saturday, November 21 and runs past midnight, which makes it the round most of the country records rather than watches. A Sunday-morning replay of a Saturday-night race is the most fragile viewing plan in the sport, because it has to survive an entire night of notifications.",
        },
        {
          h: "No classification on the card, and no table beside it",
          p: "Other apps hide the result behind a tap. Here it is simply not rendered: the card has a race name, a circuit, a broadcaster and one of three states — upcoming, running, finished. There is no drivers' table either, because a championship gap updates within minutes of the flag and describes the afternoon as plainly as a podium photo does.",
        },
        {
          h: "The link out disappears when the race ends",
          p: "Before and during a race, the card links out to the event page, which is useful while there is nothing to spoil. The moment the race goes final that link is removed, because a finished-race page opens with the classification at the top and one click would undo the whole card. When there is no event link to use, the fallback is the season schedule rather than a results page.",
        },
        {
          h: "Highlights pinned to the round you actually want",
          p: "The highlight button resolves against the official Formula 1 channel and carries a token identifying which Grand Prix it is, so it cannot quietly play the previous round's reel — and the video title stays masked as it opens. Going to find the same clip by hand means passing a results page, a podium thumbnail and a sidebar of videos that name the winner.",
        },
        {
          h: "Qualifying is the spoiler nobody plans for",
          p: "Grid position shapes everything that follows: knowing who starts from pole changes how the first lap reads and often tells you how the race will go. The board is built from the race session, so nothing from Saturday appears on it — but if you are saving a whole weekend, guard the qualifying result as carefully as the finishing order.",
        },
      ]}
      bullets={[
        "F1 cards that never print a classification.",
        "Every remaining 2026 round, from Azerbaijan on September 26 to the Abu Dhabi finale.",
        "No championship table, because a table is a result in another form.",
        "Highlights pinned to the correct round, with the video title masked.",
        "The link out is removed once a race is final, so it cannot reach a classification.",
        "Add the F1 column from Settings and it stays on your board.",
      ]}
      ctaLabel="Open F1 without spoilers"
      ctaHref="/today"
      links={[
        { href: "/ufc-results-without-spoilers", label: "UFC results" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/best-spoiler-free-sports-sites", label: "Compare the apps" },
        { href: "/faq", label: "FAQ" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["F1 without spoilers", "spoiler-free Formula 1", "F1 race results without spoilers"]}
    />
  );
}
