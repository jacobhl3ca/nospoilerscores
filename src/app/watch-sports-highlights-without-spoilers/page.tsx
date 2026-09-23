import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "Watch Sports Highlights Without Spoilers | HideScore";
const DESC =
  "Watch NBA, NFL, NHL, MLB, soccer, golf, and World Cup highlights without seeing scores, winners, thumbnails, or spoiler headlines first.";
const CANONICAL = "/watch-sports-highlights-without-spoilers";

// ⚠️ Corrected 2026-09-20. This page said you "reveal the result when you are
// ready". You never do: nothing outside GolfLeaderboard reads Team.score, so a
// score is never rendered and there is no reveal control. Ratings are opt-in
// (showRatings: false in preferences.ts; the default "auto" mode holds them off
// before noon ET).

const FAQ = [
  {
    q: "How can I watch sports highlights without spoilers?",
    a: "Open HideScore before searching YouTube or a sports homepage. A game card carries no score at all, links straight to the highlights, and leaves the result to the video you chose to press play on.",
  },
  {
    q: "Does HideScore hide highlight thumbnails?",
    a: "HideScore keeps the result and the score off the game card entirely, and it drops clips whose titles state the score while masking the titles on the ones it keeps. It is designed so you do not have to scan a normal results page or a spoiler-heavy video list first.",
  },
  {
    q: "Can I tell if a highlight is worth watching?",
    a: "Yes. Switch Ratings on in Settings and finished games show a competitiveness rating, so you can pick close games and instant classics without seeing who won. Ratings start off, and the default setting holds them back until noon Eastern.",
  },
  {
    q: "Which sports have spoiler-free highlights?",
    a: "HideScore supports major US sports, soccer, golf, and the 2026 World Cup. Availability depends on each league's official highlight feeds and video metadata.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "watch sports highlights without spoilers",
    "sports highlights without spoilers",
    "spoiler free sports highlights",
    "watch highlights without spoilers",
    "no spoiler highlights",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date routes. A page's openGraph replaces the parent's wholesale
    // (Next merges metadata per top-level field, not deep), so without this these
    // SEO landing pages emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage).
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

export default function WatchSportsHighlightsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="Watch sports highlights without spoilers"
      intro={[
        "Most highlight pages spoil the game before you press play: the final score is in the title, the winning team is in the thumbnail, and the recap headline tells you what happened.",
        "HideScore is built for the opposite workflow. Check the game card first — it carries no score — turn on ratings to find what is worth watching, and learn the result from the highlight or the replay itself.",
      ]}
      sections={[
        {
          h: "Start from the game, not the spoiler feed",
          p: "Instead of searching across video pages that expose titles and thumbnails, start from a HideScore schedule. You can jump to yesterday, today, or tomorrow, and not one of those boards prints a scoreline while you decide what to watch.",
        },
        {
          h: "Use ratings to pick, not a scoreboard",
          p: "A highlight can be technically available but not worth your time. Turn Ratings on in Settings and the competitiveness rating helps you find close games, comebacks, overtime, and instant classics without telling you who won.",
        },
      ]}
      bullets={[
        "Watch NBA, NFL, NHL, MLB, soccer, golf, and World Cup highlights without scanning a normal scoreboard.",
        "No final score or winner printed on any card, in any league.",
        "Use the optional spoiler-free ratings to choose the best game first.",
        "Move from a safe schedule to highlights, recaps, and news after you are ready.",
      ]}
      ctaLabel="Find spoiler-free highlights"
      ctaHref="/yesterday"
      links={[
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/mlb-highlights-without-spoilers", label: "MLB" },
        { href: "/nfl-highlights-without-spoilers", label: "NFL" },
        { href: "/nhl-highlights-without-spoilers", label: "NHL" },
        { href: "/soccer-highlights-without-spoilers", label: "Soccer" },
        // Added 2026-09-20 with the new per-league batch. A highlights hub that
        // omits the newest highlights routes is the orphan problem the
        // /spoiler-free-sports footer note describes.
        { href: "/nba-highlights-without-spoilers", label: "NBA highlights" },
        { href: "/college-football-highlights-without-spoilers", label: "College football" },
        { href: "/champions-league-without-spoilers", label: "Champions League" },
        { href: "/mls-highlights-without-spoilers", label: "MLS" },
        { href: "/best-spoiler-free-sports-sites", label: "Compare the apps" },
        { href: "/worldcup/highlights", label: "World Cup" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["sports highlights without spoilers", "spoiler-free sports highlights", "hidden scores"]}
    />
  );
}
