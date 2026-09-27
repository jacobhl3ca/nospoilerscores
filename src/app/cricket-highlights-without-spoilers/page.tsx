import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Rewritten 2026-09-27 when the international column shipped (cricketintl:
// every Test, ODI and T20I between the twelve ICC full members, men's and
// women's). Before that the page, and the app, covered the IPL only.
//
// Facts read off ESPN's cricket feeds on 2026-09-27: South Africa v Australia
// 2nd ODI (Johannesburg) at 4:00 am ET, India v West Indies 1st ODI
// (Thiruvananthapuram, day/night) at 4:30 am ET, England v Sri Lanka 3rd ODI
// (London) at 5:30 am ET. The West Indies tour of India runs to Oct 17 and
// Australia's tour of South Africa to Oct 31.
//
// Deliberately does NOT promise an in-app highlight video, for either column:
// IPL rights sit with JioHotstar (India only), and the international boards'
// titles do not say which match of a series they are ("England v Sri Lanka |
// 3rd Metro Bank ODI" has no date), so a strict lookup could serve the wrong
// game. See NO_HIGHLIGHT_FALLBACK in src/lib/youtube.ts. Keep the copy matched.
const TITLE = "Cricket Highlights Without Spoilers: Tests, ODIs, IPL | HideScore";
const DESC =
  "Follow Test, ODI and T20I cricket and the IPL without spoilers: every international between the twelve full members, with Eastern start times and no score, wicket count or result.";
const CANONICAL = "/cricket-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I follow international cricket without spoilers?",
    a: "Yes. Add the Cricket column and every Test, ODI and T20I between the twelve full members shows up with its format, the match number in the series and the start time in Eastern. The score, the wickets and the result are never printed on the card.",
  },
  {
    q: "Which matches are in the Cricket column?",
    a: "Men's and women's internationals between Afghanistan, Australia, Bangladesh, England, India, Ireland, New Zealand, Pakistan, South Africa, Sri Lanka, the West Indies and Zimbabwe, including ICC events. County, state and franchise cricket are left out, as are Under-19 and A-team matches. The IPL has its own column.",
  },
  {
    q: "How does a Test match look on the board?",
    a: "A Test appears on each of its days, marked with the day it is on, such as Day 2 of 5. Before it starts, the card shows how many days are scheduled. It never says who is ahead, what the lead is, or how many wickets have fallen.",
  },
  {
    q: "What time are cricket internationals in the US?",
    a: "Early. On September 27, 2026, the ODI in Johannesburg started at 4:00 am Eastern, the day/night ODI in India at 4:30 am and the ODI in London at 5:30 am. Matches in Australia and New Zealand start in the US evening the day before.",
  },
  {
    q: "Does HideScore play cricket highlights in the app?",
    a: "Not yet. IPL highlight rights are held in India only. The boards do post highlights of internationals, but their video titles do not say which game of the series they are from, so a lookup could play the third match of a series when you asked for the first. HideScore shows no video rather than risk it, and each card links to the broadcast instead.",
  },
  {
    q: "Do ratings spoil the result?",
    a: "No. A one-day or T20 rating shows how close the finish was without naming a winner. Tests are not rated: a five-day match can end in a draw that is the best game of the year, and a mark that gets that wrong is worse than none.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "cricket highlights without spoilers",
    "cricket scores without spoilers",
    "test cricket without spoilers",
    "odi highlights without spoilers",
    "ipl highlights without spoilers",
    "spoiler free cricket",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // Matches the site-level Open Graph block in layout.tsx — Next merges
    // metadata per top-level field, not deeply, so a page-level openGraph
    // replaces the parent's wholesale and must restate og:locale.
    locale: "en_US",
    type: "website",
    // Brand card (og-image.png), not og-worldcup.png: the World Cup card reads
    // "Watch the World Cup" and points at hidescore.com/worldcup — a mismatched
    // unfurl for a cricket page (cricket isn't even the same sport), and stale
    // now the 2026 World Cup is over (ended Jul 19). og-image.png is the generic
    // HideScore card, matching the other single-sport pages (NBA/NHL/MLB/NFL/EPL).
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function CricketHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Cricket highlights without spoilers"
      intro={[
        "Yes, you can follow Test, ODI and T20I cricket and the IPL without spoilers: HideScore lists every match with its format and start time and never prints a score.",
        "Cricket may be the sport most often spoiled before you watch it. Almost every international is played in a time zone hours ahead of the US, so a one-day match is finished before breakfast and a Test day ends while you sleep. Nearly everyone watches on delay, and a single notification or thumbnail gives the result away.",
        "HideScore keeps the result off the board. Pick the Cricket column for internationals, the IPL column for the Indian Premier League from late March to the end of May, or both.",
      ]}
      sections={[
        {
          h: "Every international between the full members",
          p: "The Cricket column carries men's and women's Tests, ODIs and T20Is between the twelve ICC full members, from bilateral tours to ICC events. Each card names the format and the match in the series, such as 2nd ODI or 1st Test, so a column that mixes a Test in England with a T20I in India still reads at a glance. County, state and franchise cricket stay out, and so do Under-19 and A-team matches.",
        },
        {
          h: "Test matches, one day at a time",
          p: "A Test runs for up to five days, and a result can hide in any of them: a declaration, a follow-on, a collapse on the fourth evening. HideScore shows a Test on each of its days with only the day it is on, such as Day 3 of 5. It does not show the lead, the wickets that have fallen or the session. When you are ready, the card links to the broadcast, not to a scorecard.",
        },
        {
          h: "What time the games are in the US",
          p: "On September 27, 2026, three ODIs were played on the same morning: Johannesburg at 4:00 am Eastern, Thiruvananthapuram at 4:30 am and London at 5:30 am. Matches in Australia and New Zealand start in the US evening of the day before. The board shows each start in your own time zone.",
        },
        {
          h: "Ratings that understand a chase",
          p: "A side chasing a target stops the moment it passes it, so the run totals always finish a few apart, even in a rout. HideScore rates a chase on what the batting side had left, wickets in hand and balls to spare, and a defended total on the runs it held out by. A one-wicket win off the final ball rates like the thriller it was. Tests are not rated.",
        },
        {
          h: "Why there is no highlight button yet",
          p: "IPL highlights are held by a rights holder in India and are not posted for the US. The boards do post highlights of internationals, but a series plays the same two teams three to five times in a fortnight and the video titles do not carry the date. HideScore only plays a clip it is sure is the right match, so for now each cricket card has a watch link instead.",
        },
        {
          h: "News that will not give it away",
          p: "Cricket announces results in its own language: bowled out, all out, chased down, declared, follow-on, a score written as runs for wickets. HideScore's spoiler filter reads all of it, so a headline in the news column will not hand you the result while you decide what to watch.",
        },
      ]}
      bullets={[
        "No cricket score, wicket count or result printed anywhere on the board.",
        "Men's and women's Tests, ODIs and T20Is between the twelve full members.",
        "Each Test shown on each of its days as Day N of 5, never with the state of play.",
        "Ratings for one-day and T20 games built on wickets in hand and balls to spare.",
        "A watch link to the broadcast rather than to a scorecard.",
      ]}
      ctaLabel="Open cricket without spoilers"
      links={[
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/rugby-without-spoilers", label: "Rugby" },
        { href: "/nrl-highlights-without-spoilers", label: "NRL" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["cricket highlights without spoilers", "Test cricket without spoilers", "IPL highlights without spoilers"]}
    />
  );
}
