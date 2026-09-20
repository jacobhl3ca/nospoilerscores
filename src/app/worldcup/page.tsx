import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

const TITLE = "2026 World Cup — No Spoilers | HideScore";
const DESC =
  "Follow the 2026 FIFA World Cup without spoilers. No score is printed, and optional ratings help you find the best matches without seeing who won.";

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
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — no score printed anywhere.",
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
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — no score printed anywhere.",
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore — the 2026 FIFA World Cup, spoiler-free" }],
  },
};

export default function WorldCupPage() {
  // initialOffset 0 → land on today's / upcoming slate (not the morning
  // "yesterday" smart-default), so the hub always frames "what's on to watch."
  return (
    <>
      <HomeContent initialOffset={0} worldCupHub />
      {/* Page graph: a WebPage node linked into the site's shared #website
          entity (declared in layout.tsx) plus its own BreadcrumbList, so Google
          renders a Home › World Cup trail in the search result AND reads the
          breadcrumb as this page's rather than an orphan list. The World Cup
          hub was still emitting a bare, @id-less BreadcrumbList with no WebPage
          node — every other route (the date pages, /worldcup/teams, the SEO
          landings, /faq) already uses this WebPage→#website / WebPage→#breadcrumb
          node-linking, so this brings the marquee World Cup hub in line.
          Server-rendered: page.tsx has no "use client", so the script ships in
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
                url: "https://hidescore.com/worldcup",
                inLanguage: "en",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/worldcup#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/worldcup#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
