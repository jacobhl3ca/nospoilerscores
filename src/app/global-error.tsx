"use client"; // Error boundaries must be Client Components

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Root-level error boundary. Unlike error.tsx (which only wraps page.tsx and
// its children), global-error.tsx catches failures in the root layout itself —
// the one gap error.tsx's boundary can't cover. When active it REPLACES the
// root layout, so it must ship its own <html>/<body> and cannot rely on
// globals.css (those CSS variables aren't guaranteed to load here). Colors are
// therefore inlined via a self-contained <style> that honors light/dark.
// It also can't export `metadata` — set the tab title with a <title> element.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2 recovery prop: re-fetches + re-renders the boundary's contents.
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the console for debugging (digest links it to any
    // server-side log), and report it to Sentry for crash visibility. In
    // production Next redacts a Server Component error's message down to just
    // its `digest`, so without forwarding that digest the client-side Sentry
    // event can't be tied back to the server log entry keyed on it. Attach it
    // as a searchable tag (falling back to "none" for client-only errors, which
    // carry no digest) so the two records line up in the Sentry UI.
    console.error(error);
    Sentry.captureException(error, { tags: { nextjs_digest: error.digest ?? "none" } });
  }, [error]);

  return (
    // dir="ltr" mirrors the root layout's <html> (layout.tsx): this boundary
    // REPLACES that layout and ships its own <html>, so it's the one full
    // document that didn't inherit the explicit base direction. Declaring it
    // here per W3C i18n guidance (always set a base direction on <html>) keeps
    // the crash screen consistent with every normal page and the manifest's
    // "dir": "ltr". No visual change for this LTR English site.
    <html lang="en" dir="ltr">
      <body>
        {/* This boundary REPLACES the root layout, so layout.tsx's `viewport`
            export (which emits the width=device-width meta on every normal page)
            doesn't apply here — and metadata/viewport exports aren't supported in
            a global-error boundary anyway (same reason the tab title is a manual
            <title> below). Without a viewport meta, phones lay this page out at
            the ~980px fallback width and zoom out, shrinking the centered error
            card to unreadable. Declare it explicitly, mirroring the app's own
            viewport (incl. viewport-fit=cover for the notch) so the crash screen
            renders full-width on mobile. React hoists this <meta> into <head>. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Something went wrong | HideScore</title>
        <style>{`
          :root { color-scheme: light dark; --ge-bg:#ffffff; --ge-text:#111111; --ge-muted:#999999; --ge-accent:#2563eb; --ge-card:#f5f5f5; --ge-border:rgba(0,0,0,0.1); }
          @media (prefers-color-scheme: dark) {
            :root { --ge-bg:#0a0a0a; --ge-text:#ededed; --ge-muted:#6b7280; --ge-accent:#60a5fa; --ge-card:rgba(255,255,255,0.05); --ge-border:rgba(255,255,255,0.1); }
          }
          body { margin:0; }
          .ge-wrap { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0 1.5rem; text-align:center; background:var(--ge-bg); color:var(--ge-text); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
          .ge-wrap h1 { font-size:1.5rem; font-weight:700; margin:0 0 0.5rem; }
          .ge-wrap p { margin:0 0 1.25rem; color:var(--ge-muted); }
          .ge-actions { display:flex; align-items:center; gap:0.75rem; }
          .ge-btn { display:inline-block; padding:0.5rem 1rem; border-radius:0.5rem; font-size:0.875rem; font-weight:500; cursor:pointer; text-decoration:none; }
          .ge-btn--primary { background:var(--ge-accent); color:#ffffff; border:none; }
          .ge-btn--secondary { background:var(--ge-card); border:1px solid var(--ge-border); color:var(--ge-accent); }
        `}</style>
        <div className="ge-wrap">
          {/* role="alert" so a screen reader announces the failure, matching the
              page-level error.tsx boundary. This global boundary swaps in
              dynamically when the root layout throws, so the alert node is
              inserted into the live document at error time (not present at
              initial load) — the reliable case for role="alert" to fire. Wraps
              the heading + message (not the recovery buttons) so the
              announcement is just what went wrong; the buttons stay ordinary
              controls. The wrapper adds no box styling, and the h1/p margins
              still come from the `.ge-wrap h1`/`.ge-wrap p` descendant rules, so
              the card renders pixel-for-pixel unchanged. */}
          <div role="alert">
            <h1>Something went wrong</h1>
            <p>That didn&apos;t load right. Try again — your scores are still hidden.</p>
          </div>
          <div className="ge-actions">
            <button type="button" className="ge-btn ge-btn--primary" onClick={() => unstable_retry()}>
              Try again
            </button>
            {/* Plain anchor (full reload) — after a root-layout failure a clean
                navigation is safer than client-side routing, and next/link's
                router context isn't guaranteed here since this REPLACES the root
                layout. @next/next/no-html-link-for-pages DOES fire on this
                internal `/` link — verified: `npm run lint` reports it as an
                error, not a warning — so the disable directive below is REQUIRED
                and is not unused. Do not remove it (doing so breaks lint). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="ge-btn ge-btn--secondary" href="/">
              Back to HideScore
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
