// Top games bake (Jacob 10/10): the Best of yesterday column's longer spans,
// and the source the weekly post generator reads (scripts/top-games-post.mjs).
//
// ESPN answers one day per scoreboard request (no date ranges since 9/16), so
// a year cannot be read in a browser. This keeps a day archive on the mini
// instead: for every day and every source league, that day's best rated
// finished games (at most TOP_GAMES_KEEP_PER_LEAGUE). Each run
//   1. re-reads yesterday and the day before (late games, late clips) when the
//      stored copy is older than REFRESH_EVERY_MS,
//   2. fills up to `backfill` missing days, newest first, back to Jan 1 (or 30
//      days back in January, so "This month" is whole),
//   3. re-checks the clip bar for days the clip index still covers,
//   4. writes news/top-games-<span>.json for every span (lib/topGames.ts).
// The archive lives in .bake-state/ (never uploaded); the span files go to
// public/news/, which the mini's cron uploads to R2.
//
// The order is the game's rating, never the score; nothing here reads one.
// Called from prebake-news.mjs (token "top-games"); `node scripts/bake-top-games.mjs`
// runs it alone.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const TOP_GAMES_STATE_PATH = ".bake-state/top-games-days.json";
const REFRESH_DAYS = 2;
const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000;
// highlights.json keeps about three weeks of clips. Inside that window a game
// with no clip is left out (the column exists to be played); older days were
// first read after their clips aged out, so their clip state is unknown and
// they stay in.
export const CLIP_INDEX_DAYS = 21;
export const BACKFILL_DAYS_PER_RUN = 20;
const CONCURRENCY = 6;

const ymdToDate = (ymd) => new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), 12);

// The modules the bake needs, loaded through jiti (espn.ts imports without
// file extensions, which node's own resolver cannot follow).
export async function loadTopGamesDeps({ highlights }) {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url);
  const espn = await jiti.import("../../src/lib/espn.ts");
  const best = await jiti.import("../../src/lib/bestYesterday.ts");
  const top = await jiti.import("../../src/lib/topGames.ts");
  return {
    top,
    // Source leagues in season on that day: the Best of yesterday set.
    sportsForDay(ymd) {
      const day = ymdToDate(ymd);
      const out = [];
      for (const league of espn.ALL_LEAGUES) {
        if (league.hidden || out.includes(league.sport) || !best.isBestYesterdaySourceSport(league.sport)) continue;
        if (espn.isLeagueActive(league, day)) out.push(league.sport);
      }
      return out;
    },
    // The same games and video enrichment the Best of yesterday column reads.
    fetchDay: (sport, ymd) => espn.fetchSlateGames(sport, ymd),
    hasClip: (game) => espn.hasPlayableClip(game, highlights),
  };
}

// The clip index: this machine's fresh highlights.json (the highlights bake
// runs first), else the live copy. An empty map makes every recent game fail
// the clip bar, so a miss on both returns null and the caller skips the run.
export async function loadTopGamesHighlights(localPath, read = readFile) {
  try {
    const games = JSON.parse(await read(localPath, "utf8"))?.games;
    if (games && Object.keys(games).length) return games;
  } catch { /* not baked here */ }
  try {
    const res = await fetch(`https://hidescore.com/news/highlights.json?ts=${Date.now()}`);
    const games = res.ok ? (await res.json())?.games : null;
    if (games && Object.keys(games).length) return games;
  } catch { /* offline */ }
  return null;
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// One day: every source league's best rated finished games. A league whose
// fetch throws is left out of the day and the day is marked partial, so the
// next run reads it again.
async function readDay(ymd, deps, nowMs) {
  const sports = deps.sportsForDay(ymd);
  let failed = 0;
  const lists = await pool(sports, CONCURRENCY, async (sport) => {
    try {
      const games = await deps.fetchDay(sport, ymd);
      return [sport, deps.top.rankTopGames(games, { count: deps.top.TOP_GAMES_KEEP_PER_LEAGUE })];
    } catch {
      failed++;
      return [sport, null];
    }
  });
  const leagues = {};
  for (const [sport, games] of lists) {
    if (games?.length) leagues[sport] = games.map((g) => ({ g, clip: null }));
  }
  return { at: nowMs, partial: failed > 0, leagues };
}

export async function bakeTopGames({
  deps,
  yesterday,
  outDir = "public/news",
  statePath = TOP_GAMES_STATE_PATH,
  now = new Date(),
  backfill = BACKFILL_DAYS_PER_RUN,
  log = console.log,
}) {
  const { top } = deps;
  const nowMs = now.getTime();
  const prior = await readJson(statePath);
  const days = prior?.v === 1 && prior.days && typeof prior.days === "object" ? prior.days : {};

  const monthStart = top.minusDays(yesterday, 29);
  const yearStart = `${yesterday.slice(0, 4)}0101`;
  const archiveStart = monthStart < yearStart ? monthStart : yearStart;
  for (const ymd of Object.keys(days)) if (ymd < archiveStart || ymd > yesterday) delete days[ymd];

  // Which days to read this run.
  const refresh = [];
  for (let i = 0, d = yesterday; i < REFRESH_DAYS; i++, d = top.minusDays(d, 1)) {
    const rec = days[d];
    if (!rec || rec.partial || nowMs - rec.at > REFRESH_EVERY_MS) refresh.push(d);
  }
  const missing = [];
  for (let d = top.minusDays(yesterday, REFRESH_DAYS); d >= archiveStart && missing.length < backfill; d = top.minusDays(d, 1)) {
    if (!days[d] || days[d].partial) missing.push(d);
  }
  for (const ymd of [...refresh, ...missing]) {
    const rec = await readDay(ymd, deps, nowMs);
    // Keep a known clip from the stored copy: a clip can age out of the index
    // before the day does.
    const old = days[ymd];
    if (old) {
      for (const [sport, list] of Object.entries(rec.leagues)) {
        const known = new Map((old.leagues?.[sport] ?? []).map((e) => [e.g.id, e.clip]));
        for (const e of list) if (known.get(e.g.id) === true) e.clip = true;
      }
    }
    days[ymd] = rec;
  }

  // The clip bar, for every day the index still covers. Sticky once true.
  const clipFrom = top.minusDays(yesterday, CLIP_INDEX_DAYS - 1);
  for (const [ymd, rec] of Object.entries(days)) {
    if (ymd < clipFrom) continue;
    for (const list of Object.values(rec.leagues)) {
      for (const e of list) if (e.clip !== true) e.clip = !!deps.hasClip(e.g);
    }
  }

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify({ v: 1, days }));

  const written = {};
  for (const span of top.TOP_GAMES_BAKED_SPANS) {
    const from = top.spanStartYmd(span, yesterday);
    const bySport = {};
    let covered = 0;
    let total = 0;
    for (let d = yesterday; d >= from; d = top.minusDays(d, 1)) {
      total++;
      const rec = days[d];
      if (!rec) continue;
      covered++;
      for (const [sport, list] of Object.entries(rec.leagues)) {
        for (const e of list) if (e.clip !== false) (bySport[sport] ??= []).push(e.g);
      }
    }
    const leagues = {};
    for (const [sport, games] of Object.entries(bySport)) {
      const best = top.rankTopGames(games, { count: top.TOP_GAMES_KEEP_PER_LEAGUE });
      if (best.length) leagues[sport] = best;
    }
    const file = { v: 1, span, from, to: yesterday, generatedAt: now.toISOString(), days: { covered, total }, leagues };
    await mkdir(outDir, { recursive: true });
    await writeFile(`${outDir}/top-games-${span}.json`, JSON.stringify(file));
    written[span] = { leagues: Object.keys(leagues).length, covered, total };
  }
  log(`TOP-GAMES ${yesterday} read=${refresh.length}+${missing.length} archive=${Object.keys(days).length}d ` +
    Object.entries(written).map(([s, w]) => `${s}=${w.leagues}lg/${w.covered}of${w.total}d`).join(" "));
  return written;
}
