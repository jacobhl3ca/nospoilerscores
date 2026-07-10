import type { Metadata } from "next";
import Link from "next/link";

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

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is HideScore?",
    a: "HideScore is a free way to follow sports without spoilers. It hides NBA, MLB, NHL, NFL, and golf scores, highlights, and headlines until you choose to reveal them, so you can watch games on your own schedule.",
  },
  {
    q: "How do HideScore's game ratings work?",
    a: "Game ratings tell you how exciting a finished game was without revealing the score. Turn on ratings to sort by the best games and decide what is worth watching before you press play.",
  },
  {
    q: "How can I watch sports highlights without spoilers?",
    a: "Open HideScore before checking search, YouTube, league apps, or social feeds. Scores and winners stay hidden, ratings help you pick the best finished games, and each game card links to recap or condensed highlights when available.",
  },
  {
    q: "Which sports and leagues does HideScore cover?",
    a: "HideScore covers the NBA, MLB, NHL, NFL, and golf, plus soccer and college basketball, with spoiler-free scores, schedules, highlights, and news.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is completely free, with no ads. It works without an account — your favorite teams and preferences are saved on your device — and it uses only privacy-friendly, cookieless analytics. You can optionally sign in with Apple or Google to sync your settings across devices.",
  },
  {
    q: "Is there a HideScore app?",
    a: "Yes. HideScore is a free iOS app on the App Store, and it also works in any web browser at hidescore.com.",
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <h1 className="text-2xl font-bold mb-6">Frequently asked questions</h1>

      <section className="space-y-6">
        {FAQ.map((item) => (
          <div key={item.q}>
            <h2 className="text-lg font-semibold mb-1">{item.q}</h2>
            <p>{item.a}</p>
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
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>← Back to HideScore</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            // Declare the Q&A content language, matching the inLanguage signal
            // the site adds to its other CreativeWork schema nodes (the
            // WebApplication/WebSite in layout, the WebPage in SeoLandingPage).
            // FAQPage is a WebPage subtype, so this is a valid locale hint.
            inLanguage: "en",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
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
