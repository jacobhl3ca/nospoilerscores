import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-27 with the five club rugby columns (lib/espn.ts has the ESPN
// ids). The hub for every union competition on the board, plus a pointer to
// the NRL page for rugby league.
//
// Every date and ET kick-off below was read off ESPN's rugby feeds on
// 2026-09-27: URC round 1 on Fri Sep 25 (three games at 2:45 pm ET) and Sat
// Sep 26 (Lions v Leinster in Johannesburg at 7:30 am ET); PREM round 1 on Fri
// Sep 25 at 2:45 pm, Sat Sep 26 at 10:05 am and 12:30 pm, Sun Sep 27 at 10:00
// am; Top 14 opened Sat Sep 12 with five games at 10:35 am ET and a 3:00 pm
// night game; Challenge Cup pool round 1 on Fri Oct 16; the Bledisloe tests
// on Oct 10 and Oct 17; the Nations Championship final on Nov 29.
//
// Highlights: lit = Six Nations, Super Rugby, Rugby World Cup, Nations
// Championship, URC. Dark = Premiership, Top 14, Champions Cup, Challenge Cup,
// MLR and the standalone tests (lib/youtube.ts NO_HIGHLIGHT_FALLBACK). The page
// says so plainly. No broadcaster is named: US rights are split by competition
// and were not verified for this page.
const TITLE = "Rugby Without Spoilers: URC, PREM, Top 14 | HideScore";
const DESC =
  "Follow rugby union without spoilers: URC, Premiership, Top 14, the Champions and Challenge Cups, Six Nations and the tests, with Eastern kick-off times and no scores. Free.";
const CANONICAL = "/rugby-without-spoilers";

const FAQ = [
  {
    q: "Can I follow rugby without seeing the score?",
    a: "Yes. Add any rugby competition as a column and each game shows the two teams, the kick-off time in Eastern and whether it has finished. The score is never printed on the card, in a list or in a table.",
  },
  {
    q: "Which rugby competitions does HideScore cover?",
    a: "The United Rugby Championship, the Gallagher Premiership, the Top 14, the Champions Cup, the Challenge Cup, the Six Nations, Super Rugby Pacific, the Nations Championship, the summer and autumn tests, the Rugby World Cup and Major League Rugby. Rugby league has its own NRL column and page.",
  },
  {
    q: "What time are URC and Premiership games in the US?",
    a: "Mostly in the morning and early afternoon Eastern. On the opening weekend of 2026-27 the Friday night games in the UK and Ireland started at 2:45 pm Eastern, Saturday games ran from 10:00 am to 2:45 pm, and a URC game in Johannesburg started at 7:30 am.",
  },
  {
    q: "Does every rugby game get a highlights button?",
    a: "No. A button appears only when the competition has an official uploader that titles each match by both teams. The URC, the Six Nations, Super Rugby, the Nations Championship and the World Cup do. The Premiership, the Top 14, the European cups, Major League Rugby and one-off tests do not yet, so those cards show no video rather than a clip that could spoil the result.",
  },
  {
    q: "Does HideScore show league tables?",
    a: "No. A table is a list of results in another form. Club rugby tables also carry bonus points, which tell you whether a team scored four tries or lost narrowly, so there is no table view.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone and Android apps, and it works without an account. Signing in only syncs your columns and settings across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "rugby without spoilers",
    "rugby highlights without spoilers",
    "urc no spoilers",
    "premiership rugby without spoilers",
    "top 14 without spoilers",
    "spoiler free rugby",
    "rugby scores hidden",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // Next merges metadata per top-level field, so a page-level openGraph must
    // restate the site-level locale.
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

export default function RugbyWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Rugby without spoilers"
      intro={[
        "Yes, you can follow rugby union from the US without spoilers: HideScore lists every game with its kick-off in Eastern time and never prints a score.",
        "Almost all top-flight rugby is played in Europe, South Africa and the southern hemisphere, so for a fan in America the games start while you are at work, asleep or still at breakfast. By the time you sit down to watch, the result has been in the group chat for hours. The hard part is not finding the game. It is getting to it before the score finds you.",
        "Pick the competitions you follow and each one becomes a column. A card shows the two teams, the kick-off time and a finished flag. The result is never written on it. Turn Ratings on in Settings and a finished game also carries a mark for how close it was, without naming a winner.",
      ]}
      sections={[
        {
          h: "Every competition on one board",
          p: "The club season runs from September to June: the United Rugby Championship (Ireland, Wales, Scotland, Italy and South Africa), the Gallagher Premiership in England and the Top 14 in France, with the Champions Cup and the Challenge Cup between them. The international calendar sits around that: the Six Nations in February and March, the tests in the summer and autumn, the Nations Championship in the even years and the Rugby World Cup every four. Super Rugby Pacific and Major League Rugby fill the spring. Each one is its own column, so you only see the ones you add.",
        },
        {
          h: "What time the games are in the US",
          p: "On the opening weekend of the 2026-27 club season, the Friday night games in the UK and Ireland started at 2:45 pm Eastern. Saturday games ran from 10:00 am to 2:45 pm, and the URC game in Johannesburg started at 7:30 am. In France the Top 14's Saturday afternoon games start at 10:35 am Eastern and the night game at 3:00 pm. The southern-hemisphere tests are earlier still. The board shows every kick-off in your own time zone.",
        },
        {
          h: "Why rugby is easy to spoil",
          p: "A club rugby table is harder to read around than most. Its bonus points tell you whether a team scored four tries and whether it lost narrowly, so a glance at the standings gives away the shape of a game you have not seen. Cup draws do the same: a knockout fixture tells you who won the round before. HideScore has no table view and shows each cup game as a fixture with its round, never with who advanced.",
        },
        {
          h: "Highlights, where there is an official source",
          p: "A highlights button appears only when the competition's own channel titles each match by both teams. The URC, the Six Nations, Super Rugby, the Nations Championship and the Rugby World Cup do, and the clip plays with its title and progress covered. The Premiership, the Top 14, the European cups, Major League Rugby and one-off tests do not have an uploader HideScore can trust yet: some titles miss the pairing, and some print the score. Those cards show no video rather than a guess.",
        },
        {
          h: "Ratings that never name a winner",
          p: "Rugby scores come in tries, conversions and penalty goals, so a seven-point lead is one converted try. The rating reads each game from its half-time and full-time totals: how close it was at the break, how close at the end, and whether one side came back. When a feed has no half-time total, it rates the final margin alone. It is shown as a word such as Great or Good, never as a margin.",
        },
        {
          h: "Dates to know in 2026",
          p: "The URC and the Premiership opened on Friday, September 25, and the Top 14 on Saturday, September 12. The Challenge Cup starts on Friday, October 16. New Zealand and Australia play the Bledisloe Cup on October 10 and October 17. The Nations Championship runs through November, with its final on November 29. Each column is offered in the league picker while its season is on.",
        },
      ]}
      bullets={[
        "No rugby score printed anywhere on the board.",
        "URC, Premiership, Top 14, both European cups, Six Nations and the tests.",
        "Kick-off times in Eastern for every game.",
        "Official highlights with the title covered, where an official source exists.",
        "Optional ratings for finished games that never name a winner.",
      ]}
      ctaLabel="Open rugby without spoilers"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/nrl-highlights-without-spoilers", label: "NRL" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights without spoilers" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer" },
        { href: "/cricket-highlights-without-spoilers", label: "Cricket" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["rugby without spoilers", "spoiler-free rugby union", "URC and Premiership without spoilers"]}
    />
  );
}
