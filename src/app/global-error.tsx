"use client"; // Error boundaries must be Client Components

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
    // server-side log). No external error service is wired up.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
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
          <h1>Something went wrong</h1>
          <p>That didn&apos;t load right. Try again — your scores are still hidden.</p>
          <div className="ge-actions">
            <button type="button" className="ge-btn ge-btn--primary" onClick={() => unstable_retry()}>
              Try again
            </button>
            {/* Plain anchor (full reload) — after a root-layout failure a clean
                navigation is safer than client-side routing. */}
            <a className="ge-btn ge-btn--secondary" href="/">
              Back to HideScore
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
