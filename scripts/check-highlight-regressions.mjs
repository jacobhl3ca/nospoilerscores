#!/usr/bin/env node

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadBindings, transform } from "next/dist/build/swc/index.js";

let failures = 0;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures++;
};

await loadBindings();
const youtubeSource = readFileSync("src/lib/youtube.ts", "utf8");
const transformed = await transform(youtubeSource, {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" },
});
const tempModule = join(tmpdir(), `hidescore-youtube-${process.pid}.mjs`);
// youtube.ts imports ./llwsRegions.json, and the transpiled copy keeps that
// RELATIVE specifier — so it resolves against tmpdir, not src/lib, and the
// import threw ERR_MODULE_NOT_FOUND for the whole script (this check had been
// silently unrunnable since the LLWS region table moved into its own JSON).
// Park a copy of the data file beside the temp module rather than writing the
// temp module into src/, which would leave debris in the repo on a crash.
const tempRegions = join(tmpdir(), "llwsRegions.json");
writeFileSync(tempRegions, readFileSync("src/lib/llwsRegions.json", "utf8"));
// …and Node then demands an import attribute on a JSON specifier in ESM
// (ERR_IMPORT_ATTRIBUTE_MISSING) — SWC's transform doesn't add one, so stamp it
// onto the emitted specifier. Both halves are needed; either alone still throws.
writeFileSync(
  tempModule,
  transformed.code.replace(
    /(from\s*")(\.[^"]*\.json)(")/g,
    '$1$2$3 with { type: "json" }',
  ),
);
const youtube = await import(pathToFileURL(tempModule).href);
unlinkSync(tempModule);
unlinkSync(tempRegions);

check(
  "WNBA expansion names use official title forms",
  youtube.getHighlightSearchQuery("Tempo", "Valkyries", "Aug 4, 2026") ===
    "Toronto Tempo vs Golden State Valkyries highlights Aug 4, 2026",
);
check(
  "NWSL strict secondary is CBS Sports W Golazo",
  JSON.stringify(youtube.getSecondaryChannels("nwsl")) === JSON.stringify(["CBS Sports W Golazo"]),
);
check(
  "Unrelated league secondary channels stay empty",
  youtube.getSecondaryChannels("wnba").length === 0,
);
check(
  "NFL resolves only against the NFL uploader",
  youtube.getOfficialChannelName("nfl") === "NFL",
);
check(
  "an NFL preseason card requires a preseason (or Hall of Fame) title",
  JSON.stringify(youtube.getCompetitionTitleTokens("nfl", { preseason: true })) ===
    JSON.stringify(["preseason", "hall of fame"]),
);
check(
  "a regular-season NFL card sends no competition gate (its gate is the week)",
  youtube.getCompetitionTitleTokens("nfl").length === 0 &&
    youtube.getCompetitionTitleTokens("nfl", { preseason: false }).length === 0,
);
check(
  "the preseason flag changes nothing outside the NFL",
  youtube.getCompetitionTitleTokens("ncaaf", { preseason: true }).length === 0 &&
    JSON.stringify(youtube.getCompetitionTitleTokens("nationschamp", { preseason: true })) ===
      JSON.stringify(["nations championship"]),
);
check(
  "La Liga and Ligue 1 fail closed without approved uploaders",
  youtube.hasNoTrustedHighlightSource("laliga") && youtube.hasNoTrustedHighlightSource("ligue1"),
);
check(
  "golf and tennis majors retain exact verified uploader names",
  youtube.getOfficialChannelName("golf", "PGA Champ") === "PGA Championships" &&
    youtube.getOfficialChannelName("tennis", "Australian Open") === "Australian Open",
);
check(
  "unsupported esports leagues stay dark while LEC is exact-channel only",
  youtube.hasNoTrustedHighlightSource("esports", "LCK") &&
    !youtube.hasNoTrustedHighlightSource("esports", "LEC") &&
    youtube.getOfficialChannelName("esports", "LEC") === "LEC",
);

const originalFetch = globalThis.fetch;
const youtubeRequests = [];
globalThis.fetch = async (url) => {
  youtubeRequests.push(String(url));
  return { ok: true, json: async () => ({ videoId: "verified-id" }) };
};
await youtube.resolveHighlightVideo("Giants", "Cowboys", "Aug 7, 2026", null, "NFL", undefined, null, false);
check(
  "NFL live resolve sends strict=1 and never runs an unscoped tier",
  youtubeRequests.length === 1 && youtubeRequests[0].includes("channel=NFL") && youtubeRequests[0].includes("strict=1"),
);
youtubeRequests.length = 0;
await youtube.resolveTelemundoWorldCupVideo("France", "Spain", "Jul 14, 2026", null);
check(
  "Telemundo World Cup resolve is exact-channel strict",
  youtubeRequests.length === 1 && youtubeRequests[0].includes("channel=Telemundo%20Deportes") && youtubeRequests[0].includes("strict=1"),
);
globalThis.fetch = originalFetch;

const highlightsSource = readFileSync("src/lib/highlights.ts", "utf8")
  .replace('import { getApiBase } from "@/lib/youtube";', 'const getApiBase = () => "";');
const transformedHighlights = await transform(highlightsSource, {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" },
});
const tempHighlightsModule = join(tmpdir(), `hidescore-highlights-${process.pid}.mjs`);
writeFileSync(tempHighlightsModule, transformedHighlights.code);
const highlights = await import(pathToFileURL(tempHighlightsModule).href);
unlinkSync(tempHighlightsModule);
const freshBake = Date.now();
check(
  "prebaked IDs require the exact expected channel marker",
  highlights.getChannelVerifiedBakedId(
    { t: freshBake, matchup: "cowboys|giants", official: "good", officialChannel: "NFL", sourcePolicy: "official-channel" },
    "official",
    "NFL",
    "Giants",
    "Cowboys",
  ) === "good" &&
    highlights.getChannelVerifiedBakedId(
      { t: freshBake, matchup: "cowboys|giants", official: "bad", officialChannel: "NBA", sourcePolicy: "official-channel" },
      "official",
      "NFL",
      "Giants",
      "Cowboys",
    ) === null &&
    highlights.getChannelVerifiedBakedId(
      { official: "legacy", sourcePolicy: "official-channel" },
      "official",
      "NFL",
      "Giants",
      "Cowboys",
    ) === null &&
    highlights.getChannelVerifiedBakedId(
      { official: "unproven", officialChannel: "NFL" },
      "official",
      "NFL",
      "Giants",
      "Cowboys",
    ) === null,
);
check(
  "prebaked IDs require the current matchup and reject duplicate slots",
  highlights.getChannelVerifiedBakedId(
    { t: freshBake, matchup: "cowboys|giants", official: "wrong-game", officialChannel: "NFL", sourcePolicy: "official-channel" },
    "official", "NFL", "Bills", "Jets",
  ) === null &&
    highlights.getChannelVerifiedBakedId(
      { t: freshBake, matchup: "cowboys|giants", official: "same", officialChannel: "NFL", extended: "same", extendedChannel: "NFL", sourcePolicy: "official-channel" },
      "official", "NFL", "Giants", "Cowboys",
    ) === null,
);
check(
  "prebaked IDs expire at the client trust boundary",
  highlights.getChannelVerifiedBakedId(
    { t: freshBake - 11 * 24 * 60 * 60 * 1000, matchup: "cowboys|giants", official: "stale", officialChannel: "NFL", sourcePolicy: "official-channel" },
    "official", "NFL", "Giants", "Cowboys",
  ) === null,
);

const worker = readFileSync("public/_worker.js", "utf8");
check(
  "worker accepts bare-title strict WNBA recaps",
  worker.includes("const isStrictBareWnbaRecap =") && worker.includes('preferChannelLower === "wnba"'),
);
check(
  "worker permits masked result titles only for approved UFC channels",
  worker.includes('new Set(["ufc on paramount+", "ufc", "espn mma"])') &&
    worker.includes("isMaskedOfficialCombatUpload"),
);
check(
  "worker folds diacritics in team-name matching",
  worker.includes("const normalizeTeamMatch =") && worker.includes('.normalize("NFD")'),
);

const monitor = readFileSync("scripts/check-highlight-fallbacks.mjs", "utf8");
check("monitor covers NCAAF", monitor.includes('ncaaf: "/football/college-football/scoreboard"'));
check("monitor covers NCAAW", monitor.includes('ncaaw: "/basketball/womens-college-basketball/scoreboard"'));
// The monitor, the worker and the prebake share one title matcher table: the
// monitor reads the worker's TEAM_ALIASES block, so a club alias added there
// can't leave the monitor flagging a served clip as bake-invalid.
check("monitor reads the worker's club alias table", monitor.includes("const TEAM_ALIASES = {") && monitor.includes("WORKER_TEAM_VARIANTS[normalizedTeam]"));
// NCAA men's hockey is dark (no approved uploader, 2026-09-12). The monitor must
// not scan it: a league with no button would read as a permanent gap.
check(
  "NCAAH stays dark and unmonitored",
  youtube.hasNoTrustedHighlightSource("ncaah") === true &&
    !monitor.includes('ncaah: "/hockey/mens-college-hockey/scoreboard"'),
);
// UFL is dark too (0/5 strict on "UFL", 2026-09-14). Same rule: unmonitored.
check(
  "UFL stays dark and unmonitored",
  youtube.hasNoTrustedHighlightSource("ufl") === true &&
    !monitor.includes('ufl: "/football/ufl/scoreboard"'),
);
// NCAA baseball + softball are dark the same way (2026-09-14).
check(
  "NCAA baseball and softball stay dark and unmonitored",
  youtube.hasNoTrustedHighlightSource("ncaabase") === true &&
    youtube.hasNoTrustedHighlightSource("ncaasoft") === true &&
    !monitor.includes('ncaabase: "/baseball/college-baseball/scoreboard"') &&
    !monitor.includes('ncaasoft: "/baseball/college-softball/scoreboard"'),
);
check("monitor rejects incomplete ESPN audits", monitor.includes("Source failures are not zero-game slates"));
check("rejected custom ESPN User-Agent is gone", !monitor.includes("nospoilerscores-staleness-check/1.0"));
check(
  "monitor verifies strict API requests and live oEmbed authors",
  monitor.includes('url += "&strict=1"') && monitor.includes("youtubeOembedMeta") && monitor.includes("author_name"),
);
check(
  "monitor fails closed on manifest I/O and verifies matchup plus all duplicates",
  monitor.includes('source: "highlight-manifest"') &&
    monitor.includes("missing or inconsistent matchup provenance") &&
    monitor.includes("title does not match") &&
    monitor.includes("duplicates ${prior.slot}") &&
    !monitor.includes("duplicates ${prior.slot} but claims a different channel"),
);
check(
  "monitor separates incomplete sources and enforces prebake age",
  monitor.includes("youtube-oembed") &&
    monitor.includes("missing or expired bake timestamp") &&
    monitor.includes("process.exit(2)") &&
    monitor.includes("BAKED_MAX_AGE_MS"),
);
check(
  "distinct invalid prebakes receive distinct persistent incident keys",
  monitor.includes('createHash("sha256")') && monitor.includes("eventId}:${signature}"),
);
check(
  "monitor excludes non-YouTube MLB and unapproved La Liga/Ligue 1 paths",
  !monitor.includes('mlb:   "/baseball/mlb/scoreboard"') &&
    !monitor.includes('laliga:       "/soccer/esp.1/scoreboard"') &&
    !monitor.includes('ligue1:       "/soccer/fra.1/scoreboard"'),
);
check(
  "runtime monitor covers every shipped highlight family",
  ["scanRacingAndUfc", "scanCuratedEvents", "scanChess", "scanEsports", "scanGolf", "scanTennis"]
    .every((name) => monitor.includes(`await ${name}()`)) &&
    monitor.includes("team games, tennis, golf, racing, UFC, poker, boxing, chess, esports"),
);

const gameHighlights = readFileSync("src/components/GameHighlights.tsx", "utf8");
check(
  "every per-game modal retry carries its slot's strict channel",
  gameHighlights.includes("officialModalFallbackUrl") &&
    gameHighlights.includes("secondaryModalFallbackUrl") &&
    gameHighlights.includes("nss_strict=1&nss_channels="),
);
check(
  "per-game prebakes are read only through channel-marker validation",
  gameHighlights.includes("getChannelVerifiedBakedId") &&
    !gameHighlights.includes("baked?.extended ?? baked?.official"),
);

const videoModal = readFileSync("src/components/VideoModal.tsx", "utf8");
check(
  "modal fails closed when a YouTube retry has no strict channel contract",
  videoModal.includes("if (!strictChannels.length)") &&
    !videoModal.includes("/api/youtube?q=${encodeURIComponent(q)}&exclude=${excl}${raceParam}`"),
);

const eventCard = readFileSync("src/components/EventCard.tsx", "utf8");
check(
  "racing, UFC, poker, and boxing all use strict lookups with no search handoff",
  eventCard.includes("fetchFirstVideoId(query, channel, undefined, undefined, true, raceTokens)") &&
    eventCard.includes("for (const channel of UFC_HIGHLIGHT_CHANNELS)") &&
    eventCard.includes("playStrictOnly") &&
    !eventCard.includes("openExternal(fallback)"),
);
check(
  "racing strict misses hide the button",
  eventCard.includes("setRaceSource(src)") && eventCard.includes("raceSource !== null"),
);

const golf = readFileSync("src/components/GolfLeaderboard.tsx", "utf8");
check(
  "every golf resolver is strict and missing slots stay hidden",
  golf.includes("fetchFirstVideoId(highlightQuery, mainChannel, undefined, undefined, true)") &&
    golf.includes("fetchFirstVideoId(q, channel, undefined, undefined, true)") &&
    golf.includes("visibleHighlightSlots"),
);

const prebake = readFileSync("scripts/prebake-news.mjs", "utf8");
check(
  "prebaker requests strict channels and records per-slot channel provenance",
  prebake.includes("strict: true") &&
    prebake.includes("officialChannel") && prebake.includes("extendedChannel") &&
    prebake.includes("HIGHLIGHT-DUPLICATE-REJECT"),
);
check(
  "prebaker excludes MLB YouTube and unapproved soccer searches",
  !prebake.includes('{ sport: "mlb",') &&
    !prebake.includes('{ sport: "laliga",') &&
    !prebake.includes('{ sport: "ligue1",'),
);
check(
  "prebaker revalidates persistent World Cup seed uploader and matchup",
  prebake.includes("HIGHLIGHT-SEED-REJECT") &&
    prebake.includes("hlVideoMatchesChannel(id, channel)") &&
    prebake.includes("hlVideoMatchesTeams(id, teams[0], teams[1])"),
);
check(
  "prebaker stamps every game identity and fails a broken highlights-only run",
  prebake.includes("teams: [away, home], matchup, eventDate: item.date") &&
    prebake.includes("all highlight scoreboard requests failed") &&
    prebake.includes('highlightsFailed && ONLY_LIST.includes("highlights")'),
);

console.log(failures ? `\n${failures} regression check(s) failed` : "\nall highlight regression checks passed");
process.exit(failures ? 1 : 0);
