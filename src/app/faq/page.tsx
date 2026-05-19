import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — Spoiler-Free Sports Scores | HideScore",
  description:
    "Answers about HideScore: how spoiler-free scores and game ratings work, which leagues are covered, and whether HideScore is free.",
  alternates: { canonical: "/faq" },
  robots: { index: true, follow: true },
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
    q: "Which sports and leagues does HideScore cover?",
    a: "HideScore covers the NBA, MLB, NHL, NFL, and golf, plus soccer and college basketball, with spoiler-free scores, schedules, highlights, and news.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is completely free, with no ads, no accounts, and no tracking. Your favorite teams and preferences are stored only on your device.",
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

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>← Back to HideScore</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
