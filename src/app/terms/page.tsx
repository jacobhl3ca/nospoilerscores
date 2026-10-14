import type { Metadata } from "next";
import Link from "next/link";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

// Added 2026-10-11. The terms HideScore runs under: as is with no warranty,
// whose data and marks appear on it, where a takedown request goes, New Jersey
// law, and how changes are posted. The not-affiliated sentence lives in the
// Trademarks section; the footers dropped it (10/14). Plain words like
// /privacy, and the same third parties /privacy names. Not reviewed by a lawyer.

const TERMS_TITLE = "Terms of Use | HideScore";
const TERMS_DESC =
  "The terms for using HideScore: a free service provided as is, third-party sports data and trademarks, takedown requests, and New Jersey law.";

// Used when git cannot date the route (a shallow clone, or before the first
// commit of this folder). Otherwise the date is the folder's last commit, so
// an edit to the terms always carries a new date. Noon ET.
const TERMS_FIRST_POSTED = new Date("2026-10-14T16:00:00Z");

export const metadata: Metadata = {
  title: TERMS_TITLE,
  description: TERMS_DESC,
  alternates: { canonical: "/terms" },
  // No `robots` override, for the reason on /privacy: a child object would
  // replace the root layout's googleBot directives.
  openGraph: {
    title: TERMS_TITLE,
    description: TERMS_DESC,
    url: "https://hidescore.com/terms",
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore terms of use" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TERMS_TITLE,
    description: TERMS_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore terms of use" }],
  },
};

export default function TermsPage() {
  const updated = routeLastModified("/terms");
  const shown = updated ?? TERMS_FIRST_POSTED;
  const ymd = shown.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="terms" subject="Terms" />
      <h1 className="text-2xl font-bold mb-2">Terms of Use</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Last updated: <time dateTime={ymd}>{formatUpdated(shown)}</time>
      </p>

      <section className="space-y-4">
        <p>
          These terms cover the HideScore website and the iPhone and Android apps. If you use HideScore, you agree to
          them. If you do not agree, please do not use it.
        </p>

        <h2 id="as-is" className="text-lg font-semibold mt-6">Provided as is</h2>
        <p>
          HideScore is free. It is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, with no warranty of any
          kind, express or implied. That includes the implied warranties of merchantability, fitness for a particular
          purpose and non-infringement.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>We do not promise that a start time, a channel, a rating or a link is correct. Check with the broadcaster.</li>
          <li>
            We do not promise that you will never see a result. HideScore is built to hide scores, but a headline, a
            video title or a thumbnail from another site can still give one away.
          </li>
          <li>We do not promise that HideScore is always available, and we can change or stop any part of it.</li>
        </ul>

        <h2 id="liability" className="text-lg font-semibold mt-6">Limit of liability</h2>
        <p>
          As far as the law allows, HideScore and the people who run it are not liable for any loss or damage that
          comes from using it, or from not being able to use it. You use HideScore at your own risk.
        </p>

        <h2 id="third-party" className="text-lg font-semibold mt-6">Third-party data and content</h2>
        <p>
          Schedules, game details, videos and headlines come from public sports sites and video services. They belong
          to their owners. HideScore does not host the videos it plays, and it has no control over what those sites
          publish. Watch and Listen links open sites that HideScore does not run, and their own terms apply there.
          The <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link> says what those
          sites see when your device loads from them.
        </p>

        <h2 id="trademarks" className="text-lg font-semibold mt-6">Trademarks</h2>
        <p>
          Team, league and broadcaster names and logos are trademarks of their owners. They appear only to identify
          the games. HideScore is not affiliated with, endorsed by, or sponsored by any league, team or broadcaster.
          The monkey icon is derived from{" "}
          <a href="https://github.com/twitter/twemoji" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">Twemoji</a>{" "}
          (CC-BY 4.0).
        </p>

        <h2 id="takedown" className="text-lg font-semibold mt-6">Takedown requests</h2>
        <p>
          If you own content or a trademark that appears on HideScore and you want it removed, email <EmailLink />.
          Say what it is and where you saw it. A real person reads every message and acts on a valid request quickly.
        </p>

        <h2 id="law" className="text-lg font-semibold mt-6">Governing law</h2>
        <p>
          The laws of the State of New Jersey, USA, govern these terms, without regard to its conflict-of-law rules.
          Any dispute goes to the state or federal courts in New Jersey.
        </p>

        <h2 id="changes" className="text-lg font-semibold mt-6">Changes and contact</h2>
        <p>
          Changes are posted here with a new date. If you keep using HideScore after a change, you accept the new
          terms. Questions: <EmailLink />
        </p>
      </section>

      <DocFooter route="terms" />

      {/* WebPage linked into the site's #website entity (layout.tsx) plus its
          own BreadcrumbList, like /privacy. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: TERMS_TITLE,
                description: TERMS_DESC,
                url: "https://hidescore.com/terms",
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/terms#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/terms#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Terms of Use", item: "https://hidescore.com/terms" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
