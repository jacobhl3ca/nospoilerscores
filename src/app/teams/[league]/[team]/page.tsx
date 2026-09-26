import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DocTopBar from "@/components/DocTopBar";
import TeamSchedulePreview, { FollowTeamButton } from "@/components/TeamSchedulePreview";
import { TEAM_PAGES, type TeamPage } from "@/lib/teamPages";
import { getTeamPage, leagueMeta, teamPagePath, teamsInLeague, teamWithArticle, type TeamPageLeagueMeta } from "@/lib/teamPageLeagues";

// /teams/<league>/<team> — one page per NFL, NBA, NHL, MLB and Premier League
// team, 144 in all (added 2026-09-26). Why: team-name searches ("knicks games
// without spoilers") had nowhere on the site to land; the World Cup team pages
// were the template.
//
// ⚠️ Not a doorway page. Every one carries REAL per-team content: the team's
// own last 5 and next 5 games, fetched live on the client and drawn with the
// board's GameCard (TeamSchedulePreview), plus team-specific static facts
// baked from ESPN (league, division, conference, home venue, city). A page
// that is only a renamed paragraph is not acceptable here — keep it that way.
//
// App truth for the copy, same as the note atop the Champions League page: the
// card prints no score and nothing reveals one on tap; ratings are opt-in.

type PageProps = {
  params: Promise<{ league: string; team: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return TEAM_PAGES.map((t) => ({ league: t.league, team: t.slug }));
}

const BASE = "https://hidescore.com";

function faqFor(team: TeamPage, meta: TeamPageLeagueMeta) {
  const the = teamWithArticle(team);
  const theirs = the.endsWith("s") ? `${the}'` : `${the}'s`;
  const home = team.venue ? ` Home games are at ${team.venue}${team.city ? ` in ${team.city}` : ""}.` : "";
  return [
    {
      q: `When do ${the} play next?`,
      a: `This page lists ${theirs} next five ${meta.label} games with the date, the start time in Eastern Time, home or away, and the TV or streaming broadcaster. It reads the schedule live, so it stays current through the ${meta.label} season, which runs ${meta.season}.${home}`,
    },
    {
      q: `Where can I watch ${team.name} highlights without spoilers?`,
      a: `On a finished game's card, HideScore offers a highlight button when a clip is available and plays it in its own player, with the video title covered where the title would give the result away. You do not have to scroll a results page or a YouTube list to find it.`,
    },
    {
      q: `Do ${team.name} results show on HideScore?`,
      a: `No. A finished ${team.name} game shows as a plain card: the opponent, the date and whether it has ended. No score is printed on it, and there is no control that reveals one on tap. This page also leaves out the team's record and its place in the standings.`,
    },
    {
      q: `Can HideScore tell me if a ${team.name} game was worth watching?`,
      a: `Yes, if you turn ratings on. Ratings are opt-in: a finished game can carry a Great, Good, Meh or Skip badge that says how close and eventful it was without saying who won. Follow ${the} and their games sort to the top of the ${meta.label} column on the board.`,
    },
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { league, team: slug } = await params;
  const team = getTeamPage(league, slug);
  const meta = leagueMeta(league);
  if (!team || !meta) return {};

  const title = `${team.name} Games Without Spoilers: Schedule, No Scores | HideScore`;
  const description = `${team.name} ${meta.label} schedule without spoilers: recent and upcoming games with no score, record or standings shown, spoiler-safe highlights and opt-in ratings.`;
  const canonical = teamPagePath(team);

  return {
    title,
    description,
    keywords: [
      `${team.name} games without spoilers`,
      `${team.name} no spoilers`,
      `${team.name} highlights without spoilers`,
      `${team.name} schedule`,
      `${team.shortName} spoiler free`,
    ],
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${BASE}${canonical}`,
      siteName: "HideScore",
      // Next replaces the parent openGraph wholesale, so declare the locale here too.
      locale: "en_US",
      type: "website",
      images: [{ url: `${BASE}/og-image.png`, width: 1200, height: 630, alt: `${team.name} games without spoilers` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: `${BASE}/og-image.png`, alt: `${team.name} games without spoilers` }],
    },
  };
}

export default async function TeamPageRoute({ params }: PageProps) {
  const { league, team: slug } = await params;
  const team = getTeamPage(league, slug);
  const meta = leagueMeta(league);
  if (!team || !meta) notFound();

  const canonical = teamPagePath(team);
  const url = `${BASE}${canonical}`;
  const the = teamWithArticle(team);
  const faq = faqFor(team, meta);
  const h1 = `${team.name} games without spoilers`;
  const rivals = teamsInLeague(team.league).filter((t) => t.slug !== team.slug && t.division && t.division === team.division);
  const muted = { color: "var(--text-muted)" };
  const body = { color: "var(--text-body)" };

  const facts: { k: string; v: string }[] = [
    { k: "League", v: meta.label },
    ...(team.conference ? [{ k: "Conference", v: team.conference }] : []),
    ...(team.division ? [{ k: "Division", v: team.division }] : []),
    ...(team.venue ? [{ k: "Home venue", v: team.venue }] : []),
    ...(team.city ? [{ k: "City", v: team.city }] : []),
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-base leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route={canonical.replace(/^\//, "")} subject={team.name} />

      <nav aria-label="Breadcrumb" className="mb-2 text-xs" style={muted}>
        <ol className="flex flex-wrap items-center gap-x-1.5">
          <li><Link href="/" className="hover:underline">HideScore</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link href="/teams" className="hover:underline">Teams</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link href={meta.guide} className="hover:underline">{meta.label}</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-medium" style={{ color: "var(--text-secondary)" }}>{team.name}</li>
        </ol>
      </nav>

      <div className="mb-3 flex items-center gap-3">
        {team.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt="" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
        )}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12]">{h1}</h1>
      </div>
      <p className="mb-5 text-lg leading-snug" style={body}>
        Follow {the} through the {meta.label} season without learning a result first. Every game below is a covered
        card: opponent, date, start time and broadcaster, with no score, no record and no standings.
      </p>

      <TeamSchedulePreview sport={team.sport} rawId={team.rawId} teamName={team.name} leagueLabel={meta.label} />

      <div className="mb-8 rounded-xl px-5 py-5 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="font-semibold mb-3">Put {the} at the top of the {meta.label} column.</p>
        <FollowTeamButton teamId={`${team.sport}-${team.rawId}`} label={`Follow ${the} on HideScore`} />
      </div>

      <h2 className="text-xl font-bold tracking-tight mb-3">{team.name} at a glance</h2>
      <dl className="mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[15px]" style={body}>
        {facts.map((f) => (
          <div key={f.k} className="contents">
            <dt className="font-semibold" style={{ color: "var(--text)" }}>{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="text-xl font-bold tracking-tight mt-9 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={body}>{item.a}</p>
          </div>
        ))}
      </section>

      {rivals.length > 0 && (
        <>
          <h2 className="text-xl font-bold tracking-tight mt-9 mb-3">More {team.division} teams</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
            {rivals.map((t) => (
              <li key={t.slug}>
                <Link href={teamPagePath(t)} className="underline underline-offset-2" style={body}>{t.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/teams" data-umami-event="team-page-footer-all-teams" className="underline underline-offset-2" style={muted}>
          All teams
        </Link>
        <Link href={meta.guide} data-umami-event="team-page-footer-guide" className="underline underline-offset-2" style={muted}>
          {meta.label} without spoilers
        </Link>
        <Link href="/" data-umami-event="team-page-footer-board" className="underline underline-offset-2" style={muted}>
          Back to HideScore
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
                name: h1,
                description: `Spoiler-free ${team.name} schedule and highlights on HideScore.`,
                url,
                inLanguage: "en",
                // Same @id node-linking as the World Cup team pages: the
                // site-level WebSite (layout.tsx), this page's breadcrumb and
                // the SportsTeam node below.
                isPartOf: { "@id": `${BASE}/#website` },
                breadcrumb: { "@id": `${url}#breadcrumb` },
                about: [{ "@id": `${url}#team` }, { "@type": "Thing", name: "spoiler-free sports scores" }],
              },
              {
                "@type": "SportsTeam",
                "@id": `${url}#team`,
                name: team.name,
                sport: meta.schemaSport,
                memberOf: { "@type": "SportsOrganization", name: meta.schemaLeague },
                ...(team.logo ? { logo: team.logo } : {}),
                url,
                ...(team.venue
                  ? { location: { "@type": "Place", name: team.venue, ...(team.city ? { address: team.city } : {}) } }
                  : {}),
              },
              {
                "@type": "BreadcrumbList",
                "@id": `${url}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: BASE },
                  { "@type": "ListItem", position: 2, name: "Teams", item: `${BASE}/teams` },
                  { "@type": "ListItem", position: 3, name: meta.label, item: `${BASE}${meta.guide}` },
                  { "@type": "ListItem", position: 4, name: team.name, item: url },
                ],
              },
              {
                "@type": "FAQPage",
                url,
                isPartOf: { "@id": `${BASE}/#website` },
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
