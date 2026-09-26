import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import { TEAM_PAGE_LEAGUES, teamPagePath, teamsInLeague } from "@/lib/teamPageLeagues";

// /teams — the hub for the 144 per-team pages (added 2026-09-26), grouped by
// league. Each league section has an id (#nfl, #premier-league …) so a league
// guide can link straight to its own list.

const TITLE = "Team Schedules Without Spoilers | HideScore";
const DESC =
  "Pick your team and follow its games without seeing a score: every NFL, NBA, NHL, MLB and Premier League team, with a spoiler-free schedule and highlights.";
const CANONICAL = "/teams";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore team schedules without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore team schedules without spoilers" }],
  },
};

export default function TeamsHubPage() {
  const muted = { color: "var(--text-muted)" };
  return (
    <main className="mx-auto max-w-3xl px-4 doc-page text-base leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="teams" subject="Teams" />
      <nav aria-label="Breadcrumb" className="mb-2 text-xs" style={muted}>
        <ol className="flex flex-wrap items-center gap-x-1.5">
          <li><Link href="/" className="hover:underline">HideScore</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-medium" style={{ color: "var(--text-secondary)" }}>Teams</li>
        </ol>
      </nav>
      <h1 className="mb-3 text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12]">Team schedules without spoilers</h1>
      <p className="mb-6 text-lg leading-snug" style={{ color: "var(--text-body)" }}>
        Pick a team to see its recent and upcoming games as covered cards, with no score, record or standings on them.
      </p>

      <nav aria-label="Leagues" className="mb-6 flex flex-wrap gap-2 text-sm">
        {TEAM_PAGE_LEAGUES.map((l) => (
          <a key={l.league} href={`#${l.league}`} className="rounded-md px-3 py-1 font-semibold" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {l.label}
          </a>
        ))}
      </nav>

      {TEAM_PAGE_LEAGUES.map((l) => (
        <section key={l.league} id={l.league} className="mb-8 scroll-mt-20">
          <h2 className="mb-3 text-xl font-bold tracking-tight">
            {l.label} teams
            <Link href={l.guide} className="ml-3 text-sm font-normal underline underline-offset-2" style={muted}>
              {l.label} guide
            </Link>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {teamsInLeague(l.league).map((t) => (
              <li key={t.slug}>
                <Link
                  href={teamPagePath(t)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {t.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo} alt="" width={20} height={20} loading="lazy" decoding="async" className="h-5 w-5 shrink-0 object-contain" />
                  )}
                  <span className="min-w-0 flex-1">{t.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/" className="underline underline-offset-2" style={muted}>Back to HideScore</Link>
        <Link href="/spoiler-free-sports" className="underline underline-offset-2" style={muted}>Spoiler-free sports guide</Link>
        <Link href="/faq" className="underline underline-offset-2" style={muted}>FAQ</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: "Team schedules without spoilers",
                description: DESC,
                url: `https://hidescore.com${CANONICAL}`,
                inLanguage: "en",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": `https://hidescore.com${CANONICAL}#breadcrumb` },
              },
              {
                "@type": "BreadcrumbList",
                "@id": `https://hidescore.com${CANONICAL}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Teams", item: `https://hidescore.com${CANONICAL}` },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
