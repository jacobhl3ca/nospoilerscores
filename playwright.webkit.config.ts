import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// WebKit pass for specs that need the engine (A1's focus recovery). Not in
// the default config: the visual baselines are Chromium-only. Run it on the mini
// (WebKit on the MacBook puts page windows in Mission Control):
//   ~/scripts/pw-webkit-mini.sh --config playwright.webkit.config.ts . tests/visual/modal-keys-news-play.spec.ts
export default defineConfig({
  ...base,
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } }],
});
