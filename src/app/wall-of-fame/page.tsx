import type { Metadata } from "next";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import WallOfFameRequests from "@/components/WallOfFameRequests";
import { REQUESTED_BUILDS, requestedBuildPeople } from "@/lib/requestedBuilds";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

// Added 2026-10-11 (round 2 of "Built from your requests", which sat on
// /contact from 10/9). People ranked by how many of their requests shipped,
// then every row as a table. Static data only: src/lib/requestedBuilds.ts.
// The suggest button, the initials note and the feedback form they open are
// the one client part (WallOfFameRequests).

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
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore Wall of Fame" }],
  },
  twitter: {
    card: "summary_large_image",
    title: WALL_TITLE,
    description: WALL_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore Wall of Fame" }],
  },
};

export default function WallOfFamePage() {
  const updated = routeLastModified("/wall-of-fame");
  const people = requestedBuildPeople();
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="wall-of-fame" subject="Wall of Fame" />
      {/* Header (2026-10-15): "Wall of Fame" is a proper name, so Title Case,
          with an amber trophy tile (the Fix pill's amber family) and a live
          count. No gradient text, no motion. */}
      <header className="mb-6" data-testid="wall-header">
        <div className="flex items-center gap-3 mb-2">
          <span className="wall-trophy" aria-hidden="true" data-testid="wall-trophy">
            {/* Lucide "trophy" (ISC licence) */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" />
              <path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" />
              <path d="M18 9h1.5a1 1 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" />
              <path d="M6 9H4.5a1 1 0 0 1 0-5H6" />
            </svg>
          </span>
          <h1 className="text-3xl font-bold">Wall of Fame</h1>
        </div>
        <p data-testid="wall-subtitle" style={{ color: "var(--text-secondary)" }}>
          Every item started as a note someone sent us.
        </p>
        <p className="text-sm mt-1" data-testid="wall-meta" style={{ color: "var(--text-muted)" }}>
          {REQUESTED_BUILDS.length} built so far
          {updated ? (
            <>
              {" · Updated "}
              <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
            </>
          ) : null}
        </p>
      </header>

      <section className="space-y-4">
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

        <p>Everyone on this wall gets their next request moved to the top of the list, and 6 months of any future supporter perks free.</p>
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
                  { "@type": "ListItem", position: 2, name: "Wall of Fame", item: "https://hidescore.com/wall-of-fame" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
