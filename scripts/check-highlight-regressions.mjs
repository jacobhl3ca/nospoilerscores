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
// youtube.ts also imports ./nflTeamChannels (the club embed-block, 2026-09-14).
// Same treatment: transpile it beside the temp module and point the relative
// specifier at the emitted file.
const clubSource = readFileSync("src/lib/nflTeamChannels.ts", "utf8");
const clubTransformed = await transform(clubSource, {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" },
});
const tempClubs = join(tmpdir(), `hidescore-nflTeamChannels-${process.pid}.mjs`);
writeFileSync(tempClubs, clubTransformed.code);
// …and ./collegeHighlights + its JSON table (college fallbacks, 2026-09-16).
const tempCollegeJson = join(tmpdir(), "collegeHighlightChannels.json");
writeFileSync(tempCollegeJson, readFileSync("src/lib/collegeHighlightChannels.json", "utf8"));
const collegeTransformed = await transform(readFileSync("src/lib/collegeHighlights.ts", "utf8"), {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" },
});
const tempCollege = join(tmpdir(), `hidescore-collegeHighlights-${process.pid}.mjs`);
writeFileSync(tempCollege, collegeTransformed.code);
writeFileSync(
  tempModule,
  transformed.code
    .replace(
      /(from\s*")(\.[^"]*\.json)(")/g,
      '$1$2$3 with { type: "json" }',
    )
    .replace(/(from\s*")\.\/nflTeamChannels(")/g, `$1./${tempClubs.split("/").pop()}$2`)
    .replace(/(from\s*")\.\/collegeHighlights(")/g, `$1./${tempCollege.split("/").pop()}$2`),
);
const youtube = await import(pathToFileURL(tempModule).href);
unlinkSync(tempModule);
unlinkSync(tempRegions);
unlinkSync(tempClubs);
unlinkSync(tempCollege);
unlinkSync(tempCollegeJson);

check(
  "NCAAF queries use the full school name (team.location), not ESPN's short form",
  youtube.highlightTeamName("ncaaf", "Western KY", "Western Kentucky") === "Western Kentucky" &&
    youtube.highlightTeamName("ncaaf", "Georgia", undefined) === "Georgia" &&
    youtube.highlightTeamName("nba", "Lakers", "Los Angeles") === "Lakers",
);
check(
  "NCAAF fallback chain: home conference, away conference, network; all football-gated",
  (() => {
    const chain = youtube.getHighlightFallbackChannels("ncaaf", "ESPN College Football", { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]);
    return JSON.stringify(chain.map((f) => f.channel)) === JSON.stringify(["SEC", "Big Ten Football", "CFB ON FOX"]) &&
      chain.every((f) => f.titleTokens.includes("football"));
  })(),
);
check(
  "Sports without a fallback table get no fallback channels",
  youtube.getHighlightFallbackChannels("nba", "NBA", { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]).length === 0,
);

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
// The club short-cut button (GameHighlights "Lions 10m") is embed-blocked
// exactly like the league's cut, so the modal must open on the hand-off card
// at once instead of mounting a player that fires error 150 first.
check(
  "NFL club channels are embed-blocked like the league channel",
  youtube.leadChannelBlocksEmbeds(["Detroit Lions"]) === true
    && youtube.leadChannelBlocksEmbeds(["Raiders"]) === true
    && youtube.leadChannelBlocksEmbeds(["NFL"]) === true
    && youtube.leadChannelBlocksEmbeds(["NBA"]) === false,
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
// Lit 2026-09-19 against their US broadcasters. The guard flipped from "these
// two stay dark" to "these two resolve ONLY against that exact channel AND only
// with the competition name in the title" — ESPN FC also cuts the FA Cup, the
// Copa del Rey and the Premier League, so without the token a LaLiga card can
// be served a cup tie between the same clubs (measured on Copa del Rey,
// 2026-09-14). Dropping either half re-opens a wrong-match path.
check(
  "La Liga and Ligue 1 resolve only against their broadcaster channel",
  youtube.getOfficialChannelName("laliga") === "ESPN FC" &&
    youtube.getOfficialChannelName("ligue1") === "beIN SPORTS USA" &&
    !youtube.hasNoTrustedHighlightSource("laliga") &&
    !youtube.hasNoTrustedHighlightSource("ligue1"),
);
check(
  "La Liga and Ligue 1 both require their competition name in the title",
  JSON.stringify(youtube.getCompetitionTitleTokens("laliga")) === JSON.stringify(["laliga", "la liga"]) &&
    JSON.stringify(youtube.getCompetitionTitleTokens("ligue1")) === JSON.stringify(["ligue 1"]),
);
// The Europa League's uploader moved to CBS's second European channel. UCL and
// Serie A did NOT move — asserting that here keeps a well-meaning "fix them all
// the same way" edit from going out unprobed.
check(
  "UEL resolves against CBS Sports Golazo - Europe while UCL and Serie A do not",
  youtube.getOfficialChannelName("uel") === "CBS Sports Golazo - Europe" &&
    youtube.getOfficialChannelName("ucl") === "CBS Sports Golazo" &&
    youtube.getOfficialChannelName("seriea") === "CBS Sports Golazo" &&
    youtube.getSecondaryChannels("uel")[0] === "CBS Sports Golazo",
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
// NCAA women's hockey was lit 2026-09-23 from the ECAC Hockey conference
// chain, like ncaavb: no fixed channel, a `women` title token (the channel
// also posts the men's cuts), and RPI queried by the name its titles use. A
// game with no ECAC school stays dark. Still unmonitored: the monitor models
// fixed-channel leagues only.
check(
  "NCAAWH lights from the ECAC Hockey chain behind the women token, unmonitored",
  youtube.highlightPrimaryFromChain("ncaawh") === true &&
    JSON.stringify(youtube.getHighlightFallbackChannels("ncaawh", null, { id: "ncaawh-2385" }, { id: "ncaawh-2528" }, []))
      === JSON.stringify([{ channel: "ECAC Hockey", titleTokens: ["women"] }]) &&
    youtube.getHighlightFallbackChannels("ncaawh", null, { id: "ncaawh-430" }, { id: "ncaawh-2815" }, []).length === 0 &&
    JSON.stringify(youtube.getCompetitionTitleTokens("ncaawh")) === JSON.stringify(["women"]) &&
    youtube.getYouTubeSearchUrl("Rensselaer", "Mercyhurst", "Sep 18, 2026").includes("RPI%20vs%20Mercyhurst") &&
    !monitor.includes('ncaawh: "/hockey/womens-college-hockey/scoreboard"'),
);
// NCAA women's volleyball is dark too (2026-09-14): "NCAA Championships" was
// 1/5 strict on the 2025 tournament, "ESPN" 0/3. Same rule: never scanned.
check(
  "NCAAVB stays dark and unmonitored",
  youtube.hasNoTrustedHighlightSource("ncaavb") === true &&
    !monitor.includes('ncaavb: "/volleyball/womens-college-volleyball/scoreboard"'),
);
// Conference League, Copa del Rey and DFB-Pokal are dark (2026-09-14): no
// uploader cleared the 4/5 gate and every candidate served a wrong match. The
// monitor must not scan them. The FA Cup IS lit, on ESPN FC with a required
// "fa cup" title token in all three copies.
for (const [sport, path] of [
  ["uecl", '/soccer/uefa.europa.conf/scoreboard'],
  ["copadelrey", '/soccer/esp.copa_del_rey/scoreboard'],
  ["dfbpokal", '/soccer/ger.dfb_pokal/scoreboard'],
]) {
  check(
    `${sport} stays dark and unmonitored`,
    youtube.hasNoTrustedHighlightSource(sport) === true && !monitor.includes(`"${path}"`),
  );
}
check(
  "FA Cup is lit on ESPN FC with the fa cup title gate in all three copies",
  youtube.hasNoTrustedHighlightSource("facup") === false &&
    youtube.getOfficialChannelName("facup") === "ESPN FC" &&
    JSON.stringify(youtube.getCompetitionTitleTokens("facup")) === JSON.stringify(["fa cup"]) &&
    monitor.includes('facup:        "/soccer/eng.fa/scoreboard"') &&
    monitor.includes('facup: "ESPN FC"') &&
    /facup: \["fa cup"\]/.test(monitor) &&
    /facup: \["fa cup"\]/.test(readFileSync("scripts/prebake-news.mjs", "utf8")),
);
// CFL (2026-09-13): TSN is the uploader, served through the worker route.
check("monitor covers CFL", monitor.includes('cfl:          "/api/cfl"') && monitor.includes('cfl: "TSN"'));
check("CFL highlights resolve against TSN", youtube.getOfficialChannelName("cfl") === "TSN");
// TSN titles the CFL postseason by round with no year; without the round gate
// the 2025 semi-finals resolved to a regular-season meeting (2026-09-13).
check(
  "CFL playoff round gate is mirrored by the prebaker and the monitor",
  youtube.getCompetitionTitleTokens("cfl", { playoff: true, playoffLabel: "Eastern Semi-Final" })[0] === "semi final" &&
    readFileSync("scripts/prebake-news.mjs", "utf8").includes("function hlCflPlayoffTokens") &&
    monitor.includes("function cflPlayoffTokens"),
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
  "monitor excludes non-YouTube MLB and covers the newly lit La Liga/Ligue 1",
  !monitor.includes('mlb:   "/baseball/mlb/scoreboard"') &&
    monitor.includes('laliga:       "/soccer/esp.1/scoreboard"') &&
    monitor.includes('ligue1:       "/soccer/fra.1/scoreboard"'),
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
  "prebaker excludes MLB YouTube and bakes La Liga/Ligue 1 behind their tokens",
  !prebake.includes('{ sport: "mlb",') &&
    prebake.includes('{ sport: "laliga",') &&
    prebake.includes('{ sport: "ligue1",') &&
    prebake.includes('laliga: ["laliga", "la liga"]') &&
    prebake.includes('ligue1: ["ligue 1"]'),
);
// FotMob (2026-09-23): a second source for an EMPTY soccer official slot only,
// mini-only, off with HL_FOTMOB=0, ≤41 requests per bake, tagged src "fotmob".
// The client trusts it under its own channel and keeps its title covered.
{
  const gameHighlights = readFileSync("src/components/GameHighlights.tsx", "utf8");
  const videoModal = readFileSync("src/components/VideoModal.tsx", "utf8");
  check(
    "FotMob is bake-only, capped, switchable and tagged",
    prebake.includes('process.env.HL_FOTMOB !== "0"') &&
      prebake.includes('process.env.GITHUB_ACTIONS !== "true"') &&
      prebake.includes("HL_FOTMOB_MAX_LEAGUE_FETCHES = 11") &&
      prebake.includes("HL_FOTMOB_MAX_MATCH_FETCHES = 30") &&
      prebake.includes("if (!official) {\n          const fotmob = await hlFotmobOfficial(") &&
      prebake.includes("if (officialSrc) entry.src = officialSrc;"),
  );
  check(
    "FotMob officials are trusted under their own channel with the title mask forced on",
    gameHighlights.includes('baked?.src === "fotmob" && baked.officialChannel') &&
      gameHighlights.includes("&nss_mask_title=1") &&
      videoModal.includes("|| fallbackForcesTitleMask(fallbackUrl)"),
  );
}
check(
  "prebaker bakes NCAA volleyball from each match's conference chain behind the volleyball token",
  prebake.includes('{ sport: "ncaavb",') &&
    prebake.includes('ncaavb: ["volleyball"]') &&
    prebake.includes("HL_COLLEGE_CHANNELS[lg.sport]?.primaryFromChain") &&
    JSON.stringify(youtube.getCompetitionTitleTokens("ncaavb")) === JSON.stringify(["volleyball"]),
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
check(
  "prebaker bakes NCAA women's hockey from the ECAC chain behind the women token, RPI aliased",
  prebake.includes('{ sport: "ncaawh", path: "/hockey/womens-college-hockey/scoreboard",') &&
    prebake.includes('ncaawh: ["women"]') &&
    prebake.includes('Rensselaer: "RPI"') &&
    prebake.includes("HL_COLLEGE_CHANNELS[lg.sport]?.primaryFromChain"),
);

console.log(failures ? `\n${failures} regression check(s) failed` : "\nall highlight regression checks passed");
process.exit(failures ? 1 : 0);
