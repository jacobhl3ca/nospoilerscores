import type { Metadata } from "next";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import WallOfFameRequests from "@/components/WallOfFameRequests";
import { requestedBuildPeople } from "@/lib/requestedBuilds";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

// Added 2026-10-11 (round 2 of "Built from your requests", which sat on
// /contact from 10/9). People ranked by how many of their requests shipped,
// then every row as a table. Static data only: src/lib/requestedBuilds.ts.
// The suggest button, the "This was me" links and the feedback form they open
// are the one client part (WallOfFameRequests).

const WALL_TITLE = "Wall of Fame: Built From Your Requests | HideScore";
const WALL_DESC =
  "Every league, feature and fix on this list started as a note from someone using HideScore. See what got built and who asked, then suggest the next one.";

export const metadata: Metadata = {
  title: WALL_TITLE,
  description: WALL_DESC,
  alternates: { canonical: "/wall-of-fame" },
  openGraph: {
    title: WALL_TITLE,
    description: WALL_DESC,
    url: "https://hidescore.com/wall-of-fame",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore wall of fame" }],
  },
  twitter: {
    card: "summary_large_image",
    title: WALL_TITLE,
    description: WALL_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore wall of fame" }],
  },
};

export default function WallOfFamePage() {
  const updated = routeLastModified("/wall-of-fame");
  const people = requestedBuildPeople();
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="wall-of-fame" subject="Wall of fame" />
      <h1 className="text-2xl font-bold mb-2">Wall of fame</h1>
      {updated ? (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <section className="space-y-4">
        <p>Every item started as a note someone sent us.</p>

        <ol className="space-y-1" data-testid="wall-ranked">
          {people.map((p, i) => (
            <li key={p.who} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline">
              <span style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
              <span>
                <strong>{p.who}</strong>
                {` · ${p.count} built`}
              </span>
            </li>
          ))}
        </ol>

        <p>Everyone on this wall gets their next request moved to the top of the list, and 6 months of any supporter perks free.</p>
      </section>

      <WallOfFameRequests />

      <DocFooter route="wall-of-fame" />

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
                name: WALL_TITLE,
                description: WALL_DESC,
                url: "https://hidescore.com/wall-of-fame",
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/wall-of-fame#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/wall-of-fame#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Wall of fame", item: "https://hidescore.com/wall-of-fame" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
