import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";

const TITLE = "How to Watch Sports Highlights Without Spoilers | HideScore";
const DESC =
  "A spoiler-free way to watch sports highlights: hide scores and winners first, use game ratings, then open recap or condensed highlights only when you are ready.";
const CANONICAL = "/how-to-watch-sports-highlights-without-spoilers";
const URL = `https://hidescore.com${CANONICAL}`;

const STEPS = [
  {
    name: "Open HideScore before search or YouTube",
    text: "Normal search results, league pages, and video feeds can spoil the winner in titles, thumbnails, tickers, and headlines. Start from HideScore instead.",
  },
  {
    name: "Pick the game from a board with no score on it",
    text: "Use Yesterday, Today, Tomorrow, or a league page to find the matchup. HideScore prints no score, winner, or result on any of those boards.",
  },
  {
    name: "Use ratings to choose what is worth watching",
    text: "Spoiler-free ratings help you find close games, comebacks, overtime, and instant classics without showing who won.",
  },
  {
    name: "Open the recap or condensed highlight",
    text: "Use the highlight button from the game card. HideScore links out to official or high-quality highlights while keeping the game result hidden first.",
  },
];

const FAQ = [
  {
    q: "How do I watch sports highlights without spoilers?",
    a: "Open HideScore first, choose the game with scores hidden, use spoiler-free ratings if you want to find the best game, then open the recap or condensed highlight link from the game card.",
  },
  {
    q: "Why not search for highlights directly?",
    a: "Search pages and video feeds often reveal the final score, winner, or decisive play before you press play. HideScore starts from a hidden-score game card so you can choose the highlight safely.",
  },
  {
    q: "Can HideScore tell me whether a game was good without spoiling it?",
    a: "Yes. Finished games can show a competitiveness rating, so you can prioritize close games and skip blowouts without seeing the winner or score.",
  },
  {
    q: "Which sports highlights can I watch spoiler-free?",
    a: "HideScore covers NBA, NFL, NHL, MLB, soccer, golf, college basketball, and World Cup games. Highlight availability depends on each league's official feeds and video metadata.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "how to watch sports highlights without spoilers",
    "how to view sports highlights without spoilers",
    "watch sports highlights without spoilers",
    "view sports highlights without spoilers",
    "spoiler free sports highlights",
    "sports highlights no spoilers",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: URL,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date routes. A page's openGraph replaces the parent's wholesale
    // (Next merges metadata per top-level field, not deep), so without this these
    // SEO landing pages emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage).
    locale: "en_US",
    type: "article",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function HowToWatchSportsHighlightsWithoutSpoilersPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="how-to-watch-sports-highlights-without-spoilers" subject="How-to guide" />
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <h1 className="text-2xl font-bold mb-4">How to watch sports highlights without spoilers</h1>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        The safe workflow is simple: use HideScore to choose the game before opening a spoiler-heavy search page,
        keep scores and winners hidden, check whether the game was worth watching, then open the highlight.
      </p>

      <section className="space-y-6 mt-8">
        {STEPS.map((step, index) => (
          <div key={step.name} id={`step-${index + 1}`}>
            <h2 className="text-lg font-semibold mb-1">{index + 1}. {step.name}</h2>
            <p style={{ color: "var(--text-muted)" }}>{step.text}</p>
          </div>
        ))}
      </section>

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Start from a spoiler-free scoreboard.</p>
        <Link
          href="/yesterday"
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event="seo-open-how-to-watch-sports-highlights-without-spoilers"
        >
          Find spoiler-free highlights
        </Link>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/watch-sports-highlights-without-spoilers" className="underline underline-offset-2">
            Highlights guide
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

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-how-to-watch-sports-highlights-without-spoilers">
          Back to HideScore
        </Link>
        <Link href="/spoiler-free-sports" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Spoiler-free sports guide
        </Link>
        <Link href="/faq" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          FAQ
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "HowTo",
                name: "How to watch sports highlights without spoilers",
                description: DESC,
                // Locale signal every other schema node on the site carries
                // (the WebApplication/WebSite in layout, the shared
                // SeoLandingPage component, and the sibling WebPage/FAQPage
                // nodes below). HowTo is a CreativeWork subtype, so inLanguage
                // is a valid content-language hint here.
                inLanguage: "en",
                totalTime: "PT1M",
                step: STEPS.map((step, index) => ({
                  "@type": "HowToStep",
                  position: index + 1,
                  name: step.name,
                  text: step.text,
                  url: `${URL}#step-${index + 1}`,
                })),
              },
              {
                "@type": "WebPage",
                name: TITLE,
                description: DESC,
                url: URL,
                inLanguage: "en",
                // Reference the site-level WebSite node by @id (declared in
                // layout.tsx's root JSON-LD @graph) rather than re-declaring a
                // second, @id-less WebSite here. The root layout renders on
                // every page, so Google merges both blocks into one graph and
                // this resolves to the single shared WebSite entity — the same
                // node-linking the SeoLandingPage WebPage uses — instead of
                // leaving two duplicate WebSite entities for hidescore.com.
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Point this WebPage at its own BreadcrumbList by @id so Google
                // reads the trail as this page's, instead of leaving the list an
                // orphan node in the graph. Matches the WebPage→#breadcrumb
                // node-linking every other route already uses (SeoLandingPage,
                // /faq, the date routes, /privacy, and the World Cup pages).
                breadcrumb: { "@id": `${URL}#breadcrumb` },
                about: [
                  { "@type": "Thing", name: "sports highlights without spoilers" },
                  { "@type": "Thing", name: "spoiler-free sports highlights" },
                  { "@type": "Thing", name: "hidden sports scores" },
                ],
              },
              {
                "@type": "BreadcrumbList",
                // @id so the WebPage's `breadcrumb` ref above resolves to this
                // node rather than to a disconnected, unnamed list.
                "@id": `${URL}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "How to watch sports highlights without spoilers", item: URL },
                ],
              },
              {
                "@type": "FAQPage",
                // Tie this node to the same page URL as the WebPage node above and
                // into the shared WebSite entity. FAQPage is a WebPage subtype, so
                // without a `url`/`isPartOf` it floated as a SECOND, disconnected
                // page node beside the WebPage describing the exact same address.
                // Anchoring it to the canonical URL + #website (the same node-linking
                // the WebPage/BreadcrumbList above use) makes the two page nodes read
                // as one entity for this URL, matching every other FAQ-bearing route.
                url: URL,
                isPartOf: { "@id": "https://hidescore.com/#website" },
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
