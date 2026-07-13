import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

const TITLE = "Tomorrow's World Cup Schedule - No Spoilers | HideScore";
const DESC =
  "Plan tomorrow's 2026 FIFA World Cup matches without spoilers. See kickoff times, teams, watch links and spoiler-free ratings when games finish.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "world cup tomorrow",
    "tomorrow world cup schedule",
    "world cup schedule no spoilers",
    "spoiler free world cup schedule",
    "2026 world cup tomorrow",
  ],
  alternates: { canonical: "/worldcup/tomorrow" },
  openGraph: {
    title: TITLE,
    description: "Tomorrow's World Cup matches, spoiler-free.",
    url: "https://hidescore.com/worldcup/tomorrow",
    siteName: "HideScore",
    // og:locale — matches layout.tsx + the /worldcup hub (Next replaces the
    // parent openGraph wholesale, so each World Cup route must declare its own).
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore - tomorrow's 2026 FIFA World Cup schedule, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Tomorrow's World Cup matches, spoiler-free.",
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore - tomorrow's 2026 FIFA World Cup schedule, spoiler-free" }],
  },
};

export default function WorldCupTomorrowPage() {
  return (
    <>
      <HomeContent initialOffset={1} worldCupHub worldCupHubMode="tomorrow" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
              { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
              { "@type": "ListItem", position: 3, name: "Tomorrow", item: "https://hidescore.com/worldcup/tomorrow" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
