import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Today's Sports Scores — No Spoilers | HideScore",
  description:
    "Today's NBA, MLB, NHL, NFL, and soccer games without spoilers. See which games are worth watching before the score is revealed.",
  alternates: { canonical: "/today" },
  openGraph: {
    title: "Today's Sports Scores — No Spoilers | HideScore",
    description: "Today's games, spoiler-free. Ratings tell you what's worth watching.",
    url: "https://hidescore.com/today",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx. A page's
    // openGraph replaces the parent's wholesale (Next merges metadata per top-
    // level field, not deep), so without this the homepage was the only route
    // emitting og:locale — social unfurlers (Facebook/LinkedIn/Slack/iMessage)
    // got none for the core date routes, the ones most often shared.
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — today's sports scores, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Today's Sports Scores — No Spoilers | HideScore",
    description: "Today's games, spoiler-free. Ratings tell you what's worth watching.",
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — today's sports scores, spoiler-free" }],
  },
};

export default function TodayPage() {
  return (
    <>
      <HomeContent initialOffset={0} />
      {/* BreadcrumbList lets Google render a Home › Today trail in the search
          result instead of the bare /today URL — matching the /faq, /privacy,
          /worldcup, and guide pages that already declare the same hierarchy.
          Server-rendered: this page has no "use client", so the script ships in
          the static HTML for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
              { "@type": "ListItem", position: 2, name: "Today", item: "https://hidescore.com/today" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
