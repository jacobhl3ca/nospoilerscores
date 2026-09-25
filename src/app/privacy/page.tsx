import type { Metadata } from "next";
import Link from "next/link";

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
      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Last updated: <time dateTime={PRIVACY_UPDATED}>{PRIVACY_UPDATED}</time></p>

      <section className="space-y-4">
        <p>
          HideScore is built to keep sports results off your screen. We never sell your personal information or share it for advertising. The account data we store is limited to the optional sign-in and sync information described below.
        </p>

        <h2 className="text-lg font-semibold mt-6">What we collect</h2>
        <p>
          HideScore has no advertising trackers, and we do not place cookies to track you across sites.
        </p>
        <p>
          For basic usage statistics we use privacy-friendly, cookieless analytics (GoatCounter and a self-hosted Umami instance). These record only aggregate page views &mdash; which pages are visited and rough totals. They do not set cookies, do not build a profile of you, and do not track you across other sites.
        </p>
        <p>
          You can also <Link href="/notrack" className="underline underline-offset-2">turn off self-hosted analytics in this browser</Link>. The choice stays on this device until you clear HideScore&rsquo;s browser data.
        </p>
        <p>
          If you are signed in, we also tag your analytics session with a random, scrambled account code and whether you are using the website or mobile app, so we can tell how many real accounts &mdash; rather than how many devices &mdash; use each one. That code is derived from your account with a one-way key we keep private: it cannot be turned back into your email or sign-in identifier, and it is only ever sent to our own self-hosted Umami, never to a third party.
        </p>
        <p>
          To find and fix crashes, HideScore uses Sentry, a third-party error-monitoring service. When the app hits an unexpected error, it sends Sentry a technical report &mdash; the error message and stack trace, along with basic browser and device details and a small sample of anonymous performance data. We use this only to diagnose and fix bugs. It is not tied to your identity, is never used for advertising, and is not sold or shared.
        </p>
        <p>
          HideScore works fully without an account. You can optionally sign in with Apple, Google, or a six-digit code sent to your email so your favorite teams and settings sync across your devices. If you choose to sign in, we store the associated email address, provider or internal identity record, session, saved preferences, and basic account timestamps and website/mobile-app usage. We use this data only to provide and secure your account and sync. You can sign out at any time, and deleting your account from Settings &rarr; Account erases the server copy of this data.
        </p>
        <p>
          If you are not signed in, your favorite-team selections and view preferences are stored only in your browser&apos;s local storage on your device and are never transmitted to us. If you sign in, those same preferences are also synced to our server so they follow you across your devices.
        </p>

        <h2 className="text-lg font-semibold mt-6">Network requests</h2>
        <p>
          When you use HideScore, your device fetches publicly available scores, schedules, news headlines, and video metadata from third-party sports sources, including ESPN, MLB.com, NBA.com, NHL.com, Reddit, YouTube, and others. These services may receive your IP address and standard request information as a normal part of any web request. HideScore does not see, log, or store these requests on our servers.
        </p>

        <h2 className="text-lg font-semibold mt-6">Children</h2>
        <p>
          HideScore is not directed at children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact us and we will delete it.
        </p>

        <h2 className="text-lg font-semibold mt-6">Third-party content</h2>
        <p>
          HideScore links to and embeds publicly available content from third-party sports providers and broadcasters. HideScore is not affiliated with, endorsed by, or sponsored by ESPN, MLB, NBA, NHL, NFL, the NCAA, FIFA, or any team, league, or broadcaster. All trademarks and logos belong to their respective owners.
        </p>

        <h2 className="text-lg font-semibold mt-6">Changes</h2>
        <p>
          If this policy changes in the future, the updated version will be posted at this URL with a new &ldquo;Last updated&rdquo; date.
        </p>

        <h2 className="text-lg font-semibold mt-6">Contact</h2>
        <p>
          Questions: <a href="mailto:hi@hidescore.com" className="underline underline-offset-2">hi@hidescore.com</a>
        </p>

        <h2 className="text-lg font-semibold mt-6">Credits</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          The HideScore monkey icon is derived from <a href="https://github.com/twitter/twemoji" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">Twemoji</a>, copyright Twitter, Inc. and other contributors, licensed under CC-BY 4.0.
        </p>
      </section>

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>← Back to HideScore</Link>
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
