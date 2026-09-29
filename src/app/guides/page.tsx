import type { Metadata } from "next";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import { GUIDE_GROUPS, GUIDE_ROUTES } from "@/lib/guidesIndex";

// Added 2026-09-28. Every spoiler-free guide on one page, grouped by sport. It
// replaces the homepage footer's "Guides" popup (a <details> panel of SEO copy
// and one long run-on sentence of links): Jacob asked for Guides to be a page
// like About and FAQ. The intro keeps the first two paragraphs of that popup
// word for word, since they carry the keywords. The list is GUIDE_GROUPS, which
// tests/guides-index.test.ts checks against src/app and the sitemap.

const TITLE = "Spoiler-free sports guides | HideScore";
const DESC =
  "Every HideScore guide in one place: how to follow the NFL, NBA, MLB, NHL, soccer, F1, UFC, rugby and cricket without seeing a score, plus how-tos and comparisons.";

// Build day (YYYY-MM-DD, New York), set in next.config.ts. Unset in tests.
const BUILT_ON = process.env.NEXT_PUBLIC_BUILT_ON;
// "September 28, 2026". Noon UTC is the same calendar day in New York.
const formatBuiltOn = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/guides" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://hidescore.com/guides",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — spoiler-free sports scores" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores" }],
  },
};

export default function GuidesPage() {
  const muted = { color: "var(--text-muted)" };
  const body = { color: "var(--text-body)" };
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="guides" subject="Guides" />
      <h1 className="text-2xl font-bold mb-4">Spoiler-free guides</h1>

      <p className="mb-4" style={body}>
        HideScore is the spoiler-free way to follow sports. Check scores for the NBA, NFL, NHL, MLB, MLS, the Premier
        League, La Liga, Serie A, the Bundesliga, Ligue 1, the Champions League, the 2026 World Cup and golf without ever
        seeing who won — no score or result is written on the board at all.
      </p>
      <p className="mb-6" style={body}>
        Before you commit to a replay, switch on our competitiveness rating and it tells you whether a game was a
        blowout or an instant classic, so you can watch the best sports highlights without spoilers and skip the duds —
        all without learning the final score.
      </p>

      {GUIDE_GROUPS.map((group) => {
        const id = `guides-${group.sport.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <section key={group.sport} aria-labelledby={id} className="mb-6">
            <h2 id={id} className="text-lg font-semibold mb-2">
              {group.sport}
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              {group.guides.map((g) => (
                <li key={g.href}>
                  <a href={g.href} className="underline underline-offset-2 hover:opacity-80">
                    {g.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {BUILT_ON ? (
        <p className="text-sm" style={muted}>
          Updated <time dateTime={BUILT_ON}>{formatBuiltOn(BUILT_ON)}</time>
        </p>
      ) : null}

      <DocFooter route="guides" />

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
                url: "https://hidescore.com/guides",
                inLanguage: "en",
                ...(BUILT_ON ? { dateModified: BUILT_ON } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/guides#breadcrumb" },
                mainEntity: { "@id": "https://hidescore.com/guides#list" },
              },
              {
                "@type": "ItemList",
                "@id": "https://hidescore.com/guides#list",
                numberOfItems: GUIDE_ROUTES.length,
                itemListElement: GUIDE_GROUPS.flatMap((g) => g.guides).map((g, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: g.label,
                  url: `https://hidescore.com${g.href}`,
                })),
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/guides#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Guides", item: "https://hidescore.com/guides" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
