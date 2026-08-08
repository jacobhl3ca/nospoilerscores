import type { MetadataRoute } from "next";
import { WORLD_CUP_TEAMS } from "@/lib/worldCupTeams";

// Static sitemap for hidescore.com. Works with `output: "export"` — Next emits
// a static /sitemap.xml at build time. Keep the route list in sync with src/app.
export const dynamic = "force-static";

const BASE = "https://hidescore.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const daily = ["", "/worldcup", "/worldcup/tomorrow", "/worldcup/highlights", "/today", "/tomorrow", "/yesterday"];
  const worldCupTeams = [
    "/worldcup/teams",
    ...WORLD_CUP_TEAMS.map((team) => `/worldcup/teams/${team.slug}`),
  ];
  const evergreen = [
    "/spoiler-free-sports",
    "/how-to-watch-sports-highlights-without-spoilers",
    "/watch-sports-highlights-without-spoilers",
    "/no-spoiler-scores",
    "/nba-scores-without-spoilers",
    "/nhl-scores-without-spoilers",
    "/mlb-highlights-without-spoilers",
    "/nfl-highlights-without-spoilers",
    "/soccer-highlights-without-spoilers",
    "/premier-league-without-spoilers",
    "/liga-mx-scores-without-spoilers",
    "/cricket-highlights-without-spoilers",
    "/watch-world-cup-without-spoilers",
    "/faq",
    "/privacy",
  ];
  const highIntent = new Set([
    "/spoiler-free-sports",
    "/how-to-watch-sports-highlights-without-spoilers",
    "/watch-sports-highlights-without-spoilers",
    "/no-spoiler-scores",
    "/watch-world-cup-without-spoilers",
  ]);
  const leagueIntent = new Set([
    "/nba-scores-without-spoilers",
    "/nhl-scores-without-spoilers",
    "/mlb-highlights-without-spoilers",
    "/nfl-highlights-without-spoilers",
    "/soccer-highlights-without-spoilers",
    // Added 2026-08-03 with the Liga MX and IPL columns. Same 0.7 league-intent
    // priority as the other per-league pages — these two got their own routes
    // (rather than a mention on the soccer page) because they carry real
    // standalone search demand: "liga mx without spoilers", "ipl highlights
    // without spoilers". The other six new soccer competitions deliberately did
    // NOT get routes; thin near-duplicate pages read as doorway content.
    "/liga-mx-scores-without-spoilers",
    "/cricket-highlights-without-spoilers",
    // Added 2026-08-08 for the 2026-27 season. Same standalone-demand test the
    // Liga MX and cricket routes had to pass: "premier league without spoilers"
    // is searched on its own, and the World-Cup-shifted August 21 start date is
    // a question the soccer page cannot answer without becoming about one league.
    "/premier-league-without-spoilers",
  ]);

  // Build timestamp. This file is statically emitted on every Cloudflare deploy,
  // so it reflects when the site was last regenerated — the one <lastmod> signal
  // crawlers still use to prioritize re-crawling.
  const lastModified = new Date();

  return [
    ...daily.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: path === "" ? 1 : path === "/worldcup" ? 0.9 : path.startsWith("/worldcup/") ? 0.8 : 0.7,
    })),
    ...worldCupTeams.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: path === "/worldcup/teams" ? 0.75 : 0.65,
    })),
    ...evergreen.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: highIntent.has(path) ? 0.8 : leagueIntent.has(path) ? 0.7 : 0.5,
    })),
  ];
}
