// scripts/generate-reddit-posters.mjs
// Generate poster thumbnails for Reddit v.redd.it video posts that arrive with
// no preview image. Fresh clips — especially live World Cup goals on r/soccer /
// r/worldcup — frequently have NO Reddit-generated preview yet: it's absent from
// the RSS (media:thumbnail), from redlib (renders poster=""), and from the
// post's og:image, and the only copy lives behind the blocked JSON API. So we
// grab the video's own first frame with ffmpeg and store it in R2, serving it as
// the row thumbnail + video poster instead of the grey play-box placeholder.
//
// Runs on the Mac mini reddit cron AFTER the bake and BEFORE the R2 JSON upload
// (hidescore-reddit-cron.sh), so the patched imageUrl ships in the same run.
// Posters are served via the worker's EXISTING /cards/*.png route (which returns
// Content-Type image/png) — so NO worker / Pages deploy is needed, only R2
// writes from the cron. They live at cards/rposters/<id>.png →
// https://hidescore.com/cards/rposters/<id>.png.
//
// Idempotent: a small on-disk cache of already-uploaded ids skips re-grabbing a
// clip we've already postered (same v.redd.it id → same first frame), so
// steady-state bakes only fetch brand-new clips.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";

const exec = promisify(execFile);

const OUT_DIR = "public/news";
const R2_BUCKET = "hidescore-data";
const R2_PREFIX = "cards/rposters"; // served by the /cards/*.png worker route
const PUBLIC_BASE = "https://hidescore.com/cards/rposters";
const FFMPEG = process.env.FFMPEG_BIN || "/opt/homebrew/bin/ffmpeg";
const WRANGLER = process.env.WRANGLER_BIN || join(homedir(), ".npm-global/bin/wrangler");
const CACHE_PATH = join(homedir(), ".cache", "hidescore", "reddit-posters.json");
const CONCURRENCY = 4;
const CACHE_MAX = 3000;

const vreddId = (url) =>
  (typeof url === "string" && url.match(/v\.redd\.it\/([a-z0-9]+)/i) || [])[1] || null;

async function loadCache() {
  try {
    return new Set(JSON.parse(await readFile(CACHE_PATH, "utf8")));
  } catch {
    return new Set();
  }
}
async function saveCache(set) {
  let ids = [...set];
  if (ids.length > CACHE_MAX) ids = ids.slice(ids.length - CACHE_MAX); // FIFO trim
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(ids));
  } catch {
    /* cache is an optimization — losing it just re-grabs */
  }
}

async function grabFrame(id, tmp, ss) {
  // -ss before -i = fast input seek; ~1s in skips a black intro frame. Scale to
  // 640w (keep aspect, even height) so the png stays small. -update 1 = single
  // image output (silences the image2 sequence-pattern warning).
  await exec(
    FFMPEG,
    [
      "-nostdin", "-y", "-ss", String(ss),
      "-i", `https://v.redd.it/${id}/HLSPlaylist.m3u8`,
      "-frames:v", "1", "-vf", "scale=640:-2", "-update", "1", tmp,
    ],
    { timeout: 25000 }
  );
}

async function makePoster(id) {
  const tmp = join(tmpdir(), `rposter_${id}.png`);
  try {
    await grabFrame(id, tmp, 1);
  } catch {
    await grabFrame(id, tmp, 0); // very short clip — try the very first frame
  }
  await exec(
    WRANGLER,
    [
      "r2", "object", "put", `${R2_BUCKET}/${R2_PREFIX}/${id}.png`,
      "--file", tmp, "--remote", "--content-type", "image/png",
    ],
    { timeout: 30000 }
  );
  return `${PUBLIC_BASE}/${id}.png`;
}

async function main() {
  const cache = await loadCache();
  let files;
  try {
    files = (await readdir(OUT_DIR)).filter((f) => /^reddit-.*\.json$/.test(f));
  } catch {
    console.log("posters: no OUT_DIR, nothing to do");
    return;
  }

  // Collect every posterless v.redd.it item across all reddit feeds, deduped by
  // id (the same clip can crosspost into several subs).
  const targets = new Map(); // id -> [{ f, it }]
  const fileData = new Map(); // f -> { path, data, changed }
  for (const f of files) {
    const path = join(OUT_DIR, f);
    let data;
    try {
      data = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    fileData.set(f, { path, data, changed: false });
    for (const it of data.items || []) {
      if (it.imageUrl) continue; // already has a thumbnail
      const id = vreddId(it.videoUrl);
      if (!id) continue; // not a v.redd.it video (streamff/yt already carry thumbs)
      if (!targets.has(id)) targets.set(id, []);
      targets.get(id).push({ f, it });
    }
  }

  const ids = [...targets.keys()];
  let made = 0, reused = 0, failed = 0;

  const apply = (id, url) => {
    for (const { f, it } of targets.get(id)) {
      it.imageUrl = url; // row thumbnail + <video> poster (video stays the playable)
      fileData.get(f).changed = true;
    }
  };

  // Cached ids → patch only, no network.
  const fresh = [];
  for (const id of ids) {
    if (cache.has(id)) {
      apply(id, `${PUBLIC_BASE}/${id}.png`);
      reused++;
    } else {
      fresh.push(id);
    }
  }

  // Generate the rest with a small concurrency pool.
  let idx = 0;
  async function worker() {
    while (idx < fresh.length) {
      const id = fresh[idx++];
      try {
        const url = await makePoster(id);
        apply(id, url);
        cache.add(id);
        made++;
      } catch {
        failed++; // leave posterless — client shows the play-box fallback
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fresh.length) }, worker));

  // Write back patched feeds (the cron's upload loop ships these to R2).
  for (const { path, data, changed } of fileData.values()) {
    if (changed) await writeFile(path, JSON.stringify(data));
  }
  await saveCache(cache);
  console.log(
    `posters: made ${made}, reused ${reused}, failed ${failed} (of ${ids.length} posterless v.redd.it items)`
  );
}

await main();
