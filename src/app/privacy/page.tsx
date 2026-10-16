import type { Metadata } from "next";
import Link from "next/link";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";

const PRIVACY_TITLE = "Privacy Policy | HideScore";
const PRIVACY_DESC = "HideScore never sells or shares your data and collects no personal information unless you choose to create an optional account.";

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
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Last updated: <time dateTime="2026-10-16">2026-10-16</time></p>

      <section className="space-y-4">
        <p>
          HideScore collects as little as it can. We never sell your data or share it for advertising.
        </p>

        <h2 className="text-lg font-semibold mt-6">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Usage stats.</strong> Which pages and features get used, and whether on the website or the app. They are counted without cookies and never build a profile of you. It keeps a random number on your device so each device counts once. You can <Link href="/notrack" className="underline underline-offset-2">turn them off in this browser</Link>.
          </li>
          <li>
            <strong>Crash reports.</strong> When something breaks, the app sends the error and basic device details to an error-monitoring service. We use them only to fix bugs.
          </li>
          <li>
            <strong>Your account, if you make one.</strong> Sign-in is optional (Apple, Google or an email code). We then store your email, sign-in record, saved settings and basic account activity, so your teams sync between devices. Your usage stats also note a scrambled account code that cannot be turned back into your email. It is not used to count visitors.
          </li>
        </ul>
        <p>
          Without an account, your teams and settings stay on your device. The services below get only the data listed next to them and must protect it to the same standard.
        </p>

        {/* Every outside service the code talks to (2026-10-16, report #399
            B2). When a new host shows up in layout.tsx, lib/ or _worker.js,
            add it here; tests/visual/legal-text.spec.ts holds the list. */}
        <h2 id="services" className="text-lg font-semibold mt-6">Outside services we use</h2>
        <ul data-services className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Cloudflare</strong> hosts the website and our server. It stores accounts, synced settings, sign-in codes and the bracket leaderboard. It sees your IP address and tells our server your country and region, which we use only to suggest local radio links.
          </li>
          <li>
            <strong>Umami</strong>, run on our own server at stats.hidescore.com, counts usage stats.
          </li>
          <li>
            <strong>GoatCounter</strong> also counts usage stats: the page, the site you came from and your screen size. The switch on the opt-out page turns off Umami only.
          </li>
          <li>
            <strong>Sentry</strong> (USA) receives crash reports from the website and the apps, and speed timings from a sample of visits.
          </li>
          <li>
            <strong>Apple</strong> and <strong>Google</strong> handle Sign in with Apple and Google sign-in, if you use them. In the apps, the App Store or Google Play shows the rating prompt.
          </li>
          <li>
            <strong>Resend</strong> sends the email with your sign-in code. It gets your email address.
          </li>
          <li>
            <strong>Formspree</strong> receives the feedback form: your message, your email and initials if you give them, the app version and your browser type.
          </li>
          <li>
            <strong>GitHub</strong> holds the site&rsquo;s public code, which includes the initials on the Wall of Fame. Initials go there only when you agree.
          </li>
          <li>
            <strong>images.weserv.nl</strong> resizes news and video pictures. It sees your IP address and the picture&rsquo;s address.
          </li>
          <li>
            <strong>Open-Meteo</strong> gives the weather for outdoor games. It gets the venue&rsquo;s city and sees your IP address.
          </li>
          <li>
            <strong>Sports sites and video players</strong>: ESPN, MLB, NHL, YouTube, Brightcove, FotMob, Reddit and Wikimedia. Your device loads scores, videos and logos from them (see Sports data below).
          </li>
        </ul>
        <p>
          Our server also reads public data from other sports sites, such as theScore, PandaScore, Lichess and World Climbing. Those requests come from our server, not from your device.
        </p>
        <p>
          The bracket leaderboard is public. It shows the name or initials you enter and your picks.
        </p>

        <h2 className="text-lg font-semibold mt-6">Deleting your data</h2>
        <p>
          Settings &rarr; Account &rarr; Delete account erases your synced data from our servers. Email us to delete anything else.
        </p>

        <h2 className="text-lg font-semibold mt-6">Sports data</h2>
        <p>
          Your device loads scores, schedules and videos straight from public sports sites. Those sites see a normal web request, including your IP address. Some of them pass through our server on Cloudflare first, so it can keep a short-lived copy of the answer. We do not log these requests.
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

      <DocFooter route="privacy" />

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
