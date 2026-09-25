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
