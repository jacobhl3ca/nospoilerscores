import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

const TITLE = "2026 World Cup — No Spoilers | HideScore";
const DESC =
  "Follow the 2026 FIFA World Cup without spoilers. Scores stay hidden, and ratings help you find the best matches without seeing who won.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "world cup no spoilers",
    "spoiler free world cup",
    "2026 world cup schedule",
    "world cup scores hidden",
    "watch world cup on delay",
    "fifa world cup spoiler free",
  ],
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: TITLE,
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — scores hidden until you tap.",
    url: "https://hidescore.com/worldcup",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // today/tomorrow/yesterday routes. A page's openGraph replaces the parent's
    // wholesale (Next merges metadata per top-level field, not deep), so without
    // this the marquee World Cup routes — the ones most often shared right now —
    // emitted no og:locale for social unfurlers (Facebook/LinkedIn/Slack/iMessage).
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore — the 2026 FIFA World Cup, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — scores hidden until you tap.",
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore — the 2026 FIFA World Cup, spoiler-free" }],
  },
};

export default function WorldCupPage() {
  // initialOffset 0 → land on today's / upcoming slate (not the morning
  // "yesterday" smart-default), so the hub always frames "what's on to watch."
  return (
    <>
      <HomeContent initialOffset={0} worldCupHub />
      {/* BreadcrumbList lets Google render a Home › World Cup trail in the
          search result instead of the bare /worldcup URL. The /watch-world-cup-
          without-spoilers guide already declares this same hierarchy (with
          /worldcup as position 2), so the hub now closes the loop by claiming
          its own place in the trail. Server-rendered: page.tsx has no
          "use client", so the script ships in the static HTML for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
              { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
