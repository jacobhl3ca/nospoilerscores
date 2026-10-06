// ESPN "Game Highlights" clip: the in-app fallback for a La Liga game whose
// official YouTube cut refuses embedded playback (LALIGA EA SPORTS).
//
// ESPN's per-game summary (site.api.espn.com/…/soccer/esp.1/summary?event=<id>)
// lists every video it cut for that match in `videos[]`. Exactly one per game
// is the ~70 s package, headlined "<Home> vs. <Away> - Game Highlights"; the
// rest are per-goal clips whose headlines name the scorer ("X scores in the
// 42'"), which is a spoiler. Its `links.source.HD.href` is a direct mp4 on
// espnmedia-cdn.akamaized.net that the modal's native <video> plays as is.
// Verified 2026-09-25: 9/9 esp.1 games of the 9/19–21 round had one.
//
// Pure: the caller fetches the summary and passes the score check in
// (isScoreSpoiler from src/lib/spoilers.ts), so the unit test and the bake
// share one rule.

const GAME_HIGHLIGHTS_RX = /-\s*game highlights\s*$/i;
const MP4_HOST_RX = /^https:\/\/[a-z0-9.-]+\.akamaized\.net\/.+\.mp4(\?|$)/i;

// The mp4 for one ESPN video object, HD first, or null.
export function espnVideoMp4(video) {
  const src = video?.links?.source;
  for (const href of [src?.HD?.href, src?.mezzanine?.href, src?.full?.href, src?.href]) {
    if (typeof href === "string" && MP4_HOST_RX.test(href)) return href;
  }
  return null;
}

// The ONE spoiler-free "Game Highlights" clip in a summary's videos[], or a
// miss with its reason: "none" (no Game Highlights entry with an mp4) or
// "score" (the only match prints the result). Never ESPN's thumbnail.
export function pickEspnGameClip(videos, isScoreSpoiler) {
  const matches = (Array.isArray(videos) ? videos : [])
    .filter((v) => typeof v?.headline === "string" && GAME_HIGHLIGHTS_RX.test(v.headline.trim()) && espnVideoMp4(v));
  if (!matches.length) return { clip: null, reason: "none" };
  const clean = matches.find((v) => !isScoreSpoiler(v.headline));
  if (!clean) return { clip: null, reason: "score" };
  const sec = Number(clean.duration);
  return {
    clip: {
      url: espnVideoMp4(clean),
      headline: clean.headline.trim(),
      ...(Number.isFinite(sec) && sec > 0 ? { sec: Math.round(sec) } : {}),
    },
    reason: "ok",
  };
}

// ── ESPN Videos feed: play the clip in our modal ─────────────────────────
// The col-3 ESPN Videos items are scraped from espn.com with no stream, so the
// modal showed a still and "Open on ESPN". ESPN's app API
// (api-app.espn.com/v1/video/clips/<id>, no auth, verified 2026-10-01) lists
// the same direct mp4 on espnmedia-cdn.akamaized.net as the La Liga package.
// mp4 only: the HLS entries sit on a different, signed host.

// { url, sec? } for one clip-API payload, or null: no video, a different id,
// a premium (ESPN+) clip, or no akamaized mp4.
export function pickEspnVideoClip(payload, id) {
  const v = Array.isArray(payload?.videos) ? payload.videos[0] : null;
  if (!v || v.premium === true) return null;
  if (id != null && v.id != null && String(v.id) !== String(id)) return null;
  const url = espnVideoMp4(v);
  if (!url) return null;
  const sec = Number(v.duration);
  return { url, ...(Number.isFinite(sec) && sec > 0 ? { sec: Math.round(sec) } : {}) };
}

// ESPN's own clip type: videos[0].tracking.coverageType ("OnePlay",
// "Highlight", "Analysis", …), or "" when absent or for a different id. Read
// from the clip-API answer the bake already asks for the mp4.
export function espnClipKind(payload, id) {
  const v = Array.isArray(payload?.videos) ? payload.videos[0] : null;
  if (!v) return "";
  if (id != null && v.id != null && String(v.id) !== String(id)) return "";
  const kind = v.tracking?.coverageType;
  return typeof kind === "string" ? kind.trim() : "";
}

// Talk clips the card drops: Analysis, InstantAnalysis, PressConference,
// Interview. The title filters miss a talk clip with no blocked word ("Paul
// Finebaum and Heather Dinich differ on SEC's top team", Jacob 10/4). A
// missing or new type is kept.
const TALK_KIND_RX = /analysis|press\s*conference|interview/i;
export function isEspnTalkKind(kind) {
  return typeof kind === "string" && TALK_KIND_RX.test(kind);
}

// Give each ESPN Videos item its videoUrl + durationSec, and drop talk clips
// by ESPN's own type. A clip is asked at most once: an answered id records
// its `kind` in the state (hit or miss), and a known id is never asked again.
// An entry written before `kind` existed is asked one more time. Only those
// cost a request, `gapMs` apart and at most `max` per call. A failed request
// is not recorded, so the next bake asks again; until then the item keeps
// the carried clip (the prior feed file by id, then the state's url).
//   off    → every videoUrl is dropped (the ESPN_VIDEO_PLAY=0 switch).
//   on     → false still carries known clips and drops known talk clips,
//            but asks nothing new.
//   prior  → Map id → item from the last written feed.
//   state  → { clips: { [id]: { at, url?, sec?, kind } } }, updated in place.
//   fetchClip(id) → the API payload, or null on any failure.
export async function attachEspnVideoClips(items, { on, off, prior, state, fetchClip, max = 8, gapMs = 1000, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let requests = 0;
  let dropped = 0;
  let lastAt = 0;
  const out = [];
  for (const item of items) {
    const bare = { ...item };
    delete bare.videoUrl;
    delete bare.durationSec;
    if (off || !/^\d+$/.test(String(item.id))) { out.push(bare); continue; }
    let clip = null;
    let answered = typeof state.clips[item.id]?.kind === "string";
    if (!answered && on && requests < max) {
      const wait = lastAt + gapMs - now();
      if (wait > 0) await sleep(wait);
      requests++;
      const payload = await fetchClip(item.id).catch(() => null);
      lastAt = now();
      if (payload) {
        answered = true;
        clip = pickEspnVideoClip(payload, item.id);
        state.clips[item.id] = { at: now(), ...(clip ?? {}), kind: espnClipKind(payload, item.id) };
      }
    }
    if (answered && isEspnTalkKind(state.clips[item.id].kind)) { dropped++; continue; }
    if (!clip) {
      const carried = prior?.get(item.id);
      const entry = state.clips[item.id];
      if (carried?.videoUrl && MP4_HOST_RX.test(carried.videoUrl)) {
        clip = { url: carried.videoUrl, ...(Number.isFinite(carried.durationSec) ? { sec: carried.durationSec } : {}) };
      } else if (entry?.url && MP4_HOST_RX.test(entry.url)) {
        clip = entry;
      }
    }
    out.push(clip ? { ...bare, videoUrl: clip.url, ...(clip.sec ? { durationSec: clip.sec } : {}) } : bare);
  }
  return { items: out, requests, dropped };
}
