import type { Metadata } from "next";
import Link from "next/link";
import { WORLD_CUP_TEAMS } from "@/lib/worldCupTeams";

const TITLE = "2026 World Cup Teams - Spoiler-Free Schedules | HideScore";
const DESC =
  "Browse every 2026 World Cup team and open a spoiler-free schedule, highlights, and hidden-score viewing guide for each country.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/worldcup/teams" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://hidescore.com/worldcup/teams",
    siteName: "HideScore",
    // og:locale — matches layout.tsx + the /worldcup hub (Next replaces the
    // parent openGraph wholesale, so each World Cup route must declare its own).
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore — 2026 World Cup teams without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore — 2026 World Cup teams without spoilers" }],
  },
};

export default function WorldCupTeamsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <h1 className="text-2xl font-bold mb-4">2026 World Cup teams without spoilers</h1>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Pick a country to follow its World Cup schedule, match cards, and highlights without opening a result-first
        scoreboard. No score is printed on any of them.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {WORLD_CUP_TEAMS.map((team) => (
          <Link
            key={team.slug}
            href={`/worldcup/teams/${team.slug}`}
            data-umami-event={`wc-teams-open-${team.slug}`}
            className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <span aria-hidden="true" className="inline-flex h-6 w-8 items-center justify-center rounded-md text-sm" style={{ background: "var(--bg-card-hover)" }}>
              {team.flag}
            </span>
            <span className="min-w-0 flex-1">
              {team.name}
              {team.rank ? (
                // The bare "#12" is part of the link's accessible name, so a
                // screen reader announces "United States number 12" with no hint
                // it's a FIFA ranking (the detail page spells it out as "FIFA
                // ranking snapshot: #12"; this grid never did). Voice the "#N"
                // glyph as "FIFA rank N" and hide the visual token from AT —
                // same aria-hidden + sr-only split the loading state uses in
                // HomeContent — so the label reads clearly with no visual change.
                <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>
                  <span aria-hidden="true">#{team.rank}</span>
                  <span className="sr-only">FIFA rank {team.rank}</span>
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/worldcup" data-umami-event="wc-teams-footer-hub" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          World Cup hub
        </Link>
        <Link href="/worldcup/tomorrow" data-umami-event="wc-teams-footer-tomorrow" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Tomorrow
        </Link>
        <Link href="/worldcup/highlights" data-umami-event="wc-teams-footer-highlights" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Highlights
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: TITLE,
                description: DESC,
                url: "https://hidescore.com/worldcup/teams",
                // Declare the page's content language, matching the inLanguage
                // signal every other WebPage node on the site carries (the
                // WebApplication/WebSite in layout, the shared SeoLandingPage
                // component, and the sibling /worldcup/teams/<slug> CollectionPage).
                // CollectionPage is a WebPage subtype, so this is a valid locale hint.
                inLanguage: "en",
                // Reference the site-level WebSite node by @id (declared in
                // layout.tsx's root JSON-LD @graph) rather than re-declaring a
                // second, @id-less WebSite here. The root layout renders on
                // every page, so Google merges both blocks into one graph and
                // this resolves to the single shared WebSite entity — the same
                // node-linking the SeoLandingPage WebPage uses — instead of
                // leaving two duplicate WebSite entities for hidescore.com.
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Point this page at its own BreadcrumbList node (below) by @id,
                // the same @graph node-linking the WebPage→#website isPartOf above
                // and every other route already uses. The BreadcrumbList was the
                // one sibling node left unlinked here — a bare, @id-less list
                // floating beside the page it describes, so Google read the trail
                // as disconnected from this CollectionPage. `breadcrumb` is a valid
                // WebPage property (CollectionPage is a WebPage subtype), and tying
                // it to the page node is Google's recommended shape for the
                // breadcrumb rich result — matching the /privacy, /worldcup/highlights,
                // and /worldcup/tomorrow fixes. This was the last collection/WebPage
                // route still emitting an orphan BreadcrumbList.
                breadcrumb: { "@id": "https://hidescore.com/worldcup/teams#breadcrumb" },
                // Enumerate the team links this page renders so crawlers can
                // discover every /worldcup/teams/<slug> detail page from the
                // structured data, not just the visible <a> grid. Mirrors the
                // on-page order (FIFA rank) via ListItem.position.
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: WORLD_CUP_TEAMS.length,
                  itemListElement: WORLD_CUP_TEAMS.map((team, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    name: team.name,
                    url: `https://hidescore.com/worldcup/teams/${team.slug}`,
                  })),
                },
              },
              {
                "@type": "BreadcrumbList",
                // Stable @id so the CollectionPage node above can reference this
                // exact list (Google merges the page's JSON-LD into one graph, so
                // the ref resolves here) instead of leaving the trail orphaned.
                "@id": "https://hidescore.com/worldcup/teams#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
                  { "@type": "ListItem", position: 3, name: "Teams", item: "https://hidescore.com/worldcup/teams" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
