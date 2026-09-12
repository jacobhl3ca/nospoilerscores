#!/usr/bin/env node
// Live check for the Grand Slam bracket builder (src/lib/slamBracket.ts).
//
// The unit tests (tests/slam-bracket.test.ts) pin the reconstruction against a
// synthetic 8-player draw where the right answer is known. This script runs the
// SAME builder over ESPN's real 127-match Slam payload and verifies the tree it
// produces is internally consistent: in every round pair, the two matches in
// slots 2k and 2k+1 must be exactly the two whose players contest slot k of the
// next round. That is the property the whole bracket layout rests on, and it
// can only be checked against a real draw.
//
//   node scripts/check-slam-bracket.mjs                 # live from ESPN
//   node scripts/check-slam-bracket.mjs --payload f.json # replay a saved payload
//
// Exits non-zero on any misplacement so it can gate a release.

import { createJiti } from "jiti";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const payloadArg = argv.includes("--payload") ? argv[argv.indexOf("--payload") + 1] : null;

const jiti = createJiti(import.meta.url);
const { fetchSlam, windowFor } = await jiti.import(path.join(repo, "src/lib/slamBracket.ts"));

const url = `https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=${windowFor(new Date())}`;

let payload;
if (payloadArg) {
  payload = JSON.parse(fs.readFileSync(payloadArg, "utf8"));
} else {
  // curl, not fetch: node's DNS is blocked in some sandboxed shells where curl
  // still resolves, and this script has to run in both.
  payload = JSON.parse(execFileSync("curl", ["-s", "--max-time", "60", url], { maxBuffer: 64 * 1024 * 1024 }).toString());
}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });

const slam = await fetchSlam();
if (!slam) {
  console.log("No Grand Slam in the current window — nothing to check.");
  process.exit(0);
}
console.log(`Tournament: ${slam.name}`);

let checked = 0;
let bad = 0;
for (const draw of slam.draws) {
  console.log(`\n${draw.label}`);
  for (const r of draw.rounds) {
    const done = r.matches.filter((m) => m.completed).length;
    console.log(`  ${r.short.padEnd(3)} ${String(r.matches.length).padStart(2)} matches · ${done} final · spoils=${r.hasResults}`);
  }
  for (let i = 0; i + 1 < draw.rounds.length; i++) {
    const a = draw.rounds[i];
    const b = draw.rounds[i + 1];
    if (a.matches.length !== b.matches.length * 2) {
      console.log(`  ! ${a.short}->${b.short}: ${a.matches.length} does not halve to ${b.matches.length}`);
      bad++;
      continue;
    }
    for (let k = 0; k < b.matches.length; k++) {
      const names = b.matches[k].sides.map((s) => s.player?.name).filter(Boolean);
      if (!names.length) continue; // undecided — nothing to verify yet
      const feeders = [a.matches[2 * k], a.matches[2 * k + 1]];
      for (const n of names) {
        checked++;
        if (feeders.some((f) => f.sides.some((s) => s.player?.name === n))) continue;
        bad++;
        if (bad <= 5) {
          console.log(`  MISPLACED ${a.short}->${b.short} slot ${k}: ${n} did not come through`,
            feeders.map((f) => f.sides.map((s) => s.player?.name ?? "TBD").join(" v ")).join(" | "));
        }
      }
    }
  }
}

console.log(`\n${checked} advancing players checked, ${bad} misplaced`);
process.exit(bad ? 1 : 0);
