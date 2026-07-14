import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

const TITLE = "No Spoiler Scores - Sports Scores Without Spoilers | HideScore";
const DESC =
  "Check NBA, NFL, NHL, MLB, soccer, golf, and World Cup scores without spoilers. HideScore keeps results hidden until you tap.";
const CANONICAL = "/no-spoiler-scores";

const FAQ = [
  {
    q: "What are no spoiler scores?",
    a: "No spoiler scores are scoreboards that show the schedule and matchups while hiding the actual score and winner until you choose to reveal them.",
  },
  {
    q: "Can I check yesterday's games without seeing who won?",
    a: "Yes. HideScore is especially useful for yesterday's completed games because scores stay hidden while you decide what to watch or reveal.",
  },
  {
    q: "Can I plan tomorrow's games without spoilers?",
    a: "Yes. Tomorrow's schedule is spoiler-free by nature, and HideScore keeps the same clean game-card view for planning what to watch.",
  },
  {
    q: "Does HideScore work without an account?",
    a: "Yes. HideScore works in any browser without an account. You can optionally sign in to sync preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "no spoiler scores",
    "spoiler free scores",
    "sports scores without spoilers",
    "no spoiler sports scores",
    "hide sports scores",
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

export default function NoSpoilerScoresPage() {
  return (
    <SeoLandingPage
      h1="No spoiler scores for sports fans"
      intro={[
        "Normal scoreboards are built to tell you the result as fast as possible. That is a problem when you are watching a game on delay or deciding what replay is worth your time.",
        "HideScore keeps scores hidden by default. You can scan matchups, dates, leagues, and watchability ratings without learning the winner first.",
      ]}
      sections={[
        {
          h: "A scoreboard for delayed watching",
          p: "Use HideScore when you missed a game live, are avoiding notifications, or want to choose a replay without opening a spoiler-heavy sports app.",
        },
        {
          h: "Scores reveal only when you tap",
          p: "Each game card starts spoiler-free. When you are ready, reveal the score, open highlights, or move into news and recaps with full context.",
        },
      ]}
      bullets={[
        "Check NBA, NFL, NHL, MLB, soccer, golf, and World Cup schedules with hidden scores.",
        "Use yesterday, today, and tomorrow views without landing on a final score.",
        "Sort by game rating to find close games before seeing the result.",
        "Reveal scores one game at a time instead of exposing the whole slate.",
      ]}
      ctaLabel="Open no-spoiler scores"
      ctaHref="/"
      links={[
        { href: "/today", label: "Today" },
        { href: "/yesterday", label: "Yesterday" },
        { href: "/tomorrow", label: "Tomorrow" },
        { href: "/watch-sports-highlights-without-spoilers", label: "Highlights" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["no spoiler scores", "sports scores without spoilers", "hidden sports scores"]}
    />
  );
}
