import Link from "next/link";

// Bottom links for every page that renders DocTopBar (2026-09-28). The same
// row as the homepage footer (About · FAQ · Guides · Contact · Feedback ·
// Privacy) behind a first "← Back to HideScore", so an article ends the way
// the board does instead of with its own ad-hoc link list. All next/link with
// prefetch off, like the homepage row (10/5): a tap is a soft navigation, so a
// lost request can't land the iOS shell on its "No connection" page.
// The item that points at the current page is left out.
// `route` = the canonical path without its leading slash, as in DocTopBar.

export const SITE_LINKS: { href: string; label: string }[] = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/guides", label: "Guides" },
  { href: "/contact", label: "Contact" },
  // /contact hosts the feedback form (FeedbackBox) under the email line.
  { href: "/contact#feedback", label: "Feedback" },
  { href: "/privacy", label: "Privacy" },
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
        {SITE_LINKS.filter((l) => l.href.split("#")[0] !== here).map((l) => (
          <Link key={l.label} href={l.href} prefetch={false} className="underline underline-offset-2 hover:opacity-80" style={muted}>
            {l.label}
          </Link>
        ))}
      </nav>
      {/* Legal line (10/3): the same sentence the About page carries, left out
          on /about and /contact, where it already sits just above. */}
      {route !== "about" && route !== "contact" && (
        <p className="mt-3 text-xs" style={muted}>
          HideScore is not affiliated with, endorsed by, or sponsored by any league, team or broadcaster.
        </p>
      )}
    </>
  );
}
