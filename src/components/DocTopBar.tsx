import Link from "next/link";

// Shared top bar for the static doc pages (/about, /contact, /faq, /privacy and
// every SeoLandingPage route), added 2026-09-25. Before it, the only way back to
// the board was a text link at the very bottom of the page. Server component,
// no client JS. Deliberately NOT the app header: no date nav, no league icons.
// `route` = the canonical path without its leading slash, used to tell the top
// button's clicks apart from the bottom "Back to HideScore" link's.
export default function DocTopBar({ route, ctaHref = "/" }: { route: string; ctaHref?: string }) {
  return (
    <div className="mb-6 pb-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
      <Link
        href="/"
        aria-label="HideScore home"
        className="hover:opacity-80 transition-opacity flex items-center gap-2"
        style={{ color: "var(--text)" }}
      >
        <svg className="w-7 h-7 header-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="32" height="32" rx="6" className="header-logo-bg" />
          <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
        </svg>
        <span className="text-lg font-bold tracking-tight">HideScore</span>
      </Link>
      <Link
        href={ctaHref}
        className="inline-block rounded-lg px-3.5 py-1.5 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
        data-umami-event={`doc-top-open-${route}`}
      >
        Open HideScore
      </Link>
    </div>
  );
}
