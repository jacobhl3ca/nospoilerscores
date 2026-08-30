/**
 * Runs the WEBSITE's calculateRating over live ESPN scoreboards and writes
 * {league, id, rating}. The Swift harness scores the byte-identical payloads.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildRatingModule } from "./extract-rating.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const { calculateRating } = await import(pathToFileURL(buildRatingModule(join(REPO, "src/lib/espn.ts"))).href);
const catalog = JSON.parse(readFileSync(join(REPO, "public/tv/catalog.json"), "utf8"));

const days = Number(process.argv[2] ?? 3);
const only = process.argv[3] ? new Set(process.argv[3].split(",").filter(Boolean)) : null;

function ymd(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

const fixtures = join(HERE, "fixtures");
rmSync(fixtures, { recursive: true, force: true });
mkdirSync(fixtures, { recursive: true });

const out = [];
let boards = 0;
for (const league of catalog.leagues) {
  if (only && !only.has(league.key)) continue;
  for (let i = 0; i < days; i++) {
    const date = ymd(i);
    const url = new URL(catalog.espnBase + league.path);
    url.searchParams.set("dates", date);
    url.searchParams.set("limit", "300");
    if (["ncaaf", "ncaam", "ncaaw"].includes(league.key)) url.searchParams.set("groups", "50");
    let payload;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      payload = await res.json();
    } catch { continue; }
    const events = payload.events ?? [];
    if (!events.length) continue;
    writeFileSync(join(fixtures, `${league.key}-${date}.json`), JSON.stringify(payload));
    boards++;
    for (const event of events) {
      // parseGame stamps the sport before scoring; the calibration keys off it.
      event._sport = league.key;
      out.push({ league: league.key, id: String(event.id), rating: calculateRating(event) ?? null });
    }
  }
}

writeFileSync(join(HERE, "ts-ratings.json"), JSON.stringify(out, null, 1));
console.log(`   ${out.length} games across ${boards} scoreboards`);
