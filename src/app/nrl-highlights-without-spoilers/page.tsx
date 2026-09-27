import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-27 with the NRL column, one week before the Grand Final.
//
// Every fact below was read off ESPN's rugby-league/3/scoreboard feed on
// 2026-09-27: the season opened Sat Feb 28 2026 at 9:15 pm ET (Knights v
// Cowboys, Allegiant Stadium, Las Vegas); round 27 kicked off Fri Sep 4 at
// 4:00 and 6:00 am ET, Sat Sep 5 at 1:00, 3:30 and 5:35 am ET, and Sun Sep 6
// at 12:00 and 2:05 am ET; the prelim finals were Fri Sep 25 at 5:50 am ET and
// Sun Sep 27 at 2:00 am ET; the Grand Final is Sun Oct 4 2026 at 4:30 am ET
// (7:30 pm in Sydney) at Accor Stadium. ⛔ The page never names the Grand Final
// pairing: the two teams in it ARE the prelim final results.
//
// Highlights: the NRL's own channel ("NRL - National Rugby League"), 12/12
// strict hits over round 27 and every final, 0 wrong (lib/youtube.ts). The
// NRLW posts from its own channel. Watch link: Watch NRL (200 on 2026-09-27).
//
// ⚠️ WHAT THE APP ACTUALLY DOES: the score is parsed only to compute the
// rating and is never rendered. There is no ladder view. Ratings are OPT-IN.
const TITLE = "NRL Highlights Without Spoilers | HideScore";
const DESC =
  "Watch NRL highlights without spoilers: every game with its kick-off in Eastern time, no score printed, and the NRL's own highlights for each match. Free.";
const CANONICAL = "/nrl-highlights-without-spoilers";

const FAQ = [
  {
    q: "Can I watch NRL highlights without spoilers?",
    a: "Yes. Add the NRL as a column and each game shows the two clubs, the kick-off time in Eastern, and whether it has finished, never the score. When the NRL posts its highlights for that match, the card gets a button that plays it with the title covered.",
  },
  {
    q: "When is the 2026 NRL Grand Final in US time?",
    a: "Sunday, October 4, 2026, at 4:30 am Eastern, which is 7:30 pm in Sydney. It is played at Accor Stadium. HideScore shows the game on the board without the names of the finalists spelled out anywhere else on the page, because the finalists are the prelim final results.",
  },
  {
    q: "What time are NRL games in the US?",
    a: "In the middle of the night. In round 27 the Friday games started at 4:00 and 6:00 am Eastern, the Saturday games at 1:00, 3:30 and 5:35 am, and the Sunday games at midnight and 2:05 am. Every result is final before most of the US is awake.",
  },
  {
    q: "Where do the highlights come from?",
    a: "Only from the NRL's own YouTube channel, and only a video titled with both clubs for that season. In a test of the twelve most recent games, round 27 and every final, the channel had all twelve and none was the wrong match. The women's NRLW posts from a separate channel, so its games between the same clubs cannot be served by mistake.",
  },
  {
    q: "Does HideScore show the NRL ladder?",
    a: "No. A ladder is a list of results in another form, so there is no ladder view. The finals series is where this matters most: the ladder after round 27 tells you who played whom in week one, and every week after that tells you who won.",
  },
  {
    q: "Where can I watch the NRL live in the US?",
    a: "Watch NRL, the league's own international streaming pass, carries every match live and on replay in the US. The watch link on each card opens it, not a scores page.",
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
    "nrl highlights without spoilers",
    "nrl no spoilers",
    "spoiler free nrl",
    "nrl grand final 2026 us time",
    "rugby league highlights without score",
    "nrl scores without spoilers",
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

export default function NrlHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="NRL highlights without spoilers"
      intro={[
        "Yes, you can follow the NRL from the US without spoilers: HideScore never prints a score, and each finished game gets the NRL's own highlights with the title covered.",
        "Rugby league is played in Australia and New Zealand, so for a fan in America every game kicks off overnight. By the time you wake up, the result is already in your feeds, in the group chat and on the front of every sports app. The hard part is not finding the game. It is getting to the replay before the score finds you.",
        "Add the NRL as a column and each game shows the two clubs, the kick-off time in Eastern and a finished flag. The result is never written on the card. Turn Ratings on in Settings and a finished game also carries a mark for how close or dramatic it was, without naming a winner.",
        "The 2026 Grand Final is on Sunday, October 4, at 4:30 am Eastern.",
      ]}
      sections={[
        {
          h: "Every game is overnight in the US",
          p: "In round 27 of 2026 the Friday games started at 4:00 and 6:00 am Eastern, the Saturday games at 1:00, 3:30 and 5:35 am, and the Sunday games at midnight and 2:05 am. Only the season opener, played in Las Vegas on February 28, started in the US evening. Every other result lands while you sleep, so the first thing you see in the morning can give it away.",
        },
        {
          h: "The finals give each other away",
          p: "The top eight clubs play four weeks of finals, and every week's fixtures are decided by the week before. That makes the finals the easiest part of the season to be spoiled on: reading who plays in the prelim finals tells you who won the semi-finals. HideScore shows each finals game as a fixture with its round, such as Preliminary Final, and never lists who advanced.",
        },
        {
          h: "Grand Final: Sunday, October 4, 4:30 am ET",
          p: "The 2026 Grand Final is played at Accor Stadium in Sydney at 7:30 pm local time, which is 4:30 am on Sunday in New York. This page does not name the two teams in it, because the finalists are the prelim final results. Open the board and the game is there, covered, whenever you are ready.",
        },
        {
          h: "Highlights from the NRL only",
          p: "A highlight button uses only the NRL's own YouTube channel, and only a video titled with both clubs for this season. The channel also re-posts older finals between the same clubs, so the season check matters. In a test of the twelve most recent games, round 27 and every final, it found all twelve and none was the wrong match. The clip plays with its title and progress covered.",
        },
        {
          h: "Ratings that never name a winner",
          p: "Rugby league scores come in tries, conversions, penalty goals and one-point field goals, so a six-point lead is one converted try. The rating reads each game the same way: how close it was at half-time, how close at the end, and whether one side came back. It is shown as a word such as Great or Good, never as a margin.",
        },
        {
          h: "Watch live on Watch NRL",
          p: "Watch NRL, the league's international streaming pass, carries every game live and on replay in the US. Each card's watch link opens it rather than a scores page, so the way into the full game never passes a result on the way.",
        },
      ]}
      bullets={[
        "No NRL score printed anywhere on the board.",
        "Kick-off times in Eastern for every overnight game.",
        "Finals shown by round, never by who advanced.",
        "Highlights from the NRL's own channel, with the title covered.",
        "Optional ratings for finished games that never name a winner.",
        "Watch links to Watch NRL, not to a scoreboard.",
      ]}
      ctaLabel="Open the NRL without spoilers"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights without spoilers" },
        { href: "/cricket-highlights-without-spoilers", label: "Cricket" },
        { href: "/f1-without-spoilers", label: "F1" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL highlights" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NRL highlights without spoilers", "spoiler-free rugby league", "NRL Grand Final without spoilers"]}
    />
  );
}
