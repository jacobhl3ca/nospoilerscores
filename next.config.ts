import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Static export — the site is served by Cloudflare Pages, not a Next server.
  output: "export",
  // No rewrites(): Next ignores rewrites under `output: "export"` (it warned
  // "rewrites ... are not applied when exporting" on every build), so the old
  // /api/youtube rewrite was dead config. The real /api/* routing lives in the
  // Cloudflare worker (public/_worker.js), which the client hits same-origin
  // (getApiBase() returns "" on web, the prod origin under Capacitor).
  env: {
    // Build day in New York (YYYY-MM-DD), inlined into the bundle for the
    // board's "Updated" line. Date only, so the static HTML and the hydrated
    // client always agree.
    NEXT_PUBLIC_BUILT_ON: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  },
};

// Sentry: wraps the build to (optionally) upload source maps. SENTRY_AUTH_TOKEN
// is not set in CI, so the upload step just skips — client error capture still
// works via instrumentation-client.ts regardless.
export default withSentryConfig(nextConfig, {
  org: "olarpo",
  project: "hidescore",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
