import Link from "next/link";
import FeedbackBox from "@/components/FeedbackBox";
import SupportLine from "@/components/SupportLine";

// Bottom links for every page that renders DocTopBar (2026-09-28). The same
// row as the homepage footer (About · FAQ · Guides · WOF · Contact ·
// Feedback · Privacy · Terms), so an article ends the way the board does
// instead of with its own ad-hoc link list. All next/link with prefetch off,
// like the homepage row (10/5): a tap is a soft navigation, so a lost request
// can't land the iOS shell on its "No connection" page.
// 10/15 (Jacob): the row looks exactly like the homepage's (centred, text-xs,
// all 8 items; the current page stays in with aria-current), and
// "← Back to HideScore" moved out of the row onto its own line below it.
// `route` = the canonical path without its leading slash, as in DocTopBar.
// 10/14: "Feedback" opens the form right here (FeedbackBox) instead of a soft
// navigation to /contact#feedback, which showed nothing for up to 2 s.
// "Wall of fame" reads "WOF" so the row fits on one line (article pages on a
// desktop, 390 px phones); `title` carries the full name for hover and
// screen readers.

export const SITE_LINKS: { href: string; label: string; title?: string }[] = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/guides", label: "Guides" },
  { href: "/wall-of-fame", label: "WOF", title: "Wall of fame" },
  { href: "/contact", label: "Contact" },
  // /contact hosts the feedback form under the email line. Rendered as the
  // form's own trigger below, not a link.
  { href: "/contact#feedback", label: "Feedback" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function DocFooter({ route }: { route: string }) {
  const here = `/${route}`;
  const muted = { color: "var(--text-muted)" };
  return (
    <>
      <nav
        aria-label="Site"
        className="mt-10 pt-4 flex flex-col items-center gap-3 text-xs text-center"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" data-testid="doc-footer-links">
          {SITE_LINKS.map((l) =>
            l.href === "/contact#feedback" ? (
              <FeedbackBox key={l.label} />
            ) : (
              <Link
                key={l.label}
                href={l.href}
                prefetch={false}
                className="underline underline-offset-2 hover:opacity-80"
                style={muted}
                aria-label={l.title}
                aria-current={l.href === here ? "page" : undefined}
                title={l.title}
              >
                {l.label}
              </Link>
            ),
          )}
        </div>
        <Link
          href="/"
          className="text-sm font-semibold underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--text)" }}
          data-umami-event={`doc-bottom-open-${route}`}
        >
          ← Back to HideScore
        </Link>
      </nav>
      <SupportLine />
    </>
  );
}
