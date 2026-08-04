// Regression check for the esports highlight-channel gate.
//
//   node scripts/check-esports-channels.mjs          # offline gate assertions
//   node scripts/check-esports-channels.mjs --live   # + live PandaScore/YouTube probe
//
// Why this exists: esports is ONE sport key spanning leagues with completely
// unrelated YouTube uploaders, so the channel lookup keys on the league
// (Game.esportsLeague → `esports_${league.toLowerCase()}` in OFFICIAL_CHANNELS).
// A league with no verified entry must stay fully dark — no official button AND
// no unscoped search, because esports search results are fan re-uploads whose
// titles give away the result. This asserts that gate, and with --live also
// checks that PandaScore still calls the league "LEC" (the string the whole
// lookup hangs on) and that a real finished series still resolves on-channel.
//
// Sibling of scripts/check-highlight-fallbacks.mjs.

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

await loadBindings();
const src = readFileSync("src/lib/youtube.ts", "utf8");
const out = await transform(src, {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" },
});
const tmp = join(tmpdir(), `nss-youtube-${process.pid}.mjs`);
writeFileSync(tmp, out.code);
const {
  getOfficialChannelName: ch,
  hasNoTrustedHighlightSource: dark,
  requiresStrictChannelOnly: strict,
} = await import(pathToFileURL(tmp).href);
unlinkSync(tmp);

let bad = 0;
const check = (name, ok) => {
  if (!ok) bad++;
  console.log((ok ? "  PASS  " : "! FAIL  ") + name);
};

console.log("gate:");
check("esports LEC → channel LEC, lit",   ch("esports", "LEC") === "LEC" && dark("esports", "LEC") === false);
check("esports lec lowercase matches",    ch("esports", "lec") === "LEC");
check("esports LCK → no channel, dark",   ch("esports", "LCK") === null && dark("esports", "LCK") === true);
check("esports LPL → no channel, dark",   ch("esports", "LPL") === null && dark("esports", "LPL") === true);
check("esports Dota tournament → dark",   dark("esports", "1win Essence") === true);
check("esports missing league → dark",    dark("esports", undefined) === true);
check("esports never search-falls-back",  strict("esports") === true);
check("cricket still dark",               dark("cricket") === true);
check("euro still dark",                  dark("euro") === true);
check("epl unchanged (NBC Sports, lit)",  dark("epl") === false && ch("epl") === "NBC Sports");
check("epl not strict-only",              strict("epl") === false);
check("golf label key unchanged",         ch("golf", "Masters") === "The Masters");
check("tennis label key unchanged",       ch("tennis", "Wimbledon") === "Wimbledon");
check("f1 bare key unchanged",            ch("f1") === "FORMULA 1");
check("nfl unchanged",                    ch("nfl") === "NFL" && dark("nfl") === false);

if (process.argv.includes("--live")) {
  const BASE = "https://hidescore.com";
  console.log("\nlive:");
  // PandaScore's league name is the lookup key. If it ever renames LEC, the
  // button silently goes dark — that is exactly what this catches.
  const seen = new Set();
  for (const d of lastNDays(10)) {
    const r = await fetch(`${BASE}/api/esports?date=${d}`).then((x) => x.json()).catch(() => null);
    for (const g of r?.games || []) seen.add(g.league);
  }
  check(`PandaScore still names the league "LEC" (saw: ${[...seen].join(", ") || "nothing"})`, seen.has("LEC"));

  // A real finished LEC series must still resolve on-channel under strict=1.
  const q = "SK Gaming vs G2 Esports highlights";
  const vid = await fetch(`${BASE}/api/youtube?q=${encodeURIComponent(q)}&channel=LEC&strict=1`)
    .then((x) => x.json()).then((j) => j?.videoId).catch(() => null);
  check(`strict LEC resolve returns a video (${vid || "none"})`, !!vid);
  if (vid) {
    const meta = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`)
      .then((x) => x.json()).catch(() => null);
    check(`resolved video is on the LEC channel (${meta?.author_name || "?"})`, meta?.author_name === "LEC");
    // LEC titles carry no score. If that ever changes the button spoils the result.
    check(`resolved title carries no score (${meta?.title || "?"})`, !/\b[0-3]\s*[-–]\s*[0-3]\b/.test(meta?.title || ""));
  }
}

function lastNDays(n) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

console.log(bad ? `\n${bad} FAILED` : `\nall checks passed`);
process.exit(bad ? 1 : 0);
