import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
  description:
    "Tomorrow's NBA, MLB, NHL, and NFL schedule without spoilers. Plan which games to watch — spoiler-free previews and ratings.",
  alternates: { canonical: "/tomorrow" },
  openGraph: {
    title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
    description: "Tomorrow's games, spoiler-free.",
    url: "https://hidescore.com/tomorrow",
    siteName: "HideScore",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — tomorrow's sports schedule, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
    description: "Tomorrow's games, spoiler-free.",
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — tomorrow's sports schedule, spoiler-free" }],
  },
};

export default function TomorrowPage() {
  return (
    <>
      <HomeContent initialOffset={1} />
      {/* BreadcrumbList lets Google render a Home › Tomorrow trail in the search
          result instead of the bare /tomorrow URL — matching the /faq, /privacy,
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
              { "@type": "ListItem", position: 2, name: "Tomorrow", item: "https://hidescore.com/tomorrow" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
