// Resolve ESPN scoreboard event ids to their airing UUIDs so HideScore can
// deep-link the watch player straight to the per-game stream instead of
// dumping the user on espn.com/watch/player/_/id/{numericEventId}, which is
// hit-or-miss. The real watch URL is /watch/player/_/id/{airingUuid} where
// the UUID is an "airing id" that ESPN exposes via a public picker endpoint.
//
// Input:  today's scoreboard for each sport (site.api.espn.com).
// Output: public/espn-airings.json keyed by ESPN numeric event id.
//
// Runs on cron. Failures are non-fatal — on a full bust we keep yesterday's
// file so existing links keep resolving.
//
// Output shape (public/espn-airings.json):
//   {
//     "generatedAt": "2026-04-18T...Z",
//     "airings": {
//       "401869190": {
//         "uuid": "36ad15b9-9a9e-4008-b800-ab54b6456c5a",
//         "network": "ESPN on ABC"
//       },
//       ...
//     },
//     "nbaGameIds": {
//       "401869190": "0042500101"
//     }
//   }
//
// nbaGameIds maps ESPN event id → NBA's own gameId for League Pass links
// when the game isn't on an ESPN/Prime broadcast.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT_PATH = resolve("public/espn-airings.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const SPORT_PATHS = {
  nba: "/basketball/nba/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
  mlb: "/baseball/mlb/scoreboard",
  nfl: "/football/nfl/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
};

// Only call the picker for games where an ESPN-family network is actually
// listed. The picker would return empty buckets for Prime/TNT games anyway,
// but skipping saves a round trip. If ESPN adds games mid-day we'll pick
// them up on the next cron run.
const ESPN_BROADCAST_RE = /\b(espn|abc|espnu|sec network|acc network|espn\+)\b/i;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchScoreboardGames(sport) {
  const url = `https://site.api.espn.com/apis/site/v2/sports${SPORT_PATHS[sport]}`;
  const data = await fetchJson(url);
  const events = data.events ?? [];
  const games = [];
  for (const e of events) {
    const id = e.id;
    const comp = (e.competitions ?? [])[0] ?? {};
    const broadcasts = [];
    for (const b of comp.broadcasts ?? []) {
      for (const n of b.names ?? []) broadcasts.push(n);
    }
    games.push({ id, sport, broadcasts, shortName: e.shortName ?? "" });
  }
  return games;
}

// Hit ESPN's public picker endpoint. Returns { uuid, network } for the
// primary feed, or null when the event isn't on an ESPN property.
async function resolveAiring(eventId) {
  const url = `https://watch.product.api.espn.com/api/product/v3/watchespn/web/picker?eventId=${eventId}&tz=UTC-0400&lang=en&countryCode=US&entitlements=no&features=continueWatching`;
  const data = await fetchJson(url);
  const buckets = data?.page?.buckets ?? [];
  for (const bucket of buckets) {
    for (const content of bucket.contents ?? []) {
      const stream = (content.streams ?? [])[0];
      if (stream?.id) {
        return {
          uuid: stream.id,
          network: stream.source?.name ?? bucket.name ?? "",
        };
      }
    }
  }
  return null;
}

// NBA's own gameId (for League Pass deep links) comes from the league's
// CDN schedule, keyed by "AWAY@HOME" team tricode. ESPN uses the same
// tricodes for NBA teams, so the match is 1:1.
async function fetchNbaGameIdsByMatchup() {
  const map = new Map();
  try {
    const data = await fetchJson(
      "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"
    );
    const games = data?.scoreboard?.games ?? [];
    for (const g of games) {
      const away = g.awayTeam?.teamTricode;
      const home = g.homeTeam?.teamTricode;
      if (away && home && g.gameId) {
        map.set(`${away}@${home}`, String(g.gameId));
      }
    }
  } catch (e) {
    console.log(`nba cdn schedule failed: ${e.message}`);
  }
  return map;
}

function extractNbaMatchupKey(game) {
  // ESPN shortName for NBA is "AWAY @ HOME" (e.g., "HOU @ LAL"). Normalize.
  const m = game.shortName.match(/^([A-Z]{2,4})\s*@\s*([A-Z]{2,4})/);
  return m ? `${m[1]}@${m[2]}` : null;
}

async function main() {
  const airings = {};
  const nbaGameIds = {};

  // 1. Collect today's games across all ESPN-covered sports.
  const bySport = {};
  for (const sport of Object.keys(SPORT_PATHS)) {
    try {
      bySport[sport] = await fetchScoreboardGames(sport);
      console.log(`ok  scoreboard ${sport} — ${bySport[sport].length} games`);
    } catch (e) {
      console.log(`err scoreboard ${sport} — ${e.message}`);
      bySport[sport] = [];
    }
  }

  // 2. Resolve airing UUIDs for every game with an ESPN-family broadcast.
  const allGames = Object.values(bySport).flat();
  const espnCandidates = allGames.filter((g) =>
    g.broadcasts.some((b) => ESPN_BROADCAST_RE.test(b))
  );
  console.log(
    `resolving ${espnCandidates.length} ESPN-broadcast games across ${allGames.length} total`
  );
  for (const game of espnCandidates) {
    try {
      const result = await resolveAiring(game.id);
      if (result) {
        airings[game.id] = result;
        console.log(`ok  ${game.sport} ${game.id} ${game.shortName} — ${result.uuid}`);
      } else {
        console.log(`--  ${game.sport} ${game.id} ${game.shortName} — no airings`);
      }
    } catch (e) {
      console.log(`err ${game.sport} ${game.id} — ${e.message}`);
    }
  }

  // 3. Build NBA event-id → NBA gameId map for League Pass deep-links
  //    on non-ESPN, non-Prime games.
  const nbaMap = await fetchNbaGameIdsByMatchup();
  for (const game of bySport.nba ?? []) {
    const key = extractNbaMatchupKey(game);
    if (!key) continue;
    const gameId = nbaMap.get(key);
    if (gameId) nbaGameIds[game.id] = gameId;
  }
  console.log(`resolved ${Object.keys(nbaGameIds).length} NBA gameId mappings`);

  // 4. Guard: if we ended up with nothing, keep the previous file rather
  //    than clobbering a working map with an empty one (ESPN could rate-limit
  //    or the CDN could blip — both recover on the next cron).
  if (
    Object.keys(airings).length === 0 &&
    Object.keys(nbaGameIds).length === 0 &&
    existsSync(OUT_PATH)
  ) {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    const prevAirings = Object.keys(prev.airings ?? {}).length;
    const prevNba = Object.keys(prev.nbaGameIds ?? {}).length;
    if (prevAirings > 0 || prevNba > 0) {
      console.log(
        `scrape returned nothing; keeping previous (${prevAirings} airings, ${prevNba} nba)`
      );
      process.exit(0);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    airings,
    nbaGameIds,
  };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(
    `wrote ${Object.keys(airings).length} airings + ${Object.keys(nbaGameIds).length} nba ids → ${OUT_PATH}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
