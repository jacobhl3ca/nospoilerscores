import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";

// ⚠️ Corrected 2026-09-20. This page said the score is "hidden first, then
// revealed only when you ask". It is not: nothing outside GolfLeaderboard reads
// Team.score, so a score is never rendered and there is nothing to uncover.
// News HEADLINES and media DO blur and un-blur on a tap (revealNewsTitles /
// revealNewsMedia in preferences.ts) — that part is real, and is the only
// tap-to-reveal in the app. Ratings are opt-in (showRatings: false; the default
// "auto" mode holds them off before noon ET).
const TITLE = "Spoiler-Free Sports Scores and Highlights | HideScore";
const DESC =
  "HideScore is a spoiler-free sports app for NBA, NFL, NHL, MLB, soccer, golf, and World Cup fans. No score is printed anywhere, and headlines and thumbnails stay blurred until you choose to reveal them.";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does spoiler-free sports mean?",
    a: "Spoiler-free sports means you can check schedules, game cards, highlights, and ratings without the final score or the winner ever appearing on the page.",
  },
  {
    q: "Which sports does HideScore cover?",
    a: "HideScore covers NBA, NFL, NHL, MLB, soccer, golf, college basketball, and the 2026 World Cup. No score is rendered for any of them, and highlights are available for completed games.",
  },
  {
    q: "Can I find good games without seeing the score?",
    a: "Yes. Switch Ratings on in Settings and the competitiveness rating shows whether a finished game was close, dramatic, or one-sided, with no mention of the winner or the final score. Ratings start off, and the default setting holds them back until noon Eastern.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free, has no ads, and works in any browser. There is also a free app on the App Store and on Google Play.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "spoiler free sports",
    "spoiler-free sports",
    "spoiler free sports scores",
    "spoiler free sports highlights",
    "no spoiler sports",
    "sports scores without spoilers",
    "hide sports scores",
  ],
  alternates: { canonical: "/spoiler-free-sports" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://hidescore.com/spoiler-free-sports",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date/SEO-landing routes. A page's openGraph replaces the parent's
    // wholesale (Next merges metadata per top-level field, not deep), so without
    // this this page emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage). en_US is the OG-spec format (underscore, not "en").
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://hidescore.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "HideScore — spoiler-free sports scores and highlights",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores and highlights" }],
  },
};

export default function SpoilerFreeSportsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="spoiler-free-sports" subject="Spoiler-free guide" />
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <h1 className="text-2xl font-bold mb-4">Spoiler-free sports scores and highlights</h1>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        HideScore is built for fans who want spoiler free sports without the usual scoreboard trap. No score or result
        is printed on the board at all, and winner headlines and highlight thumbnails stay blurred until you decide to
        reveal them.
      </p>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Use it for NBA, NFL, NHL, MLB, soccer, golf, college basketball, and the 2026 World Cup. You can check what is
        on today, plan tomorrow&apos;s games, catch up on yesterday&apos;s highlights, and avoid learning the ending before you
        press play.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">Why sports spoilers are different</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Most sports sites treat the final score as the headline. That works when you watched live, but it ruins the game
        if you are catching up after work, following a different time zone, or deciding which replay is worth two hours.
        HideScore flips the default: the score is never written down, and the headlines that would give it away start
        blurred.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">Find the best games without the result</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        An unscored board alone is not enough. Turn Ratings on in Settings and completed games carry a competitiveness
        rating, so you can spot the instant classics and skip the blowouts without learning who won. That makes it
        useful for full replays, condensed games, and spoiler-free sports highlights.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-3">What you can check spoiler-free</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        <li>Today&apos;s games, with no score printed on any of them.</li>
        <li>Tomorrow&apos;s schedule, kickoff times, and matchups.</li>
        <li>Yesterday&apos;s completed games and highlight links.</li>
        <li>Optional competitiveness ratings that never name the winner.</li>
        <li>News and recaps after you are ready to see more context.</li>
      </ul>

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Open HideScore and never see a score you did not go looking for.</p>
        <Link
          href="/"
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event="seo-spoiler-free-sports-open-home"
        >
          See spoiler-free scores
        </Link>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/watch-sports-highlights-without-spoilers" className="underline underline-offset-2">
            Highlights
          </Link>
          <Link href="/no-spoiler-scores" className="underline underline-offset-2">
            No-spoiler scores
          </Link>
          <Link href="/mlb-highlights-without-spoilers" className="underline underline-offset-2">
            MLB
          </Link>
          <Link href="/nfl-highlights-without-spoilers" className="underline underline-offset-2">
            NFL
          </Link>
          <Link href="/soccer-highlights-without-spoilers" className="underline underline-offset-2">
            Soccer
          </Link>
          {/* Premier League (shipped 2026-08-08) and Liga MX (2026-08-03) are
              per-league pages whose ONLY inbound link was the soccer page's
              footer — same orphan risk the Cricket note below calls out. This
              hub is the strongest internal link source (every SeoLandingPage
              footer points here), so listing them here strengthens crawling and
              ranking. Grouped right after Soccer to cluster the football pages. */}
          <Link href="/premier-league-without-spoilers" className="underline underline-offset-2">
            Premier League
          </Link>
          <Link href="/liga-mx-scores-without-spoilers" className="underline underline-offset-2">
            Liga MX
          </Link>
          <Link href="/nba-scores-without-spoilers" className="underline underline-offset-2">
            NBA
          </Link>
          <Link href="/nhl-scores-without-spoilers" className="underline underline-offset-2">
            NHL
          </Link>
          {/* NHL highlights shipped 2026-08-15 and gets its own entry rather than
              riding on the NHL scores link above: they are separate routes for
              separate intents, and the highlights one was built specifically to
              catch a query the homepage was absorbing. Listing only one of them
              here would leave the new page with a single inbound link. */}
          <Link href="/nhl-highlights-without-spoilers" className="underline underline-offset-2">
            NHL highlights
          </Link>
          {/* Cricket shipped 2026-08-03 as a sitemap-only page with ZERO inbound
              internal links — an orphan, which crawlers reach late and rank
              poorly. Liga MX got its link from the soccer page; this is
              cricket's. Any new per-league landing page needs one of these. */}
          <Link href="/cricket-highlights-without-spoilers" className="underline underline-offset-2">
            Cricket
          </Link>
          {/* The 2026-09-20 batch: seven new per-league routes plus the
              comparison page. Same reason as the Cricket and Premier League
              notes above — this hub is the strongest internal link source on
              the site, and a per-league page that ships with only a sitemap
              entry is an orphan. Every one of them is listed here on its first
              day rather than waiting for a later pass. */}
          <Link href="/nba-highlights-without-spoilers" className="underline underline-offset-2">
            NBA highlights
          </Link>
          <Link href="/champions-league-without-spoilers" className="underline underline-offset-2">
            Champions League
          </Link>
          {/* 2026-09-26: the other three UEFA competition routes, linked here on
              their first day for the same orphan reason as the batch above. */}
          <Link href="/europa-league-without-spoilers" className="underline underline-offset-2">
            Europa League
          </Link>
          <Link href="/conference-league-without-spoilers" className="underline underline-offset-2">
            Conference League
          </Link>
          <Link href="/nations-league-without-spoilers" className="underline underline-offset-2">
            Nations League
          </Link>
          <Link href="/la-liga-without-spoilers" className="underline underline-offset-2">
            La Liga
          </Link>
          <Link href="/mls-highlights-without-spoilers" className="underline underline-offset-2">
            MLS
          </Link>
          <Link href="/college-football-highlights-without-spoilers" className="underline underline-offset-2">
            College football
          </Link>
          <Link href="/f1-without-spoilers" className="underline underline-offset-2">
            F1
          </Link>
          <Link href="/ufc-results-without-spoilers" className="underline underline-offset-2">
            UFC
          </Link>
          <Link href="/best-spoiler-free-sports-sites" className="underline underline-offset-2">
            Compare the apps
          </Link>
          <Link href="/today" className="underline underline-offset-2">
            Today
          </Link>
          <Link href="/yesterday" className="underline underline-offset-2">
            Yesterday
          </Link>
          <Link href="/worldcup" className="underline underline-offset-2">
            World Cup
          </Link>
          <Link href="/faq" className="underline underline-offset-2">
            FAQ
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={{ color: "var(--text-muted)" }}>{item.a}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 flex gap-4">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-spoiler-free-sports">
          Back to HideScore
        </Link>
        <Link href="/privacy" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Privacy
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
                name: TITLE,
                description: DESC,
                url: "https://hidescore.com/spoiler-free-sports",
                // Declare the page's content language, matching the inLanguage
                // signal every other WebPage node on the site carries (the
                // WebApplication/WebSite in layout, and the shared
                // SeoLandingPage component the league landing pages render).
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
                // uses. The BreadcrumbList here was the one sibling node left
                // unlinked — a bare, @id-less list floating beside the page it
                // describes — while the shared SeoLandingPage component already
                // ties the two together. `breadcrumb` is a valid WebPage property.
                breadcrumb: { "@id": "https://hidescore.com/spoiler-free-sports#breadcrumb" },
                about: [
                  { "@type": "Thing", name: "spoiler-free sports" },
                  { "@type": "Thing", name: "sports scores" },
                  { "@type": "Thing", name: "sports highlights" },
                ],
              },
              {
                "@type": "BreadcrumbList",
                // Stable @id so the WebPage node above can reference this exact
                // list (Google merges the page's JSON-LD into one graph, so the
                // ref resolves here), matching the SeoLandingPage breadcrumb node.
                "@id": "https://hidescore.com/spoiler-free-sports#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Spoiler-Free Sports", item: "https://hidescore.com/spoiler-free-sports" },
                ],
              },
              {
                "@type": "FAQPage",
                // Tie this node to the same page URL as the WebPage node above and
                // into the shared WebSite entity. FAQPage is a WebPage subtype, so
                // without a `url`/`isPartOf` it floated as a SECOND, disconnected
                // page node beside the WebPage describing the exact same address —
                // the lone sibling in this @graph still left unlinked. Anchoring it
                // to the canonical URL + #website (the same node-linking the
                // WebPage/BreadcrumbList use) makes the two page nodes read as one
                // entity for this URL, matching the shared SeoLandingPage component.
                url: "https://hidescore.com/spoiler-free-sports",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Same locale signal as the WebPage node above, matching the
                // inLanguage the FAQPage nodes already carry on /faq and the
                // shared SeoLandingPage component. FAQPage is a WebPage subtype,
                // so this is a valid locale hint.
                inLanguage: "en",
                mainEntity: FAQ.map((item) => ({
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
