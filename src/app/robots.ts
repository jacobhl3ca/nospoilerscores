import type { MetadataRoute } from "next";

// Static robots.txt for hidescore.com (output: "export" emits it at build time).
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://hidescore.com/sitemap.xml",
    host: "https://hidescore.com",
  };
}
