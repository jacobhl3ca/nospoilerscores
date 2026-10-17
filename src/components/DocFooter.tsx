import Link from "next/link";
import FeedbackBox from "@/components/FeedbackBox";
import SupportLine from "@/components/SupportLine";

// Bottom links for every page that renders DocTopBar (2026-09-28). The same
// row as the homepage footer (About · FAQ · Guides · WOF · Contact ·
// Feedback · Privacy · Terms) behind a first "← Back to HideScore", so an article ends the way
// the board does instead of with its own ad-hoc link list. All next/link with
// prefetch off, like the homepage row (10/5): a tap is a soft navigation, so a
// lost request can't land the iOS shell on its "No connection" page.
// The item that points at the current page is left out.
// `route` = the canonical path without its leading slash, as in DocTopBar.
// 10/14: "Feedback" opens the form right here (FeedbackBox) instead of a soft
// navigation to /contact#feedback, which showed nothing for up to 2 s.
// "Wall of fame" reads "WOF" so the row fits on one line (article pages on a
// desktop, 390 px phones); `title` carries the full name for hover, and the
// accessible name starts with the visible "WOF" (WCAG 2.5.3).

export const SITE_LINKS: { href: string; label: string; title?: string }[] = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/guides", label: "Guides" },
  { href: "/wall-of-fame", label: "WOF", title: "Wall of Fame" },
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
        className="mt-10 pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link
          href="/"
          className="font-semibold underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--text)" }}
          data-umami-event={`doc-bottom-open-${route}`}
        >
          ← Back to HideScore
        </Link>
        {SITE_LINKS.filter((l) => l.href.split("#")[0] !== here).map((l) =>
          l.href === "/contact#feedback" ? (
            <FeedbackBox key={l.label} />
          ) : (
            <Link
              key={l.label}
              href={l.href}
              prefetch={false}
              className="underline underline-offset-2 hover:opacity-80"
              style={muted}
              aria-label={l.title && `${l.label}: ${l.title}`}
              title={l.title}
            >
              {l.label}
            </Link>
          ),
        )}
      </nav>
      <SupportLine />
    </>
  );
}
