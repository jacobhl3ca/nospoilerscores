import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "Spoiler-Free Sports Scores and Highlights | HideScore";
const DESC =
  "HideScore is a spoiler-free sports app for NBA, NFL, NHL, MLB, soccer, golf, and World Cup fans. Scores, results, headlines, and highlights stay hidden until you choose to reveal them.";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does spoiler-free sports mean?",
    a: "Spoiler-free sports means you can check schedules, game cards, highlights, and ratings without seeing the final score or who won until you choose to reveal it.",
  },
  {
    q: "Which sports does HideScore cover?",
    a: "HideScore covers NBA, NFL, NHL, MLB, soccer, golf, college basketball, and the 2026 World Cup, with scores hidden by default and highlights available for completed games.",
  },
  {
    q: "Can I find good games without seeing the score?",
    a: "Yes. HideScore's competitiveness rating shows whether a finished game was close, dramatic, or one-sided without revealing the winner or final score.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free, has no ads, and works in any browser. There are also free iOS and Android apps.",
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
    type: "website",
    images: [
      {
        url: "https://hidescore.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "HideScore - spoiler-free sports scores and highlights",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore - spoiler-free sports scores and highlights" }],
  },
};

export default function SpoilerFreeSportsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        HideScore
      </p>
      <h1 className="text-2xl font-bold mb-4">Spoiler-free sports scores and highlights</h1>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        HideScore is built for fans who want spoiler free sports without the usual scoreboard trap. Scores, results,
        winner headlines, and highlight thumbnails stay hidden until you decide to reveal them.
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
        HideScore flips the default: the score is hidden first, then revealed only when you ask.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">Find the best games without the result</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        A hidden score alone is not enough. HideScore also gives completed games a competitiveness rating, so you can
        spot the instant classics and skip the blowouts without learning who won. That makes it useful for full replays,
        condensed games, and spoiler-free sports highlights.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-3">What you can check spoiler-free</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        <li>Today&apos;s games with scores hidden until you tap.</li>
        <li>Tomorrow&apos;s schedule, kickoff times, and matchups.</li>
        <li>Yesterday&apos;s completed games and highlight links.</li>
        <li>Competitiveness ratings that do not reveal the winner.</li>
        <li>News and recaps after you are ready to see more context.</li>
      </ul>

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Open HideScore and keep every score hidden.</p>
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
          <Link href="/nba-scores-without-spoilers" className="underline underline-offset-2">
            NBA
          </Link>
          <Link href="/nhl-scores-without-spoilers" className="underline underline-offset-2">
            NHL
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
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
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
                isPartOf: { "@type": "WebSite", name: "HideScore", url: "https://hidescore.com" },
                about: [
                  { "@type": "Thing", name: "spoiler-free sports" },
                  { "@type": "Thing", name: "sports scores" },
                  { "@type": "Thing", name: "sports highlights" },
                ],
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Spoiler-Free Sports", item: "https://hidescore.com/spoiler-free-sports" },
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
