import type { Metadata } from "next";
import Link from "next/link";

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
    name: "Pick the game while scores are hidden",
    text: "Use Yesterday, Today, Tomorrow, or a league page to find the matchup. HideScore keeps scores, winners, and results hidden until you tap to reveal them.",
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
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
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
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
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
                isPartOf: { "@type": "WebSite", name: "HideScore", url: "https://hidescore.com" },
                about: [
                  { "@type": "Thing", name: "sports highlights without spoilers" },
                  { "@type": "Thing", name: "spoiler-free sports highlights" },
                  { "@type": "Thing", name: "hidden sports scores" },
                ],
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "How to watch sports highlights without spoilers", item: URL },
                ],
              },
              {
                "@type": "FAQPage",
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
