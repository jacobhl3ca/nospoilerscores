import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b1d8b3efe70b8dbe7f865cd0b5dc832a@o4511667913818112.ingest.us.sentry.io/4511694546534400",
  tracesSampleRate: 0.1,
  enableLogs: true,
  // Ignore noise from browser extensions / third-party injected code.
  // Verified none of these originate in HideScore source.
  ignoreErrors: [
    /EmptyRanges/,
    /runtime\.sendMessage/,
    /Unable to load image data:image\/svg\+xml/,
    // ⛔ The old comment here claimed detailEvent "has never existed in HideScore
    // source" and called this injected-extension noise. That is wrong, and the
    // 2026-08-16 Sentry audit caught it: `detailEvent` is declared at
    // HomeContent.tsx:512 (`useState`) and used at 3875-3879, and the captured
    // stack frame is our own `HomeContent` in src_components_HomeContent_tsx_*.js,
    // not an extension. Every one of the 5 events was `next dev` on localhost
    // (environment=development), so this is a stale-closure artifact of Turbopack
    // hot reload, not a browser extension.
    //
    // Kept, because it is dev-only and unactionable — but scoped to development
    // so that a real production `detailEvent` ReferenceError is NOT swallowed.
    // The blanket rule would have hidden one.
    ...(process.env.NODE_ENV === "development" ? [/detailEvent is not defined/] : []),
  ],
  denyUrls: [
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-web-extension:\/\//,
    /extensions\//,
    // Third-party analytics — errors in these scripts are not HideScore bugs.
    /gc\.zgo\.at/,        // GoatCounter
    /stats\.hidescore\.com/, // Umami (self-hosted)
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
