import type { Metadata } from "next";
import Link from "next/link";
import DocFooter from "@/components/DocFooter";
import DocTopBar from "@/components/DocTopBar";
import EmailLink from "@/components/EmailLink";
import FeedbackBox from "@/components/FeedbackBox";
import {
  REQUESTED_BUILDS,
  REQUESTED_BUILDS_SHOWN,
  requestedBuildDay,
  type RequestedBuild,
} from "@/lib/requestedBuilds";
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

// One row of "Built from your requests": day · kind · title · thanks.
function RequestedBuildRow({ r }: { r: RequestedBuild }) {
  return (
    <li>
      <time dateTime={r.date} style={{ color: "var(--text-muted)" }}>{requestedBuildDay(r.date)}</time>
      {" · "}
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {r.kind}
      </span>
      {" · "}
      {r.title}
      {r.by.length > 0 && (
        <>
          {" · "}
          {/* nowrap keeps "thanks K.K." on one line at 390 px. */}
          <span className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{`thanks ${r.by.join(", ")}`}</span>
        </>
      )}
    </li>
  );
}

export default function ContactPage() {
  const updated = routeLastModified("/contact");
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="contact" subject="Contact" />
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

        <h2 id="feedback" className="text-lg font-semibold mt-6 scroll-mt-4">Send feedback</h2>
        <p>
          Send a note from here without opening your email. In the iPhone and Android apps, the Feedback link at the
          bottom of Settings opens the same form. Add your email to the note if you want a reply.
        </p>
        {/* The homepage footer's "Feedback" links here (2026-09-28). A div,
            not a p: FeedbackBox renders its modal (a div + form) in place. */}
        <div>
          <FeedbackBox label="Send feedback" />
        </div>

        {/* Added 2026-10-09. What shipped because someone asked, so a note
            sent from here visibly goes somewhere. Data: src/lib/requestedBuilds.ts,
            rendered in its order (grouped by person, newest first in a group).
            The overflow is a native <details>, so the page stays free of JS. */}
        <h2 id="built" className="text-lg font-semibold mt-6">Built from your requests</h2>
        <p>Every item below started as a note from someone using HideScore.</p>
        <ul className="space-y-1.5" data-testid="requested-builds">
          {REQUESTED_BUILDS.slice(0, REQUESTED_BUILDS_SHOWN).map((r) => (
            <RequestedBuildRow key={`${r.date}|${r.title}`} r={r} />
          ))}
        </ul>
        {REQUESTED_BUILDS.length > REQUESTED_BUILDS_SHOWN && (
          <details>
            <summary className="cursor-pointer underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
              Show all {REQUESTED_BUILDS.length}
            </summary>
            <ul className="space-y-1.5 mt-1.5" data-testid="requested-builds-more">
              {REQUESTED_BUILDS.slice(REQUESTED_BUILDS_SHOWN).map((r) => (
                <RequestedBuildRow key={`${r.date}|${r.title}`} r={r} />
              ))}
            </ul>
          </details>
        )}
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Want your initials added or removed? Say so in a note.
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

      <DocFooter route="contact" />

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
