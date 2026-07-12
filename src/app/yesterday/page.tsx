import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Yesterday's Sports Scores — No Spoilers | HideScore",
  description:
    "Yesterday's NBA, MLB, NHL, NFL, and soccer games without spoilers. Catch up on completed games — scores hidden, highlights one tap away.",
  alternates: { canonical: "/yesterday" },
  openGraph: {
    title: "Yesterday's Sports Scores — No Spoilers | HideScore",
    description: "Yesterday's completed games, spoiler-free. Tap to see scores or watch highlights.",
    url: "https://hidescore.com/yesterday",
    siteName: "HideScore",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — yesterday's sports scores, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Yesterday's Sports Scores — No Spoilers | HideScore",
    description: "Yesterday's completed games, spoiler-free. Tap to see scores or watch highlights.",
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — yesterday's sports scores, spoiler-free" }],
  },
};

export default function YesterdayPage() {
  return (
    <>
      <HomeContent initialOffset={-1} />
      {/* BreadcrumbList lets Google render a Home › Yesterday trail in the search
          result instead of the bare /yesterday URL — matching the /faq, /privacy,
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
              { "@type": "ListItem", position: 2, name: "Yesterday", item: "https://hidescore.com/yesterday" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
