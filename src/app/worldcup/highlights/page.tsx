import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

const TITLE = "World Cup Highlights Without Spoilers | HideScore";
const DESC =
  "Watch 2026 FIFA World Cup highlights without seeing scores, winners, thumbnails or spoiler headlines first. HideScore keeps results hidden until you tap.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "world cup highlights no spoilers",
    "spoiler free world cup highlights",
    "watch world cup highlights without spoilers",
    "world cup recap no spoilers",
    "2026 world cup highlights",
  ],
  alternates: { canonical: "/worldcup/highlights" },
  openGraph: {
    title: TITLE,
    description: "Catch up on World Cup highlights without seeing who won first.",
    url: "https://hidescore.com/worldcup/highlights",
    siteName: "HideScore",
    // og:locale — matches layout.tsx + the /worldcup hub (Next replaces the
    // parent openGraph wholesale, so each World Cup route must declare its own).
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore - World Cup highlights without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Catch up on World Cup highlights without seeing who won first.",
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore - World Cup highlights without spoilers" }],
  },
};

export default function WorldCupHighlightsPage() {
  return (
    <>
      <HomeContent initialOffset={-1} worldCupHub worldCupHubMode="highlights" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
              { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
              { "@type": "ListItem", position: 3, name: "Highlights", item: "https://hidescore.com/worldcup/highlights" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
