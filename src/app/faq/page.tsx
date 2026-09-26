import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import DocTopBar from "@/components/DocTopBar";

const FAQ_TITLE = "FAQ — Spoiler-Free Sports Scores | HideScore";
const FAQ_DESC =
  "Answers about HideScore: how spoiler-free scores and game ratings work, which leagues are covered, and whether HideScore is free.";

export const metadata: Metadata = {
  title: FAQ_TITLE,
  description: FAQ_DESC,
  alternates: { canonical: "/faq" },
  // No `robots` override: a child `robots` object fully replaces the root
  // layout's, which would drop its googleBot directives (max-image-preview:large,
  // max-snippet:-1). index/follow is already inherited from the layout, so this
  // page stays indexable AND keeps the richer snippet/image-preview hints.
  openGraph: {
    title: FAQ_TITLE,
    description: FAQ_DESC,
    url: "https://hidescore.com/faq",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date/SEO-landing routes. A page's openGraph replaces the parent's
    // wholesale (Next merges metadata per top-level field, not deep), so without
    // this the FAQ page emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage). en_US is the OG-spec format (underscore, not "en").
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — spoiler-free sports scores, frequently asked questions" }],
  },
  twitter: {
    card: "summary_large_image",
    title: FAQ_TITLE,
    description: FAQ_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores, frequently asked questions" }],
  },
};

// `links` render as inline anchors at the end of the answer, joined with "and"
// (and are folded into the answer text for the FAQPage schema, which takes plain
// text only).
type FaqLink = { href: string; text: string };
const FAQ: { q: string; a: string; links?: FaqLink[] }[] = [
  {
    q: "What is HideScore?",
    a: "HideScore is a free way to follow sports without spoilers. It prints no NBA, MLB, NHL, NFL, soccer or golf score anywhere, and it keeps highlight titles and news headlines blurred until you choose to reveal them, so you can watch games on your own schedule.",
  },
  {
    q: "How do HideScore's game ratings work?",
    a: "Game ratings tell you how exciting a finished game was without naming the score or the winner. They are off until you turn them on in Settings, and on the default setting they stay off before noon Eastern. Once on, you can sort by the best games and decide what is worth watching before you press play.",
  },
  {
    q: "How can I watch sports highlights without spoilers?",
    a: "Open HideScore before checking search, YouTube, league apps, or social feeds. No score or winner is written on the board, the optional ratings help you pick the best finished games, and each game card links to recap or condensed highlights when available.",
  },
  {
    q: "Which sports and leagues does HideScore cover?",
    a: "HideScore covers the NBA, WNBA, MLB, NHL, NFL, college basketball and football, golf, tennis, motorsports, combat sports, cricket, chess, poker, and soccer. Soccer includes the Premier League, MLS, Champions League, Europa League, Conference League, La Liga, Serie A, Bundesliga, Ligue 1, Liga MX, NWSL, EFL Championship, Copa Libertadores, Saudi Pro League, the UEFA Nations League, and major international tournaments.",
  },
  {
    q: "Why don't I see a league on the main screen?",
    a: "The main screen shows a few leagues at a time. Open Settings to choose your columns or use a column heading to switch leagues. Settings lists every supported league year-round in the In season and Offseason groups, and saved offseason picks return automatically when play resumes. The main switcher generally stays seasonal; NBA remains selectable during its offseason for news and trades. You can choose favorite teams from supported leagues year-round.",
  },
  {
    q: "How do the separate soccer leagues work?",
    a: "Each competition is its own league in HideScore, so La Liga, Serie A, Bundesliga, Ligue 1, the Premier League, Champions League, and the others can each have their own score column, news, teams, and highlights. Pick the competitions you follow in Settings.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is completely free, with no ads. It works without an account — your favorite teams and preferences are saved on your device — and it uses only privacy-friendly, cookieless analytics. You can optionally sign in with Apple or Google to sync your settings across devices.",
  },
  {
    q: "Is there a HideScore app?",
    // Store links + one plain line about ratings added 2026-09-26. A link to the
    // listing is all the store rules allow: no "do you like it?" pre-question
    // and no reward. Keep it that way.
    a: "Yes. HideScore is a free app for iPhone and Android, and it also works in any web browser at hidescore.com. If it helps you, a rating on the store is what helps other fans find it. Get it on",
    links: [
      { href: "https://apps.apple.com/app/hidescore/id6766885311", text: "the App Store" },
      { href: "https://play.google.com/store/apps/details?id=com.jacobhl.hidescore", text: "Google Play" },
    ],
  },
  // Added 2026-09-20. These two match the shape of the prompts assistants are
  // actually sending — Search Console shows LLM-written queries reaching the
  // site, and chatgpt.com is already the third-largest referrer behind Google
  // and DuckDuckGo. Both answer the superlative question directly in the first
  // sentence, because that is the sentence an assistant quotes.
  {
    q: "What is the best app to follow teams without spoilers?",
    a: "For breadth, HideScore: it covers over 50 competitions on one board, hides standings as well as scores, and is free with no account. Pick your teams once and their games surface with the result covered. Other options are narrower — DTMTS covers the four big American leagues on the web, No Spoiler Sports adds soccer and college football, and joyavo is an iPhone app with a paid tier. There is an honest comparison of all of them at",
    links: [{ href: "/best-spoiler-free-sports-sites", text: "the best spoiler-free sports sites" }],
  },
  {
    q: "What is the best game recap app without spoilers?",
    a: "HideScore, if the thing you want is to open a recap without reading the score on the way in. Recaps open from a covered game card instead of a search page, clips whose titles state the result are filtered out, and the titles of the ones that remain are masked. An excitement rating on each finished game tells you which recap is worth your time without naming the winner.",
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="faq" subject="FAQ" />
      <h1 className="text-2xl font-bold mb-6">Frequently asked questions</h1>

      <section className="space-y-6">
        {FAQ.map((item) => (
          <div key={item.q}>
            <h2 className="text-lg font-semibold mb-1">{item.q}</h2>
            <p>
              {item.a}
              {item.links && (
                <>
                  {" "}
                  {item.links.map((link, i) => (
                    <Fragment key={link.href}>
                      {i > 0 && " and "}
                      {/* rel="me" — both sites are the same author, so this is the
                          identity link Google/IndieWeb consumers read to tie the
                          HideScore author to the jacobhl.com Person entity. It is
                          scoped to jacobhl.com: since 2026-09-20 an answer can
                          point at one of our own pages, and since 2026-09-26 at
                          the app stores, and rel="me" on either would assert
                          that the target is a second identity of the same
                          person, which is not what it means. */}
                      <a
                        href={link.href}
                        rel={link.href.startsWith("https://jacobhl.com") ? "me" : undefined}
                        className="underline underline-offset-2"
                      >
                        {link.text}
                      </a>
                    </Fragment>
                  ))}
                  .
                </>
              )}
            </p>
          </div>
        ))}
      </section>

      <p className="mt-8">
        Need the short version? Read the{" "}
        <Link href="/how-to-watch-sports-highlights-without-spoilers" className="underline underline-offset-2">
          guide to watching sports highlights without spoilers
        </Link>.
      </p>

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-faq">← Back to HideScore</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            // This FAQPage IS the page-level node for /faq (there's no separate
            // WebPage node here, unlike the SeoLandingPage routes where the
            // WebPage carries these). Give it the page's name + description so it
            // matches every other route's page node (the /privacy and date-route
            // WebPage nodes both carry name + description) — Google lists `name`
            // as a recommended WebPage property, and FAQPage is a WebPage subtype,
            // so both are valid here. Reuse the same constants the <title> and
            // <meta name="description"> emit so the graph node stays in lockstep
            // with the page metadata. Purely additive JSON-LD; no visual change.
            name: FAQ_TITLE,
            description: FAQ_DESC,
            // Anchor this node to the canonical /faq URL and into the shared
            // WebSite entity declared in layout.tsx. FAQPage is a WebPage subtype,
            // so without a `url`/`isPartOf` it floated as a page node describing
            // /faq that was disconnected from the site graph — the same gap the
            // SeoLandingPage and worldcup/teams FAQ nodes already had fixed.
            // Linking it to the canonical URL + #website makes Google read it as
            // this page's FAQ block on the known site rather than an orphan node.
            url: "https://hidescore.com/faq",
            isPartOf: { "@id": "https://hidescore.com/#website" },
            // Declare the Q&A content language, matching the inLanguage signal
            // the site adds to its other CreativeWork schema nodes (the
            // WebApplication/WebSite in layout, the WebPage in SeoLandingPage).
            // FAQPage is a WebPage subtype, so this is a valid locale hint.
            inLanguage: "en",
            // Point this page node at its BreadcrumbList (below) by @id — the
            // same @graph node-linking the isPartOf ref above and the
            // SeoLandingPage WebPage→#breadcrumb ref already use. The
            // BreadcrumbList was the one sibling node left unlinked — a bare,
            // @id-less list floating beside the page it describes. `breadcrumb`
            // is a valid WebPage property (FAQPage is a WebPage subtype), and
            // tying it to the page node is Google's recommended pattern for the
            // breadcrumb rich result.
            breadcrumb: { "@id": "https://hidescore.com/faq#breadcrumb" },
            // Topic entities for this page, matching the `about` array every
            // SeoLandingPage WebPage node already carries (e.g. the NBA/soccer
            // routes) — the FAQ page node was the one content page left without
            // it. `about` is a valid WebPage property (FAQPage is a WebPage
            // subtype) and gives Google explicit entity signals for what this
            // page covers, using the site's own spoiler-free vocabulary. Purely
            // additive JSON-LD; no visual change.
            about: [
              "spoiler-free sports scores",
              "sports highlights without spoilers",
              "sports game ratings",
            ].map((name) => ({ "@type": "Thing", name })),
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              // Answer text is plain text in the schema, so an entry whose
              // rendered answer ends in a link gets that link's label folded
              // back in — otherwise the structured answer would end mid-sentence.
              acceptedAnswer: {
                "@type": "Answer",
                text: item.links ? `${item.a} ${item.links.map((l) => l.text).join(" and ")}.` : item.a,
              },
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />

      {/* BreadcrumbList lets Google render a Home › FAQ trail in the search
          result instead of the bare /faq URL — matching the /worldcup and
          /watch-world-cup-without-spoilers pages that already declare the same
          hierarchy. Server-rendered: this page has no "use client", so the
          script ships in the static HTML for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            // Stable @id so the FAQPage node above can reference this exact list
            // (Google merges the page's JSON-LD blocks into one graph, so the
            // ref resolves here) instead of leaving it a bare, @id-less list
            // floating beside the page — matching the SeoLandingPage's
            // WebPage→#breadcrumb node-linking.
            "@id": "https://hidescore.com/faq#breadcrumb",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
              { "@type": "ListItem", position: 2, name: "FAQ", item: "https://hidescore.com/faq" },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
