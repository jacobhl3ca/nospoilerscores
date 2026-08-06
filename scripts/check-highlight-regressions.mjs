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
writeFileSync(tempModule, transformed.code);
const youtube = await import(pathToFileURL(tempModule).href);
unlinkSync(tempModule);

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
check("monitor rejects incomplete ESPN audits", monitor.includes("Source failures are not zero-game slates"));
check("rejected custom ESPN User-Agent is gone", !monitor.includes("nospoilerscores-staleness-check/1.0"));

console.log(failures ? `\n${failures} regression check(s) failed` : "\nall highlight regression checks passed");
process.exit(failures ? 1 : 0);
