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
  ],
  denyUrls: [
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-web-extension:\/\//,
    /extensions\//,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
