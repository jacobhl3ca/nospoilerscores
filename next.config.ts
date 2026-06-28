import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export — the site is served by Cloudflare Pages, not a Next server.
  output: "export",
  // No rewrites(): Next ignores rewrites under `output: "export"` (it warned
  // "rewrites ... are not applied when exporting" on every build), so the old
  // /api/youtube rewrite was dead config. The real /api/* routing lives in the
  // Cloudflare worker (public/_worker.js), which the client hits same-origin
  // (getApiBase() returns "" on web, the prod origin under Capacitor).
};

export default nextConfig;
