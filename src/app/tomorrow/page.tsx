import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
  description:
    "Tomorrow's NBA, MLB, NHL, NFL, and soccer schedule without spoilers. Plan which games to watch — spoiler-free previews and ratings.",
  alternates: { canonical: "/tomorrow" },
  openGraph: {
    title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
    description: "Tomorrow's games, spoiler-free. Plan what to watch with match times and previews.",
    url: "https://hidescore.com/tomorrow",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx. A page's
    // openGraph replaces the parent's wholesale (Next merges metadata per top-
    // level field, not deep), so without this the homepage was the only route
    // emitting og:locale — social unfurlers (Facebook/LinkedIn/Slack/iMessage)
    // got none for the core date routes, the ones most often shared.
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — tomorrow's sports schedule, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
    description: "Tomorrow's games, spoiler-free. Plan what to watch with match times and previews.",
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — tomorrow's sports schedule, spoiler-free" }],
  },
};

export default function TomorrowPage() {
  return (
    <>
      <HomeContent initialOffset={1} />
      {/* Page graph: a WebPage node linked into the site's shared #website
          entity (declared in layout.tsx) plus its own BreadcrumbList, so Google
          renders a Home › Tomorrow trail in the search result AND reads the
          breadcrumb as this page's rather than an orphan list. The three date
          routes were the only pages still emitting a bare, @id-less
          BreadcrumbList with no WebPage node — every other route (SeoLandingPage,
          /faq, /spoiler-free-sports, the World Cup pages) already uses this
          WebPage→#website / WebPage→#breadcrumb node-linking. Server-rendered:
          this page has no "use client", so the script ships in the static HTML
          for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
                description:
                  "Tomorrow's NBA, MLB, NHL, NFL, and soccer schedule without spoilers. Plan which games to watch — spoiler-free previews and ratings.",
                url: "https://hidescore.com/tomorrow",
                inLanguage: "en",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/tomorrow#breadcrumb" },
                // Topic entities for this page, matching the `about` array every
                // SeoLandingPage WebPage node and the /faq WebPage node already
                // carry — the three date routes were the last content pages still
                // without it. `about` is a valid WebPage property and gives Google
                // explicit entity signals for what the board covers, using the
                // site's own spoiler-free vocabulary. Purely additive JSON-LD; no
                // visual change.
                about: [
                  "spoiler-free sports scores",
                  "sports highlights without spoilers",
                  "sports game ratings",
                ].map((name) => ({ "@type": "Thing", name })),
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/tomorrow#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Tomorrow", item: "https://hidescore.com/tomorrow" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
