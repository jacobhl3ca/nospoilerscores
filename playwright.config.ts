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
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
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
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
