#!/usr/bin/env node
// Audits NFL_TEAM_CHANNELS (src/lib/nflTeamChannels.ts) against YouTube itself,
// and against ESPN's current team list.
//
// Why by RSS and not by a search: a channel-scoped /api/youtube lookup that
// returns "No results" proves NOTHING about the string. Running exactly that
// check on this table scored 23/32 and flagged nine names — every one of which
// is correct, confirmed by RSS seconds later; the query simply didn't surface
// those clubs. The ground truth is the channel's own feed:
//   @handle → <link rel="canonical"> → /feeds/videos.xml → <author><name>
// which is why the table stores the handle next to the name.
//
//   node scripts/check-nfl-team-channels.mjs
//
// Exits 1 when a stored name disagrees with the live RSS name, when a handle
// stops resolving, or when ESPN lists a team the table has no row for. Those
// are the three ways this silently becomes a blank highlight row instead of an
// error — the Liga MX failure mode.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src", "lib", "nflTeamChannels.ts");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Parse the table out of the TypeScript source rather than keeping a copy here.
// A checker with its own copy validates the bug instead of catching it.
function readTable() {
  const src = readFileSync(SRC, "utf8");
  const block = src.match(/const NFL_TEAM_CHANNELS[^{]*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.error("✗ Could not find NFL_TEAM_CHANNELS in src/lib/nflTeamChannels.ts.");
    process.exit(1);
  }
  const rows = new Map();
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*\{\s*channel:\s*"([^"]+)",\s*handle:\s*"([^"]+)"/);
    if (m) rows.set(m[1], { channel: m[2], handle: m[3] });
  }
  return rows;
}

async function liveChannelName(handle) {
  const html = await fetch(`https://www.youtube.com/@${handle}`, { headers: { "user-agent": UA } })
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  const id = html.match(/rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/([\w-]+)"/)?.[1];
  if (!id) return { name: null, uploads: 0, reason: "handle no longer resolves" };
  const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  return {
    name: xml.match(/<author>\s*<name>(.*?)<\/name>/s)?.[1] ?? null,
    uploads: [...xml.matchAll(/<media:title>/g)].length,
    reason: null,
  };
}

const table = readTable();
const espn = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40")
  .then((r) => r.json())
  .then((d) => (d.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team.abbreviation))
  .catch(() => []);

const problems = [];
for (const [abbr, row] of table) {
  const live = await liveChannelName(row.handle);
  if (live.reason) {
    problems.push(`${abbr}: @${row.handle} ${live.reason}`);
    console.log(`  DEAD ${abbr.padEnd(4)} @${row.handle} — ${live.reason}`);
  } else if (live.name !== row.channel) {
    problems.push(`${abbr}: table says "${row.channel}", YouTube says "${live.name}"`);
    console.log(`  DIFF ${abbr.padEnd(4)} "${row.channel}" → now "${live.name}"`);
  } else if (live.uploads === 0) {
    // An empty feed is the squatted-slug signature: the six that trapped the
    // first build of this table (@clevelandbrowns et al) all looked like this.
    problems.push(`${abbr}: @${row.handle} has an EMPTY feed — likely a squatted slug`);
    console.log(`  EMPTY ${abbr.padEnd(3)} @${row.handle} — no uploads`);
  } else {
    console.log(`  ok   ${abbr.padEnd(4)} ${row.channel}`);
  }
  await sleep(300);
}

const missing = espn.filter((a) => !table.has(a));
if (missing.length) {
  problems.push(`ESPN lists teams with no row: ${missing.join(", ")}`);
  console.log(`\n  ESPN lists ${missing.length} team(s) this table has no row for: ${missing.join(", ")}`);
}

console.log(`\n${table.size} rows checked, ${espn.length} teams on ESPN's list.`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n` + problems.map((p) => `    - ${p}`).join("\n"));
  process.exit(1);
}
console.log("✓ Every NFL club channel name matches the channel's own feed.");
