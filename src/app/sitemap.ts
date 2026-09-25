import type { MetadataRoute } from "next";
import { routeLastModified } from "@/lib/routeLastModified";

// Static sitemap for hidescore.com. Works with `output: "export"` — Next emits
// a static /sitemap.xml at build time. Keep the route list in sync with src/app.
export const dynamic = "force-static";

const BASE = "https://hidescore.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const daily = [
    "", "/worldcup", "/worldcup/tomorrow", "/worldcup/highlights", "/today", "/tomorrow", "/yesterday",
    // Added 2026-09-23. Daily rather than evergreen: each leads with the live
    // MLB playoff panel, so what a crawler renders changes every game day from
    // September through the World Series. Demand is in each route's header.
    "/mlb-playoff-bracket", "/mlb-playoff-picture", "/mlb-wild-card-standings",
  ];
  // Trimmed to the index page on 2026-09-20. The 48 per-team routes
  // (/worldcup/teams/<slug>) stay LIVE and stay linked from /worldcup/teams —
  // they are simply no longer submitted. Over the 30 days to 2026-09-20 all 48
  // earned 0 views between them, which is two thirds of the 72 URLs in this
  // file spending crawl budget that the eight new league pages added the same
  // day actually need. The 2026 World Cup finished on July 19, so this is the
  // off-cycle trough rather than a permanent verdict: restore the per-team
  // routes when the 2030 cycle starts drawing searches again.
  const worldCupTeams = ["/worldcup/teams"];
  const evergreen = [
    "/spoiler-free-sports",
    "/how-to-watch-sports-highlights-without-spoilers",
    "/watch-sports-highlights-without-spoilers",
    // Added 2026-09-24: paste any YouTube link and play it with the title
    // covered. Only the bare landing is listed; ?v= links are per-clip shares.
    "/watch",
    "/no-spoiler-scores",
    "/nba-scores-without-spoilers",
    "/nhl-scores-without-spoilers",
    "/mlb-highlights-without-spoilers",
    "/nfl-highlights-without-spoilers",
    "/nhl-highlights-without-spoilers",
    "/soccer-highlights-without-spoilers",
    "/premier-league-without-spoilers",
    "/liga-mx-scores-without-spoilers",
    "/cricket-highlights-without-spoilers",
    "/watch-world-cup-without-spoilers",
    // Added 2026-09-20 — seven new per-league routes plus the comparison page.
    // See each route's own header comment for the demand it answers and the
    // ESPN feed its dated facts were verified against.
    "/nba-highlights-without-spoilers",
    "/champions-league-without-spoilers",
    "/college-football-highlights-without-spoilers",
    "/f1-without-spoilers",
    "/ufc-results-without-spoilers",
    "/la-liga-without-spoilers",
    "/mls-highlights-without-spoilers",
    "/best-spoiler-free-sports-sites",
    "/redzone-for-every-sport",
    "/faq",
    // Added 2026-09-24: who runs the site and how to reach it, for the
    // entity/contact checks answer engines make. No personal details on it.
    "/about",
    "/contact",
    "/privacy",
  ];
  const highIntent = new Set([
    "/spoiler-free-sports",
    "/watch",
    "/how-to-watch-sports-highlights-without-spoilers",
    "/watch-sports-highlights-without-spoilers",
    "/no-spoiler-scores",
    "/watch-world-cup-without-spoilers",
    // Added 2026-09-20. Not a league page: it is a cross-service comparison
    // aimed at answer engines (chatgpt.com is already the third-largest
    // referrer to the site), so it sits with the hubs at 0.8 rather than with
    // the per-league routes at 0.7.
    "/best-spoiler-free-sports-sites",
    // Added 2026-09-20. High-intent rather than league-intent: it answers a
    // question ("is there a redzone for <sport>") that currently lands on the
    // homepage, and it is the only page on the site carrying the dated
    // whip-around inventory, so it competes on its own rather than as one of
    // the per-league set.
    "/redzone-for-every-sport",
  ]);
  const leagueIntent = new Set([
    "/nba-scores-without-spoilers",
    "/nhl-scores-without-spoilers",
    "/mlb-highlights-without-spoilers",
    "/nfl-highlights-without-spoilers",
    // Added 2026-08-15. Not a new-demand bet like the three below — this one is
    // measured: GSC had "spoiler free nhl highlights" at 149 impressions and 0
    // clicks from position 6.9, all of it landing on the homepage for want of a
    // page that answers it. See the route's own header comment.
    "/nhl-highlights-without-spoilers",
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
    // Added 2026-09-20. Each of these seven cleared the specificity gate rather
    // than being a thin near-duplicate of the pages above: every one carries
    // dated fixtures, kickoff times in ET and the US broadcaster, verified
    // against the ESPN feed on the day it shipped, plus a section on that
    // sport's own spoiler mechanism (the UCL's simultaneous 3:00 pm ET
    // kickoffs, F1's pre-dawn races, a 65-game college football Saturday).
    // A golf route was planned for the same batch and was DROPPED: the app
    // covers only the four majors, none of which is in window until April 2027,
    // so its call to action had nowhere live to land.
    "/nba-highlights-without-spoilers",
    "/champions-league-without-spoilers",
    "/college-football-highlights-without-spoilers",
    "/f1-without-spoilers",
    "/ufc-results-without-spoilers",
    "/la-liga-without-spoilers",
    "/mls-highlights-without-spoilers",
  ]);

  // Build timestamp, for the boards whose rendered content really does change
  // every day. Everything else carries the date its own source last changed
  // (routeLastModified) — until 2026-09-24 every URL got the build time, so all
  // of them claimed "changed today" on every deploy and the signal meant nothing.
  // The World Cup routes moved to the git date too: the tournament ended July 19.
  const buildTime = new Date();
  const dated = (path: string) => {
    const d = routeLastModified(path);
    return d ? { lastModified: d } : {};
  };

  return [
    ...daily.map((path) => ({
      url: `${BASE}${path}`,
      ...(path.startsWith("/worldcup") ? dated(path) : { lastModified: buildTime }),
      changeFrequency: "daily" as const,
      priority: path === "" ? 1 : path === "/worldcup" ? 0.9 : path.startsWith("/worldcup/") ? 0.8 : 0.7,
    })),
    ...worldCupTeams.map((path) => ({
      url: `${BASE}${path}`,
      ...dated(path),
      changeFrequency: "daily" as const,
      priority: path === "/worldcup/teams" ? 0.75 : 0.65,
    })),
    ...evergreen.map((path) => ({
      url: `${BASE}${path}`,
      ...dated(path),
      changeFrequency: "weekly" as const,
      priority: highIntent.has(path) ? 0.8 : leagueIntent.has(path) ? 0.7 : 0.5,
    })),
  ];
}
