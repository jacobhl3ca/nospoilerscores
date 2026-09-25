import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

// Added 2026-09-24. An AI-visibility scan flagged the site for having no About
// or Contact page — the pages answer engines read to decide a site is a real,
// reachable product. This is about the APP, not its maker: Jacob asked for no
// personal details here (the FAQ's "Who makes HideScore?" entry came off the
// same day), so there is no name, city or Person node. The contact is the same
// public hi@ inbox /privacy already lists.
//
// Every product claim below matches what the code does, per the 2026-09-20
// sweep: no score is rendered anywhere, there is no standings table, ratings
// are off until turned on, and the only tap-to-reveal surfaces are news
// headlines/media and the MLB playoff picture.

const ABOUT_TITLE = "About HideScore | Spoiler-Free Sports Board";
const ABOUT_DESC =
  "What HideScore is, what it never shows, what it costs, and how to reach us. A free sports board that prints no score, result or league table.";

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESC,
  alternates: { canonical: "/about" },
  openGraph: {
    title: ABOUT_TITLE,
    description: ABOUT_DESC,
    url: "https://hidescore.com/about",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — spoiler-free sports scores" }],
  },
  twitter: {
    card: "summary_large_image",
    title: ABOUT_TITLE,
    description: ABOUT_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores" }],
  },
};

export default function AboutPage() {
  const updated = routeLastModified("/about");
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="about" />
      <h1 className="text-2xl font-bold mb-2">About HideScore</h1>
      {updated ? (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <section className="space-y-4">
        <p>
          HideScore is a free sports board for people who watch games on delay. It shows who played, when, and where to
          watch, and it never prints a score, a result or a league table. You can look up last night&apos;s games in the
          morning and still watch one that evening without knowing how it ended.
        </p>

        <h2 className="text-lg font-semibold mt-6">What it shows</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>A card for each game with the matchup, the start time and the broadcaster.</li>
          <li>
            An optional excitement rating on finished games. It says how close or dramatic a game was without naming the
            winner. Ratings are off until you turn them on in Settings.
          </li>
          <li>Highlights that open from the game card, with titles that give the result away filtered out or masked.</li>
          <li>Watch links that go to the broadcaster, never to a box score or a results page.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">What it never shows</h2>
        <p>
          No score, no winner and no standings table, anywhere on the board. There is no button that reveals a score,
          because the score is never drawn. The two things you can uncover on purpose are news headlines, which start
          blurred, and the MLB playoff picture, which sits behind its own button.
        </p>

        <h2 className="text-lg font-semibold mt-6">What it covers</h2>
        <p>
          Over 50 competitions: the NFL, NBA, WNBA, MLB, NHL, college football and basketball, the Premier League,
          Champions League, La Liga, MLS, Liga MX and the rest of the major soccer leagues, plus Formula 1, UFC, golf,
          tennis, cricket and more. The <Link href="/faq" className="underline underline-offset-2">FAQ</Link> has the
          full list.
        </p>

        <h2 className="text-lg font-semibold mt-6">What it costs</h2>
        <p>
          Nothing. HideScore is an independent project with no paid tier and no advertising, and it works without an
          account. Signing in is optional and only syncs your leagues and favorite teams between
          devices. The <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link> explains how
          little it collects.
        </p>

        <h2 className="text-lg font-semibold mt-6">Where it runs</h2>
        <p>
          In any web browser at <Link href="/" className="underline underline-offset-2">hidescore.com</Link>, and as an app
          for{" "}
          <a href="https://apps.apple.com/app/hidescore/id6766885311" className="underline underline-offset-2">iPhone</a>{" "}
          and{" "}
          <a
            href="https://play.google.com/store/apps/details?id=com.jacobhl.hidescore"
            className="underline underline-offset-2"
          >
            Android
          </a>
          .
        </p>

        <h2 id="contact" className="text-lg font-semibold mt-6 scroll-mt-4">
          Contact
        </h2>
        <p>
          Email <EmailLink />, or use
          the Feedback button at the bottom of the board. Bug reports, missing leagues and spoilers that got through are
          all welcome. The <Link href="/contact" className="underline underline-offset-2">contact page</Link> has more.
        </p>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          HideScore is not affiliated with, endorsed by, or sponsored by any league, team or broadcaster.
        </p>
      </section>

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-about">
          ← Back to HideScore
        </Link>
      </div>

      {/* AboutPage node whose subject is the site's Organization (declared with
          its ContactPoint in layout.tsx), plus the same WebPage→#breadcrumb
          linking every other route uses. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "AboutPage",
                name: ABOUT_TITLE,
                description: ABOUT_DESC,
                url: "https://hidescore.com/about",
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/about#breadcrumb" },
                mainEntity: { "@id": "https://hidescore.com/#organization" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/about#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "About", item: "https://hidescore.com/about" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
