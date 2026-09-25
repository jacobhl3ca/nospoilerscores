import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

// Added 2026-09-25. The AI-visibility scan still flagged "No Contact page" after
// /about gained a #contact section: it looks for a route of its own. Same rules
// as /about — the app only, no name, street address or phone (Jacob, 9/24). The
// scan asks for a ContactPage node, which this page carries.

const CONTACT_TITLE = "Contact HideScore | Spoiler-Free Sports Board";
const CONTACT_DESC =
  "How to reach HideScore: email hi@hidescore.com or use the Feedback button on the board. Bug reports, missing leagues and spoilers that got through are welcome.";

export const metadata: Metadata = {
  title: CONTACT_TITLE,
  description: CONTACT_DESC,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: CONTACT_TITLE,
    description: CONTACT_DESC,
    url: "https://hidescore.com/contact",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — spoiler-free sports scores" }],
  },
  twitter: {
    card: "summary_large_image",
    title: CONTACT_TITLE,
    description: CONTACT_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores" }],
  },
};

export default function ContactPage() {
  const updated = routeLastModified("/contact");
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="contact" />
      <h1 className="text-2xl font-bold mb-2">Contact HideScore</h1>
      {updated ? (
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
        </p>
      ) : (
        <div className="mb-6" />
      )}

      <section className="space-y-4">
        <p>
          HideScore is a free, spoiler-free sports board. The fastest way to reach the team behind it is email.
        </p>

        <h2 className="text-lg font-semibold mt-6">Email</h2>
        <p>
          <EmailLink />. A real
          person reads every message.
        </p>

        <h2 className="text-lg font-semibold mt-6">In the app</h2>
        <p>
          Use the Feedback button at the bottom of the board, on the web or in the iPhone and Android apps. Add your email
          to the note if you want a reply.
        </p>

        <h2 className="text-lg font-semibold mt-6">What to send</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>A spoiler that got through: a score in a highlight title, a thumbnail or a headline.</li>
          <li>A league, cup or broadcaster you want covered.</li>
          <li>A bug, a wrong start time or a broken watch link.</li>
          <li>
            Privacy questions. To erase a synced account yourself, use Settings → Account; the{" "}
            <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link> has the details.
          </li>
        </ul>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          HideScore is an online app with no office or phone line. It is not affiliated with, endorsed by, or sponsored
          by any league, team or broadcaster.
        </p>
      </section>

      <div className="mt-10 flex gap-4">
        <Link href="/about" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          About HideScore
        </Link>
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-contact">
          ← Back to HideScore
        </Link>
      </div>

      {/* ContactPage whose subject is the site's Organization (declared with
          its ContactPoint in layout.tsx), plus the same WebPage→#breadcrumb
          linking every other route uses. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "ContactPage",
                name: CONTACT_TITLE,
                description: CONTACT_DESC,
                url: "https://hidescore.com/contact",
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/contact#breadcrumb" },
                mainEntity: { "@id": "https://hidescore.com/#organization" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/contact#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Contact", item: "https://hidescore.com/contact" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
