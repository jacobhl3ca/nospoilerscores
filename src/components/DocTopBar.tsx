import Link from "next/link";
import DocFloatingControls from "@/components/DocFloatingControls";
import DocReadProgress from "@/components/DocReadProgress";

// Shared top bar for the static doc pages (/about, /contact, /faq, /privacy,
// /guides and every SeoLandingPage route), added 2026-09-25. Before it, the only way back to
// the board was a text link at the very bottom of the page. Deliberately NOT the
// app header: no date nav, no league icons.
// `route` = the canonical path without its leading slash, used to tell the top
// button's clicks apart from the bottom "Back to HideScore" link's.
//
// Pinned on scroll and labelled with the page's subject ("HideScore | NFL
// highlights"), with a reading-progress line across the top of the viewport —
// Jacob 9/25, the news-site pattern. The bar itself is still server-rendered;
// the progress line is the only client JS. Below `sm` the wordmark drops out
// when there is a subject: at 375px the logo + wordmark + button leave ~57px,
// too little for any subject, and the button still says "Open HideScore".
export default function DocTopBar({
  route,
  ctaHref = "/",
  subject,
}: {
  route: string;
  ctaHref?: string;
  subject?: string;
}) {
  return (
    <>
      <DocReadProgress />
      <DocFloatingControls route={route} href={ctaHref} />
      <div className="doc-topbar mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* A "‹" before the logo makes the link read as a way back, not
              just branding (Jacob 9/28: articles still felt stuck-ish). */}
          <Link
            href="/"
            aria-label="Back to HideScore"
            className="hover:opacity-80 transition-opacity flex shrink-0 items-center gap-1.5"
            style={{ color: "var(--text)" }}
            data-umami-event={`doc-top-back-${route}`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <svg className="w-7 h-7 header-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="6" className="header-logo-bg" />
              <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
            </svg>
            <span className={`text-lg font-bold tracking-tight${subject ? " hidden sm:inline" : ""}`}>HideScore</span>
          </Link>
          {subject ? (
            <>
              <span aria-hidden="true" className="h-5 w-px shrink-0" style={{ background: "var(--border-hover)" }} />
              <span className="doc-topbar-subject truncate text-sm font-medium sm:text-[15px]" style={{ color: "var(--text)" }}>
                {subject}
              </span>
            </>
          ) : null}
        </div>
        <Link
          href={ctaHref}
          className="inline-block shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event={`doc-top-open-${route}`}
        >
          Open HideScore
        </Link>
      </div>
    </>
  );
}
