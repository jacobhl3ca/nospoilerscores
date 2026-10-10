import * as Sentry from "@sentry/nextjs";
import { OWN_ABORT_PATTERN } from "@/lib/abort";
import { labelBlankEvent } from "@/lib/sentryEvents";

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
    // A fetch HideScore cancelled on purpose (effect cleanup on unmount or
    // refresh, or our own timeout) — see src/lib/abort.ts. Only aborts made
    // through abortOwn() carry this message; a nameless AbortError
    // ("signal is aborted without reason", "The operation was aborted.") is
    // NOT ours and still reports (GitHub #252, #261).
    OWN_ABORT_PATTERN,
    // ResizeObserver's spec-mandated safety valve, not a HideScore fault: the
    // browser fires it when a resize callback dirties layout again and the loop
    // has not settled inside one frame. Nothing throws in our code, nothing is
    // left broken, and the next frame reconciles — it is in Sentry's own
    // recommended ignoreErrors. Filtered after JAVASCRIPT-NEXTJS-NY-K reported 6
    // events from a single Android 12 WebView inside four minutes, 0 users
    // affected (carried over from PR #58). Chrome says "loop limit exceeded";
    // Firefox and newer Chrome say "loop completed with undelivered notifications".
    /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
    // ⛔ An older comment here claimed detailEvent "has never existed in HideScore
    // source" and called it injected-extension noise. That was wrong, and the
    // 2026-08-16 audit caught it: `detailEvent` is ours, declared in
    // HomeContent.tsx and captured in our own src_components_HomeContent_tsx_*.js
    // frame. Every event was `next dev` on localhost, so it is a Turbopack Fast
    // Refresh stale-closure artifact.
    //
    // Generalised from that one identifier to the shape (PR #58) after
    // JAVASCRIPT-NEXTJS-NY-H arrived as the identical thing with a different
    // name: `enabledCategories is not defined`, thrown under `next dev` with
    // `[Fast Refresh] rebuilding` in the breadcrumbs one line above it.
    //
    // Still scoped to development, which is the whole safety property: a real
    // production ReferenceError is NOT swallowed by this.
    ...(process.env.NODE_ENV === "development"
      ? [/^(?:ReferenceError: )?\w+ is not defined$/]
      : []),
  ],
  // GitHub #57: events with no type, value or message arrive titled
  // "<unknown>". Fill them from the original thrown/rejected value so the
  // next one names its source. Every other event passes through unchanged.
  beforeSend(event, hint) {
    return labelBlankEvent(event, hint?.originalException);
  },
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
