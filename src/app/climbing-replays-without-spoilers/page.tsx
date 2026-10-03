import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Added 2026-10-03 with the Climbing column (World Climbing Series World Cups).
//
// Facts read off the sportclimbing/ifsc-calendar feed (release 202610031015)
// on 2026-10-03, converted to Eastern. Every 2026 round time below is still
// marked provisional there, so the copy says so:
//   Salt Lake City (boulder), Oct 16–18: men's semi-final Sat Oct 17 12:00 pm,
//   men's final Sat 9:00 pm; women's semi-final Sun Oct 18 12:00 pm, women's
//   final Sun 9:00 pm.
//   Santiago (lead + speed), Oct 23–25: speed finals Sat Oct 24 5:00 pm; lead
//   semi-finals Sun Oct 25 8:00 am; women's lead final Sun 5:00 pm, men's lead
//   final Sun 6:00 pm.
// The 2027 season opens in Tokyo on April 9.
//
// ⛔ Names no athlete and no result, past or future. Keep it that way.
const TITLE = "Climbing World Cup Replays Without Spoilers | HideScore";
const DESC =
  "Watch World Climbing Series boulder, lead and speed finals without spoilers: round times in your time zone, live and replay links, and a worth-watching rating that names no climber.";
const CANONICAL = "/climbing-replays-without-spoilers";

const FAQ = [
  {
    q: "How do I watch a climbing World Cup final without spoilers?",
    a: "Add the Climbing column. On a World Cup day it lists each semi-final and final with its start time and a Watch live button. When a round ends, the button becomes Watch replay and plays the full stream in HideScore's spoiler-safe player, with the video title covered. No climber's name and no result appear on the card.",
  },
  {
    q: "When are the Salt Lake City and Santiago World Cups?",
    a: "Salt Lake City (boulder) runs October 16 to 18, 2026, with the men's final on Saturday, October 17 and the women's final on Sunday, October 18, both at 9:00 pm Eastern. Santiago (lead and speed) runs October 23 to 25: the speed finals are on Saturday, October 24 at 5:00 pm Eastern, and the lead finals on Sunday, October 25 from 5:00 pm. World Climbing still marks these times as provisional, so the card shows them with a ≈ until they are confirmed.",
  },
  {
    q: "Where can I watch climbing World Cups in the US?",
    a: "World Climbing streams the semi-finals and finals free on its YouTube channel in the US. In much of Europe the stream is blocked because Eurosport and HBO Max hold the rights there, so each card also links to World Climbing's own where-to-watch page once it is published.",
  },
  {
    q: "Do the ratings spoil the result?",
    a: "No. Only finals are rated, and only after they end. The rating says how close the final was, such as a lead decided by one hold or a boulder final that changed leader on the last problem, without saying who won. Ratings follow the same switch as every other sport in Settings.",
  },
  {
    q: "Why are the qualification rounds missing?",
    a: "Most boulder and lead qualifications are not streamed, so the card shows only rounds you can actually watch and counts the rest in a footer line, such as 2 rounds not streamed. Speed qualifications are usually streamed, and they appear when they are.",
  },
  {
    q: "Why doesn't the card show who is in the final?",
    a: "A semi-final or final start list tells you who advanced from the round before, which is a result. HideScore leaves every name off the card, so you can watch the semi-final first and still not know the finalists.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "climbing world cup without spoilers",
    "ifsc replay without spoilers",
    "world climbing series replay",
    "bouldering world cup replay",
    "spoiler free climbing",
    "climbing world cup schedule eastern time",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // Restated: a page-level openGraph replaces layout.tsx's block wholesale.
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

export default function ClimbingReplaysWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Climbing World Cup replays without spoilers"
      intro={[
        "Yes, you can watch World Climbing Series finals without spoilers: HideScore lists each round with its start time and a watch button, and never names a climber or a result.",
        "Climbing is easy to spoil. Most World Cups run in Europe and Asia, so the finals end while the US is at work or asleep. The official channel posts short clips of the winning climb within the hour, and their titles and thumbnails name the winner. Even the semi-final start list tells you who made the final.",
        "HideScore keeps all of that off the board. Add the Climbing column for boulder, lead and speed World Cups.",
      ]}
      sections={[
        {
          h: "Every round you can watch, in your time zone",
          p: "On a World Cup day the Climbing column shows one card per round: Men's Boulder Semi-final, Women's Lead Final, and so on, with the start time in your own time zone. The header says where the day sits in the event, such as Salt Lake City · Boulder · Day 2 of 3. A time World Climbing has not confirmed yet carries a ≈, because rounds still move by an hour or more in the week before.",
        },
        {
          h: "Live, then replay, in a covered player",
          p: "Before and during a round the card has a Watch live button for World Climbing's YouTube stream. When the round ends, the same stream becomes the replay, and the button plays it inside HideScore's spoiler-safe player with the title strip covered. A results link never appears on the card.",
        },
        {
          h: "Which final is worth two hours",
          p: "A climbing final replay runs one and a half to two and a half hours, so the useful question is which one to watch. HideScore rates each final once it ends, with the same four words as every other sport: great, good, meh, skip. A lead final settled by one hold, a boulder final where the leader changed on the last problem, or a speed final won by a few hundredths rates high. A runaway rates low. The rating names no one.",
        },
        {
          h: "Salt Lake City and Santiago, October 2026",
          p: "Two World Cups are left in 2026. Salt Lake City (boulder), October 16 to 18: the men's final is on Saturday, October 17 and the women's final on Sunday, October 18, both at 9:00 pm Eastern, after semi-finals at noon. Santiago (lead and speed), October 23 to 25: the speed finals are on Saturday, October 24 at 5:00 pm Eastern and the lead finals on Sunday, October 25 at 5:00 pm (women) and 6:00 pm (men). The 2027 season opens in Tokyo on April 9.",
        },
        {
          h: "Outside the US",
          p: "World Climbing's YouTube stream is blocked in much of Europe, where Eurosport and HBO Max hold the rights. Each round card says when its stream is region-blocked and links to World Climbing's where-to-watch page for the event once it is published.",
        },
      ]}
      bullets={[
        "No athlete names, start lists, rankings, scores or heights anywhere on the board.",
        "Semi-finals and finals for boulder, lead and speed, with times in your time zone.",
        "Watch live before a round, Watch replay in a covered player after it.",
        "A rating for each finished final that says how close it was, not who won.",
        "Add-to-calendar with each round's real start and end time.",
      ]}
      ctaLabel="Open climbing without spoilers"
      links={[
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/f1-without-spoilers", label: "F1" },
        { href: "/ufc-results-without-spoilers", label: "UFC" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["climbing World Cup without spoilers", "World Climbing Series replays", "bouldering World Cup replays"]}
    />
  );
}
