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
    // ResizeObserver's spec-mandated safety valve, not a HideScore fault: the
    // browser fires it when a resize callback dirties layout again and the loop
    // has not settled inside one frame. Nothing throws in our code, nothing is
    // left broken, and the next frame reconciles — it is in Sentry's own
    // recommended ignoreErrors. Filtered 2026-09-01 after JAVASCRIPT-NEXTJS-NY-K
    // reported 6 events from a single Android 12 WebView inside four minutes,
    // 0 users affected. Not scoped to development: this one is genuinely
    // unactionable in production too, unlike the detailEvent rule below.
    // Chrome says "loop limit exceeded"; Firefox and newer Chrome say
    // "loop completed with undelivered notifications".
    /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
    // ⛔ The comment that used to sit here claimed detailEvent "has never existed
    // in HideScore source" and called it injected-extension noise. That was
    // wrong, and the 2026-08-16 audit caught it: `detailEvent` is ours, declared
    // in HomeContent.tsx and captured in our own
    // src_components_HomeContent_tsx_*.js frame. Every event was `next dev` on
    // localhost, so it is a Turbopack Fast Refresh stale-closure artifact.
    //
    // Generalised 2026-09-01 from that one identifier to the shape, after
    // JAVASCRIPT-NEXTJS-NY-H arrived as the identical thing wearing a different
    // name: `enabledCategories is not defined`, thrown from
    // HomeContent.useMemo[hiddenNewsCategories] on http://localhost:3178 under
    // HeadlessChrome, with `[Fast Refresh] rebuilding` in the breadcrumbs one
    // line above it. `enabledCategories` is imported at HomeContent.tsx:6 and
    // used at 1942-1943 — it exists, it is spelled right, and only a hot reload
    // ever fails to find it. Naming each identifier as it appears is a queue,
    // not a filter; the third one is already on its way.
    //
    // Still scoped to development, which is the whole safety property: a real
    // production ReferenceError is NOT swallowed by this. In dev the error is
    // already in the console and the Next overlay before Sentry ever sees it.
    ...(process.env.NODE_ENV === "development"
      ? [/^(?:ReferenceError: )?\w+ is not defined$/]
      : []),
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
