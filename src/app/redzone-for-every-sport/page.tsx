// Answers the "is there a RedZone for <sport>" family of queries — "redzone for
// nba", "is there a redzone for mlb", "soccer redzone", "college football
// redzone" — which HideScore has been picking up on the homepage for want of a
// page that actually answers them.
//
// This route is the one place on the site that carries a dated inventory of
// every whip-around show, so it passes the specificity test the other landing
// pages are held to (see the notes in src/app/sitemap.ts): real air days, real
// start times, real season dates, and a straight "no" for college football,
// none of which appears on any other page. Every fact below was verified on
// 2026-09-20 and shares its source with the per-league show config in
// src/lib/whiparound.ts, which drives the same information into the league
// column headers.
import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Is there a RedZone for every sport? All 9 whip-around shows (2026) | HideScore";
// Trimmed to 151 chars so Google shows it whole — the prior 227-char copy was
// truncated (~155-char SERP limit). DESC feeds only meta/OG/Twitter/JSON-LD
// description, never visible page text, so the on-page inventory is unchanged.
const DESC =
  "NFL RedZone equivalents in almost every league: Big Inning, Goal Rush, MLS 360, NBA CrunchTime and more. Air days, times and how to watch spoiler-free.";
const CANONICAL = "/redzone-for-every-sport";

const FAQ = [
  {
    q: "How do I watch a whip-around show without spoilers for the late games?",
    a: "Open HideScore first. No score is printed on the board, so you can see which games are still in progress, start the whip-around show from the league header, and keep the late window unspoiled for a replay afterwards.",
  },
  {
    q: "Is there a RedZone for college football?",
    a: "No. Nothing fills that slot in 2026. ESPN's Goal Line channel ended after the 2019 season, and although ESPN took over the RedZone name in January 2026 and has said it may extend it to other sports, no college football version has launched.",
  },
  {
    q: "Is there a RedZone for the NBA?",
    a: "Yes: NBA CrunchTime, Mondays at 8:30 PM ET in the NBA App. It is free with an NBA ID, and the 2026-27 regular season runs from October 20, 2026 to April 11, 2027.",
  },
  {
    q: "Is there a RedZone for MLB?",
    a: "Yes: MLB Network's Big Inning, nightly through the regular season on MLB.TV. Its start time moves with the slate rather than sitting at a fixed hour, so HideScore reads that night's scheduled time into the MLB column header.",
  },
  {
    q: "Is there a soccer RedZone?",
    a: "Three of them. Peacock's Goal Rush covers select Premier League Saturdays from 10:00 AM ET, Paramount+ runs The Golazo Show across the 3:00 PM ET Champions League kickoff window on matchdays, and MLS 360 covers the Saturday 7:30 PM ET block on Apple TV.",
  },
  {
    q: "Do these shows cost anything extra?",
    a: "It varies. NBA CrunchTime is free with an NBA ID. MLS 360 is included with MLS Season Pass and free for Xfinity customers. RedZone needs NFL+ Premium, ESPN Unlimited, or a YouTube TV, Fubo, Sling or Hulu Live add-on.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "redzone for every sport",
    "redzone for nba",
    "is there a redzone for mlb",
    "soccer redzone",
    "college football redzone",
    "whip around shows",
    "nba crunchtime",
    "mlb big inning",
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

export default function RedzoneForEverySportPage() {
  return (
    <SeoLandingPage
      h1="Is there a RedZone for every sport?"
      intro={[
        "Almost. Seven leagues run a whip-around show that cuts between simultaneous games the way NFL RedZone does, and two more appear for a few weeks a year. College football is the one real gap.",
        "Here is the full 2026 list: what each show is called, when it airs, where it lives, and what it costs. Every time below is Eastern.",
      ]}
      sections={[
        {
          h: "NFL RedZone — Sundays, 1:00 PM ET",
          p: "The original, and still the model: seven commercial-free hours cutting between the 1:00 PM and 4:25 PM windows every Sunday of the regular season, Weeks 1 through 18. ESPN took over the show in January 2026. Watch it with NFL+ Premium, ESPN Unlimited, or the add-on on YouTube TV, Fubo, Sling or Hulu Live.",
        },
        {
          h: "MLB Big Inning — nightly through the season",
          p: "MLB Network's version runs every night of the regular season on MLB.TV, but its start time is not fixed: it follows the night's first-pitch spread, landing anywhere from the afternoon to after 9:00 PM. HideScore scrapes the published schedule daily and shows that night's real start time in the MLB column header.",
        },
        {
          h: "Peacock Goal Rush — select Saturdays, 10:00 AM ET",
          p: "The Premier League equivalent, covering the block of matches that all kick off at 3:00 PM in England. It only runs on the Saturdays that actually have a full simultaneous block, which is why it appears some weeks and not others.",
        },
        {
          h: "The Golazo Show — Champions League matchdays, 3:00 PM ET",
          p: "Paramount+ whips between the 9:00 PM CET kickoffs on Champions League matchdays through the league phase, which runs from September 2026 into late January 2027. Exact per-matchday air times are not published in one place.",
        },
        {
          h: "MLS 360 — Saturdays, 7:30 PM ET",
          p: "Apple TV's whip-around covers the Saturday night block where most of the league kicks off together. From 2026 it is English-only. It comes with MLS Season Pass, and Xfinity customers get it at no extra cost.",
        },
        {
          h: "NBA CrunchTime — Mondays, 8:30 PM ET",
          p: "The NBA App jumps between the closing minutes of every Monday night game. It is free with an NBA ID, which makes it the cheapest whip-around show in American sport. The 2026-27 regular season runs October 20, 2026 through April 11, 2027.",
        },
        {
          h: "NHL Frozen Frenzy — one night only: Tuesday, October 13, 2026",
          p: "The NHL schedules a single night where all 32 teams play, and ESPN2 carries a whip-around across it starting at 6:00 PM ET, with the same feed in the ESPN App. It happens once a season, so it is worth putting in a calendar.",
        },
        {
          h: "March Madness Fast Break and Olympics Gold Zone",
          p: "Two seasonal entries. Fast Break covers the NCAA tournament's opening rounds each March, when 16 games can tip in a single day. Peacock's Gold Zone does the same across Olympic event finals; the next edition is Los Angeles 2028. ESPN also runs Squeeze Play and Bases Loaded over the college baseball postseason in May and June.",
        },
        {
          h: "College football: there is still no RedZone",
          p: "This is the one genuine gap. ESPN's Goal Line channel, the closest thing college football ever had, ended after the 2019 season. ESPN acquired the RedZone name in January 2026 and has said it may extend the brand beyond the NFL, but nothing has launched, and no Saturday whip-around exists for the 2026 season.",
        },
        {
          h: "Watching a whip-around show without getting spoiled",
          p: "A whip-around show is a spoiler engine by design: it exists to show you the best moment happening anywhere, which means it shows you scores from games you have not watched. HideScore is the counterweight. Open the board with scores hidden, see which games are live, start the show from the league header, and leave the late window unrevealed for the replay.",
        },
      ]}
      bullets={[
        "Seven leagues run a whip-around show in 2026; college football runs none.",
        "NBA CrunchTime is free with an NBA ID; RedZone needs a paid add-on.",
        "NHL Frozen Frenzy happens once a season: Tuesday, October 13, 2026.",
        "HideScore shows each league's whip-around time in the column header, and turns it into a link once the show is on air.",
        "No score is printed on the board, so the late window survives the show.",
      ]}
      ctaLabel="Open today's board"
      ctaHref="/today"
      links={[
        { href: "/nfl-highlights-without-spoilers", label: "NFL" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB" },
        { href: "/nba-scores-without-spoilers", label: "NBA" },
        { href: "/premier-league-without-spoilers", label: "Premier League" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["NFL RedZone alternatives", "whip-around sports shows", "NBA CrunchTime", "MLB Big Inning", "spoiler-free sports"]}
    />
  );
}
