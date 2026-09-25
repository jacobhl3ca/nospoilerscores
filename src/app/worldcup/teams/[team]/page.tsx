import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import { notFound } from "next/navigation";
import { getWorldCupTeam, WORLD_CUP_TEAMS } from "@/lib/worldCupTeams";
import { formatWorldCupDay, worldCup2026Ended, worldCupLastMatchYmd } from "@/lib/worldCup2026";

type PageProps = {
  params: Promise<{ team: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return WORLD_CUP_TEAMS.map((team) => ({ team: team.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { team: slug } = await params;
  const team = getWorldCupTeam(slug);
  if (!team) return {};

  const title = `${team.name} World Cup Schedule Without Spoilers | HideScore`;
  const description = `Follow ${team.name} at the 2026 FIFA World Cup without seeing scores first. HideScore prints no match result, and keeps ratings and highlights spoiler-free.`;
  const canonical = `/worldcup/teams/${team.slug}`;

  return {
    title,
    description,
    keywords: [
      `${team.name} World Cup schedule`,
      `${team.name} World Cup highlights no spoilers`,
      `${team.name} score without spoilers`,
      `${team.name} soccer highlights without spoilers`,
      "World Cup no spoilers",
    ],
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `https://hidescore.com${canonical}`,
      siteName: "HideScore",
      // og:locale — matches layout.tsx + the /worldcup hub (Next replaces the
      // parent openGraph wholesale, so each World Cup route must declare its
      // own). Covers all 48 generated team pages.
      locale: "en_US",
      type: "website",
      images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: `${team.name} World Cup coverage without spoilers` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "https://hidescore.com/og-worldcup.png", alt: `${team.name} World Cup coverage without spoilers` }],
    },
  };
}

export default async function WorldCupTeamPage({ params }: PageProps) {
  const { team: slug } = await params;
  const team = getWorldCupTeam(slug);
  if (!team) notFound();

  const canonical = `/worldcup/teams/${team.slug}`;
  const title = `${team.name} World Cup schedule without spoilers`;
  // After the final: a direct link to the board of this team's last match.
  // Read at build time (static export). Date only, never a result.
  const lastMatchYmd = worldCup2026Ended() ? worldCupLastMatchYmd(team.slug) : null;
  const possessive = team.name.endsWith("s") ? `${team.name}'` : `${team.name}'s`;
  const faq = [
    {
      q: `Can I follow ${team.name} at the World Cup without seeing the score?`,
      a: `Yes. HideScore shows ${team.name} World Cup match cards with no score printed on them.`,
    },
    {
      q: `Where can I find ${team.name} World Cup highlights without spoilers?`,
      a: `Start from HideScore's spoiler-free World Cup highlights page. It opens from hidden-score match cards so you do not have to scan result headlines first.`,
    },
    {
      q: `Does HideScore show when ${team.name} plays next?`,
      a: `Yes. The World Cup hub shows today's and upcoming World Cup matches with kickoff information while keeping scores and winners hidden.`,
    },
    {
      q: `Can ratings tell me if a match involving ${team.name} was worth watching?`,
      a: `Yes. After a match finishes, HideScore can show a spoiler-free competitiveness rating so you can choose what to watch without learning who won.`,
    },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route={canonical.replace(/^\//, "")} />
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex h-12 w-16 items-center justify-center rounded-xl text-2xl font-bold" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {team.flag}
        </span>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Follow {team.name} at the 2026 FIFA World Cup without opening a scoreboard that gives away the result.
        HideScore prints no score or winner, and it masks highlight titles that would give the result away.
      </p>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Use this as a safe starting page for {team.name} match days, delayed viewing, and post-game highlights.
        {team.rank ? ` FIFA ranking snapshot: #${team.rank}.` : ""}
      </p>

      <div
        className="mt-6 rounded-xl px-5 py-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-lg font-semibold mb-3">Follow {team.name} spoiler-free</h2>
        {lastMatchYmd && (
          // A plain <a> so /worldcup does a full load and reads ?d= on mount.
          <a
            href={`/worldcup?d=${lastMatchYmd}`}
            data-umami-event="wc-team-last-match"
            className="mb-2 block rounded-lg px-3 py-2 text-sm font-semibold text-center"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Open {possessive} last match, {formatWorldCupDay(lastMatchYmd)}
          </a>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/worldcup"
            data-umami-event="wc-team-open-hub"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-center"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Open World Cup hub
          </Link>
          <Link
            href="/worldcup/tomorrow"
            data-umami-event="wc-team-open-tomorrow"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-center"
            style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Tomorrow&apos;s matches
          </Link>
          <Link
            href="/worldcup/highlights"
            data-umami-event="wc-team-open-highlights"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-center"
            style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Spoiler-free highlights
          </Link>
          <Link
            href="/watch-world-cup-without-spoilers"
            data-umami-event="wc-team-open-guide"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-center"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--accent)" }}
          >
            Watch guide
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">What stays hidden</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        <li>No {team.name} score or winner is printed on the board.</li>
        <li>Completed match ratings do not reveal who won.</li>
        <li>Highlight entry points avoid result-first headlines where possible.</li>
        <li>Today, tomorrow, and recent-match views are linked from one spoiler-safe path.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-8 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={{ color: "var(--text-muted)" }}>{item.a}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/worldcup/teams" data-umami-event="wc-team-footer-all-teams" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          All teams
        </Link>
        <Link href="/worldcup" data-umami-event="wc-team-footer-hub" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          World Cup hub
        </Link>
        <Link href="/soccer-highlights-without-spoilers" data-umami-event="wc-team-footer-soccer-highlights" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Soccer highlights
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: title,
                description: `Spoiler-free ${team.name} World Cup schedule, ratings, and highlights on HideScore.`,
                url: `https://hidescore.com${canonical}`,
                // Declare the page's content language, matching <html lang="en">
                // and the inLanguage signal already on the WebPage nodes for the
                // SEO landing pages (SeoLandingPage) and the site-level WebSite /
                // WebApplication nodes (layout). Keeps every WebPage node's locale
                // signal consistent across the site.
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
                // the same @graph node-linking the WebPage→WebSite isPartOf above
                // and the SeoLandingPage WebPage uses. The BreadcrumbList was the
                // one sibling node left unlinked here — a bare, @id-less list
                // floating beside the page it describes. `breadcrumb` is a valid
                // WebPage property, and tying it to the page node is Google's
                // recommended shape for the breadcrumb rich result.
                breadcrumb: { "@id": `https://hidescore.com${canonical}#breadcrumb` },
                about: [
                  // Reference the fuller standalone SportsTeam node below by
                  // @id rather than re-declaring a thinner (no memberOf) copy
                  // here. Both live in the same @graph, so this deduplicates
                  // the team to one entity — the same node-linking pattern the
                  // WebSite isPartOf ref above uses — instead of leaving two
                  // separate SportsTeam nodes for the same team on the page.
                  { "@id": `https://hidescore.com${canonical}#team` },
                  { "@type": "SportsEvent", name: "2026 FIFA World Cup" },
                  { "@type": "Thing", name: "spoiler-free sports scores" },
                ],
              },
              {
                "@type": "SportsTeam",
                "@id": `https://hidescore.com${canonical}#team`,
                name: team.name,
                sport: "Soccer",
                memberOf: { "@type": "SportsOrganization", name: "FIFA World Cup" },
              },
              {
                "@type": "BreadcrumbList",
                // Stable per-page @id so the WebPage node above can reference this
                // exact list (Google merges the page's JSON-LD into one graph, so
                // the ref resolves here). Keyed on the canonical path so each of
                // the 48 generated team pages gets its own unambiguous node.
                "@id": `https://hidescore.com${canonical}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
                  { "@type": "ListItem", position: 3, name: "Teams", item: "https://hidescore.com/worldcup/teams" },
                  { "@type": "ListItem", position: 4, name: team.name, item: `https://hidescore.com${canonical}` },
                ],
              },
              {
                "@type": "FAQPage",
                // Tie this node to the same page URL as the WebPage node above
                // and into the shared WebSite entity. FAQPage is a WebPage
                // subtype, so without a `url`/`isPartOf` it floated as a SECOND,
                // disconnected page node beside the WebPage describing the exact
                // same address — the lone sibling in this @graph still left
                // unlinked, after the WebPage→#website and WebPage→#breadcrumb
                // refs above already tied the rest together. Anchoring it to the
                // canonical URL + #website (the same node-linking pattern the
                // WebPage/BreadcrumbList use) makes the two page nodes read as
                // one entity for this URL across all 48 generated team pages —
                // matching the SeoLandingPage FAQPage fix.
                url: `https://hidescore.com${canonical}`,
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Same locale signal as the WebPage node above, matching the
                // inLanguage the FAQPage nodes already carry on SeoLandingPage
                // and /faq.
                inLanguage: "en",
                mainEntity: faq.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
