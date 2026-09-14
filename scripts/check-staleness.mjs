#!/usr/bin/env node
// Staleness check for prebaked feeds served via the R2-backed worker.
//
// Hits each feed at the public origin (so worker + R2 + DNS are all on the
// hook), parses `fetchedAt` / `generatedAt`, and prints a per-feed status
// table. Two tiers:
//   - warn (past `warnH`)        — logged only, workflow stays green, no email
//   - crit (past `critH`) / err  — exits 1, GH Actions emails repo owner
// Manual runs always show the full table so you can spot a warn drift before
// it crosses crit.
//
// Run locally:   node scripts/check-staleness.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-staleness.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";

// warnH = "this feed missed a couple of runs, watch it"
// critH = "real outage, page someone" — set at 4× warnH so it takes a sustained
// failure, not a transient blip, to fire.
const NEWS_HOURLY = [
  "cbs-epl", "cbs-general", "cbs-golf", "cbs-mlb", "cbs-mls",
  "cbs-nba", "cbs-ncaam", "cbs-nfl", "cbs-nhl", "cbs-tennis",
  "espn-top", "espn-videos",
  "mlb", "mlb-videos", "nba", "nba-videos", "wnba", "wnba-videos", "nhl",
  // Every Reddit feed the site renders — the soccer/World-Cup + college tail
  // (ucl/uel/fifa/soccer/ncaaf/ncaaw) was previously unmonitored, which is
  // exactly the family the hourly bake rate-limits first (see the batching fix).
  "reddit-boxing", "reddit-cricket", "reddit-epl", "reddit-fifa", "reddit-general", "reddit-golf", "reddit-mlb",
  "reddit-mls", "reddit-nba", "reddit-ncaabase", "reddit-ncaaf", "reddit-ncaah", "reddit-ncaam", "reddit-ncaaw",
  "reddit-f1", "reddit-indycar", "reddit-nascar", "reddit-nfl", "reddit-nhl", "reddit-nwsl", "reddit-soccer", "reddit-tennis",
  "reddit-ucl", "reddit-uel", "reddit-ufc", "reddit-ufl", "reddit-wnba",
  "thescore-epl", "thescore-general", "thescore-mlb", "thescore-mls",
  "thescore-nba", "thescore-ncaam", "thescore-nfl", "thescore-nhl",
  // Editorial substitute feeds + the two league video feeds that shipped after
  // this list was last swept and were never added — they baked unwatched for
  // weeks (found 2026-07-22 by diffing prebake's job table against this list;
  // rerun that diff whenever a feed is added). fetchedAt-only on purpose: BBC
  // tennis/golf legitimately go 2-3 days without a story between majors, so a
  // content-age rule would page every off-week.
  "bbc-football", "bbc-tennis", "bbc-golf", "guardian-football",
  "fifa-videos", "mls-videos",
];

// The low-volume soccer/World-Cup + college reddit tail is the family the
// hourly bake rate-limits FIRST (Reddit throttles one sub across several
// consecutive bake runs while the busy subs sail through). When that happens
// the feed just serves slightly older posts — graceful degradation, not an
// outage — and it self-heals within a day (observed reddit-fifa drift to ~13h
// on 6/20, fresh again the next bake). The 11 high-volume year-round subs all
// bake through the same mini → scraper → R2 path, so they remain the strict
// 12h canaries: if the infra actually dies, THEY page. Giving the flaky tail a
// looser 24h crit (warn still 4h, so drift stays visible in the table) stops
// the self-healing rate-limit blips from paging, the same call already made for
// prime-asins below. NB: these stay <4h in practice even off-season because the
// bake rewrites fetchedAt every run, so 24h only fires on a genuinely stuck feed.
const RATE_LIMIT_PRONE_REDDIT = new Set([
  "reddit-fifa", "reddit-ucl", "reddit-uel", "reddit-ncaaf", "reddit-ncaaw",
  // r/collegehockey (added 2026-09-12) is a low-volume college sub like r/ncaaw.
  "reddit-ncaah",
  // r/UnitedFootballLeague (added 2026-09-14) is a low-volume spring-league sub.
  "reddit-ufl",
  // r/collegebaseball (added 2026-09-14), same low-volume college shape.
  "reddit-ncaabase",
  // reddit-wnba is a lower-volume sub whose prebake occasionally slips a couple
  // of hourly runs on a Reddit 429/403 blip and self-heals; a 12h crit paged on
  // a 13.4h transient (issue #18, 2026-07-06). Treat like the other flaky subs.
  "reddit-wnba",
]);

// Competition-specific subs go genuinely DORMANT in their own off-season: the
// bake keeps running (fetchedAt stays <4h) but r/UEFAEuropaLeague simply has no
// new posts for days, because there is no Europa League in July. That is the
// sub being quiet, not the feed being broken, so a content-age CRIT here pages
// on the calendar rather than on a bug — reddit-uel sat at 118h and alerted
// every hour overnight 2026-07-25/26, with reddit-ncaaw (dormant until
// November) at 64h right behind it. Same call already made for bbc-tennis/golf
// between majors: content age stays WARN-only so drift is still visible in the
// table, and the fetchedAt crit above still catches a genuinely stuck bake.
// The 13 year-round subs keep the strict 48h content crit, which is what
// actually catches the stale-mirror bug this rule was written for — a mirror
// serving stale snapshots hits those first, not the off-season tail.
const SEASONAL_REDDIT = new Set([
  "reddit-uel", "reddit-ucl", "reddit-ncaaw", "reddit-ncaaf", "reddit-fifa",
  "reddit-ncaah",
  // UFL plays late Mar – mid Jun; the sub is quiet Jul – Feb.
  "reddit-ufl", "reddit-ncaabase",
]);

const FEEDS = [
  ...NEWS_HOURLY.map((slug) => {
    // Reddit subs bake HOURLY on the mini, so a 24h crit is far too loose for the
    // busy ones — a genuinely stuck feed (the r/baseball-went-static case) should
    // page within half a day, not a full one. The GHA-baked feeds (cbs/thescore/
    // *-videos, every 2h) keep the looser 24h that tolerates an overnight blip.
    const reddit = slug.startsWith("reddit-");
    const critH = reddit ? (RATE_LIMIT_PRONE_REDDIT.has(slug) ? 24 : 12) : 24;
    // CONTENT age (newest item's `published`), not just `fetchedAt`. A feed can
    // rebake on schedule — fresh fetchedAt, green table — while every post in it
    // is days old, because a redlib mirror handed the baker a stale cached
    // /hot snapshot. That's exactly how r/baseball sat 4 days behind on
    // 2026-07-22 with all 49 feeds reading "fresh" (Jacob spotted it in the UI,
    // not the monitor). prebake now rejects stale mirrors; this is the net that
    // catches the next variant of the same class of bug. Thresholds are loose on
    // purpose — even the quietest sub we bake tops out around 18h — so this
    // fires on "went static", never on a genuinely slow news day.
    const contentWarnH = reddit ? 24 : null;
    const contentCritH = reddit
      ? (SEASONAL_REDDIT.has(slug)
          ? Infinity
          : (RATE_LIMIT_PRONE_REDDIT.has(slug) ? 72 : 48))
      : null;
    return { path: `/news/${slug}.json`, warnH: reddit ? 4 : 6, critH, contentWarnH, contentCritH };
  }),
  // League-wide recap lookout (prebake bakeLeagueRecaps, mini every 30 min).
  // A slow feed by nature: records carry forward and most series post once a
  // day or once a week, so only fetchedAt is watched, loosely. Not in
  // NEWS_HOURLY because it is not an `items` feed (no content-age check).
  { path: "/news/recaps.json", warnH: 24, critH: 72 },
  { path: "/espn-airings.json", warnH: 6, critH: 24 },           // GHA every 2h
  // prime-asins is a best-effort nicety: it deep-links Prime broadcasts to the
  // exact game page, and scrape-prime-asins.mjs is explicitly non-fatal — if
  // Prime blocks the runner or changes its markup, the site silently falls back
  // to the generic Prime sports page. So a stale feed here is graceful
  // degradation, NOT a page-someone outage: warn-only (critH = Infinity). It
  // still shows in the table without failing the workflow. NB: the scraper has
  // been returning 0 fresh matchups since ~2026-05-13 (Prime anti-bot) — the
  // deep-link feature is effectively dead and wants a real fix or removal,
  // tracked separately; this just stops it emailing.
  { path: "/prime-asins.json", warnH: 18, critH: Infinity },     // GHA every 6h — best-effort, warn-only
  { path: "/big-inning-schedule.json", warnH: 36, critH: 144 },  // GHA 2×/day
];

const TIMESTAMP_FIELDS = ["fetchedAt", "generatedAt"];
const FETCH_TIMEOUT_MS = 15000;

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function extractTimestamp(json) {
  for (const field of TIMESTAMP_FIELDS) {
    const v = json?.[field];
    if (typeof v === "string") {
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return { ts, field };
    }
  }
  return null;
}

// Newest `published` across a feed's items — the age of the CONTENT, which is
// independent of when the bake last ran.
function newestItemTs(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  let newest = 0;
  for (const it of items) {
    const ts = Date.parse(it?.published || "");
    if (!Number.isNaN(ts) && ts > newest) newest = ts;
  }
  return newest || null;
}

const now = Date.now();

const rows = await Promise.all(
  FEEDS.map(async (feed) => {
    const url = `${BASE}${feed.path}`;
    const row = { path: feed.path, status: "ok", ageH: null, note: "", warnH: feed.warnH, critH: feed.critH };
    try {
      const json = await fetchJson(url);
      const ts = extractTimestamp(json);
      if (!ts) {
        row.status = "crit";
        row.note = "no fetchedAt/generatedAt";
      } else {
        row.ageH = (now - ts.ts) / 3600000;
        if (row.ageH > feed.critH) {
          row.status = "crit";
          row.note = `>${feed.critH}h critical (field=${ts.field})`;
        } else if (row.ageH > feed.warnH) {
          row.status = "warn";
          row.note = `>${feed.warnH}h warn (field=${ts.field})`;
        }
      }
      // Content-age check runs even when fetchedAt is green — that combination
      // (fresh bake, ancient posts) IS the stale-mirror signature.
      if (feed.contentCritH != null) {
        const newest = newestItemTs(json);
        if (newest) {
          row.contentAgeH = (now - newest) / 3600000;
          if (row.contentAgeH > feed.contentCritH) {
            row.status = "crit";
            row.note = `newest post ${row.contentAgeH.toFixed(1)}h old (>${feed.contentCritH}h) — feed went static`;
          } else if (row.contentAgeH > feed.contentWarnH && row.status === "ok") {
            row.status = "warn";
            row.note = `newest post ${row.contentAgeH.toFixed(1)}h old (>${feed.contentWarnH}h warn)`;
          }
        }
      }
    } catch (err) {
      row.status = "error";
      row.note = String(err?.message || err);
    }
    return row;
  }),
);

console.log(`Staleness check @ ${new Date(now).toISOString()}`);
console.log(`Base:  ${BASE}`);
console.log(`Feeds: ${rows.length}\n`);

const pathW = Math.max(...rows.map((r) => r.path.length));
for (const r of rows) {
  const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
  const post = r.contentAgeH == null ? "" : ` post=${`${r.contentAgeH.toFixed(1)}h`.padStart(6)}`;
  console.log(
    `${r.status.padEnd(5)} ${r.path.padEnd(pathW)}  age=${age.padStart(6)}${post}  warn=${String(r.warnH).padStart(2)}h crit=${String(r.critH).padStart(3)}h  ${r.note}`,
  );
}

const warns = rows.filter((r) => r.status === "warn");
const fails = rows.filter((r) => r.status === "crit" || r.status === "error");

console.log("");
if (warns.length) {
  console.log(`${warns.length} warning(s) (workflow stays green, no alert):`);
  for (const r of warns) console.log(`  - ${r.path} (${r.ageH.toFixed(1)}h)`);
}
if (fails.length) {
  console.log(`${fails.length} critical (workflow will fail → email):`);
  for (const r of fails) {
    const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
    console.log(`  - ${r.path} — ${r.status} (${age}, ${r.note})`);
  }
  process.exit(1);
}
if (!warns.length) console.log("All feeds fresh.");
