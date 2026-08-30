#!/usr/bin/env node
/**
 * Generates public/tv/catalog.json — the remote config the tvOS app reads.
 *
 * WHY THIS EXISTS: HideScore for Apple TV is a native SwiftUI app, so it cannot
 * share `src/lib/espn.ts` the way the iOS shell shares the whole website. The
 * one thing it must never drift on is the league table — which leagues exist,
 * their ESPN scoreboard path, their season window and their rating calibration.
 * So the TV app ships a BUNDLED copy of this file and, on every launch, fetches
 * the live one from https://hidescore.com/tv/catalog.json. Add a league to
 * ALL_LEAGUES + SPORT_PATHS, run `npm run tv:catalog`, push — and every Apple TV
 * picks it up with no App Store review.
 *
 * The generator reads the literals straight out of the TypeScript source rather
 * than importing it (espn.ts is browser-shaped and pulls in the whole app), so
 * `npm run tv:catalog:check` is what guarantees the two never silently diverge.
 * It exits non-zero when the committed JSON no longer matches the source.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "tv", "catalog.json");

/**
 * Pull one `const NAME ... = <literal>` out of a TS file and evaluate the
 * literal. A comment-and-string-aware bracket walk is what makes this safe:
 * every one of these literals is dense with `//` prose that contains braces,
 * parens and apostrophes, so a naive regex or a brace count would stop early.
 */
function literal(src, name) {
  const decl = new RegExp(`\\bconst\\s+${name}\\b`).exec(src);
  if (!decl) throw new Error(`build-tv-catalog: ${name} not found — did it get renamed?`);
  let i = src.indexOf("=", decl.index);
  if (i < 0) throw new Error(`build-tv-catalog: no initializer for ${name}`);
  i += 1;
  // `new Set<Sport>([...])` — skip forward to the array it wraps.
  const setAt = src.slice(i, i + 40).indexOf("new Set");
  if (setAt >= 0) i = src.indexOf("[", i);
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  const close = open === "{" ? "}" : "]";
  if (open !== "{" && open !== "[") throw new Error(`build-tv-catalog: ${name} is not an object/array literal`);

  let depth = 0, j = i, str = null, line = false, block = false;
  for (; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; j++; } continue; }
    if (str) { if (c === "\\") { j++; continue; } if (c === str) str = null; continue; }
    if (c === "/" && n === "/") { line = true; j++; continue; }
    if (c === "/" && n === "*") { block = true; j++; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { j++; break; } }
  }
  return new Function(`"use strict"; return (${src.slice(i, j)});`)();
}

const espn = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");
const news = readFileSync(join(ROOT, "src/lib/news.ts"), "utf8");

const ALL_LEAGUES = literal(espn, "ALL_LEAGUES");
const SPORT_PATHS = literal(espn, "SPORT_PATHS");
const RATING = literal(espn, "SPORT_RATING_CONFIG");
const PERIOD_SECONDS = literal(espn, "PERIOD_SECONDS");
const SOCCER = new Set(literal(espn, "SOCCER_SPORTS"));
const LOGOS = literal(news, "LEAGUE_LOGO");
const BASE = /const BASE_URL = "([^"]+)"/.exec(espn)?.[1];
if (!BASE) throw new Error("build-tv-catalog: BASE_URL not found");

// Which sports the TV app can actually render. Everything here parses out of
// ESPN's standard two-competitor scoreboard shape, which is the only parser the
// Swift client has. Deliberately EXCLUDED (each needs its own parser or a
// worker route the app doesn't call): golf + tennis (leaderboard / draw
// groupings), f1 / nascar / indycar / ufc / boxing / chess / poker (single-event
// tiles, not games), esports (PandaScore via a worker route).
const SUPPORTED = new Set([
  "mlb", "llws", "nba", "wnba", "ncaam", "ncaaw", "ncaaf", "nfl", "nhl", "cricket",
  "epl", "mls", "ucl", "uel", "fifa", "laliga", "seriea", "bundesliga", "ligue1",
  "ligamx", "nwsl", "efl", "libertadores", "euro", "afcon", "saudi",
  "sixnations", "rugbywc", "rugbychamp", "superrugby", "rugbytest", "nationschamp",
]);

// The four leagues the Apple TV opens on before anyone has picked anything.
const DEFAULT_ON = new Set(["mlb", "nba", "nfl", "nhl"]);

const leagues = [];
const seen = new Set();
for (const l of ALL_LEAGUES) {
  if (!SUPPORTED.has(l.sport) || l.hidden || l.backfillOnly) continue;
  // ALL_LEAGUES carries one row per *window* (golf majors, NFL Preseason), so a
  // sport can appear twice. The TV app is one row per sport — keep the first,
  // which is the primary window in every supported case.
  if (seen.has(l.sport)) continue;
  seen.add(l.sport);
  const r = RATING[l.sport];
  leagues.push({
    key: l.sport,
    label: l.label,
    path: SPORT_PATHS[l.sport],
    logo: LOGOS[l.sport] ?? null,
    defaultOn: DEFAULT_ON.has(l.sport),
    season: { start: l.startDate ?? null, end: l.endDate ?? null,
              cycleMod: l.yearCycle?.mod ?? null, cycleAnchor: l.yearCycle?.anchor ?? null },
    rating: {
      kind: l.sport === "cricket" ? "cricket" : "generic",
      multiplier: r.multiplier,
      overtimeBonus: r.overtimeBonus,
      scoringDivisor: r.scoringDivisor,
      regulationPeriods: r.regulationPeriods,
      periodSeconds: PERIOD_SECONDS[l.sport] ?? null,
      soccer: SOCCER.has(l.sport),
    },
  });
}

const missing = [...SUPPORTED].filter((s) => !seen.has(s));
if (missing.length) throw new Error(`build-tv-catalog: supported sports absent from ALL_LEAGUES: ${missing.join(", ")}`);

const catalog = {
  schema: 1,
  espnBase: BASE,
  // Mirrors RatingBadge in src/components/GameCard.tsx. Highest `min` wins.
  ratingTiers: [
    { min: 85, label: "GREAT", color: "#16A34A" },
    { min: 70, label: "GOOD", color: "#CA8A04" },
    { min: 50, label: "MEH", color: "#EA580C" },
    { min: 0, label: "SKIP", color: "#B91C1C" },
  ],
  leagues,
};

const json = JSON.stringify(catalog, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== json) {
    console.error("tv catalog is STALE — src/lib/espn.ts changed. Run: npm run tv:catalog");
    process.exit(1);
  }
  console.log(`tv catalog up to date (${leagues.length} leagues)`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  // The tvOS bundle carries a byte-identical fallback so a cold launch with no
  // network still shows the right leagues.
  const bundled = join(ROOT, "tvos", "HideScoreTV", "Resources", "catalog.json");
  if (existsSync(dirname(bundled))) writeFileSync(bundled, json);
  console.log(`wrote ${OUT} (${leagues.length} leagues)`);
}
