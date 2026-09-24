// Watch-page metadata (length + upload date) for YouTube ids, kept across bake
// runs.
//
// Why this exists (2026-09-23): the highlights bake read every carried id's
// watch page on EVERY run, about 1,100 fetches an hour from the mini, because
// the per-run Map was the only cache. YouTube answered most of them with a
// 302 to google.com/sorry. That run logged
// HIGHLIGHT-AGE-UNREADABLE n=785/1093, so the upload-date gate failed open
// for 72% of ids, and only 1 non-NFL official clip got a length for the
// minutes label.
//
// A length and an upload date never change for a given id, so one good read
// is enough forever. This store keeps every good read on disk, fetches only
// ids it has never read (or read only in part), and caps live fetches per run
// so a backlog cannot re-trigger the block.

const DAY_MS = 86_400_000;

/**
 * @param {object} o
 * @param {() => object} o.load         persisted map { id: { d, p, at } } or {}
 * @param {(data: object) => Promise<void>|void} o.save
 * @param {(id: string) => Promise<string>} o.fetchHtml  throws on a non-2xx
 * @param {(html: string) => number|null} o.parseDuration
 * @param {(html: string) => number|null} o.parsePublished
 * @param {number} [o.liveCap]  max live watch-page fetches per run
 * @param {number} [o.keepDays] drop persisted rows older than this on save
 * @param {() => number} [o.now]
 */
export function createWatchMetaStore({
  load, save, fetchHtml, parseDuration, parsePublished,
  liveCap = 250, keepDays = 180, now = () => Date.now(),
}) {
  let disk = null;
  const memo = new Map();
  const stats = { disk: 0, live: 0, liveOk: 0, liveFail: 0, capped: 0 };
  let dirty = false;

  const persisted = () => {
    if (disk) return disk;
    try {
      const raw = load();
      disk = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
      disk = {};
    }
    return disk;
  };

  const shape = (row) => ({
    durationSec: Number.isFinite(row?.d) ? row.d : null,
    publishedMs: Number.isFinite(row?.p) ? row.p : null,
  });

  async function get(id) {
    if (!id) return { durationSec: null, publishedMs: null };
    if (memo.has(id)) return memo.get(id);
    const row = persisted()[id];
    const known = shape(row);
    if (Number.isFinite(known.durationSec) && Number.isFinite(known.publishedMs)) {
      stats.disk++;
      memo.set(id, known);
      return known;
    }
    if (stats.live >= liveCap) {
      stats.capped++;
      memo.set(id, known);
      return known;
    }
    stats.live++;
    let fresh = { durationSec: null, publishedMs: null };
    try {
      const html = await fetchHtml(id);
      fresh = { durationSec: parseDuration(html), publishedMs: parsePublished(html) };
    } catch { /* blocked or down: keep what the disk had */ }
    const merged = {
      durationSec: Number.isFinite(fresh.durationSec) ? fresh.durationSec : known.durationSec,
      publishedMs: Number.isFinite(fresh.publishedMs) ? fresh.publishedMs : known.publishedMs,
    };
    if (Number.isFinite(fresh.durationSec) || Number.isFinite(fresh.publishedMs)) {
      stats.liveOk++;
      const next = { at: now() };
      if (Number.isFinite(merged.durationSec)) next.d = merged.durationSec;
      if (Number.isFinite(merged.publishedMs)) next.p = merged.publishedMs;
      persisted()[id] = next;
      dirty = true;
    } else {
      stats.liveFail++;
    }
    memo.set(id, merged);
    return merged;
  }

  async function flush() {
    if (!dirty) return false;
    const cutoff = now() - keepDays * DAY_MS;
    const out = {};
    for (const [id, row] of Object.entries(persisted())) {
      if (Number.isFinite(row?.at) && row.at >= cutoff) out[id] = row;
    }
    await save(out);
    dirty = false;
    return true;
  }

  return { get, flush, stats: () => ({ ...stats, stored: Object.keys(persisted()).length }) };
}
