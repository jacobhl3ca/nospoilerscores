import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b1d8b3efe70b8dbe7f865cd0b5dc832a@o4511667913818112.ingest.us.sentry.io/4511694546534400",
  tracesSampleRate: 0.1,
  enableLogs: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
