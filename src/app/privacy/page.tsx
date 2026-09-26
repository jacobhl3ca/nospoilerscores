import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";

const PRIVACY_TITLE = "Privacy Policy | HideScore";
const PRIVACY_DESC = "HideScore never sells or shares your data and collects no personal information unless you choose to create an optional account.";
// The policy's last-revision date, in one place so the visible "Last updated"
// line, its <time dateTime>, and the WebPage JSON-LD dateModified below can
// never drift apart — the same single-constant pattern PRIVACY_TITLE/_DESC use
// across the metadata and the graph node. ISO YYYY-MM-DD so it's a valid
// dateTime attribute and a valid schema.org Date literal unchanged.
const PRIVACY_UPDATED = "2026-08-06";

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESC,
  alternates: { canonical: "/privacy" },
  // No `robots` override: a child `robots` object fully replaces the root
  // layout's, which would drop its googleBot directives (max-image-preview:large,
  // max-snippet:-1). index/follow is already inherited from the layout, so this
  // page stays indexable AND keeps the richer snippet/image-preview hints.
  openGraph: {
    title: PRIVACY_TITLE,
    description: PRIVACY_DESC,
    url: "https://hidescore.com/privacy",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date routes. A page's openGraph replaces the parent's wholesale
    // (Next merges metadata per top-level field, not deep), so without this these
    // SEO landing pages emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage).
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — spoiler-free sports scores, privacy policy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRIVACY_TITLE,
    description: PRIVACY_DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — spoiler-free sports scores, privacy policy" }],
  },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="privacy" subject="Privacy" />
      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Last updated: <time dateTime="2026-09-25">2026-09-25</time></p>

      <section className="space-y-4">
        <p>
          HideScore collects as little as it can. We never sell your data or share it for advertising.
        </p>

        <h2 className="text-lg font-semibold mt-6">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Usage stats.</strong> Which pages and features get used, and whether on the website or the app. They are counted without cookies and never build a profile of you. You can <Link href="/notrack" className="underline underline-offset-2">turn them off in this browser</Link>.
          </li>
          <li>
            <strong>Crash reports.</strong> When something breaks, the app sends the error and basic device details to an error-monitoring service. We use them only to fix bugs.
          </li>
          <li>
            <strong>Your account, if you make one.</strong> Sign-in is optional (Apple, Google or an email code). We then store your email, sign-in record, saved settings and basic account activity, so your teams sync between devices. Your usage stats also carry a scrambled account code that cannot be turned back into your email.
          </li>
        </ul>
        <p>
          Without an account, your teams and settings stay on your device. The services that handle our stats and crash reports get only this data and must protect it to the same standard.
        </p>

        <h2 className="text-lg font-semibold mt-6">Deleting your data</h2>
        <p>
          Settings &rarr; Account &rarr; Delete account erases your synced data from our servers. Email us to delete anything else.
        </p>

        <h2 className="text-lg font-semibold mt-6">Sports data</h2>
        <p>
          Your device loads scores, schedules and videos straight from public sports sites. Those sites see a normal web request, including your IP address. We do not log these requests.
        </p>

        <h2 className="text-lg font-semibold mt-6">Children</h2>
        <p>
          HideScore is not for children under 13, and we do not knowingly collect their data. Tell us and we will delete it.
        </p>

        <h2 className="text-lg font-semibold mt-6">Changes and contact</h2>
        <p>
          Changes are posted here with a new date. Questions: <EmailLink />
        </p>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          HideScore is not affiliated with any team, league or broadcaster. Trademarks belong to their owners. The monkey icon is derived from <a href="https://github.com/twitter/twemoji" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">Twemoji</a> (CC-BY 4.0).
        </p>
      </section>

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-privacy">← Back to HideScore</Link>
      </div>

      {/* Page graph: a WebPage node linked into the site's shared #website entity
          (declared in layout.tsx) plus its own BreadcrumbList, so Google renders a
          Home › Privacy trail in the search result AND reads the breadcrumb as this
          page's rather than an orphan list. Privacy was still emitting a bare,
          @id-less BreadcrumbList with no WebPage node — every other route
          (SeoLandingPage, /faq, the date routes, the World Cup team/hub pages)
          already uses this WebPage→#website / WebPage→#breadcrumb node-linking.
          Server-rendered: this page has no "use client", so the script ships in the
          static HTML for crawlers. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: PRIVACY_TITLE,
                description: PRIVACY_DESC,
                url: "https://hidescore.com/privacy",
                inLanguage: "en",
                // The policy's last-revision date, mirroring the visible
                // "Last updated" <time> above (same PRIVACY_UPDATED constant, so
                // they can't drift). `dateModified` is the freshness signal
                // Google reads for a policy/legal page — it was the one property
                // this page's WebPage node was missing, even though the date is
                // already rendered on the page. Purely additive JSON-LD; no
                // visual change.
                dateModified: PRIVACY_UPDATED,
                isPartOf: { "@id": "https://hidescore.com/#website" },
                breadcrumb: { "@id": "https://hidescore.com/privacy#breadcrumb" },
              },
              {
                "@type": "BreadcrumbList",
                "@id": "https://hidescore.com/privacy#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Privacy Policy", item: "https://hidescore.com/privacy" },
                ],
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
