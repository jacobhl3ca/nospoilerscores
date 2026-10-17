import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Accessibility (axe) pass — see tests/a11y/axe.spec.ts for what it scans and
// how the baseline works. Its own config because it runs the PRODUCTION static
// export (npm run build, then out/ served as Cloudflare Pages serves it), not
// `next dev`: the dev overlay injects its own DOM that axe would report, and
// the shipped markup is what users get.
//
//   npm run a11y          — fail on a serious/critical violation not in the baseline
//   npm run a11y:update   — rewrite tests/a11y/baseline.json from today's run
//
// PLAYWRIGHT_BASE_URL skips the build and points the suite at a server that is
// already running (same contract as playwright.config.ts).
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const updating = !!process.env.A11Y_UPDATE_BASELINE;

export default defineConfig({
  ...base,
  testDir: "./tests/a11y",
  // Update mode rewrites one shared JSON file, read-modify-write per test:
  // one worker keeps those writes in order.
  workers: updating ? 1 : base.workers,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...base.use,
    baseURL: externalBaseURL || "http://localhost:3100",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: externalBaseURL ? undefined : {
    command: "npm run build && node tests/a11y/serve-out.mjs",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
