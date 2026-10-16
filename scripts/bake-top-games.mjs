#!/usr/bin/env node
// Runs the top games bake alone (scripts/lib/top-games-bake.mjs). The mini's
// 30-min prebake runs it too (prebake-news.mjs, token "top-games"); this is
// for a manual backfill or a check.
//   node scripts/bake-top-games.mjs [--backfill=N] [--out=DIR] [--state=FILE]
import { readFile } from "node:fs/promises";
import { bakeTopGames, loadTopGamesHighlights, loadTopGamesDeps, TOP_GAMES_STATE_PATH, BACKFILL_DAYS_PER_RUN } from "./lib/top-games-bake.mjs";
import { etServiceYmd } from "./lib/espn-front.mjs";

const arg = (name, dflt) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;
const outDir = arg("out", "public/news");
const highlights = await loadTopGamesHighlights(`${outDir}/highlights.json`, readFile);
if (!highlights) {
  console.error("TOP-GAMES no highlights.json (local or live); not baking");
  process.exit(1);
}
const deps = await loadTopGamesDeps({ highlights });
const today = etServiceYmd();
await bakeTopGames({
  deps,
  yesterday: deps.top.minusDays(today, 1),
  outDir,
  statePath: arg("state", TOP_GAMES_STATE_PATH),
  backfill: Number(arg("backfill", BACKFILL_DAYS_PER_RUN)),
});
