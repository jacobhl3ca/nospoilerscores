import type { Metadata } from "next";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import SponsorsBody from "@/components/SponsorsBody";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";
import { supportLiveOn } from "@/lib/supportLinks";

// Added 2026-10-15: paid sponsors and Patreon patrons, kept OFF /wall-of-fame
// (the wall is for people who asked for builds). Data: src/lib/sponsors.ts.
// Hidden until SUPPORT_LIVE_FROM (Dec 15): the body is gated in the browser
// (SponsorsBody); the sitemap entry, footer link, llms.txt line and the
// robots tag below are gated at build time, so the first deploy on or after
// the date opens them.

const SPONSORS_TITLE = "Sponsors | HideScore";
const SPONSORS_DESC =
  "HideScore is free. The sponsors and patrons on this page keep it that way.";

const liveAtBuild = supportLiveOn();

export const metadata: Metadata = {
  title: SPONSORS_TITLE,
  description: SPONSORS_DESC,
  alternates: { canonical: "/sponsors" },
  ...(liveAtBuild ? {} : { robots: { index: false } }),
  openGraph: {
    title: SPONSORS_TITLE,
    description: SPONSORS_DESC,
    url: "https://hidescore.com/sponsors",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore sponsors" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SPONSORS_TITLE,
    description: SPONSORS_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore sponsors" }],
  },
};

export default function SponsorsPage() {
  const updated = routeLastModified("/sponsors");
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="sponsors" subject="Sponsors" />
      <h1 className="text-2xl font-bold mb-2">Sponsors</h1>
      {updated ? (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <SponsorsBody liveAtBuild={liveAtBuild} />

      <DocFooter route="sponsors" />

      {/* WebPage linked into the site's #website entity (layout.tsx) plus its
          own BreadcrumbList, like every other doc route. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: SPONSORS_TITLE,
                description: SPONSORS_DESC,
                url: "https://hidescore.com/sponsors",
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/sponsors#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/sponsors#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Sponsors", item: "https://hidescore.com/sponsors" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
