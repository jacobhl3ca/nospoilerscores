import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";
import { worldCup2026Ended, WORLD_CUP_2026_FINAL } from "@/lib/worldCup2026";

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
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore — World Cup highlights without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Catch up on World Cup highlights without seeing who won first.",
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore — World Cup highlights without spoilers" }],
  },
};

export default function WorldCupHighlightsPage() {
  return (
    <>
      {/* After the final this route opens on the final's board; the reader
          steps back a day at a time from there. Static export, so the gate is
          read at build time, and every build since 7/19 is past it. */}
      <HomeContent initialOffset={-1} initialDate={worldCup2026Ended() ? WORLD_CUP_2026_FINAL : undefined} worldCupHub worldCupHubMode="highlights" />
      {/* Page graph: a WebPage node linked into the site's shared #website entity
          (declared in layout.tsx) plus its own BreadcrumbList, so Google renders a
          Home › World Cup › Highlights trail in the search result AND reads the
          breadcrumb as this page's rather than an orphan list. This route was still
          emitting a bare, @id-less BreadcrumbList with no WebPage node — every other
          route (SeoLandingPage, /faq, /privacy, the date routes, /worldcup and the
          team pages) already uses this WebPage→#website / WebPage→#breadcrumb
          node-linking. Server-rendered: no "use client" here, so the script ships in
          the static HTML for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: TITLE,
                description: DESC,
                url: "https://hidescore.com/worldcup/highlights",
                inLanguage: "en",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/worldcup/highlights#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/worldcup/highlights#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
                  { "@type": "ListItem", position: 3, name: "Highlights", item: "https://hidescore.com/worldcup/highlights" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
