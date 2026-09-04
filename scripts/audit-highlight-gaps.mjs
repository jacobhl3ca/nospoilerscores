#!/usr/bin/env node
// Why a finished game has no highlight button — answered per game, not by hand.
//
// A missing button has four very different causes and they look identical from
// the outside:
//
//   BAKED        the manifest has it; the card shows it. Nothing to do.
//   BAKE-GAP     the bake missed it but a live strict lookup finds it, so the
//                card still resolves — just slowly, one scrape per reader.
//                Usually means the recap posted after the last bake ran.
//   NO-RECAP     the approved uploader has nothing for this fixture. The button
//                is SUPPOSED to be missing; hiding beats guessing.
//   WRONG-OWNER  a clip exists but the channel that has it is not the approved
//                one. This is the actionable one: either the channel string in
//                OFFICIAL_CHANNELS is stale/renamed (a wrong string silently
//                turns the official slot off — see the "Australian Open TV" and
//                golf_pga notes in src/lib/youtube.ts), or the only uploads are
//                re-uploads and the league is right to stay dark.
//
// Only WRONG-OWNER needs a human. This script exists so nobody has to eyeball a
// slate to find out which games are which.
//
//   node scripts/audit-highlight-gaps.mjs                # yesterday, ET
//   node scripts/audit-highlight-gaps.mjs --date 20260903
//   node scripts/audit-highlight-gaps.mjs --league saudi --pace 12
//
// PACING: every lookup goes through the same /api/youtube worker real cards use,
// and youtube.com soft-blocks that Worker's SHARED IP when it is scraped in a
// burst — which briefly breaks highlights for actual readers, not just this
// audit (see the long note in scripts/check-highlight-fallbacks.mjs). So the
// default is one lookup every 8 seconds and --pace only goes up.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const etYmd = (offsetDays) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(Date.now() + offsetDays * 86400000)).replace(/-/g, "");
const YMD = arg("date", etYmd(-1));
const ONLY = arg("league", null);
const PACE = Math.max(8, Number(arg("pace", 8))) * 1000;

// Scoreboard paths and the sport->channel map are READ OUT of the app rather
// than copied here. A third hand-maintained copy of either is a copy that drifts,
// and a drifted copy makes this audit validate the bug instead of finding it.
const ESPN_SRC = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");
const YT_SRC = readFileSync(join(ROOT, "src/lib/youtube.ts"), "utf8");
const block = (src, decl) => src.slice(src.indexOf(decl), src.indexOf("\n};", src.indexOf(decl)));
const pairs = (text) => Object.fromEntries([...text.matchAll(/^\s{2}([a-z0-9_]+):\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1], m[2].replace(/\\(.)/g, "$1")]));
const PATHS = pairs(block(ESPN_SRC, "const SPORT_PATHS"));
const CHANNELS = pairs(block(YT_SRC, "const OFFICIAL_CHANNELS"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) }); }
    catch { if (i === tries - 1) return null; await sleep(3000); }
  }
}
const norm = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dateStr = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

async function lookup(query, channel) {
  let url = `${BASE}/api/youtube?q=${encodeURIComponent(query)}`;
  if (channel) url += `&channel=${encodeURIComponent(channel)}&strict=1`;
  const r = await get(url);
  await sleep(PACE);
  if (!r || !r.ok) return null;
  try { return (await r.json())?.videoId ?? null; } catch { return null; }
}

async function owner(id) {
  const r = await get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}&format=json`);
  if (!r || !r.ok) return null;
  try { const d = await r.json(); return { author: d.author_name, title: d.title }; } catch { return null; }
}

const manifest = await (async () => {
  const r = await get(`${BASE}/news/highlights.json?ts=${Date.now()}`);
  if (!r || !r.ok) { console.error("could not read the baked manifest — every game will read as a gap"); return {}; }
  return (await r.json())?.games ?? {};
})();

// Only leagues with an approved uploader can produce a verdict: a league with no
// channel is dark ON PURPOSE and has nothing to audit.
const leagues = Object.keys(PATHS)
  .filter((s) => PATHS[s] && CHANNELS[s])
  // MLB's visible row is MLB.com-native, not YouTube. f1/ufc/nascar/indycar are
  // event TILES, whose highlight buttons come off event.officialChannel in
  // EventCard rather than this per-game path, so a "gap" here would be noise.
  .filter((s) => !["mlb", "f1", "ufc", "nascar", "indycar"].includes(s))
  .filter((s) => !ONLY || s === ONLY);

console.log(`highlight gaps for ${YMD} (ET)   leagues=${leagues.length}   pace=${PACE / 1000}s`);
const tally = {};
for (const sport of leagues) {
  const r = await get(`https://site.api.espn.com/apis/site/v2/sports${PATHS[sport]}?dates=${YMD}`);
  if (!r || !r.ok) { console.log(`${sport.padEnd(14)} scoreboard ${r ? r.status : "neterr"}`); continue; }
  let data;
  try { data = await r.json(); } catch { continue; }
  const games = (data.events ?? []).filter((e) => e?.status?.type?.state === "post");
  if (!games.length) continue;
  for (const e of games) {
    const c = e.competitions?.[0]?.competitors ?? [];
    const away = c.find((x) => x.homeAway === "away")?.team?.shortDisplayName;
    const home = c.find((x) => x.homeAway === "home")?.team?.shortDisplayName;
    if (!away || !home) continue;
    const fixture = `${away} v ${home}`;
    if (manifest[`${sport}:${e.id}`]?.official) { tally.BAKED = (tally.BAKED ?? 0) + 1; continue; }
    const query = `${away} vs ${home} highlights ${dateStr(e.date)}`;
    const strict = await lookup(query, CHANNELS[sport]);
    if (strict) {
      tally["BAKE-GAP"] = (tally["BAKE-GAP"] ?? 0) + 1;
      console.log(`${sport.padEnd(14)} BAKE-GAP     ${fixture} -> ${strict} (live lookup finds it; the bake missed it)`);
      continue;
    }
    const loose = await lookup(query, null);
    const who = loose ? await owner(loose) : null;
    if (!loose || !who) {
      tally["NO-RECAP"] = (tally["NO-RECAP"] ?? 0) + 1;
      console.log(`${sport.padEnd(14)} NO-RECAP     ${fixture}`);
      continue;
    }
    const sameOwner = norm(who.author) === norm(CHANNELS[sport]);
    const key = sameOwner ? "NO-RECAP" : "WRONG-OWNER";
    tally[key] = (tally[key] ?? 0) + 1;
    console.log(`${sport.padEnd(14)} ${key.padEnd(12)} ${fixture} -> ${JSON.stringify(who.author)} ${sameOwner ? "(approved channel, but the strict gate rejected it — check the query shape)" : `!= approved ${JSON.stringify(CHANNELS[sport])}`}`);
  }
}
console.log("\n" + Object.entries(tally).map(([k, v]) => `${k}=${v}`).join("  "));
console.log("WRONG-OWNER is the only row that needs a person: the channel string may be stale, or only re-uploads exist.");
