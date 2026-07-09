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
    type: "website",
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore - 2026 World Cup teams without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore - 2026 World Cup teams without spoilers" }],
  },
};

export default function WorldCupTeamsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <h1 className="text-2xl font-bold mb-4">2026 World Cup teams without spoilers</h1>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Pick a country to follow its World Cup schedule, match cards, and highlights without opening a result-first
        scoreboard. Scores stay hidden until you choose to reveal them.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {WORLD_CUP_TEAMS.map((team) => (
          <Link
            key={team.slug}
            href={`/worldcup/teams/${team.slug}`}
            className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-2"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <span aria-hidden="true" className="inline-flex h-6 w-8 items-center justify-center rounded-md text-sm" style={{ background: "var(--bg-card-hover)" }}>
              {team.flag}
            </span>
            <span className="min-w-0 flex-1">
              {team.name}
              {team.rank ? <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>#{team.rank}</span> : null}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/worldcup" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          World Cup hub
        </Link>
        <Link href="/worldcup/tomorrow" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Tomorrow
        </Link>
        <Link href="/worldcup/highlights" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
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
                isPartOf: { "@type": "WebSite", name: "HideScore", url: "https://hidescore.com" },
              },
              {
                "@type": "BreadcrumbList",
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
