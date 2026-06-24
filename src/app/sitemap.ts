import type { MetadataRoute } from "next";

// Static sitemap for hidescore.com. Works with `output: "export"` — Next emits
// a static /sitemap.xml at build time. Keep the route list in sync with src/app.
export const dynamic = "force-static";

const BASE = "https://hidescore.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const daily = ["", "/worldcup", "/today", "/tomorrow", "/yesterday"];
  const evergreen = ["/watch-world-cup-without-spoilers", "/faq", "/privacy"];

  // Build timestamp. This file is statically emitted on every Cloudflare deploy,
  // so it reflects when the site was last regenerated — the one <lastmod> signal
  // crawlers still use to prioritize re-crawling.
  const lastModified = new Date();

  return [
    ...daily.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: path === "" ? 1 : path === "/worldcup" ? 0.9 : 0.7,
    })),
    ...evergreen.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: path === "/watch-world-cup-without-spoilers" ? 0.8 : 0.5,
    })),
  ];
}
