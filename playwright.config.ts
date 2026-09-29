import { defineConfig, devices } from "@playwright/test";

// Visual-regression suite for HideScore's key public pages. Purpose: catch
// silent AI rewrites (structural/CSS breakage) of pages that get almost no
// human review before deploy. NOT a functional test suite — see
// tests/visual/public-pages.spec.ts for the masking rationale (live scores,
// dates, and feeds are masked so day-to-day sports data changes don't cause
// false-positive diffs).
//
// Usage:
//   npm run visual          — compare against committed baselines
//   npm run visual:update   — (re)generate baselines after an intentional change
//
// PLAYWRIGHT_BASE_URL points the suite at a dev server that is already running
// elsewhere (e.g. ~/scripts/pw-webkit-mini.sh runs WebKit on the mini against
// the laptop's server); webServer is then skipped.
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  use: {
    baseURL: externalBaseURL || "http://localhost:3000",
    trace: "retain-on-failure",
    // Production registers a service worker (layout.tsx, prod only), and
    // page.route() never sees a request the worker answers. So a live
    // read-back (a config spreading this `use` with baseURL set to
    // https://hidescore.com) got the REAL feeds where a spec had mocked them.
    // Dev registers none, so this changes nothing locally.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: externalBaseURL ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
