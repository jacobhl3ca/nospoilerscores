// Prebake news feeds to /public/news/*.json.
// Runs via GitHub Actions every 30 min (see .github/workflows/news-prebake.yml).
// Covers origins that block browser CORS (MLB.com, NBA.com, NHL.com, CBS, theScore)
// plus the ESPN homepage "TOP HEADLINES" widget (scraped from HTML for exact order).

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  RECAP_SERIES, RECAP_OUT_NAME, RECAP_TTL_DAYS, parseYtVideoRenderers, parseWatchPageLengthSeconds, parseWatchPagePublishMs,
  parseRelativeTime, isoDurationToSec, etYmd, dailyCoversDate, weekdayCoversDate,
  weeklyWindowFromPublished, nflWeekWindow, parseEmbedPlayable, parseWatchPagePlayable, matchSeriesTitle, pickNewest, stripRecapRecord,
  fillHeading, pickShorterClub, promoteLoneExtended, eplSeasonYear, uploadFitsGameDate,
} from "./lib/recaps.mjs";
import { isClipPageUrl, parseClipPage } from "./lib/clip-host.mjs";
import {
  FOTMOB_LEAGUES, fotmobLeaguePath, parseFotmobNextData, fotmobFixtures, fotmobHighlightVideoId,
  findFotmobFixture, gateFotmobVideo,
} from "./lib/fotmob.mjs";
import { createWatchMetaStore } from "./lib/ytWatchMeta.mjs";

const OUT_DIR = "public/news";

// NBA.com 403s obvious-bot UAs; mirror a real Safari request.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

function stripCdata(s) {
  return (s || "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

// Streamable.com link posts on Reddit (especially r/nba, which bans direct
// uploads) only expose an embed iframe in the Reddit JSON. Streamable's public
// API returns a signed CDN MP4 URL we can drop straight into a <video> tag —
// signature is good for ~4 days, well past our same-day carry window.
async function fetchStreamableMp4(id) {
  try {
    const res = await fetch(`https://api.streamable.com/videos/${id}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const mp4 = data?.files?.mp4?.url || data?.files?.["mp4-mobile"]?.url || null;
    if (!mp4) return null;
    let thumb = data?.thumbnail_url || null;
    if (thumb && thumb.startsWith("//")) thumb = `https:${thumb}`;
    return { mp4, thumb };
  } catch {
    return null;
  }
}

// streamin.link / streamin.me — the soccer-clip host that now carries most of
// r/soccer's goal videos (direct uploads are limited, so users post the clip
// here and link it). The /v/<id> page (link→me redirect) embeds the video as
// <source src="…streamin.top/uploads/<id>.mp4">; we scrape that and hand back
// the direct MP4, which VideoModal plays natively via <video> (no CORS needed —
// verified 206 + video/mp4). Mirrors fetchStreamableMp4; null on any failure so
// the post just stays link-only, exactly as before.
async function fetchStreaminMp4(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/i) ||
      html.match(/"(https?:\/\/[^"]+\.mp4[^"]*)"/i);
    if (!m) return null;
    // og:image (when the page exposes one) → row poster thumbnail.
    const og = (html.match(/property="og:image"\s+content="(https?:\/\/[^"]+)"/i) || [])[1] || null;
    // Drop the cache-buster query + media-fragment hash → canonical CDN mp4.
    return { mp4: m[1].split(/[?#]/)[0], thumb: og ? og.split(/[?#]/)[0] : null };
  } catch {
    return null;
  }
}

// streamff.link / streamff.com — r/soccer's CURRENT dominant goal-clip host
// (the sub bans direct uploads, so clips rotate through external hosts; streamff
// is what's live now, streamin before it). The /v/<id> page is a Next.js JS app
// with no inline <source>, but its server-rendered og:image points at the open
// CDN thumbnail (cdn.streamff.<tld>/<id>.jpg) — swap the image extension for
// .mp4 to get the direct video, which serves 206 + video/mp4 and plays in
// <video> with no CORS needed (verified). Mirrors fetchStreaminMp4; null on any
// failure so the post just stays link-only.
// Escape a literal (a clip id from a URL) for embedding in a RegExp.
function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchStreamffMp4(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // The CDN host DRIFTS independently of the site domain (cdn.streamff.one →
    // cdn.hostedhost.top as of 8/21/26), so match ANY host — but only when the
    // image filename is the clip id from the /v/<id> URL, which keeps a logo or
    // error-page og:image from being mistaken for the poster.
    const vid = (pageUrl.match(/\/v\/([a-z0-9]+)/i) || [])[1] || "";
    const idRe = vid ? escapeRe(vid) : "[a-z0-9]+";
    const m =
      html.match(
        new RegExp(
          `property="og:image(?::secure_url)?"\\s+content="(https?://[^"]+/${idRe}\\.(?:jpe?g|png|webp))"`,
          "i",
        ),
      ) || html.match(new RegExp(`(https?://[a-z0-9.-]+/${idRe}\\.(?:jpe?g|png|webp))`, "i"));
    if (!m) return null;
    // The same og:image doubles as the row poster — keep it alongside the mp4
    // (just swap the extension) so r/soccer clip posts render a preview tile.
    const thumb = m[1].split(/[?#]/)[0];
    const mp4 = thumb.replace(/\.(?:jpe?g|png|webp)$/i, ".mp4");
    // streamff serves a 200 page with a TEMPLATED og:image for ids that do not
    // exist (deleted clips), so the ext-swap can name a 404. Confirm the mp4 is
    // really there before handing it to the row — but only reject on a real
    // negative answer; a network blip falls through and keeps the clip.
    try {
      const head = await fetch(mp4, {
        method: "GET",
        headers: { "User-Agent": UA, Range: "bytes=0-1", Referer: "https://streamff.com/" },
        signal: AbortSignal.timeout(6000),
      });
      if (head.status >= 400) return null;
    } catch {
      /* unreachable check — keep the clip rather than dropping a good one */
    }
    return { mp4, thumb };
  } catch {
    return null;
  }
}

// dropr.co — newest entrant in r/soccer's rotating goal-clip hosts (joined the
// streamin → streamff rotation mid-2026). Unlike streamff's JS app, the /v/<id>
// page server-renders a clean og:video pointing straight at the open CDN mp4
// (cdn.dropr.co/<hash>.mp4 — serves 206 + video/mp4, plays in <video> with no
// CORS) and also an inline <source>. Scrape either; the og:image is the poster.
// Mirrors the other resolvers; null on any failure so the post stays link-only.
async function fetchDroprMp4(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/property="og:video(?::secure_url)?"\s+content="(https?:\/\/[^"]+\.mp4[^"]*)"/i) ||
      html.match(/<source[^>]+src="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
    if (!m) return null;
    const og = (html.match(/property="og:image"\s+content="(https?:\/\/[^"]+)"/i) || [])[1] || null;
    return { mp4: m[1].split(/[?#]/)[0], thumb: og ? og.split(/[?#]/)[0] : null };
  } catch {
    return null;
  }
}

// streama.in / streamain.com — r/soccer's CURRENT dominant goal-clip host
// (verified 2026-09-18: a month of the sub shows 0 streamff posts, ~8 dropr,
// and a full search page of streama.in). The /<id>/watch page is a JS player
// with no og:video, but /embed/<id> server-renders the direct CDN mp4
// (cdn.streamain.com/...mp4 — 206 + video/mp4 + CORS *, so <video> plays it
// natively). The poster is the same stem under /thumbnails/<stem>_thumb.jpg.
// Mirrors the other resolvers; null on any failure so the post stays link-only.
// 2026-09-22: the embed now serves media.sportits.com, which this no longer
// matches; fetchClipMp4's generic reader picks it up from the <video> instead.
async function fetchStreamainMp4(pageUrl) {
  try {
    const idm = pageUrl.match(
      /^https?:\/\/(?:streama\.in|streamain\.\w+)\/(?:[a-z]{2}\/)?([A-Za-z0-9_-]{6,40})(?:\/|$)/i,
    );
    if (!idm) return null;
    const res = await fetch(`https://streamain.com/embed/${idm[1]}`, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/(https?:\/\/cdn\.streamain\.\w+\/[^"'\s]+\.mp4)/i);
    if (!m) return null;
    const mp4 = m[1].split(/[?#]/)[0];
    const stem = (mp4.match(/\/([^/]+)\.mp4$/) || [])[1];
    return {
      mp4,
      thumb: stem ? `https://streamain.com/thumbnails/${stem}_thumb.jpg` : null,
    };
  } catch {
    return null;
  }
}

// Any clip site we have no resolver for (the NEXT rotation), or a known one
// whose resolver stopped matching (streama.in moved its CDN to
// media.sportits.com on 2026-09-22): read the page's own player — og:video or
// its first <video> — following a JS player's /embed/ iframe once. Unlike the
// known hosts, an unknown one must PROVE the mp4 plays (a 2xx video/* answer)
// before a row trusts it; a network blip means no clip, never a broken one.
async function fetchGenericClipMp4(pageUrl) {
  const getPage = async (url) => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    return res.ok ? { html: await res.text(), url: res.url || url } : null;
  };
  try {
    const first = await getPage(pageUrl);
    if (!first) return null;
    let { mp4, thumb, embedUrl } = parseClipPage(first.html, first.url);
    if (!mp4 && embedUrl) {
      const embed = await getPage(embedUrl);
      if (embed) {
        const e = parseClipPage(embed.html, embed.url);
        mp4 = e.mp4;
        thumb = thumb || e.thumb;
      }
    }
    if (!mp4) return null;
    const probe = await fetch(mp4, {
      headers: { "User-Agent": UA, Range: "bytes=0-1", Referer: pageUrl },
      signal: AbortSignal.timeout(6000),
    });
    const type = probe.headers.get("content-type") || "";
    if (!probe.ok || !/^(?:video\/|application\/octet-stream)/i.test(type)) return null;
    return { mp4, thumb };
  } catch {
    return null;
  }
}

// Route an external clip-host page URL to its mp4 resolver: the matching
// per-host resolver first, then the generic player reader when that host is
// unknown or its resolver comes back empty. Every Reddit path (redlib, RSS,
// OAuth) funnels clip links through here.
async function fetchClipMp4(url) {
  let clip = null;
  if (/^https?:\/\/streamff\.\w+\/v\//i.test(url)) clip = await fetchStreamffMp4(url);
  else if (/^https?:\/\/streamin\.\w+\/v\//i.test(url)) clip = await fetchStreaminMp4(url);
  else if (/^https?:\/\/dropr\.\w+\/v\//i.test(url)) clip = await fetchDroprMp4(url);
  else if (/^https?:\/\/(?:streama\.in|streamain\.\w+)\//i.test(url)) clip = await fetchStreamainMp4(url);
  if (clip || !isClipPageUrl(url)) return clip;
  return fetchGenericClipMp4(url);
}

// ── YouTube lookup + validation + cache ───────────────────────────
// Strategy: call the site's /api/youtube?q=&channel= worker for each news
// video, then confirm the candidate via YouTube's public oEmbed — both the
// `author_name` must equal our expected channel AND the title must share a
// strong token overlap with our source title. Everything is memoised in
// public/news/_yt-cache.json so we only burn a lookup on first appearance.

const YT_CACHE_PATH = `${OUT_DIR}/_yt-cache.json`;

async function loadYTCache() {
  try { return JSON.parse(await readFile(YT_CACHE_PATH, "utf8")); } catch { return {}; }
}

async function saveYTCache(cache) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(YT_CACHE_PATH, JSON.stringify(cache));
}

const YT_STOPWORDS = new Set([
  "the","and","for","with","from","that","this","will","has","had","have","was","were","are","its",
  "out","not","but","after","into","over","under","than","then","now","new","one","two","three",
  "highlight","highlights","game","games","vs","at","on","to","of","in","a","an","is","as","it",
  "mlb","nba","nhl","nfl","espn","—","|","recap","plays","play",
]);

function ytTokens(s) {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/['’.,!?()\[\]|—–-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !YT_STOPWORDS.has(t))
  );
}

function ytTitleSimilarity(source, candidate) {
  const A = ytTokens(source);
  const B = ytTokens(candidate);
  if (A.size === 0) return 0;
  let match = 0;
  for (const t of A) if (B.has(t)) match++;
  return match / A.size;
}

async function ytSearch(query, channel) {
  try {
    const url = `https://hidescore.com/api/youtube?q=${encodeURIComponent(query)}&channel=${encodeURIComponent(channel)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.videoId || null;
  } catch { return null; }
}

async function ytOEmbed(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Returns a verified YouTube video ID (same channel, high title overlap) or null.
async function lookupAndValidate(query, channel) {
  const vid = await ytSearch(query, channel);
  if (!vid) return null;
  const meta = await ytOEmbed(vid);
  if (!meta) return null;
  // Exact channel match — filters out false positives like "NBC Chicago" or
  // random aggregator uploads that the worker sometimes surfaces.
  if ((meta.author_name || "").trim() !== channel) return null;
  // Title overlap — rejects same-channel but wrong-clip matches (e.g. "Elly's
  // 7th homer" when we asked about her "two-homer five-RBI performance").
  if (ytTitleSimilarity(query, meta.title || "") < 0.55) return null;
  return vid;
}

// Walks the items and attaches youtubeVideoId where a verified match exists.
// New lookups are cached (including null results) so we don't retry forever.
async function attachYouTubeIds(items, channel, cache) {
  const out = [];
  for (const item of items) {
    const key = `${channel}|${item.id}`;
    let vid;
    if (key in cache) {
      vid = cache[key];
    } else {
      vid = await lookupAndValidate(item.headline, channel);
      cache[key] = vid;
    }
    out.push(vid ? { ...item, youtubeVideoId: vid } : item);
  }
  return out;
}

// Sportsbook promos + pure betting content that leak into news feeds — applied
// to every text feed (ESPN/CBS/theScore/Reddit). Brand names use an optional
// space so "draft kings" and "draftkings" both match.
const ARTICLE_BLOCKLIST = [
  /\bdraft[\s-]?kings\b/i,
  /\bfan[\s-]?duel\b/i,
  /\bprize[\s-]?picks\b/i,
  /\bsportsbook\b/i,
  /\bparlay\b/i,
  /\bbest\s+bets?\b/i,
  /\bbetting\s+(?:odds|line|trends|preview|picks?|tips?)\b/i,
  /\bodds,?\s+picks?\b/i,
  /\bpicks?,?\s+predictions?\b/i,
  /\bfantasy\s+(?:baseball|basketball|football|hockey|lineup)\b/i,
  /\btransfer\s+rumors?\b/i,
  /\bdaily\b.*\b(?:playoffs?|schedule|bracket)\b/i,
];

function passesArticleBlocklist(headline, description = "") {
  const t = `${headline} ${description}`;
  return !ARTICLE_BLOCKLIST.some((re) => re.test(t));
}

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

// ── Official league sites ─────────────────────────────────────────

// MLB.com's /video/topic/most-popular page is server-rendered with ContentCards.
// That's the exact list that appears in the video-detail page's right sidebar.
// Fetches today + yesterday's MLB highlights via StatsAPI and returns a
// slug → playback HLS URL map. Used to enrich the /video/topic/most-popular
// scrape with direct streams so the in-app modal can play the exact clip.
async function fetchMLBPlaybackMap() {
  const toET = (d) => {
    const s = d.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    const [m, day, y] = s.split("/");
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const map = new Map();
  const fetchDate = async (date) => {
    try {
      const data = await getJson(
        `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=game(content(highlights(highlights)))`
      );
      for (const dt of data?.dates || []) {
        for (const g of dt?.games || []) {
          for (const h of g?.content?.highlights?.highlights?.items || []) {
            const slug = h.slug;
            if (!slug) continue;
            // Prefer the HLS manifest (`hlsCloud`); fall back to any playback URL.
            const hls = (h.playbacks || []).find((p) => p.name === "hlsCloud") || (h.playbacks || [])[0];
            if (hls?.url) map.set(slug, hls.url);
          }
        }
      }
    } catch {
      // Non-fatal — we just won't have inline playback for items on this date.
    }
  };
  await fetchDate(toET(today));
  await fetchDate(toET(yesterday));
  return map;
}

// Per-slug fallback: each MLB video detail page embeds a JSON-LD VideoObject
// whose `contentUrl` is the canonical HLS manifest. Compilations like
// "Top 10 Plays of the Week" / "Real Fast" don't appear in statsapi highlights
// (no game association), so the playback map misses them — this fills the gap.
async function fetchMLBPlaybackForSlug(slug) {
  return (await fetchMLBVideoMeta(slug))?.playbackUrl ?? null;
}

// The same JSON-LD VideoObject, with the fields the league-wide recap card
// needs beside the manifest: uploadDate, duration (ISO 8601 → seconds) and
// the poster. null when the page has no HLS VideoObject.
async function fetchMLBVideoMeta(slug) {
  try {
    const html = await getText(`https://www.mlb.com/video/${slug}`);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/g);
    if (!m) return null;
    for (const block of m) {
      const txt = block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "").trim();
      if (!txt.includes("VideoObject")) continue;
      try {
        const data = JSON.parse(txt);
        const url = typeof data.contentUrl === "string" ? data.contentUrl : null;
        if (!url || !url.includes(".m3u8")) continue;
        const thumb = Array.isArray(data.thumbnailUrl) ? data.thumbnailUrl[0] : data.thumbnailUrl;
        return {
          playbackUrl: url,
          uploadDate: typeof data.uploadDate === "string" ? data.uploadDate : null,
          durationSec: isoDurationToSec(data.duration),
          poster: typeof thumb === "string" ? thumb : null,
        };
      } catch { /* try next block */ }
    }
  } catch { /* swallow — caller treats null as "no inline playback" */ }
  return null;
}

async function fetchMLBVideos() {
  try {
    const [html, playbackMap] = await Promise.all([
      getText("https://www.mlb.com/video/topic/most-popular"),
      fetchMLBPlaybackMap(),
    ]);
    const items = [];
    const seen = new Set();
    // Each entry: <a href="/video/{slug}"...> ... <img alt="..." src="..."> ...
    //             <h3 class="ContentCard__Title...">Title</h3>
    //             <p class="ContentCard__Duration...">0:59</p> (inside card)
    const cardRe = /<a[^>]+href="(\/video\/[^"?]+)"[^>]*>([\s\S]{100,8000}?)<\/a>/g;
    let m;
    while ((m = cardRe.exec(html)) !== null) {
      const slug = m[1].replace(/^\/video\//, "");
      if (!slug || seen.has(slug)) continue;
      if (slug.startsWith("topic/") || slug.startsWith("search") || slug.startsWith("?")) continue;
      const body = m[2];
      const titleM = body.match(/<h\d[^>]*class="[^"]*ContentCard__Title[^"]*"[^>]*>([\s\S]{3,300}?)<\/h\d>/);
      if (!titleM) continue;
      const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, ""));
      if (!title) continue;
      const imgM = body.match(/<img[^>]+src="(https:\/\/img\.mlbstatic\.com\/[^"]+)"/);
      const dateM = body.match(/<p[^>]*class="[^"]*ContentCard__Date[^"]*"[^>]*>([^<]{3,30})<\/p>/);
      seen.add(slug);
      items.push({
        id: slug,
        headline: title,
        description: "",
        published: dateM ? dateM[1].trim() : "",
        imageUrl: imgM ? imgM[1] : null,
        articleUrl: `https://www.mlb.com/video/${slug}`,
        byline: "",
        section: "MLB Most Popular",
        playbackUrl: playbackMap.get(slug) || null,
      });
      if (items.length >= 10) break;
    }
    // Backfill compilations the statsapi map doesn't know about by scraping
    // each detail page's JSON-LD. Done in parallel; failures stay null.
    const needs = items.filter((it) => !it.playbackUrl);
    if (needs.length > 0) {
      const filled = await Promise.all(needs.map((it) => fetchMLBPlaybackForSlug(it.id)));
      needs.forEach((it, i) => { if (filled[i]) it.playbackUrl = filled[i]; });
    }
    if (items.length > 0) return items;
  } catch {
    // Fall through to StatsAPI fallback
  }
  return fetchMLBHighlightsFallback();
}

// Fallback: StatsAPI highlights (game-by-game clip reel). Used only if the
// mlb.com topic page scrape fails or comes back empty.
async function fetchMLBHighlightsFallback() {
  // ET day — baseball is ET-anchored and UTC drifts into the next day during
  // evening games. Pull today + yesterday and merge so early-morning runs (when
  // today has no games yet) still have recap highlights from last night.
  const toET = (d) => {
    const s = d.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    const [m, day, y] = s.split("/");
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const fetchDate = async (date) => {
    try {
      const data = await getJson(
        `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=game(content(highlights(highlights)))`
      );
      const out = [];
      for (const dt of data?.dates || []) {
        for (const g of dt?.games || []) {
          for (const h of g?.content?.highlights?.highlights?.items || []) out.push(h);
        }
      }
      return out;
    } catch {
      return [];
    }
  };
  const raw = [...(await fetchDate(toET(today))), ...(await fetchDate(toET(yesterday)))];
  return raw
    .filter((h) => {
      const t = (h.title || "").toLowerCase();
      // Drop condensed-game replays (10+ min) and generic "full game" clips —
      // they give up much more than a single-play highlight.
      if (t.includes("condensed game")) return false;
      if (t.includes("full game")) return false;
      // Pre-game matchup ads aren't what "Most Popular" is supposed to be.
      if (t.startsWith("probable pitchers")) return false;
      const dur = h.duration || "";
      const parts = dur.split(":").map((x) => parseInt(x, 10) || 0);
      // duration format "HH:MM:SS" or "MM:SS"
      const seconds = parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + (parts[1] || 0);
      if (seconds > 300) return false; // >5min = long-form, skip
      return true;
    })
    .slice(0, 10)
    .map((h) => {
      const cut = (h.image?.cuts || []).find((c) => c.width >= 640) || h.image?.cuts?.[0];
      return {
        id: h.slug || String(h.id),
        headline: h.title || h.headline || "",
        description: h.blurb || "",
        published: h.date || "",
        imageUrl: cut?.src || null,
        articleUrl: h.slug ? `https://www.mlb.com/video/${h.slug}` : "",
        byline: "",
        section: "MLB Most Popular",
      };
    });
}

async function fetchMLB() {
  const xml = await getText("https://www.mlb.com/feeds/news/rss.xml");
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = stripCdata((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
    const pub = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    // MLB RSS embeds <image href="https://img.mlbstatic.com/..."/> per item —
    // 16:9 hero crop, perfect for the news card thumbnail (matches NBA.com).
    const imgMatch = block.match(/<image\s+href="([^"]+)"/);
    if (!title || !link) continue;
    if (!passesArticleBlocklist(title)) continue;
    items.push({
      id: link,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      imageUrl: imgMatch ? imgMatch[1] : null,
      articleUrl: link,
      byline: "",
      section: "MLB.com",
    });
  }
  return items.slice(0, 15);
}

// NBA.com has a /content/videos-path-less content-type=video endpoint; pull
// the league-wide videos feed and filter to real highlights. Blocks betting,
// press conferences, and analyst segments via the shared VIDEO_BLOCKLIST.
async function fetchNBAVideos() {
  const data = await getJson(
    "https://content-api-prod.nba.com/public/1/leagues/nba/content?count=40&type=video"
  );
  const raw = (data?.results?.items || []).filter((i) => i.type === "video");
  const out = [];
  for (const i of raw) {
    const title = i.title || "";
    const desc = i.excerpt || "";
    const haystack = `${title} ${desc}`;
    // Skip non-English broadcast streams, pregame intros, non-highlight content.
    // No \b around these because NBA slug-titles use underscores (word chars),
    // breaking word-boundary matching.
    if (/(?:spanish|portuguese|french|japanese|italian|deutsch|german|prime video|ai-generated)/i.test(haystack)) continue;
    if (/\b(?:post[-\s]?game|all possessions|best plays|nightly recap|mobile view)\b/i.test(haystack)) continue;
    // NBA's in-house talk show "The Association" / "Post Up" — analysts talking,
    // not play highlights. Jacob explicitly rejected.
    if (/\bthe association\b/i.test(haystack)) continue;
    if (/\bpost up\b/i.test(haystack)) continue;
    // BAL = Basketball Africa League — not NBA; the API mixes it in.
    if (/^BAL\b/.test(title)) continue;
    if (/^vod_|^VOD_/.test(title)) continue;
    // Broadcast stream listings — match BOTH ISO ("HOU @ LAL on 2026-04-21-NBC-")
    // and American slash ("BOS @ PHI on 04/26/2026-NBC-national") date formats.
    if (/ on \d{4}-\d{2}-\d{2}/.test(title)) continue;
    if (/ on \d{1,2}\/\d{1,2}\/\d{4}/.test(title)) continue;
    if (VIDEO_BLOCKLIST.some((re) => re.test(haystack))) continue;
    // No-thumb items break the aligned video strip's row alignment (a cell
    // with just a title is much shorter than its image-bearing siblings).
    // NBA's API occasionally returns full-game-highlight entries without a
    // featuredImage — drop them so every visible cell has consistent content.
    if (!i.featuredImage) continue;
    out.push({
      id: String(i.id),
      headline: title,
      description: desc,
      published: i.date || "",
      imageUrl: i.featuredImage,
      articleUrl: i.permalink || "",
      byline: "",
      section: "NBA Top Videos",
    });
    if (out.length >= 10) break;
  }
  return out;
}

async function fetchNBA() {
  const data = await getJson("https://content-api-prod.nba.com/public/1/content/news?count=25");
  const raw = data?.results?.items || [];
  return raw
    .filter((i) => i.type === "post" && (i.permalink || "").includes("/news/"))
    .filter((i) => passesArticleBlocklist(i.title || "", i.excerpt || ""))
    .slice(0, 15)
    .map((i) => ({
      id: String(i.id),
      headline: i.title || "",
      description: i.excerpt || "",
      published: i.date || "",
      imageUrl: i.featuredImage || null,
      articleUrl: i.permalink || "",
      byline: i.author?.name || "",
      section: "NBA.com",
    }));
}

// WNBA shares NBA.com's content-api host — same payload shape, just /leagues/wnba.
async function fetchWNBAVideos() {
  const data = await getJson(
    "https://content-api-prod.nba.com/public/1/leagues/wnba/content?count=40&type=video"
  );
  const raw = (data?.results?.items || []).filter((i) => i.type === "video");
  const out = [];
  for (const i of raw) {
    const title = i.title || "";
    const desc = i.excerpt || "";
    const haystack = `${title} ${desc}`;
    if (/(?:spanish|portuguese|french|japanese|italian|deutsch|german|prime video|ai-generated)/i.test(haystack)) continue;
    if (/\b(?:post[-\s]?game|all possessions|best plays|nightly recap|mobile view)\b/i.test(haystack)) continue;
    if (/^vod_|^VOD_/.test(title)) continue;
    if (/ on \d{4}-\d{2}-\d{2}/.test(title)) continue;
    if (/ on \d{1,2}\/\d{1,2}\/\d{4}/.test(title)) continue;
    if (VIDEO_BLOCKLIST.some((re) => re.test(haystack))) continue;
    if (!i.featuredImage) continue;
    out.push({
      id: String(i.id),
      headline: title,
      description: desc,
      published: i.date || "",
      imageUrl: i.featuredImage,
      articleUrl: i.permalink || "",
      byline: "",
      section: "WNBA Top Videos",
    });
    if (out.length >= 10) break;
  }
  return out;
}

async function fetchWNBA() {
  // WNBA.com publishes ~94% video / 6% post — page 1 alone yields only ~3 news
  // articles. Paginate the mixed-content feed to fill the same ~15-item target
  // as MLB / NBA. Bounded at 5 pages so a slow API never wedges the prebake.
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= 5 && out.length < 15; page++) {
    let raw;
    try {
      const data = await getJson(`https://content-api-prod.nba.com/public/1/leagues/wnba/content?count=100&page=${page}`);
      raw = data?.results?.items || [];
    } catch {
      break;
    }
    if (raw.length === 0) break;
    for (const i of raw) {
      if (i.type !== "post") continue;
      if (!(i.permalink || "").includes("/news/")) continue;
      if (!passesArticleBlocklist(i.title || "", i.excerpt || "")) continue;
      const id = String(i.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        headline: i.title || "",
        description: i.excerpt || "",
        published: i.date || "",
        imageUrl: i.featuredImage || null,
        articleUrl: i.permalink || "",
        byline: i.author?.name || "",
        section: "WNBA.com",
      });
      if (out.length >= 15) break;
    }
  }
  return out;
}

async function fetchNHL() {
  const data = await getJson(
    "https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=news&context.slug=nhl&%24limit=20"
  );
  const raw = data?.items || [];
  return raw
    .filter((i) => passesArticleBlocklist(i.title || "", i.summary || ""))
    .slice(0, 15)
    .map((i) => {
      // Official-site 16:9 hero crop, same treatment as NBA.com/MLB.com. The
      // article thumbnail lives at top-level i.thumbnail (NOT i.fields.thumbnail,
      // which only carries description/topic — that path was always null), and
      // its templateUrl takes a {formatInstructions} placeholder. Request the
      // 16:9 ratio so it fills the card frame instead of letterboxing a 1:1 crop.
      // Mirrors fetchNHLVideos() below.
      const tmpl = i.thumbnail?.templateUrl;
      const imageUrl = tmpl
        ? tmpl.replace("{formatInstructions}", "t_ratio16_9-size40")
        : (i.thumbnail?.thumbnailUrl || null);
      return {
        id: i._entityId || i.slug,
        headline: i.title || "",
        description: i.summary || "",
        published: i.contentDate || "",
        imageUrl,
        articleUrl: `https://www.nhl.com/news/${i.slug}`,
        byline: "",
        section: "NHL.com",
      };
    });
}

// NHL.com videos are Brightcove-hosted (not YouTube, not a raw HLS manifest we
// can reach un-signed), so each item carries a brightcoveId + brightcoveAccountId
// and the modal plays it via the Brightcove default-player iframe (embedUrl) —
// which handles the policy key / geo / DRM handshake for us. See VideoModal's
// embedMode branch.
const BRIGHTCOVE_EMBED = (account, vid) =>
  `https://players.brightcove.net/${account}/default_default/index.html?videoId=${vid}`;

// Studio/analysis shows — talking heads, not game action. The NHL videos feed
// is dominated by these during the off-/post-season (NHL Tonight, NHL Network),
// so drop them the way the NBA/ESPN feeds drop their personality content. A
// FanDuel parlay ad seen 2026-06-01 was also tagged nhl-tonight, so this doubles
// as a betting-content guard alongside passesArticleBlocklist.
const NHL_STUDIO_TAGS = new Set(["nhl-tonight", "nhl-network"]);
// Positive whitelist — keep only clips tagged as real highlights/recaps/goals.
// Verified against the live feed 2026-06-01: cleanly separates "MTL at CAR |
// Recap", "Top Goals", individual goal clips, condensed games from the studio
// segments above.
const NHL_HIGHLIGHT_TAGS = new Set([
  "highlight", "goal", "top-plays", "real-time-highlight", "game-recap",
  "condensed-game", "all-goals", "series-recap", "power-play-goal",
  "shorthanded-goal", "top-saves", "save",
]);

async function fetchNHLVideos() {
  const data = await getJson(
    "https://forge-dapi.d3.nhle.com/v2/content/en-us/videos?context.slug=nhl&%24limit=40"
  );
  const raw = data?.items || [];
  const out = [];
  for (const i of raw) {
    const f = i.fields || {};
    const title = i.title || f.headline || "";
    if (!title) continue;
    if (!passesArticleBlocklist(title, f.description || "")) continue;
    const tags = (i.tags || []).map((t) => t.slug);
    // Drop studio/analysis; require at least one genuine-highlight tag.
    if (tags.some((t) => NHL_STUDIO_TAGS.has(t))) continue;
    if (!tags.some((t) => NHL_HIGHLIGHT_TAGS.has(t))) continue;
    const bcId = f.brightcoveId;
    const bcAccount = f.brightcoveAccountId;
    if (!bcId || !bcAccount) continue;
    // 16:9 thumbnail from the templateUrl ({formatInstructions} placeholder).
    // The default thumbnailUrl is a 1:1 crop, which letterboxes in the card's
    // aspect-video frame. Fall back to thumbnailUrl if the template is missing.
    const tmpl = i.thumbnail?.templateUrl;
    const imageUrl = tmpl
      ? tmpl.replace("{formatInstructions}", "t_ratio16_9-size40")
      : (i.thumbnail?.thumbnailUrl || null);
    out.push({
      id: String(bcId),
      headline: title,
      description: "",
      published: i.contentDate || "",
      imageUrl,
      articleUrl: `https://www.nhl.com/video/${i.slug}`,
      byline: "",
      section: "NHL Top Videos",
      embedUrl: BRIGHTCOVE_EMBED(bcAccount, bcId),
    });
    if (out.length >= 10) break;
  }
  return out;
}

// ── Official league YouTube channels (World Cup, MLS) ─────────────
// Leagues with no scrapeable .com video feed (FIFA+ and MLS-on-Apple are
// DRM/geo-locked) still lead their column with a "Top Videos" card by pulling
// the league's official YouTube uploads RSS. The feed hands us a real
// youtubeVideoId, so the in-app player plays the clip natively — no
// /api/youtube lookup/validation needed (unlike the .com feeds). Add a league
// here + a jobs entry + PREBAKED_VIDEOS (src/lib/news.ts) and its column leads
// with video, lockstep with MLB/NBA/NHL.
async function fetchYouTubeChannelVideos(channelId, section) {
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const items = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const vid = (block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = decodeEntities(stripCdata((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""));
    const pub = ((block.match(/<published>([^<]+)<\/published>/) || [])[1] || "").trim();
    if (!vid || !title) continue;
    // Drop Shorts and hashtag-stuffed cross-promo clips (≥2 hashtags) — they're
    // vertical / off-topic, not the highlight reel this leading card is for.
    if ((title.match(/#/g) || []).length >= 2) continue;
    if (!passesArticleBlocklist(title)) continue;
    items.push({
      id: vid,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      // mqdefault is a clean 16:9 crop; the RSS default (hqdefault) is 4:3 and
      // letterboxes in the card's aspect-video frame.
      imageUrl: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
      articleUrl: `https://www.youtube.com/watch?v=${vid}`,
      byline: "",
      section,
      youtubeVideoId: vid,
    });
    if (items.length >= 10) break;
  }
  return items;
}

// ── ESPN homepage TOP HEADLINES (scraped for exact order) ─────────

// Cached homepage HTML so the headlines + videos scrapers share one fetch.
let _espnHomeHtmlPromise = null;
function getESPNHomeHtml() {
  if (!_espnHomeHtmlPromise) _espnHomeHtmlPromise = getText("https://www.espn.com/");
  return _espnHomeHtmlPromise;
}

// ESPN homepage "ICYMI" widget — single curated video, always present in the
// <article class="sub-module editorial"> block. Used as the headline video in
// the col-3 ESPN Videos card.
async function fetchESPNICYMI() {
  const html = await getESPNHomeHtml();
  const blockM = html.match(/<article class="sub-module editorial"[\s\S]{0,10000}?<\/article>/);
  if (!blockM) return null;
  const block = blockM[0];
  // ESPN serves ICYMI with and without the data-video attribute (depends on auth
  // state / region flags). Fall back to the clip?id= URL that's always in the
  // thumbnail anchor.
  const vidM = block.match(/data-video="watch,\d+,\d+,(\d+)/) || block.match(/clip\?id=(\d+)/);
  if (!vidM) return null;
  const vid = vidM[1];
  const imgM = block.match(/data-default-src="(https?:\/\/[^"]+\.jpg)"/);
  // Headline is the <h2><a>...</a></h2> under the text-container <li>.
  const titleM = block.match(/<h2[^>]*><a[^>]+href="[^"]*clip\?id=\d+"[^>]*>([\s\S]{5,300}?)<\/a><\/h2>/);
  const descM = block.match(/<p[^>]*>([\s\S]{5,500}?)<\/p>/);
  const title = titleM ? decodeEntities(titleM[1].replace(/<[^>]+>/g, "")) : "";
  if (!title) return null;
  return {
    id: vid,
    headline: `ICYMI: ${title}`,
    description: descM ? decodeEntities(descM[1].replace(/<[^>]+>/g, "")) : "",
    published: "",
    imageUrl: imgM ? imgM[1] : null,
    articleUrl: `https://www.espn.com/video/clip?id=${vid}`,
    byline: "",
    section: "ICYMI",
  };
}

// Map ESPN article URL path → sport-logo URL for the small badge shown left
// of each headline in the col-3 ESPN Top card. Parses the first segment
// after the domain. Two CDN paths cover every sport — `teamlogos/leagues`
// for the leagues with a real logo there (NBA / MLB / NHL / etc.), and
// `redesign/assets/img/icons/ESPN-icon-*` for the rest (college basketball,
// college football, tennis, soccer, racing). Every known ESPN path slug
// must resolve so a new sport never ships logo-less.
const TEAMLOGOS = (slug) =>
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/${slug}.png&w=40&h=40&transparent=true`;
const SPORT_ICON = (slug) =>
  `https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-${slug}.png`;

// League-shield logos for the majors (NBA silhouette, NFL shield, etc.) —
// per Jacob's preference 2026-05-02. Tried SPORT_ICON (the ball / equipment)
// for visual consistency but he preferred the brand-shields back. The
// SPORT_ICON alternative is kept as an inline `// alt:` comment next to
// each line so we can flip back fast if he changes his mind.
const TWEMOJI = (hex) =>
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${hex}.png`;

const PATH_TO_LOGO = {
  // Major leagues — brand shield (alt: ball/equipment via SPORT_ICON)
  nba: TEAMLOGOS("nba"),         // alt: SPORT_ICON("basketball")
  wnba: TEAMLOGOS("wnba"),       // alt: SPORT_ICON("basketball")
  mlb: TEAMLOGOS("mlb"),         // alt: SPORT_ICON("baseball")
  nhl: TEAMLOGOS("nhl"),         // alt: SPORT_ICON("hockey")
  nfl: TEAMLOGOS("nfl"),         // alt: SPORT_ICON("football")
  mls: TEAMLOGOS("mls"),         // alt: SPORT_ICON("soccer")
  fifa: TEAMLOGOS("fifa"),       // alt: SPORT_ICON("soccer")
  golf: TEAMLOGOS("pgatour"),    // alt: SPORT_ICON("golf")
  pga: TEAMLOGOS("pgatour"),     // alt: SPORT_ICON("golf")
  lpga: TEAMLOGOS("lpga"),       // alt: SPORT_ICON("golf")
  f1: TEAMLOGOS("f1"),           // alt: TWEMOJI("1f3ce") racing car
  ufc: TEAMLOGOS("ufc"),         // alt: SPORT_ICON("mma")
  mma: TEAMLOGOS("ufc"),         // alt: SPORT_ICON("mma")
  boxing: TEAMLOGOS("ufc"),      // alt: SPORT_ICON("boxing")
  racing: TEAMLOGOS("f1"),       // alt: SPORT_ICON("nascar")
  // Sports without a clean league shield — fall back to ESPN's redesign
  // sport-icon set (just the ball / equipment).
  soccer: SPORT_ICON("soccer"),
  tennis: SPORT_ICON("tennis"),
  cricket: SPORT_ICON("cricket"),
  rugby: SPORT_ICON("rugby"),
  badminton: SPORT_ICON("badminton"),
  nascar: SPORT_ICON("nascar"),
  olympics: SPORT_ICON("olympics"),
  // College + generic-sport URL slugs
  "mens-college-basketball": SPORT_ICON("basketball"),
  "womens-college-basketball": SPORT_ICON("basketball"),
  "college-basketball": SPORT_ICON("basketball"),
  "college-football": SPORT_ICON("football-college"),
  ncaaf: SPORT_ICON("football-college"),
  ncaab: SPORT_ICON("basketball"),
  ncaa: SPORT_ICON("basketball"),
  basketball: SPORT_ICON("basketball"),
  football: SPORT_ICON("football"),
  // Horse racing — Twemoji jockey 🏇. Jacob explicitly liked this one
  // 2026-05-02 (ESPN equestrian icon is Olympic show-jumping, wrong sport).
  "horse-racing": TWEMOJI("1f3c7"),
  equestrian: TWEMOJI("1f3c7"),
};

// Walk all URL path segments first (catches /recruiting/basketball/...,
// /soccer/..., etc.). If nothing matches, fall back to scanning the URL
// id-slug for a known sport keyword — picks up /espn/betting/.../id/.../
// espn-mlb-betting-tips-... which has no sport directory but mentions "mlb"
// in the slug. Last resort returns the ESPN brand mark so no row ever
// ships without an icon (Jacob 2026-05-02: "ensure there will always be
// correct icons" — empty thumb box looks broken).
const ESPN_FALLBACK_LOGO = "https://a.espncdn.com/i/espn/misc_logos/500/espn.png";
function espnArticleLogo(articleUrl) {
  try {
    const u = new URL(articleUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    for (const seg of segs) {
      const hit = PATH_TO_LOGO[seg.toLowerCase()];
      if (hit) return hit;
    }
    // Fallback: scan the full path for a hyphen-bounded sport keyword.
    const lower = u.pathname.toLowerCase();
    for (const key of Object.keys(PATH_TO_LOGO)) {
      if (lower.includes(`-${key}-`) || lower.includes(`/${key}-`) || lower.includes(`-${key}/`)) {
        return PATH_TO_LOGO[key];
      }
    }
    return ESPN_FALLBACK_LOGO;
  } catch {
    return ESPN_FALLBACK_LOGO;
  }
}

// Previously fell back to `https://now.core.api.espn.com/v1/sports/news?limit=20`
// when the homepage scrape missed the headlineStack block — but that endpoint
// is the broad multi-sport "now" feed (fantasy advice, betting tips, F1,
// cricket, EPL filler) NOT the top-headlines list, so users saw garbage on
// every prebake run that hit the fallback path. Removed: better to ship an
// empty espn-top than the wrong one.

async function fetchESPNTopHeadlinesFromHtml(html) {
  // ESPN occasionally swaps the inner wrapper element (div ↔ section) inside
  // the top-headlines block, and splits the headline list across two adjacent
  // <ul class="headlineStack__list"> elements (5 + 4 today). Anchor on the
  // parent class, then concat every headline UL found until the section closes.
  const topIdx = html.indexOf('class="headlineStack top-headlines"');
  if (topIdx >= 0) {
    // Grab the listContainer's full inner HTML — it wraps every UL of headlines
    // for this block. Falls back to a 30 KB slice if the markup ever drops the
    // listContainer wrapper entirely.
    const tail = html.slice(topIdx, topIdx + 30000);
    const containerM = tail.match(/headlineStack__listContainer"[^>]*>([\s\S]*?)<\/section>/);
    const block = containerM ? containerM[1] : tail;
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    const items = [];
    let m;
    while ((m = liRe.exec(block)) !== null) {
      const li = m[1];
      const anchor = li.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!anchor) continue;
      let url = anchor[1];
      if (url.startsWith("/")) url = `https://www.espn.com${url}`;
      const title = decodeEntities(anchor[2].replace(/<[^>]+>/g, ""));
      if (!title) continue;
      if (!passesArticleBlocklist(title)) continue;
      items.push({
        id: url,
        headline: title,
        description: "",
        published: "",
        imageUrl: null,
        leagueLogo: espnArticleLogo(url),
        articleUrl: url,
        byline: "",
        section: "ESPN",
      });
    }
    if (items.length > 0) return items.slice(0, 15);
  }
  return [];
}

// ── Article lead images (ESPN top headlines) ──────────────────────
//
// ESPN's homepage headline list is text-only — there is no <img> anywhere in
// the <li> — so espn-top baked `imageUrl: null` on all 9-15 items. That left
// the cards picture-less AND made every shared ESPN link unfurl with the
// generic site blob instead of the story's art (Jacob, 7/28). The article page
// itself carries a normal og:image, so resolve it per headline.
//
// Cached by article URL because a story's lead art doesn't change: we pay one
// extra fetch per NEW headline, not per hourly bake. Only HITS are cached —
// a transient block would otherwise pin `null` for the whole TTL. Any failure
// leaves imageUrl null and the item ships anyway; a missing picture is a
// cosmetic downgrade, never a dropped story.
const ARTICLE_IMG_CACHE_PATH = `${OUT_DIR}/_article-img-cache.json`;
let _artCache = null;
let _artDirty = false;

async function loadArticleImgCache() {
  if (_artCache) return _artCache;
  try { _artCache = JSON.parse(await readFile(ARTICLE_IMG_CACHE_PATH, "utf8")); } catch { _artCache = {}; }
  const cutoff = Date.now() - 14 * 864e5;
  for (const [k, v] of Object.entries(_artCache)) {
    if (!v || !v.at || v.at < cutoff) delete _artCache[k];
  }
  return _artCache;
}

async function saveArticleImgCache() {
  if (!_artDirty || !_artCache) return;
  try {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(ARTICLE_IMG_CACHE_PATH, JSON.stringify(_artCache));
    _artDirty = false;
  } catch { /* best-effort cache */ }
}

async function fetchArticleOgImage(articleUrl) {
  const cache = await loadArticleImgCache();
  const hit = cache[articleUrl];
  if (hit && hit.img) return hit.img;
  try {
    const html = await getText(articleUrl);
    const m =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (!m) return null;
    const img = decodeEntities(m[1]);
    cache[articleUrl] = { img, at: Date.now() };
    _artDirty = true;
    return img;
  } catch {
    return null; // blocked/slow article → ship the headline without art
  }
}

// Fill in `imageUrl` for any item that lacks one, 4 article fetches at a time.
async function attachArticleImages(items) {
  const queue = items.filter((it) => !it.imageUrl && it.articleUrl);
  if (!queue.length) return items;
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const it = queue.shift();
        it.imageUrl = await fetchArticleOgImage(it.articleUrl);
      }
    })
  );
  await saveArticleImgCache();
  return items;
}

async function fetchESPNTopHeadlines() {
  // First try the shared cached homepage HTML — most jobs hit the same fetch.
  let html = await getESPNHomeHtml();
  let items = await fetchESPNTopHeadlinesFromHtml(html);
  if (items.length > 0) return attachArticleImages(items);
  // ESPN intermittently serves a homepage variant *without* the
  // headlineStack block. Verified 2026-05-13: same Mac mini residential IP,
  // 5 minutes apart, opposite results. Retry with fresh fetches; a different
  // request often lands on the variant that does have the block.
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      html = await getText("https://www.espn.com/");
      items = await fetchESPNTopHeadlinesFromHtml(html);
      if (items.length > 0) {
        // Refresh shared cache so subsequent jobs (videos) hit the same
        // headline-bearing variant we just successfully scraped.
        _espnHomeHtmlPromise = Promise.resolve(html);
        return attachArticleImages(items);
      }
    } catch {
      // Treat as retry — fall through to next attempt.
    }
  }
  return [];
}

// ── ESPN homepage big-format videos (thumbnail + title, in scroll order) ──

// Skip talking-heads + betting-promo content. First block = personality shows;
// second block = interview/reaction content that looks like analysis rather than
// actual play highlights; third block = sportsbook sponsorships.
const VIDEO_BLOCKLIST = [
  // Personality-led ESPN shows
  /\bstephen\s*a\b/i,
  /\bschefter\b/i,
  /\bfirst\s*take\b/i,
  /\bget\s*up\b/i,
  /\bnfl\s*live\b/i,
  /\bpat\s*mcafee\b/i,
  /\bpti\b/i,
  /\bpardon\s+the\s+interruption\b/i,
  /\baround\s+the\s+horn\b/i,
  /\bnba\s*today\b/i,
  /\bthis\s*just\s*in\b/i,
  /\bsportscenter\b/i,
  /\binsiders?\b/i,
  // Common ESPN/sports-media personalities whose videos are takes, not plays
  /\bperk(?:\s|:)/i,       // Kendrick Perkins
  /\brex ryan\b/i,
  /\brob parker\b/i,
  /\bryan clark\b/i,
  /\borlovsky\b/i,         // Dan Orlovsky — ESPN often uses last name only
  /\bmina kimes\b/i,
  /\bdomonique foxworth\b/i,
  /\bwindhorst\b/i,         // Brian Windhorst
  /\bkanell\b/i,            // Danny Kanell
  /\bherbstreit\b/i,
  /\blouis riddick\b/i,
  /\bmcfarland\b/i,         // Booger McFarland
  /\bwoj\b/i,               // Shams/Woj insider drops
  /\bshams\b/i,
  /\bleft the table\b/i,    // "X got left the table" etc. segment filler
  // Interview / talking-head / analysis content
  /\binterview\b/i,
  /\bpress\s+conference\b/i,
  /\bmedia\s+availability\b/i,
  /\bpostgame\b/i,
  /\bpost[-\s]?game\s+react/i,
  /\breact(?:s|ion|ing)?\b/i,
  /\bexplains?\b/i,
  /\banaly(?:sis|zes|ze|st)\b/i,
  /\bbreakdown\b/i,
  /\bweigh(?:s|ed)\s+in\b/i,
  /\btalks\b/i,
  // Betting / sportsbook content
  /\bbetting\b/i,
  /\bdraftkings\b/i,
  /\bfanduel\b/i,
  /\bprizepicks\b/i,
  /\bsportsbook\b/i,
  /\bodds\b/i,
  /\bparlay\b/i,
  /\bprops?\s+bet\b/i,
  /\bpicks?\s+(?:and|&)\s+props?\b/i,
];

// ESPN-only structural analyst-take guard. ESPN headlines opinion/segment clips
// as "Lastname: <claim>" or "First Last: <claim>" — a person's name (1–3
// capitalized tokens) at the very start, then a colon. Real ESPN highlight
// titles lead with the action ("Brady Neal cranks a three-run HR"), never a
// bare name. This catches new pundits the name denylist misses, since ESPN uses
// last-name-only ("Orlovsky: Pats making a 'dice roll'"). NOT added to
// VIDEO_BLOCKLIST because the league feeds (MLB/NBA/WNBA) legitimately use a
// "Label:" format for real highlights ("Game Highlights:", "Game Recap:",
// "Real Fast:"); the label-word guard below keeps those. "St. Mary's…" / "Texas'
// Stewart…" are safe (no leading "Word:").
const ESPN_TAKE_PREFIX_RE = /^([A-Z][a-z'.]+(?:\s+[A-Z][a-z'.]+){0,2}):\s/;
const ESPN_VIDEO_LABEL_WORDS = new Set([
  "highlights", "highlight", "recap", "recaps", "plays", "play", "top", "best",
  "game", "games", "full", "featured", "sc", "fastcast", "cast", "week", "day",
  "season", "preview", "rankings", "chasing", "history", "real", "fast",
  "behind", "watch", "extended", "condensed",
]);
function isEspnAnalystTake(title) {
  const m = title.match(ESPN_TAKE_PREFIX_RE);
  if (!m) return false;
  // Keep label-led titles ("Top Plays:", "Real Fast:", "Power Rankings:") — a
  // person's name contains no content-label word.
  return !m[1].toLowerCase().split(/\s+/).some((w) => ESPN_VIDEO_LABEL_WORDS.has(w));
}

async function fetchESPNTopVideos() {
  // ICYMI is ESPN's hand-picked headline video — pinned to slot 2 so the day's
  // newest big-format video leads and ICYMI sits below it as a clearly-labeled
  // "in case you missed it" anchor.
  const icymi = await fetchESPNICYMI().catch(() => null);
  // ICYMI-only counts as a miss: ICYMI is a fallback addition, not real video
  // module content. Floor is icymi ? 1 : 0.
  const floor = icymi ? 1 : 0;
  let html = await getESPNHomeHtml();
  let scraped = scrapeESPNTopVideosFromHtml(html, icymi);
  // Same ESPN homepage-variant flakiness as fetchESPNTopHeadlines: occasionally
  // the served HTML lacks the video blocks entirely. news-prebake.yml runs with
  // --skip=espn-top, so the headlines retry never refreshes the shared HTML
  // cache for us — videos has to retry independently.
  if (scraped.length <= floor) {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        html = await getText("https://www.espn.com/");
        scraped = scrapeESPNTopVideosFromHtml(html, icymi);
        if (scraped.length > floor) {
          _espnHomeHtmlPromise = Promise.resolve(html);
          break;
        }
      } catch {
        // Treat as retry — fall through to next attempt.
      }
    }
  }
  return await persistVideos("espn-videos", scraped, icymi?.id);
}

function scrapeESPNTopVideosFromHtml(html, icymi) {
  // Only scrape "big format" blocks — these are <section class="contentItem__content--fullWidth">
  // variants (hero + enhanced video modules). Small horizontal strips like "Top Plays" 4-wide
  // carousels don't carry --fullWidth and get skipped, which matches ESPN's visual hierarchy.
  const sectionRe = /<section[^>]*class="([^"]*contentItem__content[^"]*)"[^>]*>([\s\S]{100,20000}?)(?=<section class="contentItem__content|<\/article>|<\/section>\s*<\/article>)/g;
  const items = [];
  const seen = new Set();
  if (icymi) {
    items.push(icymi);
    seen.add(icymi.id);
  }
  let m;
  while ((m = sectionRe.exec(html)) !== null) {
    const cls = m[1];
    if (!/contentItem__content--fullWidth/.test(cls)) continue;
    if (!/has-video|contentItem__content--video/.test(cls)) continue;
    // miniCard + bloom modifiers are how ESPN marks the 4-wide horizontal
    // strips of small highlight thumbnails tucked below a big video module.
    // Those look like "Robert Williams slam / Luke Kornet / Toumani Camara" —
    // user explicitly doesn't want them.
    if (/\b(?:miniCard|module_bloom_behavior|onefeed-bloom)\b/.test(cls)) continue;
    // --collection wrappers are story roundups (takeaways / draft preview /
    // "8 stats") — not actual video features, even when they embed a clip.
    if (/contentItem__content--collection/.test(cls)) continue;
    const block = m[2];
    const vidM = block.match(/data-popup-href="\/video\/clip\?id=(\d+)"/) || block.match(/data-video="watch,\d+,\d+,(\d+)/);
    if (!vidM) continue;
    const vid = vidM[1];
    if (seen.has(vid)) continue;
    const titleM = block.match(/<h\d[^>]*class="[^"]*contentItem__title[^"]*"[^>]*>([\s\S]{5,400}?)<\/h\d>/);
    if (!titleM) continue;
    const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, ""));
    if (!title) continue;
    const descM = block.match(/<p[^>]*class="[^"]*contentItem__subhead[^"]*"[^>]*>([\s\S]{5,500}?)<\/p>/);
    const description = descM ? decodeEntities(descM[1].replace(/<[^>]+>/g, "")) : "";
    // The first <a href> in a video block is often a sibling-story link (a
    // "read more" bumper module with its own /story/_/id/<other-id>/...) and
    // doesn't lead to the highlighted clip. Anchor on the canonical clip URL
    // so the link always plays the actual video the headline describes.
    const articleUrl = `https://www.espn.com/video/clip?id=${vid}`;
    const imgM = block.match(/data-default-src="(https?:\/\/[^"]+\.jpg)"/);
    const imageUrl = imgM ? imgM[1] : null;
    const haystack = `${title} ${description}`;
    if (VIDEO_BLOCKLIST.some((re) => re.test(haystack))) continue;
    if (isEspnAnalystTake(title)) continue;
    seen.add(vid);
    items.push({
      id: vid,
      headline: title,
      description,
      published: "",
      imageUrl,
      articleUrl,
      byline: "",
      section: "ESPN Video",
    });
    if (items.length >= 20) break; // over-collect; merge+cap below
  }
  return items;
}

// Merge freshly-scraped videos with what we wrote earlier today so the full top
// 10 "big videos that hit the frontpage" builds up across the day. Rolls over
// at ET midnight (a fresh day starts fresh). ICYMI is pinned to slot 2 (index
// 1) so the day's newest hero video leads and ICYMI sits below it.
async function persistVideos(name, fresh, pinnedId) {
  const path = `${OUT_DIR}/${name}.json`;
  let existing = null;
  try {
    existing = JSON.parse(await readFile(path, "utf8"));
  } catch {
    existing = null;
  }
  const nowMs = Date.now();
  const currentETDay = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const existingETDay = existing?.fetchedAt
    ? new Date(existing.fetchedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })
    : null;
  // Fresh day → drop yesterday's list. Same day → carry forward.
  const carryRaw = existingETDay === currentETDay ? (existing?.items || []) : [];
  // Purge carried-forward ESPN analyst takes so a pundit clip that slipped in
  // earlier today (e.g. before this filter shipped) doesn't linger in the
  // carry until the ET-midnight rollover. ICYMI is safe — its all-caps
  // "ICYMI:" prefix doesn't match the name-pattern regex.
  const carry =
    name === "espn-videos"
      ? carryRaw.filter((i) => !isEspnAnalystTake(i.headline || ""))
      : carryRaw;
  const byId = new Map();
  // Seed with carry so unseen items survive the merge; fresh items overwrite
  // (so headline/description/imageUrl edits propagate) while preserving the
  // earliest firstSeenAt we've ever recorded for that id.
  for (const item of carry) {
    byId.set(item.id, { ...item, firstSeenAt: item.firstSeenAt || nowMs });
  }
  for (const item of fresh) {
    const prior = byId.get(item.id);
    byId.set(item.id, { ...item, firstSeenAt: prior?.firstSeenAt || item.firstSeenAt || nowMs });
  }
  // Repair carry-forward items written before commit ce??? — earlier scrapes
  // captured a sibling-story href as articleUrl on some videos (SGA, Rocky).
  // The id is the canonical clip id, so rebuild articleUrl from it for the
  // ESPN feed only (where ids are numeric clip ids).
  if (name === "espn-videos") {
    for (const [id, item] of byId) {
      if (/^\d+$/.test(id)) {
        item.articleUrl = `https://www.espn.com/video/clip?id=${id}`;
      }
    }
  }
  // Order: newest big-format video first, ICYMI second, then the rest by
  // firstSeenAt ascending so morning videos anchor the body of the list.
  const all = [...byId.values()];
  const pinned = pinnedId ? all.filter((i) => i.id === pinnedId) : [];
  const rest = all
    .filter((i) => i.id !== pinnedId)
    .sort((a, b) => (a.firstSeenAt || 0) - (b.firstSeenAt || 0));
  const ordered = rest.length > 0 ? [rest[0], ...pinned, ...rest.slice(1)] : pinned;
  return ordered.slice(0, 10);
}

// ── Reddit top posts (per-league + general /r/sports) ────────────
// Reddit started 403'ing the public www.reddit.com JSON endpoints from GitHub
// Actions datacenter IPs in late April 2026, then extended the block to ALL
// unauthenticated .json (incl. residential IPs + old/np/oauth hosts) by late
// May 2026 — every /hot.json now returns 403 everywhere. Two working paths:
//   1. OAuth (oauth.reddit.com) — full media (video, full-res, scores), needs
//      REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (app-only client_credentials).
//      Reddit gated NEW app creation behind manual approval in Nov 2026, so
//      until that request clears we don't have creds.
//   2. RSS (/hot/.rss) — still returns 200 with a custom User-Agent. No video
//      stream / full-res image / score data, but carries title/link/author/
//      date + a thumbnail for image+highlight posts. This is the active path.
// fetchReddit() auto-selects: creds present → OAuth JSON; absent → RSS. Drop
// the creds in and it upgrades back to full media with no code change.
const REDDIT_UA = "web:com.hidescore.prebake:v1.0 (by /u/Signal_Interview_704)";
let _redditTokenPromise = null;
async function getRedditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (_redditTokenPromise) return _redditTokenPromise;
  _redditTokenPromise = (async () => {
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "User-Agent": REDDIT_UA,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Reddit token → ${res.status} ${await res.text().catch(() => "")}`);
    const data = await res.json();
    if (!data?.access_token) throw new Error(`Reddit token: missing access_token in response`);
    return data.access_token;
  })().catch((err) => {
    // Reset so the next call retries; otherwise one bad token request poisons
    // every subreddit fetch in this script run.
    _redditTokenPromise = null;
    throw err;
  });
  return _redditTokenPromise;
}

// Subreddit-meta / recurring AutoModerator threads. The OAuth path skips these
// via p.stickied + flair, but RSS carries no stickied/flair field, so match on
// the (stable) title patterns instead. Belt-and-suspenders with the author skip.
const REDDIT_META_TITLE =
  /daily (discussion|game)(?: thread)?|wunderkind watch|game thread index|post[- ]?game thread|free talk|sunday brunch|shitpost saturday|moronic monday|megathread|simple questions|weekly|^\s*\[?\s*off[- ]?topic/i;

// Recurring-thread bots that aren't AutoModerator. r/soccer's u/2soccer2bot
// posts "Daily Discussion" + "Wunderkind Watch" every day; neither is stickied
// in the RSS view, so they took two of the twelve card slots as permanently
// blank headlines (no image, no video, no selftext) — a chunk of the 83%-blank
// r/soccer feed Jacob's media watchdog flagged 2026-07-22.
const REDDIT_BOT_AUTHOR = /^(AutoModerator|2soccer2bot)$/i;

// ── Redlib video-id recovery ──────────────────────────────────────
// RSS drops the one field that powers inline playback: the v.redd.it video id.
// But Reddit's video CDN itself was never blocked — only the JSON/API was — so
// https://v.redd.it/<id>/HLSPlaylist.m3u8 still returns 200 with audio tracks
// and `access-control-allow-origin: *`, which VideoModal plays cross-origin via
// hls.js (Chrome/Firefox) or Safari-native HLS. The only missing piece is the
// <id>, and a public redlib mirror renders it on each video post's listing card
// (through its own /vid/<id>/ proxy path). So we scrape ONE listing per sub to
// build a postId→videoId map, then point videoUrl straight at the CDN.
//
// Playback never touches redlib — it streams from Reddit's CDN — so a volunteer
// instance being down at bake time just means that run's clips stay link-only
// (graceful), and the user never depends on redlib. Instances rotate / get
// blocked, so we try several and degrade to an empty map. (Same one-listing-
// per-sub trick the alerts-site flair scraper uses.)
const REDLIB_INSTANCES = [
  "https://redlib.perennialte.ch",
  "https://redlib.catsarch.com",
  "https://rl.bloat.cat",
  "https://redlib.kittywit.ch",
  "https://safereddit.com",
];

async function fetchRedditVideoMap(subreddit) {
  // Desync + spread the burst: all reddit jobs fire in parallel, so stagger the
  // start and rotate which mirror each sub tries first rather than dog-piling
  // one volunteer instance. First non-empty result wins; failures fall through.
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1200)));
  const offset = [...subreddit].reduce((a, c) => a + c.charCodeAt(0), 0) % REDLIB_INSTANCES.length;
  for (let k = 0; k < REDLIB_INSTANCES.length; k++) {
    const base = REDLIB_INSTANCES[(offset + k) % REDLIB_INSTANCES.length];
    // Go through redlibGet, not a raw fetch: safereddit.com (the only mirror
    // still answering as of 2026-09-18) serves an Anubis challenge page —
    // HTTP 200, zero posts — to anything sending a browser User-Agent, and the
    // real listing only to a UA-less request. redlibGet tries both and checks
    // the body, so a challenge page no longer reads as success.
    const html = await redlibGet(base, `/r/${subreddit}/hot`, /<div class="post[ "]/);
    if (!html) continue; // dead / blocked / challenged mirror — try the next
    // Redlib renders each post inside <div class="post ...">; the post-id is in
    // its /r/<sub>/comments/<id>/ permalink and the v.redd.it id appears in the
    // media element — usually the /vid/<id>/ proxy path, but match the raw and
    // /hls/ shapes too so a differently-configured instance still resolves.
    const map = new Map();
    const clips = new Map();
    for (const block of html.split(/<div class="post[ "]/).slice(1)) {
      const idm = block.match(new RegExp(`/r/${subreddit}/comments/(\\w+)/`, "i"));
      if (!idm) continue;
      const vm =
        block.match(/v\.redd\.it\/([a-z0-9]{8,16})/i) ||
        block.match(/\/vid\/([a-z0-9]{8,16})\//i) ||
        block.match(/\/hls\/([a-z0-9]{8,16})/i);
      if (vm) map.set(idm[1], vm[1]);
      // Clip-host goal clips render as a "no_thumbnail" link anchor (no <img>),
      // so capture the clip page url here for fetchRedditRSS to resolve into a
      // playable mp4 (fetchClipMp4). Any host, so a new one needs no code.
      // v.redd.it wins if both.
      const cl = [...block.matchAll(/href="(https?:\/\/[^"]+)"/gi)]
        .map((h) => decodeEntities(h[1]))
        .find(isClipPageUrl);
      if (cl && !map.has(idm[1])) clips.set(idm[1], cl);
    }
    if (map.size > 0 || clips.size > 0) return { vreddit: map, clips };
  }
  return { vreddit: new Map(), clips: new Map() };
}

// ── Redlib-primary post listing ───────────────────────────────────
// Reddit now rate-limits the public RSS by request VOLUME per IP: a lone request
// from the residential mini returns 200, but the cron's ~17 feeds — even fully
// serialized — exhaust the window and 429/403 across the board (verified
// 2026-06-12). Redlib fetches the listing through ITS server's IP, so our IP's
// limit never applies, and one page carries title + author + date + thumbnail +
// the v.redd.it video id all at once. We rewrite redlib's media-proxy URLs back
// to Reddit's own open CDN (i.redd.it / preview.redd.it / v.redd.it) so the
// client never depends on a volunteer instance staying up. fetchReddit() falls
// back to the gated reddit.com RSS only when every mirror is down.
let _redlibWinner = null;
// Mirrors caught serving a stale CACHED listing (see STALE_LISTING_MAX_H below).
// A mirror can be up, return HTTP 200 and parse perfectly while handing back a
// days-old snapshot of /hot — the failure that put r/baseball 4 days behind on
// 2026-07-22 while every freshness monitor read green (fetchedAt is stamped at
// bake time, so stale CONTENT looks identical to fresh content). Sticky for the
// whole run so we don't re-poison another sub with the same bad mirror.
const _redlibStale = new Set();
const STALE_LISTING_MAX_H = 36;
async function fetchRedlibHTML(subreddit) {
  // Try the instance that last worked first (usually one volunteer host is up at
  // a time), then the hash-rotated rest, so we don't re-pay dead-mirror timeouts
  // on every sub.
  for (const base of redlibOrder(subreddit)) {
    const html = await redlibGet(base, `/r/${subreddit}/hot`, /<div class="post[ "]/);
    if (html) {
      _redlibWinner = base;
      return { html, base };
    }
  }
  return null;
}

// Mirror-order for any redlib page: last winner first, then hash-rotated so
// different subs don't dog-pile the same volunteer host.
function redlibOrder(seed) {
  const order = [];
  if (_redlibWinner && !_redlibStale.has(_redlibWinner)) order.push(_redlibWinner);
  const offset = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % REDLIB_INSTANCES.length;
  for (let k = 0; k < REDLIB_INSTANCES.length; k++) {
    const inst = REDLIB_INSTANCES[(offset + k) % REDLIB_INSTANCES.length];
    if (!order.includes(inst) && !_redlibStale.has(inst)) order.push(inst);
  }
  return order;
}

// GET a redlib page, trying BOTH User-Agent variants before giving up on a
// mirror. The instances disagree about what a bot looks like: perennialte.ch
// 403s a request with no UA, while safereddit.com serves a ~4KB Anubis
// challenge page (HTTP 200, no posts) to our Safari UA and the real page to a
// bare request. We only ever sent the Safari UA, so safereddit — the mirror
// that's up most often — silently counted as "down" for every fetch, and the
// whole fallback chain collapsed onto the IP-rate-limited reddit.com RSS
// whenever perennialte blipped. `mustContain` is what a REAL page has, so a
// 200-with-a-challenge is treated as a miss, not as success.
async function redlibGet(base, path, mustContain) {
  for (const headers of [{ "User-Agent": UA }, {}]) {
    try {
      const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      const html = await res.text();
      if (mustContain.test(html)) return html;
    } catch {
      continue; // dead / blocked mirror-variant — try the next
    }
  }
  return null;
}

// Rewrite a redlib media-proxy path to Reddit's own open CDN so display/playback
// never touches the volunteer instance. Returns null for shapes we don't know.
function redlibMediaToReddit(path) {
  if (!path) return null;
  let p = decodeEntities(path);
  // Some builds (perennialte.ch) emit ABSOLUTE URLs on their own media host —
  // https://redlib-media.<instance>/preview/pre/… — instead of the relative
  // /preview/… path. Those baked straight through the `^https?://` early-out
  // below, so every reddit image we served pointed at a volunteer proxy: when
  // that host blips, EVERY picture in the app breaks (and it's an extra hop on
  // every load even when it's up). Strip the host and re-apply the path rules
  // so we always land on Reddit's own CDN.
  const abs = p.match(/^https?:\/\/[^/]+(\/(?:img|preview)\/.+)$/i);
  if (abs) p = abs[1];
  if (/^https?:\/\//.test(p)) return p;
  if (p.startsWith("/img/")) return "https://i.redd.it/" + p.slice(5);
  if (p.startsWith("/preview/external-pre/")) return "https://external-preview.redd.it/" + p.slice(22);
  if (p.startsWith("/preview/pre/")) return "https://preview.redd.it/" + p.slice(13);
  return null;
}

// ── Reddit galleries ("more than 1 picture" posts) ────────────────
// A gallery post renders in the redlib LISTING as nothing but a 140×140
// square-cropped thumbnail plus a literal <span>gallery</span> marker — the
// other images aren't in the listing at all. Baking that thumbnail as the
// post's image meant the lightbox popped a 140px postage stamp and the rest of
// the pictures were unreachable (Jacob 7/28: "picture posts don't show
// properly, especially if more than 1 picture"). The post PAGE carries every
// image at full res, so resolve galleries there and cache the result by post id
// (a post's gallery never changes) so we pay one extra fetch per gallery post
// ONCE, not on every hourly bake — the mirrors are volunteer-run and the reddit
// budget on the mini is already tight (see the contention notes above).
const GALLERY_CACHE_PATH = `${OUT_DIR}/_gallery-cache.json`;
let _galCache = null;
let _galDirty = false;

async function loadGalleryCache() {
  if (_galCache) return _galCache;
  try { _galCache = JSON.parse(await readFile(GALLERY_CACHE_PATH, "utf8")); } catch { _galCache = {}; }
  const cutoff = Date.now() - 14 * 864e5;
  for (const [k, v] of Object.entries(_galCache)) {
    if (!v || !v.at || v.at < cutoff) delete _galCache[k];
  }
  return _galCache;
}

async function saveGalleryCache() {
  if (!_galDirty || !_galCache) return;
  try {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(GALLERY_CACHE_PATH, JSON.stringify(_galCache));
  } catch { /* best-effort cache */ }
}

// Resolve every image in a gallery post. `budget` bounds the NETWORK fetches per
// subreddit (cache hits are free); returns null when unresolved so the caller
// keeps its thumbnail-only behaviour.
async function fetchGalleryImages(permPath, postId, budget) {
  const cache = await loadGalleryCache();
  const hit = cache[postId];
  if (hit && Array.isArray(hit.images) && hit.images.length) return hit.images;
  if (budget.n >= budget.max) return null;
  // Space repeat hits inside one listing — safereddit (the only mirror serving
  // post pages reliably) starts refusing on a back-to-back burst.
  if (budget.n > 0) await new Promise((r) => setTimeout(r, 800));
  budget.n++;
  // A mirror can serve listings fine and 503 post pages (perennialte does, they
  // cost it more), so rotate rather than trusting the listing winner.
  for (const base of redlibOrder(postId)) {
    const html = await redlibGet(base, permPath, /class="gallery"/);
    if (!html) continue;
    const gi = html.indexOf('class="gallery"');
    // Bound the scan to the gallery block — comment bodies further down the page
    // carry their own image links and would otherwise be swept in as "photos".
    const ends = ['class="post_footer"', 'id="comments"', 'class="comment ']
      .map((s) => html.indexOf(s, gi))
      .filter((i) => i > gi);
    const seg = html.slice(gi, ends.length ? Math.min(...ends) : gi + 80000);
    const urls = [];
    // Each gallery figure is <a href="/preview/pre/<id>.jpg?width=<full>…"> —
    // reddit's own full-res crop, signed, so it survives the mirror going away.
    const re = /<a[^>]+href="(\/(?:img|preview)\/[^"]+)"/g;
    let m;
    while ((m = re.exec(seg)) !== null && urls.length < 20) {
      const u = redlibMediaToReddit(m[1]);
      if (u && !urls.includes(u)) urls.push(u);
    }
    if (!urls.length) continue;
    cache[postId] = { images: urls, at: Date.now() };
    _galDirty = true;
    return urls;
  }
  return null; // every mirror refused — fall back to the thumbnail
}

async function parseRedlibListing(html, subreddit, sectionLabel) {
  const out = [];
  // At most 6 gallery post-page fetches per subreddit per bake (cache hits are
  // free and don't count) so a photo-heavy sub can't turn one listing into 12
  // extra requests at a volunteer mirror.
  const galleryBudget = { n: 0, max: 6 };
  for (const block of html.split(/<div class="post[ "]/).slice(1)) {
    const head = block.slice(0, Math.max(0, block.indexOf(">")));
    if (/\bstickied\b/.test(head)) continue; // pinned meta/rules
    // Canonical reddit permalink — the footer post_comments link is the most
    // reliable (link-type posts point the title <a> at the external URL instead).
    const permPath = (block.match(new RegExp(`href="(/r/${subreddit}/comments/\\w+/[^"#?]*)`, "i")) || [])[1];
    if (!permPath) continue;
    const postId = (permPath.match(/\/comments\/(\w+)/) || [])[1] || permPath;
    // Title: h2.post_title minus the flair anchor → the remaining anchor's text.
    const h2 = (block.match(/<h2 class="post_title">([\s\S]*?)<\/h2>/) || [])[1] || "";
    const flair = decodeEntities((h2.match(/class="post_flair"[^>]*>\s*<span>([\s\S]*?)<\/span>/) || [])[1] || "");
    const h2NoFlair = h2.replace(/<a[^>]*class="post_flair"[\s\S]*?<\/a>/g, "");
    const title = decodeEntities(((h2NoFlair.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    if (!passesArticleBlocklist(title)) continue;
    if (REDDIT_META_TITLE.test(title)) continue;
    if (/rule|mod|meta|pinned/i.test(flair)) continue;
    const author = (block.match(/class="post_author[^"]*"[^>]*href="\/u\/([^"\/]+)"/) || [])[1] || "";
    if (REDDIT_BOT_AUTHOR.test(author)) continue;
    // Date lives in <span class="created" title="Jun 12 2026, 08:30:10 UTC">.
    const dtitle = (block.match(/class="created"[^>]*title="([^"]+)"/) || [])[1] || "";
    const ts = dtitle ? Date.parse(dtitle.replace(/\sUTC$/, " GMT")) : NaN;
    if (ts && Date.now() - ts > 21 * 864e5) continue; // drop stale pins

    let videoUrl = null;
    let imageUrl = null;
    let imageFullUrl = null;
    let youtubeVideoId = null;
    let body = null;
    // Every image of a multi-picture (gallery) post, full-res and in order.
    let images = null;
    // True when the ONLY image we found is redlib's 140px listing thumbnail
    // (external-link posts: the article's preview crop). Fine as a row tile,
    // garbage blown up — the client uses this to keep such posts out of the
    // image lightbox instead of popping a blurry postage stamp.
    let thumbOnly = false;

    // 1) Reddit-hosted video (v.redd.it) → the open HLS CDN (audio + CORS:*).
    const vm = block.match(/\/(?:hls|vid)\/([a-z0-9]{8,16})\b/i) || block.match(/v\.redd\.it\/([a-z0-9]{8,16})/i);
    if (vm) videoUrl = `https://v.redd.it/${vm[1]}/HLSPlaylist.m3u8`;

    // 2) Reddit-hosted image post → lightboxable full-res (imageFullUrl).
    const imgPath = (block.match(/class="post_media_image[^"]*"[^>]*href="([^"]+)"/) || [])[1] ||
      (block.match(/<img[^>]*class="post_media_image[^"]*"[^>]*src="([^"]+)"/) || [])[1] ||
      // redlib (perennialte.ch current build) emits the anchor as
      // <a href="/preview/pre/<id>.jpeg?..." class="post_media_image short"> — href
      // BEFORE class, and the inner <img> carries no class — so both regexes above
      // miss it and EVERY i.redd.it/preview image post renders image-less (the
      // RSS image fix never runs because redlib "succeeds" first). Grab the
      // <img src> after the post_media_image anchor, attribute-order-agnostic.
      (block.match(/post_media_image[^>]*>\s*<img[^>]+\bsrc="([^"]+)"/) || [])[1];
    if (imgPath) {
      imageUrl = redlibMediaToReddit(imgPath);
      imageFullUrl = imageUrl;
    }
    // 3) v.redd.it video poster → row thumbnail.
    if (!imageUrl) {
      const poster = (block.match(/poster="([^"]+)"/) || [])[1];
      if (poster) imageUrl = redlibMediaToReddit(poster);
    }

    // 4) External-link / external-media post. Redlib renders these as
    //    <a class="post_thumbnail [no_thumbnail]" href="<external>"> … </a> — the
    //    href is the OFF-reddit URL (streamable, youtube, a news article, a clip
    //    host). "no_thumbnail" posts carry an <svg> placeholder and NO <img>, so
    //    read the href first and pick up the thumbnail (when present) separately.
    //    Then resolve the hosts we can play inline; anything else keeps its
    //    thumbnail and links out, exactly as before.
    const tHref = (block.match(/<a[^>]*class="post_thumbnail[^"]*"[^>]*href="([^"]+)"/) || [])[1];
    if (tHref) {
      const extUrl = decodeEntities(tHref);
      if (!imageUrl) {
        const tImg = block.match(/<a[^>]*class="post_thumbnail[^"]*"[\s\S]{0,500}?<img[^>]*src="([^"]+)"/);
        if (tImg) {
          imageUrl = redlibMediaToReddit(tImg[1]);
          // Listing thumbnails are 140px (square-cropped for galleries). Mark it
          // so the client shows it as a tile, not as a lightbox "photo", unless
          // the gallery resolver below finds the real images.
          if (imageUrl) thumbOnly = true;
        }
        // "no_thumbnail" image posts: redlib draws an SVG placeholder (no <img>),
        // but the anchor href IS the image — /img/<id>.jpg or a direct
        // i.redd.it/preview URL. Use it as the row thumbnail AND lightbox full-res
        // so an image post doesn't collapse to a text-only modal. r/soccer leans on
        // this: its image posts render almost exclusively as no_thumbnail (Jacob
        // 6/18 — "no pictures for r/soccer"). The 4f5462e1 RSS-path fix never fires
        // here because redlib succeeds first.
        else if (
          /^\/(?:img|preview)\//.test(extUrl) ||
          /^https?:\/\/(?:i|preview|external-preview)\.redd\.it\//i.test(extUrl) ||
          /^https?:\/\/\S+\.(?:jpe?g|png|gif|webp)(?:$|\?)/i.test(extUrl)
        ) {
          imageUrl = redlibMediaToReddit(extUrl);
          imageFullUrl = imageUrl;
        }
      }
      if (!videoUrl && !youtubeVideoId) {
        const sm = extUrl.match(/^https?:\/\/streamable\.com\/([a-zA-Z0-9]+)/);
        const ym = extUrl.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([\w-]{6,})/) ||
          extUrl.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/) ||
          extUrl.match(/^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w-]{6,})/);
        const gifv = extUrl.match(/^https?:\/\/i\.imgur\.com\/(\w+)\.gifv/i);
        const mp4 = extUrl.match(/^https?:\/\/\S+\.mp4(?:$|\?)/i);
        // r/soccer's goal-clip hosts (any of them — see fetchClipMp4). The
        // clip page yields a direct mp4 + an og:image poster. These post as
        // "no_thumbnail" links, so the clip's own poster is the only preview
        // tile they get — without it the row collapses to text, unlike
        // image-bearing posts from other subs.
        const clipPage = !sm && isClipPageUrl(extUrl);
        if (sm || clipPage) {
          const clip = sm ? await fetchStreamableMp4(sm[1]) : await fetchClipMp4(extUrl);
          if (clip) {
            videoUrl = clip.mp4;
            if (!imageUrl) imageUrl = clip.thumb;
          }
        } else if (ym) youtubeVideoId = ym[1];
        else if (gifv) videoUrl = `https://i.imgur.com/${gifv[1]}.mp4`;
        else if (mp4) videoUrl = extUrl;
      }
    }

    // 4b) Gallery ("more than 1 picture") post — redlib flags it with a literal
    //     <span>gallery</span> beside the thumbnail and shows nothing else, so
    //     go read the post page for the actual pictures. Cached by post id.
    if (!videoUrl && /class="post_thumbnail[\s\S]{0,800}?<span>gallery<\/span>/.test(block)) {
      const gimgs = await fetchGalleryImages(permPath, postId, galleryBudget);
      if (gimgs && gimgs.length) {
        images = gimgs;
        imageFullUrl = gimgs[0];
        thumbOnly = false;
      }
    }

    // 5) Selftext body for text posts with no media (parity with OAuth path).
    //    Key on the actual selftext container `<div class="md">` — link posts
    //    render an EMPTY post_body (no md div), so this skips them instead of
    //    capturing the stray markup around an empty preview.
    if (!videoUrl && !imageFullUrl && !imageUrl) {
      const mi = block.indexOf('<div class="md">');
      if (mi >= 0) {
        // indexOf lands on the ATTRIBUTE, not the tag, so slicing there kept
        // the footer div's half-written opening tag ("<div ") on the end of the
        // segment. The tag regex below needs a closing ">" to match, so that
        // fragment survived and every text post rendered a literal "<div" after
        // its body (Jacob 8/4). Back up to the tag's "<" so the segment always
        // ends on a tag boundary, and strip any dangling partial tag as a
        // backstop for the 4000-char fallback slice, which can cut anywhere.
        const fiAttr = block.indexOf('class="post_footer"', mi);
        const fi = fiAttr > mi ? block.lastIndexOf("<", fiAttr) : -1;
        const seg = block.slice(mi, fi > mi ? fi : mi + 4000);
        const text = decodeEntities(seg.replace(/<[^>]+>/g, " ").replace(/<[^>]*$/, " ")).trim();
        if (text) body = text.length > 1500 ? text.slice(0, 1500) + "…" : text;
      }
    }

    out.push({
      id: postId,
      headline: title,
      description: "",
      published: ts ? new Date(ts).toISOString() : "",
      imageUrl,
      articleUrl: `https://www.reddit.com${permPath}`,
      byline: author ? `u/${author}` : "",
      section: sectionLabel,
      videoUrl,
      imageFullUrl,
      body,
      ...(images ? { images } : {}),
      ...(thumbOnly ? { thumbOnly: true } : {}),
      ...(youtubeVideoId ? { youtubeVideoId } : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

// Some redlib mirrors render the post listing but drop the <video> / v.redd.it
// media element, so a genuine video post lands with videoUrl=null and shows as a
// static image. When posts are still missing a video after the primary mirror,
// sweep the OTHER mirrors and merge any v.redd.it id they expose for those exact
// posts, so a clip the primary mirror dropped still plays (Jacob 6/15: "retry
// all redlib instances if not found"). Text posts (body set) and YouTube-link
// posts are excluded — there's no v.redd.it id to find. Bounded: one pass over
// the remaining mirrors, early-exit the moment every gap is filled.
async function fillMissingRedlibVideos(items, subreddit) {
  const missing = new Map();
  for (const it of items) {
    if (!it.videoUrl && !it.youtubeVideoId && !it.body) missing.set(it.id, it);
  }
  if (missing.size === 0) return items;
  const tried = new Set(_redlibWinner ? [_redlibWinner] : []);
  const offset = [...subreddit].reduce((a, c) => a + c.charCodeAt(0), 0) % REDLIB_INSTANCES.length;
  for (let k = 0; k < REDLIB_INSTANCES.length && missing.size; k++) {
    const base = REDLIB_INSTANCES[(offset + k) % REDLIB_INSTANCES.length];
    if (tried.has(base)) continue;
    tried.add(base);
    // Go through redlibGet, not a raw fetch: safereddit.com (the only mirror
    // still answering as of 2026-09-18) serves an Anubis challenge page —
    // HTTP 200, zero posts — to anything sending a browser User-Agent, and the
    // real listing only to a UA-less request. redlibGet tries both and checks
    // the body, so a challenge page no longer reads as success.
    const html = await redlibGet(base, `/r/${subreddit}/hot`, /<div class="post[ "]/);
    if (!html) continue; // dead / blocked / challenged mirror — try the next
    for (const block of html.split(/<div class="post[ "]/).slice(1)) {
      const idm = block.match(new RegExp(`/r/${subreddit}/comments/(\\w+)/`, "i"));
      if (!idm || !missing.has(idm[1])) continue;
      const vm =
        block.match(/v\.redd\.it\/([a-z0-9]{8,16})/i) ||
        block.match(/\/vid\/([a-z0-9]{8,16})\//i) ||
        block.match(/\/hls\/([a-z0-9]{8,16})/i);
      if (vm) {
        missing.get(idm[1]).videoUrl = `https://v.redd.it/${vm[1]}/HLSPlaylist.m3u8`;
        missing.delete(idm[1]);
      }
    }
  }
  return items;
}

async function fetchRedditViaRedlib(subreddit, sectionLabel) {
  // Usually one volunteer mirror is up and the rest are dead or behind a
  // Cloudflare bot-wall, so an empty result almost always means that one good
  // mirror just rate-limited this single hit (not that redlib is unusable).
  // Retry with backoff before falling through to the gated reddit.com RSS, which
  // is itself IP-rate-limited and likely to 429 anyway.
  for (let attempt = 0; attempt < 3; attempt++) {
    const hit = await fetchRedlibHTML(subreddit);
    if (hit) {
      const items = await parseRedlibListing(hit.html, subreddit, sectionLabel);
      if (items.length) {
        // Reject a stale cached snapshot. Even the quietest sub we bake
        // (r/ncaaw, r/EuropaLeague in the off-season) has a top-of-hot post
        // inside ~18h, so a whole listing older than STALE_LISTING_MAX_H means
        // the mirror is serving cache, not that the sub went quiet. Burn that
        // mirror for the rest of the run and retry — next loop rotates to
        // another instance, and if they're all bad we fall through to the
        // gated reddit.com RSS, which is always live.
        const newest = Math.max(
          ...items.map((it) => Date.parse(it.published || "") || 0),
        );
        if (newest && Date.now() - newest > STALE_LISTING_MAX_H * 3600e3) {
          const ageH = ((Date.now() - newest) / 3600e3).toFixed(1);
          console.warn(
            `redlib ${hit.base} served a STALE r/${subreddit} listing (newest post ${ageH}h old) — blacklisting for this run`,
          );
          _redlibStale.add(hit.base);
          if (_redlibWinner === hit.base) _redlibWinner = null;
          continue; // no backoff sleep: a cache hit cost us nothing
        }
        return await fillMissingRedlibVideos(items, subreddit);
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  return [];
}

// Serialize every reddit network hit — the www.reddit.com RSS fetch AND the
// redlib video scrape — through one in-flight request with a gap between. The
// job runner fires all ~17 reddit feeds via Promise.allSettled, and that
// parallel BURST is what trips Reddit's limiter: a single spaced RSS request
// from the residential mini IP returns 200, but 17 at once → 429/403 across the
// board (verified 2026-06-12). The redlib mirrors are volunteer-run too, so the
// same gate keeps us from dog-piling the one instance that happens to be up.
//
// 2026-06-14: redlib has decayed to a single reachable mirror (catsarch 403,
// kittywit timeout — only perennialte.ch renders posts). 900ms spacing isn't
// enough: a sustained 17-feed stream against that one instance (plus the anon
// reddit.com RSS fallback) still rate-limits, and the LATE feeds — the entire
// World Cup / soccer family at the bottom of the job list — come back with no
// video, killing inline autoplay. Measured: a 6-feed batch keeps its video, the
// full 17-feed run loses it on the tail. So break the stream into batches of 6
// with a long cooldown between them; each batch stays under the limiter's window
// and its window resets in the gap (verified: a fresh 6-feed batch fired right
// after a rate-limited full run recovered all video). Adds ~3 min to the reddit
// bake (2 cooldowns) — fine for an hourly cron.
// 2026-06-17: the lone mirror decayed FURTHER — even 6-feed batches now starve
// every league feed after r/sports (live: r/sports had video, all 17 leagues
// 0-video). Standalone each league still resolves video, so it's pure per-IP
// rate-limit on that one mirror. If the soccer/league tail still loses video,
// drop further (2, then 1) — bake time scales but stays well under the hourly
// cron. 2026-06-17 (later): batch=3 still FLAPPED bake-to-bake (one bake soccer
// 5/fifa 7/mlb 6, the next soccer 0) — the mirror's per-hour mood varies, so a
// borderline 3rd-in-batch request wins or loses by luck. Dropped 3→2 (soccer is
// then 1st in its batch, not last) AND added a video-regression guard in
// writeFeed so a 0-video bake can't clobber a still-fresh with-video file — the
// guard is what actually stops the user-visible flapping; the batch size just
// makes good bakes more frequent (2/batch ≈ 8 cooldowns ≈ +12 min).
// 2026-07-11: batch=2 was still starving the SECOND feed of each pair — a bake
// 429'd exactly the even-positioned feeds (reddit-mlb/wnba/nfl/golf at gate
// positions 2/4/6/8), because within a batch the 2nd request fires just 900ms
// after the 1st, before the cooldown resets the window, so it hits a saturated
// limiter and the same tail leagues stayed hours-stale bake after bake. Take
// the documented next step: batch=1 so EVERY feed gets its own cooldown (no
// sacrificial 2nd-in-batch request). Drop the cooldown 90s→45s since a single
// request per window needs far less recovery than a 2-hit burst did — ~17 feeds
// × 45s ≈ 13 min of cooldowns, still well under the 30-min cron (mutex covers
// any overlap). If the tail 429s again, raise the cooldown before touching size.
const REDDIT_BATCH_SIZE = 1;
const REDDIT_BATCH_COOLDOWN_MS = 45000;
let _redditGate = Promise.resolve();
let _redditHits = 0;
function gateReddit(fn) {
  const run = _redditGate.then(fn, fn);
  const space = () => {
    _redditHits++;
    const batchEdge = _redditHits % REDDIT_BATCH_SIZE === 0;
    return new Promise((r) => setTimeout(r, batchEdge ? REDDIT_BATCH_COOLDOWN_MS : 900));
  };
  _redditGate = run.then(space, space);
  return run;
}

// RSS fallback — used when no OAuth creds are configured (see header note).
// Atom feed returns 200 with a custom UA; carries title/link/author/published
// and, for image/highlight posts, a media:thumbnail (external-preview.redd.it
// ~640w). No video stream, full-res image, scores, or selftext — those fields
// are null vs the OAuth path. Caller wraps this in gateReddit() so reddit hits
// stay serialized (see the burst note above).
async function fetchRedditRSS(subreddit, sectionLabel) {
  const url = `https://www.reddit.com/r/${subreddit}/hot/.rss?limit=25`;
  // The gate guarantees one reddit.com request at a time; the retry below is a
  // belt-and-suspenders backoff for a transient 429/403 limiter blip.
  let xml = null;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": REDDIT_UA } });
    if (res.ok) {
      xml = await res.text();
      break;
    }
    if ((res.status === 429 || res.status === 403) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.floor(Math.random() * 1000)));
      continue;
    }
    throw new Error(`${url} → ${res.status}`);
  }
  // RSS succeeded, so we're on a Reddit-reachable IP (the Mac mini cron — GHA
  // datacenter IPs 403 above and never get here). Only now fetch the redlib
  // video map, so GHA's doomed reddit runs never touch a volunteer instance.
  const media = await fetchRedditVideoMap(subreddit);
  const out = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1];
    const title = decodeEntities(((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim());
    if (!title) continue;
    if (!passesArticleBlocklist(title)) continue;
    if (REDDIT_META_TITLE.test(title)) continue;
    let author = ((e.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || "").trim().replace(/^\/?u\//i, "");
    if (REDDIT_BOT_AUTHOR.test(author)) continue;
    const link = ((e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "").trim();
    if (!link) continue;
    const id = ((e.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || link).trim();
    const published = ((e.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || "").trim();
    // RSS carries no stickied flag, so drop ancient pinned/welcome/rules posts
    // by age — genuine "hot" posts are at most a few days old, while pins linger
    // for months (e.g. r/sports' "Welcome to /r/sports!").
    const ts = published ? Date.parse(published) : NaN;
    if (ts && Date.now() - ts > 21 * 864e5) continue;
    // media:thumbnail is present for image/highlight posts only (text/video posts omit it).
    let imageUrl = ((e.match(/<media:thumbnail[^>]*\burl="([^"]+)"/) || [])[1] || "").trim();
    imageUrl = imageUrl ? decodeEntities(imageUrl) : null;
    // Reddit's preview pipeline (preview.redd.it / media:thumbnail) lags behind a
    // fresh post, so it's frequently missing on brand-new image posts. The raw
    // i.redd.it link, though, is embedded in the entry <content> from the moment
    // the post goes up — so parse it for the full-res lightbox source, and use it
    // as the thumbnail too when no preview crop came through (mirrors the OAuth
    // path's i.redd.it url fallback).
    const content = (e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";
    const reddImageFull =
      (content.match(/https?:\/\/i\.redd\.it\/[^"'&<\s]+\.(?:jpe?g|png|gif|webp)/i) || [])[0] || null;
    if (!imageUrl && reddImageFull) imageUrl = reddImageFull;
    // Last resort when media:thumbnail AND the i.redd.it link are both missing
    // (an intermittent stripped RSS variant — same flakiness as ESPN's homepage —
    // is what left r/worldcup image posts showing text-only, Jacob 6/23). The
    // post's <img> is still in the body, but <content> is HTML-entity-encoded, so
    // decode before matching the tag. Catches preview.redd.it / external-preview
    // crops (galleries, crossposts) that aren't an i.redd.it URL.
    if (!imageUrl) {
      const bodyImg = (decodeEntities(content).match(/<img[^>]+\bsrc="([^"]+)"/) || [])[1] || "";
      if (bodyImg) imageUrl = bodyImg;
    }
    // redlib hands us the v.redd.it id for video posts → point straight at the
    // open HLS CDN (audio + CORS:*). Non-video posts and redlib-down runs leave
    // it null and fall back to the article link-out, exactly as before.
    const postId = (link.match(/\/comments\/(\w+)/) || [])[1] || "";
    // The v.redd.it id for a native video post is embedded RIGHT IN the entry
    // <content> as the post's [link] href (https://v.redd.it/<id>) — so read it
    // straight from the feed first. (external-preview.redd.it / i.redd.it can't
    // false-match; neither ends in "v.redd.it".) Only fall back to the redlib
    // map for the rare crosspost that lacks it — redlib mirrors are down/blocked
    // most days, and depending on them ALONE is why these videos broke daily.
    const vredditId =
      (content.match(/v\.redd\.it\/([a-z0-9]+)/i) || [])[1] ||
      (postId ? media.vreddit.get(postId) : null);
    let videoUrl = vredditId ? `https://v.redd.it/${vredditId}/HLSPlaylist.m3u8` : null;
    // streamff / streamin goal clips (r/soccer's video hosts) → resolve the
    // direct mp4 so they play inline instead of linking out.
    if (!videoUrl && postId) {
      // Prefer the redlib-built map, but fall back to the clip-host /v/<id> link
      // sitting right in the entry <content> (the post's link-out). redlib
      // mirrors are down most days, so without this the clip only resolves on the
      // rare run that reached a live mirror; the feed itself always carries the
      // host URL. Host-agnostic: the post's [link] href on any clip site
      // resolves, so a future rotation needs no code (Jacob 6/23, 9/22).
      const linkHref = (decodeEntities(content).match(/href="([^"]+)">\[link\]/) || [])[1];
      const clipUrl =
        media.clips.get(postId) ||
        (linkHref && isClipPageUrl(linkHref) ? linkHref : null);
      if (clipUrl) {
        const clip = await fetchClipMp4(clipUrl);
        if (clip) {
          videoUrl = clip.mp4;
          if (!imageUrl) imageUrl = clip.thumb;
        }
      }
    }
    out.push({
      id,
      headline: title,
      description: "",
      published: published ? new Date(published).toISOString() : "",
      imageUrl,
      articleUrl: link,
      byline: author ? `u/${author}` : "",
      section: sectionLabel,
      videoUrl,
      imageFullUrl: reddImageFull,
      body: null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

async function fetchRedditListing(subreddit, sectionLabel, token) {
  // No creds → anon reddit.com JSON/RSS is rate-limited per IP now (see redlib
  // note above), so read the listing through redlib first; it carries title +
  // thumbnail + video in one page and proxies via its own IP. Gated reddit.com
  // RSS is the last-resort fallback when every redlib mirror is down. With creds,
  // the richer oauth.reddit.com JSON path below runs instead.
  if (!token) {
    return gateReddit(async () => {
      const viaRedlib = await fetchRedditViaRedlib(subreddit, sectionLabel);
      if (viaRedlib.length) return viaRedlib;
      return fetchRedditRSS(subreddit, sectionLabel);
    });
  }
  const url = `https://oauth.reddit.com/r/${subreddit}/hot?limit=25&raw_json=1`;
  const headers = { "User-Agent": REDDIT_UA, Authorization: `Bearer ${token}` };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const data = await res.json();
  const posts = (data?.data?.children || []).map((c) => c.data).filter(Boolean);
  const out = [];
  for (const p of posts) {
    // Skip sticky meta/rules threads and any post flaired as rules/meta.
    if (p.stickied) continue;
    const flair = (p.link_flair_text || "").toLowerCase();
    if (/rule|mod|meta|pinned/.test(flair)) continue;
    // Skip NSFW/removed.
    if (p.over_18 || p.removed_by_category) continue;
    const title = decodeEntities(p.title || "");
    if (!title) continue;
    if (!passesArticleBlocklist(title)) continue;
    // Pick the best inline preview — Reddit's preview image first (high-res),
    // then the thumbnail field. Skip "self"/"default" placeholders for text posts.
    // Final fallback: if the post URL is itself an i.redd.it image, use it.
    // Reddit's anon endpoint strips preview/post_hint for some subreddits
    // (observed on r/wnba 5/20/26) even when the post is clearly an image —
    // the URL pattern is the only reliable signal in that case.
    const preview = p.preview?.images?.[0]?.source?.url;
    let imageUrl = null;
    if (preview) {
      imageUrl = preview.replace(/&amp;/g, "&");
    } else if (p.thumbnail && /^https?:\/\//.test(p.thumbnail)) {
      imageUrl = p.thumbnail;
    } else if (/^https:\/\/i\.redd\.it\/.+\.(jpe?g|png|gif|webp)$/i.test(p.url || "")) {
      imageUrl = p.url;
    }
    // v.redd.it videos: prefer hls_url (HLS playlist with both audio + video
    // tracks) when the post has audio. fallback_url is CMAF_*.mp4 — video only,
    // no audio track — so unmuting does nothing. Keep fallback_url for is_gif
    // posts (genuinely silent). VideoModal already loads .m3u8 via hls.js
    // (Chrome/Firefox) or Safari native HLS.
    let videoUrl = null;
    const rv = p.media?.reddit_video || p.secure_media?.reddit_video;
    if (rv?.fallback_url && /^https:\/\/v\.redd\.it\//.test(rv.fallback_url)) {
      if (rv.has_audio && rv.hls_url) {
        videoUrl = rv.hls_url.replace(/&amp;/g, "&");
      } else {
        videoUrl = rv.fallback_url.replace(/&amp;/g, "&");
      }
    } else if (p.domain === "streamable.com") {
      const m = (p.url || "").match(/^https?:\/\/streamable\.com\/([a-zA-Z0-9]+)/);
      if (m) {
        const clip = await fetchStreamableMp4(m[1]);
        if (clip) { videoUrl = clip.mp4; if (!imageUrl) imageUrl = clip.thumb; }
      }
    } else if (isClipPageUrl(p.url || "")) {
      const clip = await fetchClipMp4(p.url);
      if (clip) { videoUrl = clip.mp4; if (!imageUrl) imageUrl = clip.thumb; }
    }
    // i.redd.it image posts: surface the original full-res URL so the client
    // can pop a lightbox instead of bouncing out to reddit.com to view a JPEG.
    let imageFullUrl = null;
    // Accept i.redd.it image URLs regardless of post_hint — anon Reddit strips
    // post_hint for some subreddits (see imageUrl fallback above for the same
    // workaround). URL extension is sufficient signal.
    if (/^https:\/\/i\.redd\.it\/.+\.(jpe?g|png|gif|webp)$/i.test(p.url || "")) {
      imageFullUrl = p.url;
    }
    // Reddit galleries (is_gallery) + posts Reddit only exposes via
    // media_metadata: no top-level preview or i.redd.it url, so the checks above
    // miss them and the post renders image-less (the Bob Uecker mural post,
    // Jacob 6/18). Pull the first image — gallery_data gives the display order;
    // s.u is the full-res source, p[] the preview crops (both &amp;-encoded).
    if ((!imageUrl || !imageFullUrl) && p.media_metadata) {
      const firstId = p.gallery_data?.items?.[0]?.media_id || Object.keys(p.media_metadata)[0];
      const mm = firstId ? p.media_metadata[firstId] : null;
      if (mm && (mm.e === "Image" || mm.status === "valid")) {
        const full = mm.s?.u ? mm.s.u.replace(/&amp;/g, "&") : null;
        const crop = mm.p?.length ? mm.p[mm.p.length - 1].u.replace(/&amp;/g, "&") : null;
        if (!imageFullUrl && full) imageFullUrl = full;
        if (!imageUrl) imageUrl = full || crop;
      }
    }
    // Selftext body — only for true text posts. Skip when the post carries
    // image/video media (the lightbox already shows the visual). Cap length
    // so a 10k-char rant doesn't bloat the prebake JSON; the modal links out
    // for the full read.
    let body = null;
    if (!videoUrl && !imageFullUrl && !imageUrl && p.is_self && p.selftext) {
      const raw = decodeEntities(String(p.selftext)).trim();
      if (raw) body = raw.length > 1500 ? raw.slice(0, 1500) + "…" : raw;
    }
    out.push({
      id: p.id || p.permalink,
      headline: title,
      description: "",
      published: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : "",
      imageUrl,
      articleUrl: p.permalink ? `https://www.reddit.com${p.permalink}` : (p.url || ""),
      byline: p.author ? `u/${p.author}` : "",
      section: sectionLabel,
      videoUrl,
      imageFullUrl,
      body,
    });
    if (out.length >= 12) break;
  }
  return out;
}

// ── Top comments (for the Feed view — Jacob 7/14) ─────────────────
// Comments routinely state the score, so they're spoiler-blurred (tap-to-reveal)
// client-side; we just carry the top few plain-text bodies per post. Reddit
// blocks anon datacenter IPs, so this only runs where the listing did (the
// residential Mac-mini cron), and is entirely best-effort: any failure just
// leaves the post comment-less (the Feed renders fine without them).
//
// With OAuth creds the JSON path is cheap (100 QPM, no cooldown) so we enrich
// more posts; the anon RSS path shares the same 45s-cooldown gate as the
// listings, so we enrich only the top couple posts to keep the cron under its
// interval.
const COMMENTS_TOP_POSTS = 8;
const COMMENTS_PER_POST = 4;
const COMMENT_MIN_LEN = 4;
const COMMENT_MAX_LEN = 280;

function cleanComment(raw) {
  const text = decodeEntities(String(raw || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length < COMMENT_MIN_LEN) return null;
  if (text === "[deleted]" || text === "[removed]") return null;
  return text.length > COMMENT_MAX_LEN ? text.slice(0, COMMENT_MAX_LEN).trimEnd() + "…" : text;
}

// OAuth JSON comments — [postListing, commentsListing]; children[].data.body is
// the raw markdown. sort=top so the first N are the highest-scored.
async function fetchRedditCommentsOAuth(subreddit, postId, token) {
  const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?sort=top&limit=8&depth=1&raw_json=1`;
  const res = await fetch(url, { headers: { "User-Agent": REDDIT_UA, Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  const children = data?.[1]?.data?.children || [];
  const out = [];
  for (const c of children) {
    const d = c?.data;
    if (!d || c.kind !== "t1" || d.stickied) continue;
    if (/^AutoModerator$/i.test(d.author || "")) continue;
    const t = cleanComment(d.body);
    if (t) out.push(t);
    if (out.length >= COMMENTS_PER_POST) break;
  }
  return out;
}

// Comments are OAuth-only. Anon reddit.com is IP-blocked/rate-limited (the
// listings themselves fall back to redlib precisely because anon .rss 403s), so
// an anon comment fetch just burns the 45s Reddit gate for nothing. They start
// populating once the cron carries Reddit creds — the same creds the whole feed
// wants (see BACKLOG "Reddit news feeds — fix + re-enable"): drop client id/secret
// in ~/.config/hidescore/reddit.env on the mini and getRedditToken() lights up.
async function enrichWithComments(subreddit, items, token) {
  if (!token) return;
  for (const it of items.slice(0, COMMENTS_TOP_POSTS)) {
    const postId = (String(it.articleUrl || "").match(/\/comments\/(\w+)/) || [])[1];
    if (!postId) continue;
    try {
      const comments = await fetchRedditCommentsOAuth(subreddit, postId, token);
      if (comments && comments.length) it.comments = comments;
    } catch {
      /* best-effort — a comment-less post is fine */
    }
  }
}

// Public entry point: fetch the listing, then best-effort enrich the top posts
// with their top comments for the Feed view.
async function fetchReddit(subreddit, sectionLabel) {
  const token = await getRedditToken().catch(() => null);
  const items = await fetchRedditListing(subreddit, sectionLabel, token);
  try { await enrichWithComments(subreddit, items, token); } catch { /* best-effort */ }
  return items;
}

// ── CBS Sports RSS (general + per-league) ─────────────────────────

function parseCBSItems(xml, sectionLabel) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities(((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    const link = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
    const pub = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    if (!title || !link) continue;
    if (!passesArticleBlocklist(title)) continue;
    // CBS DOES ship a per-item picture — as an <enclosure type="image/*">, not
    // the <media:*> tags BBC/Guardian use (the note below used to claim CBS had
    // none). Without it every CBS card AND every CBS share link unfurled with
    // the generic site blob. Attribute order varies, so try both.
    const enc =
      (block.match(/<enclosure\b[^>]*\burl="([^"]+)"[^>]*\btype="image\/[^"]*"/) || [])[1] ||
      (block.match(/<enclosure\b[^>]*\btype="image\/[^"]*"[^>]*\burl="([^"]+)"/) || [])[1];
    items.push({
      id: link,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      imageUrl: enc ? decodeEntities(enc) : null,
      articleUrl: link,
      byline: "",
      section: sectionLabel,
    });
  }
  return items.slice(0, 12);
}

// ── BBC Sport / The Guardian RSS — editorial substitute feeds for the soccer,
// tennis, and golf columns, where no league .com publishes an open feed. Both
// are clean RSS WITH per-item images (in <media:*> tags rather than CBS's
// <enclosure>, handled above): BBC carries a single
// <media:thumbnail url> (bumped 240→480 for retina); the Guardian carries
// several <media:content width url> — take the widest.
function parseEditorialRSS(xml, sectionLabel) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities(((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
    const link = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
    const pub = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    if (!title || !link) continue;
    if (!passesArticleBlocklist(title)) continue;
    let imageUrl = null;
    const bbc = (block.match(/<media:thumbnail[^>]*\burl="([^"]+)"/) || [])[1];
    if (bbc) {
      imageUrl = decodeEntities(bbc).replace("/standard/240/", "/standard/480/");
    } else {
      // Guardian: several <media:content> per item — keep the widest.
      let best = null, bestW = 0, mm;
      const mcRe = /<media:content\b([^>]*)>/g;
      while ((mm = mcRe.exec(block)) !== null) {
        const u = (mm[1].match(/\burl="([^"]+)"/) || [])[1];
        const w = parseInt((mm[1].match(/\bwidth="(\d+)"/) || [])[1] || "0", 10);
        if (u && w >= bestW) { bestW = w; best = u; }
      }
      imageUrl = best ? decodeEntities(best) : null;
    }
    items.push({
      id: link,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      imageUrl,
      articleUrl: link,
      byline: "",
      section: sectionLabel,
    });
  }
  return items.slice(0, 12);
}

async function fetchEditorialRSS(url, sectionLabel) {
  const xml = await getText(url);
  return parseEditorialRSS(xml, sectionLabel);
}

async function fetchCBS(pathSlug, sectionLabel) {
  const url = pathSlug
    ? `https://www.cbssports.com/rss/headlines/${pathSlug}/`
    : "https://www.cbssports.com/rss/headlines/";
  const xml = await getText(url);
  return parseCBSItems(xml, sectionLabel);
}

// ── theScore JSON API ─────────────────────────────────────────────

async function fetchTheScore(leagueSlug, sectionLabel) {
  // Per-league paths actually filter correctly; the top-level ?leagues= query
  // param is a no-op on this API, so we use the path form when a slug is set.
  const url = leagueSlug
    ? `https://api.thescore.com/${leagueSlug}/articles?limit=15`
    : "https://api.thescore.com/articles?limit=15";
  const raw = await getJson(url);
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((a) => passesArticleBlocklist(a.headline || "", a.abstract || ""))
    .slice(0, 12)
    .map((a) => ({
    id: String(a.id),
    headline: a.headline || "",
    description: a.abstract || "",
    published: a.posted_at || a.created_at || "",
    imageUrl: null,
    articleUrl: a.share_url || "",
    byline: a.byline || "",
    section: sectionLabel,
  }));
}

// ── Game highlight IDs (prebaked so the score cards never live-scrape) ──
//
// The per-game "watch highlights" buttons (src/components/GameHighlights.tsx)
// resolve their YouTube video IDs live, at view time, one card at a time — a
// ~1-2s /api/youtube lookup per card that makes cards stagger in ("MLB loads,
// then World Cup"). This bakes those IDs server-side, exactly the way news
// video IDs are handled, so the client reads them from a static file and the
// buttons appear instantly, all at once. The client still falls back to a live
// resolve for any finished game not yet baked (recap not uploaded when the cron
// last ran), so nothing regresses when a bake is missing.
//
// The lookup MUST mirror src/lib/youtube.ts + GameHighlights.tsx exactly so a
// baked ID is what a live client would resolve:
//   • fifa uses strict channel slots: FIFA short, FOX full, Telemundo variants,
//     and a "World Cup" competition token in the query;
//   • MLB is excluded because the client uses date-exact MLB.com-native video;
//   • every other league: official-channel/broadcaster slots only.
// The key MUST be `${sport}:${event.id}` — GameHighlights keys off game.sport +
// game.id, and game.id === event.id for every team-sport card (espn.ts parseGame).
const HL_OUT_PATH = `${OUT_DIR}/highlights.json`;
const HL_ENTRY_TTL_MS = 10 * 24 * 60 * 60 * 1000; // prune baked games older than 10d

// Leagues that render per-game highlight cards, with their official YouTube
// channel — mirrors OFFICIAL_CHANNELS + the scoreboard paths in src/lib. Golf/
// MLB/F1/UFC omitted: MLB renders MLB.com-native video; leaderboard/event cards
// have their own strict resolvers. Leagues without an approved channel are also
// omitted so the prebaker can never reintroduce an unscoped button.
const HL_LEAGUES = [
  { sport: "nba",   path: "/basketball/nba/scoreboard",                       channel: "NBA" },
  { sport: "wnba",  path: "/basketball/wnba/scoreboard",                      channel: "WNBA" },
  { sport: "nhl",   path: "/hockey/nhl/scoreboard",                           channel: "NHL" },
  { sport: "nfl",   path: "/football/nfl/scoreboard",                         channel: "NFL" },
  { sport: "ncaam", path: "/basketball/mens-college-basketball/scoreboard",   channel: "March Madness" },
  { sport: "ncaaw", path: "/basketball/womens-college-basketball/scoreboard", channel: "March Madness" },
  { sport: "ncaaf", path: "/football/college-football/scoreboard",            channel: "ESPN College Football" },
  // NCAA volleyball (added 2026-09-23). No fixed uploader: `channel: null`
  // plus `primaryFromChain` in collegeHighlightChannels.json makes the first
  // channel of each match's conference chain the official one — see
  // hlFallbackChain and the item builder below. A match outside the four
  // channel conferences has an empty chain and costs no lookup. Until this
  // line existed the chain never ran at bake time: 0 of 445 matches baked over
  // 9/17-9/23, so every P4 card paid a live /api/youtube lookup.
  { sport: "ncaavb", path: "/volleyball/womens-college-volleyball/scoreboard", channel: null },
  { sport: "fifa",  path: "/soccer/fifa.world/scoreboard",                    channel: "FIFA" },
  { sport: "epl",   path: "/soccer/eng.1/scoreboard",                         channel: "NBC Sports" },
  { sport: "mls",   path: "/soccer/usa.1/scoreboard",                         channel: "Major League Soccer" },
  { sport: "ucl",   path: "/soccer/uefa.champions/scoreboard",                channel: "CBS Sports Golazo" },
  // UEL moved to CBS's second European channel — see the uel note in
  // src/lib/youtube.ts. The old channel stays as the strict 2nd slot.
  { sport: "uel",   path: "/soccer/uefa.europa/scoreboard",                   channel: "CBS Sports Golazo - Europe", secondaryChannel: "CBS Sports Golazo" },
  // La Liga + Ligue 1 (lit 2026-09-19): their US broadcasters, each gated on a
  // competition title token in HL_COMPETITION_TOKENS below. ESPN FC also cuts
  // the FA Cup / Copa del Rey / Premier League and beIN also cuts the Coupe de
  // France, so the token is load-bearing, not decoration.
  { sport: "laliga",     path: "/soccer/esp.1/scoreboard",                    channel: "ESPN FC" },
  { sport: "ligue1",     path: "/soccer/fra.1/scoreboard",                    channel: "beIN SPORTS USA" },
  { sport: "seriea",     path: "/soccer/ita.1/scoreboard",                    channel: "CBS Sports Golazo" },
  { sport: "bundesliga", path: "/soccer/ger.1/scoreboard",                    channel: "Bundesliga" },
  // ⚠️ "TUDN USA", NOT "TUDN México" — the third and last copy of this string.
  // src/lib/youtube.ts and check-highlight-fallbacks.mjs were both corrected on
  // 2026-08-10; this one was missed, so Liga MX was the one league in this list
  // that could never bake: the prebaker asked a channel that has no per-match
  // recap, wrote nothing, and getChannelVerifiedBakedId would have rejected the
  // entry anyway for naming a channel the client does not expect. Every Liga MX
  // card therefore fell through to a LIVE strict lookup — which is the "Liga MX
  // videos load slowly" Jacob reported on 8/11. Re-measured against the live
  // worker 2026-08-11, spaced to dodge the burst limiter: TUDN USA 4/4
  // (Necaxa/Toluca, Santos/América, Pachuca/León, Monterrey/Atlas), TUDN México
  // 0/4. Change all three copies together or the monitor validates the bug.
  { sport: "ligamx",     path: "/soccer/mex.1/scoreboard",                    channel: "TUDN USA" },
  { sport: "nwsl",       path: "/soccer/usa.nwsl/scoreboard",                 channel: "National Women's Soccer League", secondaryChannel: "CBS Sports W Golazo" },
  { sport: "efl",        path: "/soccer/eng.2/scoreboard",                    channel: "EFL" },
  { sport: "libertadores", path: "/soccer/conmebol.libertadores/scoreboard",  channel: "CONMEBOL Libertadores" },
  { sport: "saudi",      path: "/soccer/ksa.1/scoreboard",                    channel: "الدوري السعودي للمحترفين - Saudi Pro League" },
  { sport: "afcon",      path: "/soccer/caf.nations/scoreboard",              channel: "CAF TV" },
  // FA Cup (added 2026-09-14): ESPN FC, 7/10 strict on 2025-26 ties, 0 wrong,
  // with the "fa cup" title token below. uecl / copadelrey / dfbpokal are dark
  // and deliberately absent — see NO_HIGHLIGHT_FALLBACK in src/lib/youtube.ts.
  { sport: "facup",      path: "/soccer/eng.fa/scoreboard",                   channel: "ESPN FC" },
  // Little League World Series (added 2026-08-21). ESPN cuts a per-game
  // "Full Game Highlights" for the Williamsport rounds. The names it titles
  // with are the state/country, not ESPN's own city-based team name — see
  // hlHighlightTeamName below and highlightTeamName in src/lib/youtube.ts.
  { sport: "llws",   path: "/baseball/llb/scoreboard",                        channel: "ESPN" },
  { sport: "tennis", path: "/tennis/atp/scoreboard",                          channel: null },
  // Rugby union (added 2026-09-04). These four already had an approved uploader
  // in OFFICIAL_CHANNELS and a 3-hour buffer in highlightBufferHours, but were
  // never baked — so every rugby card fell through to a LIVE per-card
  // /api/youtube scrape, the same slow path Liga MX was pulled off on 2026-08-11.
  // Worse than slow: check-highlight-fallbacks.mjs pacing exists because bursts
  // of live lookups soft-block the Worker's SHARED IP, and a Six Nations Saturday
  // is ~3 matches x N readers all scraping at once.
  //
  // rugbychamp + rugbytest are deliberately absent, matching NO_HIGHLIGHT_FALLBACK:
  // neither has a single uploader that owns its window (Champions Cup resolved to
  // one of the two CLUBS; the November tests to fan channels). A league with no
  // approved channel must not be baked — there is nothing to bake it against.
  { sport: "sixnations",   path: "/rugby/180659/scoreboard",                   channel: "Guinness Men's Six Nations" },
  { sport: "superrugby",   path: "/rugby/242041/scoreboard",                   channel: "Super Rugby Pacific" },
  { sport: "rugbywc",      path: "/rugby/164205/scoreboard",                   channel: "World Rugby" },
  // Nations Championship shares the World Rugby channel with the U20 Junior
  // World Championships — same nations, same window — so it is the one league
  // here that MUST carry the competition title gate. Its 2nd slot is Super Rugby
  // Pacific, which posts the southern-hemisphere host fixtures (mirrors
  // SECONDARY_CHANNELS.nationschamp).
  { sport: "nationschamp", path: "/rugby/17567/scoreboard",                    channel: "World Rugby", secondaryChannel: "Super Rugby Pacific" },
  // CFL (added 2026-09-13). ESPN no longer serves the CFL, so `worker: true`
  // reads the slate from our own /api/cfl route (theScore, reshaped to the
  // ESPN scoreboard — see public/_worker.js) instead of site.api.espn.com.
  // TSN is the uploader (16/16 strict + week hits on Weeks 12–15); the week
  // gate is load-bearing because TSN's 2024/2025 uploads carry no year.
  { sport: "cfl",    path: "/api/cfl",                                          channel: "TSN", worker: true },
  // NCAA women's hockey (added 2026-09-23). No fixed uploader, like ncaavb:
  // `channel: null` plus `primaryFromChain` makes the ECAC Hockey channel the
  // official one for any game with an ECAC school, behind the `women` token
  // below. Every other game has an empty chain and costs no lookup. See
  // src/lib/collegeHighlights.ts for the channel probe.
  { sport: "ncaawh", path: "/hockey/womens-college-hockey/scoreboard",       channel: null },
];
// Origin for the worker-served leagues above. Overridable so a local
// `wrangler pages dev` run can be baked against.
const HL_WORKER_BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";

// Competition token required in the winning video's TITLE. Mirrors
// COMPETITION_TITLE_TOKENS in src/lib/youtube.ts — keep the two in sync, or the
// bake will write clips the client would have refused to resolve live.
const HL_COMPETITION_TOKENS = {
  ncaavb: ["volleyball"],
  nationschamp: ["nations championship"],
  facup: ["fa cup"],
  laliga: ["laliga", "la liga"],
  ligue1: ["ligue 1"],
  ncaawh: ["women"],
};
// CFL playoffs — mirrors cflPlayoffTitleTokens in src/lib/youtube.ts. Sent per
// EVENT: TSN titles the postseason by round with no year, and a playoff card
// has no week, so without this the 2025 semi-finals baked a REGULAR-season
// meeting of the same pair (probed 2026-09-13). Keep the two in sync.
function hlCflPlayoffTokens(playoffLabel) {
  const l = String(playoffLabel || "").toLowerCase();
  if (/grey.?cup/.test(l)) return ["grey cup"];
  if (/semi/.test(l)) return ["semi final"];
  if (/east/.test(l)) return ["east final", "eastern final"];
  if (/west/.test(l)) return ["west final", "western final"];
  return ["grey cup", "semi final", "east final", "eastern final", "west final", "western final", "playoff"];
}
// NFL preseason — mirrors NFL_PRESEASON_TITLE_TOKENS in src/lib/youtube.ts.
// Sent per EVENT, not per league: an exhibition (season.type 1) must resolve to
// a title that says "preseason" (or "hall of fame"), both because the NFL's
// bare preseason titles carry no "highlights" and the worker only accepts them
// under this token, and because the same two clubs can meet again in the
// regular season under the same names and year with no week to tell them
// apart (Game.weekNumber is null for the exhibitions).
const HL_NFL_PRESEASON_TOKENS = ["preseason", "hall of fame"];
// Competition token required in the title (mirrors COMPETITION_NAMES) — fifa only.
const HL_COMPETITION = { fifa: "World Cup" };

function hlNormalizeTeam(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sorted so an ESPN home/away flip does not invalidate the same matchup, while
// reusing an event ID for either different team does invalidate every cached ID.
function hlMatchupFingerprint(away, home) {
  return [hlNormalizeTeam(away), hlNormalizeTeam(home)].sort().join("|");
}

// Verified completed World Cup highlight slots. These seed the ignored/R2-backed
// highlights cache on fresh CI checkouts, so all-time World Cup cards do not
// regress to slow live scraping or stale one-link entries.
const HL_WORLD_CUP_SEEDS = {
  "fifa:760489": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Paraguay", "Germany"], matchup: hlMatchupFingerprint("Paraguay", "Germany"), official: "Gw6vNwAvkTs", extended: "-gtI96YhJek", telemundo: "zGZGTRKNxvs" },
  "fifa:760488": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Morocco", "Netherlands"], matchup: hlMatchupFingerprint("Morocco", "Netherlands"), official: "vdnhUnGHwco", extended: "DkZtwwbN1YI", telemundo: "IMYhuFBuN-0" },
  "fifa:760493": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Senegal", "Belgium"], matchup: hlMatchupFingerprint("Senegal", "Belgium"), official: "PsPQkfngzV8", extended: "OJ84ZgReAsE", telemundo: "PLOT1Sa2A2o" },
  "fifa:760499": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Egypt", "Australia"], matchup: hlMatchupFingerprint("Egypt", "Australia"), official: "olBx2GK7kZI", extended: "ACWOG7t8Plk", telemundo: "b_9eFJBe4ek" },
  "fifa:760500": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Cape Verde", "Argentina"], matchup: hlMatchupFingerprint("Cape Verde", "Argentina"), official: "hzvEZ2Vxb94", extended: "EC2jOKluGRI", telemundo: "hWlz2o8KPL0" },
  "fifa:760508": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Colombia", "Switzerland"], matchup: hlMatchupFingerprint("Colombia", "Switzerland"), official: "g9bxtV3oZDI", extended: "_uEzppRKcd0", telemundo: "D9HlmSHUIvo" },
  "fifa:760509": { t: Date.parse("2026-07-09T14:56:01.325Z"), teams: ["Egypt", "Argentina"], matchup: hlMatchupFingerprint("Egypt", "Argentina"), official: "-LHb5yN-OzI", extended: "XO3x8vm0Ijc", telemundo: "QO8-LAmwS1E", telemundoExtended: "6tveHOrsXwY" },
  "fifa:760510": { t: Date.parse("2026-07-10T10:45:00.000Z"), teams: ["Morocco", "France"], matchup: hlMatchupFingerprint("Morocco", "France"), official: "2zz8FDiKeX4", extended: "J_1iFnRsHG0", telemundo: "7mx7L_IgBfY", telemundoExtended: "x3zlfmji_CU" },
};
// Mirror of TEAM_NAME_ALIASES / buildQuery in src/lib/youtube.ts.
const HL_TEAM_ALIASES = {
  "Red Bull NY": "New York Red Bulls",
  Tempo: "Toronto Tempo",
  Valkyries: "Golden State Valkyries",
  Rensselaer: "RPI",
};
const hlAlias = (n) => HL_TEAM_ALIASES[n] ?? n;
// The LLWS code->state/country table is the SAME FILE src/lib/youtube.ts reads,
// not a copy: the bake and the client have to agree on matchup identity or
// getChannelVerifiedBakedId rejects every entry written here. See the comment on
// highlightTeamName in src/lib/youtube.ts for why the rewrite exists at all.
const HL_LLWS_REGION_NAMES = JSON.parse(
  readFileSync(new URL("../src/lib/llwsRegions.json", import.meta.url), "utf8"),
);
// College football titles use the full school name ESPN keeps in team.location
// ("Western Kentucky"), not the shortDisplayName ("Western KY"). Mirrors
// LOCATION_NAME_SPORTS in src/lib/youtube.ts.
const HL_LOCATION_NAME_SPORTS = new Set(["ncaaf", "ncaavb"]);
// Per-game fallback uploaders (conference + TV network) for the official slot.
// SAME FILE src/lib/youtube.ts reads; the chain builder mirrors
// buildCollegeFallbackChain in src/lib/collegeHighlights.ts.
const HL_COLLEGE_CHANNELS = JSON.parse(
  readFileSync(new URL("../src/lib/collegeHighlightChannels.json", import.meta.url), "utf8"),
);
const hlFallbackChain = (sport, primaryChannel, homeTeam, awayTeam, broadcasts) => {
  const cfg = HL_COLLEGE_CHANNELS[sport];
  if (!cfg) return [];
  const confKey = (t) => (t?.conferenceId ? String(t.conferenceId) : (t?.id ? cfg.teamConferences?.[String(t.id)] : undefined));
  const channels = [];
  const add = (c) => { if (c && c !== primaryChannel && !channels.includes(c)) channels.push(c); };
  const homeConf = confKey(homeTeam);
  const awayConf = confKey(awayTeam);
  add(homeConf ? cfg.conferences[homeConf] : undefined);
  add(awayConf ? cfg.conferences[awayConf] : undefined);
  for (const name of broadcasts ?? []) add(cfg.networks.find((n) => n.names.includes(name))?.channel);
  return channels.map((channel) => ({ channel, titleTokens: cfg.channelTitleTokens?.[channel] ?? cfg.titleTokens }));
};
const hlHighlightTeamName = (sport, name, location) => {
  if (HL_LOCATION_NAME_SPORTS.has(sport)) return (location && String(location).trim()) || name;
  if (sport !== "llws") return name;
  const code = String(name).trim().split(/\s+/).pop() ?? "";
  return HL_LLWS_REGION_NAMES[code.toUpperCase()] ?? name;
};
const HL_TELEMUNDO_WORLD_CUP_ALIASES = {
  Argentina: "Argentina",
  Australia: "Australia",
  Belgium: "Bélgica",
  Brazil: "Brasil",
  Colombia: "Colombia",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  Norway: "Noruega",
  Paraguay: "Paraguay",
  Spain: "España",
  Switzerland: "Suiza",
  USA: "Estados Unidos",
};
const hlTelemundoTeam = (n) => HL_TELEMUNDO_WORLD_CUP_ALIASES[n] ?? hlAlias(n);
const HL_TENNIS_CHANNELS = [
  [/wimbledon/i, "Wimbledon"],
  [/roland|french open/i, "Roland-Garros"],
  [/us open/i, "US Open Tennis Championships"],
  [/australian open|aus open/i, "Australian Open"],
];
function hlQuery(away, home, dateStr, series, competition, dated) {
  const head = `${hlAlias(away)} vs ${hlAlias(home)} highlights`;
  let q = competition
    ? (dated ? `${head} ${competition} ${dateStr}` : `${head} ${competition}`)
    : (dated ? `${head} ${dateStr}` : head);
  if (series) q += ` ${series}`;
  return q;
}

function hlTelemundoWorldCupQuery(away, home, dateStr, series) {
  let q = `${hlTelemundoTeam(away)} vs ${hlTelemundoTeam(home)} resumen Copa Mundial ${dateStr}`;
  if (series) q += ` ${series}`;
  return q;
}

// One /api/youtube call mirroring youtube.ts fetchFirstVideoId (q, channel,
// exclude, prefer=extended). Returns a raw video id or null.
async function hlFetchId(query, { channel, exclude, preferExtended, strict, week, compTokens } = {}) {
  try {
    let url = `https://hidescore.com/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
    // Competition TITLE gate — mirrors the `comp=` param in fetchFirstVideoId
    // (src/lib/youtube.ts) and COMPETITION_TITLE_TOKENS. The bake has to send it
    // for the same reason it sends `week`: one official channel that uploads more
    // than one competition between the same two nations. World Rugby carries both
    // the Nations Championship and the U20 Junior World Championships, so an
    // ungated bake can write an U20 clip that clears the uploader gate AND the
    // both-teams gate — and getChannelVerifiedBakedId does NOT re-check the
    // competition on the client, so a bad bake would be served as-is.
    if (compTokens?.length) url += `&comp=${encodeURIComponent(compTokens.join("|"))}`;
    // Gridiron week gate — mirrors fetchFirstVideoId in src/lib/youtube.ts. The
    // bake has to send it too: carried entries are revalidated against uploader
    // + matchup only, and BOTH meetings of a division rival pass that check, so
    // without the week the bake can cache the wrong week's recap indefinitely.
    if (week) url += `&week=${week}`;
    const ex = (exclude ?? []).filter(Boolean);
    if (ex.length) url += `&exclude=${encodeURIComponent(ex.join(","))}`;
    if (preferExtended) url += `&prefer=extended`;
    if (strict && channel) url += `&strict=1`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.videoId ?? null;
  } catch { return null; }
}

const HL_TITLE_TEAM_ALIASES = {
  usa: ["usa", "united states", "usmnt", "estados unidos"],
  "bosnia herz": ["bosnia herz", "bosnia herzegovina", "bosnia and herzegovina"],
  "south korea": ["south korea", "korea republic", "korea"],
  "ivory coast": ["ivory coast", "cote d ivoire"],
  turkiye: ["turkiye", "turkey"],
  "congo dr": ["congo dr", "dr congo", "democratic republic of congo"],
  curacao: ["curacao"],
  czechia: ["czechia", "czech republic"],
  "cape verde": ["cape verde", "cabo verde"],
  netherlands: ["netherlands", "holland", "paises bajos"],
};

// The worker's club alias table (ESPN compact name ↔ every title form the
// official channels use: "red bull ny" ↔ "New York Red Bulls", "inter milan" ↔
// "Inter", "wolves" ↔ "Wolverhampton"). Read from public/_worker.js at bake
// time, the same way HL_LLWS_REGION_NAMES reads the client's JSON, so the two
// matchers can never disagree: the 2026-09-12 nine-day re-bake showed the
// worker resolving six MLS/UCL/Serie A/EFL clips that this file's country-only
// table then rejected as HIGHLIGHT-MATCHUP-REJECT. Same reverse index as the
// worker (any variant → the full list). Empty when the block cannot be found,
// which degrades to the previous behaviour instead of failing the bake.
const HL_WORKER_TEAM_VARIANTS = (() => {
  try {
    const src = readFileSync(new URL("../public/_worker.js", import.meta.url), "utf8");
    const start = src.indexOf("const TEAM_ALIASES = {");
    const end = src.indexOf("\n        };", start);
    if (start < 0 || end < 0) return {};
    const table = new Function(`return {${src.slice(start + "const TEAM_ALIASES = {".length, end)}};`)();
    const index = {};
    for (const variants of Object.values(table)) {
      for (const v of variants) index[hlNormalizeTeam(v)] = variants.map(hlNormalizeTeam);
    }
    return index;
  } catch {
    return {};
  }
})();

// The 32 NFL club channels, read from src/lib/nflTeamChannels.ts the same way
// check-nfl-team-channels.mjs reads it — one table, never a copy. Keyed by
// ESPN abbreviation (Washington is WSH). Empty when the block cannot be found,
// which simply leaves every NFL card with the league button only.
const HL_NFL_CLUB_CHANNELS = (() => {
  try {
    const src = readFileSync(new URL("../src/lib/nflTeamChannels.ts", import.meta.url), "utf8");
    const block = src.match(/const NFL_TEAM_CHANNELS[^{]*\{([\s\S]*?)\n\};/);
    if (!block) return {};
    const rows = {};
    for (const line of block[1].split("\n")) {
      const m = line.match(/^\s*(\w+):\s*\{\s*channel:\s*"([^"]+)",\s*handle:\s*"([^"]+)"/);
      if (m) rows[m[1]] = m[2];
    }
    return rows;
  } catch {
    return {};
  }
})();
// Club packages post within hours of the final or not at all, so the club
// lookup only runs on games this recent — it is two extra worker calls per
// still-missing game per run, on top of the league resolve.
const HL_CLUB_DAYS = 3;
// A club GAME package runs 4–10 min (Week 1 2026: 259–596 s). The clubs also
// post 1–3 min single-player reels that clear the worker's gates ("Jaxson Dart
// Highlights: Giants vs. Cowboys | Week 1 SNF", 108 s, the first dry run), so
// anything under four minutes is not the game and is rejected. An unknown
// duration (watch page unreachable) is let through.
const HL_CLUB_MIN_SEC = 240;

function hlTitleHasTeam(title, team) {
  const normalizedTitle = hlNormalizeTeam(title);
  const normalizedTeam = hlNormalizeTeam(team);
  const variants = new Set([
    normalizedTeam,
    hlNormalizeTeam(hlAlias(team)),
    hlNormalizeTeam(hlTelemundoTeam(team)),
    ...(HL_TITLE_TEAM_ALIASES[normalizedTeam] ?? []),
    ...(HL_WORKER_TEAM_VARIANTS[normalizedTeam] ?? []),
  ]);
  if ([...variants].some((variant) => variant && normalizedTitle.includes(variant))) return true;
  // Name-order tolerance, mirroring titleHasTeam in public/_worker.js: ESPN
  // names Chinese tennis players family-name-first ("Zheng Qinwen") and the US
  // Open channel titles them given-name-first ("Qinwen Zheng vs. Elena
  // Rybakina Highlights | …"). A two-word name matches when both words appear
  // as whole words anywhere in the title. This check also revalidates CARRIED
  // entries every run, so without it the worker could bake such a match and
  // the next bake would reject it as HIGHLIGHT-MATCHUP-REJECT.
  return [...variants].some((variant) => {
    const words = String(variant ?? "").split(" ").filter(Boolean);
    if (words.length !== 2 || words.some((w) => w.length < 2)) return false;
    return words.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalizedTitle));
  });
}

const HL_OEMBED_META_CACHE = new Map();
async function hlOembedMeta(id) {
  if (!id) return null;
  if (HL_OEMBED_META_CACHE.has(id)) return HL_OEMBED_META_CACHE.get(id);
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}&format=json`, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      HL_OEMBED_META_CACHE.set(id, null);
      return null;
    }
    const data = await res.json();
    const meta = { title: String(data?.title ?? ""), author: String(data?.author_name ?? "") };
    HL_OEMBED_META_CACHE.set(id, meta);
    return meta;
  } catch {
    HL_OEMBED_META_CACHE.set(id, null);
    return null;
  }
}

async function hlVideoMatchesTeams(id, away, home) {
  const meta = await hlOembedMeta(id);
  return !!meta?.title && hlTitleHasTeam(meta.title, away) && hlTitleHasTeam(meta.title, home);
}

// WEEK TOKEN — mirrors parseWeekFromTitle in public/_worker.js (kept as a
// hand copy, not a shared import: this is a plain Node script, the worker
// runs on Cloudflare's edge runtime). Reads both digit ("Week 15") and
// spelled-out ("WEEK ONE" … "WEEK TWENTY-ONE") forms — TSN spells CFL weeks
// 1–5 out in full and switches to digits from week 6 on, so the old
// digit-only regex read a spelled title as carrying no week token at all,
// which the revalidation below (like the worker) treats as "untouched" —
// letting a Week 1 recap survive as the cached id for a Week 6/8 game
// forever (measured live 2026-09-22). Keep this word list in sync with
// public/_worker.js's WEEK_WORDS by hand.
const HL_WEEK_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const HL_WEEK_TOKEN_RE = new RegExp(
  `\\bw(?:ee)?k\\.?\\s*(\\d{1,2}|${HL_WEEK_WORDS.join("|")})(?:[\\s-]one)?\\b`,
  "i",
);
function hlParseWeekFromTitle(title) {
  const m = String(title ?? "").match(HL_WEEK_TOKEN_RE);
  if (!m) return null;
  const whole = m[0].toLowerCase();
  const w = m[1].toLowerCase();
  const base = /^\d+$/.test(w) ? parseInt(w, 10) : HL_WEEK_WORDS.indexOf(w);
  if (base < 0 || Number.isNaN(base)) return null;
  return base === 20 && /twenty[\s-]one\b/.test(whole) ? 21 : base;
}

// Gridiron week check for CARRIED entries. The matchup check above passes for
// BOTH meetings of a division rival — same two teams, same season — so it is not
// enough on its own for NFL/NCAAF. Same asymmetry as the worker's gate: a title
// whose week token disagrees is rejected, a title with no week token is left
// alone (postseason cuts say "Divisional Round", and the caller sends no week
// for those anyway) — UNLESS requireWeek is set, which flips a missing token to
// a reject. CFL passes this true: TSN's 2024/2025 no-week uploads are a
// different, older-season format, not a legitimately week-less cut (see
// cflWeekRequired at the call sites). NFL/NCAAF/the NFL club check never pass
// it, so their behavior is unchanged.
async function hlVideoMatchesWeek(id, week, requireWeek = false) {
  if (!week) return true;
  const meta = await hlOembedMeta(id);
  const titleWeek = hlParseWeekFromTitle(meta?.title);
  if (titleWeek === null) return !requireWeek;
  return titleWeek === week;
}

// Competition check for CARRIED entries — the analogue of hlVideoMatchesWeek one
// competition up. Mirrors compTitleMatches in public/_worker.js: no tokens means
// no gate, and unlike the week check a title that names NO competition is
// REJECTED, not waved through, because "Italy v Japan | Junior World
// Championships" and the senior fixture are the same two nations on the same
// weekend and the token is the only thing that tells them apart.
async function hlVideoMatchesComp(id, compTokens) {
  if (!compTokens?.length) return true;
  const meta = await hlOembedMeta(id);
  const title = String(meta?.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!title) return false;
  return compTokens.some((tok) => {
    const t = String(tok || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return t && title.includes(t);
  });
}

async function hlVideoMatchesChannel(id, channel) {
  const meta = await hlOembedMeta(id);
  return String(meta?.author ?? "").toLowerCase() === String(channel ?? "").toLowerCase();
}

// UPLOAD-DATE check — the season gate the title checks cannot be. The team,
// competition and week checks all pass for the SAME two clubs meeting in an
// earlier season, because ESPN FC / CBS / MLS / Serie A put neither a date nor
// a year in a recap title. The 2nd (extended) button made it visible: it
// re-asks with the 1st video excluded, and the next-best hit is last season's
// cut. Measured against the live manifest 2026-09-20: ~105 of 135 soccer
// `extended` slots held the wrong season, the oldest a 2012 MLS game.
// The watch page's uploadDate settles it. A failed fetch yields null and the
// id is KEPT — see uploadFitsGameDate. Good reads persist on disk, and the club
// slot already pays this fetch, so it is at most one extra request per id.
// Exported shape kept simple on purpose: PLAN-3 reuses it.
// Fail-open tally for the gate below. An unreadable upload date returns PASS
// on purpose, so a stale id survives and nothing is written to the log —
// exactly how 93 wrong-season videos outlived a clean re-bake on 2026-09-20.
// Printed once at the end of the bake so the next silent fail-open is visible.
let hlAgeChecks = 0;
let hlAgeUnreadable = 0;

async function hlVideoMatchesDate(id, gameIso) {
  if (!id || !gameIso) return true;
  const gameMs = Date.parse(gameIso);
  if (!Number.isFinite(gameMs)) return true;
  const { publishedMs } = await fetchYtWatchMeta(id);
  hlAgeChecks++;
  if (!Number.isFinite(publishedMs)) hlAgeUnreadable++;
  return uploadFitsGameDate(publishedMs, gameMs);
}

async function hlIsTelemundoVideo(id) {
  return hlVideoMatchesChannel(id, "Telemundo Deportes");
}

// Mirror resolveHighlightVideo: one dated query, one exact uploader, no
// unscoped retry tier.
async function hlResolve(away, home, dateStr, series, channel, exclude, competition, preferExtended, week, compTokens) {
  const dated = hlQuery(away, home, dateStr, series, competition, true);
  if (!channel) return null;
  return hlFetchId(dated, { channel, exclude, preferExtended, strict: true, week, compTokens });
}

async function hlResolveTelemundoWorldCup(away, home, dateStr, series, exclude, preferExtended) {
  return hlFetchId(hlTelemundoWorldCupQuery(away, home, dateStr, series), {
    channel: "Telemundo Deportes",
    exclude,
    preferExtended,
    strict: true,
  });
}

// ET calendar date as YYYYMMDD (ESPN scoreboard `dates=` param), offset in days.
function hlEtYmd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, "");
}

// Same ET date string the client builds for the query ("Jul 7, 2026").
function hlDateStr(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function hlDateYmd(iso) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(iso)).replace(/-/g, "");
  } catch {
    return "";
  }
}

function hlTennisChannel(eventName) {
  return HL_TENNIS_CHANNELS.find(([rx]) => rx.test(eventName ?? ""))?.[1] ?? null;
}

function hlTennisMatches(events, ymd) {
  const matches = [];
  for (const event of events ?? []) {
    if (!event?.major) continue;
    const channel = hlTennisChannel(event.name);
    if (!channel) continue;
    for (const grouping of event.groupings ?? []) {
      const slug = (grouping?.grouping?.slug ?? "").toLowerCase();
      if (!slug.includes("singles") || slug.includes("doubles")) continue;
      for (const match of grouping.competitions ?? []) {
        if (match?.status?.type?.state !== "post") continue;
        const date = match.date ?? event.date;
        if (hlDateYmd(date) !== ymd) continue;
        const comps = match.competitors ?? [];
        const home = comps.find((c) => c.homeAway === "home") ?? comps[0];
        const away = comps.find((c) => c.homeAway === "away") ?? comps[1];
        const homeName = home?.athlete?.displayName ?? home?.athlete?.shortName;
        const awayName = away?.athlete?.displayName ?? away?.athlete?.shortName;
        if (!match.id || !awayName || !homeName) continue;
        const year = String(date ?? "").slice(0, 4);
        const series = [event.name, year].filter(Boolean).join(" ") || null;
        matches.push({ id: match.id, away: awayName, home: homeName, date, series, channel });
      }
    }
  }
  return matches;
}

// ── FotMob: second source for the soccer official slot ──────────────────
// See scripts/lib/fotmob.mjs for what is read and why. The step runs ONLY for
// a game whose official slot is still empty after every channel lookup, so it
// never replaces a clip the resolver found. Its id then passes the same gates
// a resolved one does (oEmbed + both teams + upload date) plus an embed check,
// and the entry is tagged `src: "fotmob"` so a bad batch can be removed with
// one filter.
//
// Limits (FotMob's terms do not grant scraping — keep it small):
//   • mini bake only: off under GitHub Actions (the manual news-prebake
//     fallback) and off with HL_FOTMOB=0 (the off switch; it also drops every
//     carried FotMob id, so one bake clears a bad batch);
//   • ≤11 league pages + ≤30 match pages per bake (≤41 requests), 1 per second;
//   • a game FotMob answered is not re-asked for 6 hours;
//   • any non-200 or missing __NEXT_DATA__ is skipped silently for that bake;
//     three bakes in a row with requests but zero parses send one silent
//     (priority -2) Pushover.
const HL_FOTMOB_ON = process.env.HL_FOTMOB !== "0" && process.env.GITHUB_ACTIONS !== "true";
const HL_FOTMOB_MAX_LEAGUE_FETCHES = 11;
const HL_FOTMOB_MAX_MATCH_FETCHES = 30;
const HL_FOTMOB_GAP_MS = 1000;
const HL_FOTMOB_REASK_MS = 6 * 60 * 60 * 1000;
const HL_FOTMOB_DARK_BAKES = 3;
// Outside public/news on purpose: the mini uploads every public/news/*.json to
// R2. Ignored by git, so the mini's reset to origin/main leaves it in place.
const HL_FOTMOB_STATE_PATH = ".bake-state/fotmob.json";
const hlFotmob = { requests: 0, leagueFetches: 0, matchFetches: 0, parsed: 0, lastAt: 0, fixtures: new Map(), state: null };

async function hlFotmobState() {
  if (hlFotmob.state) return hlFotmob.state;
  let state = null;
  try { state = JSON.parse(await readFile(HL_FOTMOB_STATE_PATH, "utf8")); } catch { /* first run */ }
  hlFotmob.state = {
    asked: state?.asked && typeof state.asked === "object" ? state.asked : {},
    darkBakes: Number.isFinite(state?.darkBakes) ? state.darkBakes : 0,
  };
  return hlFotmob.state;
}

// One FotMob page → its __NEXT_DATA__, or null. Spaced HL_FOTMOB_GAP_MS apart.
async function hlFotmobGet(path) {
  const wait = hlFotmob.lastAt + HL_FOTMOB_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  hlFotmob.requests++;
  try {
    const res = await fetch(`https://www.fotmob.com${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = parseFotmobNextData(await res.text());
    if (data) hlFotmob.parsed++;
    return data;
  } catch {
    return null;
  } finally {
    hlFotmob.lastAt = Date.now();
  }
}

// Finished fixtures for one league, fetched at most once per bake.
async function hlFotmobFixturesFor(sport) {
  if (hlFotmob.fixtures.has(sport)) return hlFotmob.fixtures.get(sport);
  const path = fotmobLeaguePath(sport);
  if (!path || hlFotmob.leagueFetches >= HL_FOTMOB_MAX_LEAGUE_FETCHES) return null;
  hlFotmob.leagueFetches++;
  const data = await hlFotmobGet(path);
  const fixtures = data ? fotmobFixtures(data) : null;
  hlFotmob.fixtures.set(sport, fixtures);
  return fixtures;
}

const hlTeamVariantsOf = (name) => [hlAlias(name), ...(HL_WORKER_TEAM_VARIANTS[hlNormalizeTeam(name)] ?? [])];

// The official id FotMob links for this game, gated, or null. A carried
// FotMob id is re-gated without asking FotMob again. `embedBlocked` /
// `titleScore` ride along for a clip that only plays on youtube.com (see
// gateFotmobVideo); the entry stores them as officialEmbeddable: false /
// officialTitleScore: true.
async function hlFotmobOfficial(sport, key, item, away, home, prev) {
  if (!HL_FOTMOB_ON || !FOTMOB_LEAGUES[sport]) return null;
  const gate = (id) => gateFotmobVideo(id, {
    oembedMeta: hlOembedMeta,
    embeddable: fetchYtEmbeddable,
    watchable: fetchYtWatchPlayable,
    matchesTeams: (v) => hlVideoMatchesTeams(v, away, home),
    matchesDate: (v) => hlVideoMatchesDate(v, item.date),
  });
  const flags = (verdict) => ({ embedBlocked: !!verdict.embedBlocked, titleScore: !!verdict.titleScore });
  if (prev?.src === "fotmob" && prev.official && prev.officialChannel) {
    const carried = await gate(prev.official);
    if (carried.ok && carried.channel.toLowerCase() === prev.officialChannel.toLowerCase()) {
      return { id: prev.official, channel: prev.officialChannel, ...flags(carried) };
    }
    console.warn(`HIGHLIGHT-FOTMOB-REJECT ${key} carried ${prev.official} ${carried.ok ? "channel" : carried.reason}`);
  }
  const state = await hlFotmobState();
  if (Date.now() - (state.asked[key] ?? 0) < HL_FOTMOB_REASK_MS) return null;
  const fixtures = await hlFotmobFixturesFor(sport);
  if (!fixtures) return null;
  const fixture = findFotmobFixture(fixtures, { away, home, dateIso: item.date }, hlTeamVariantsOf);
  if (!fixture) {
    console.warn(`HIGHLIGHT-FOTMOB-REJECT ${key} no-fixture (${away} vs ${home})`);
    return null;
  }
  if (hlFotmob.matchFetches >= HL_FOTMOB_MAX_MATCH_FETCHES) return null;
  hlFotmob.matchFetches++;
  const data = await hlFotmobGet(fixture.path);
  if (!data) return null;
  state.asked[key] = Date.now();
  const videoId = fotmobHighlightVideoId(data);
  if (!videoId) {
    console.warn(`HIGHLIGHT-FOTMOB-REJECT ${key} no-link (${away} vs ${home})`);
    return null;
  }
  const verdict = await gate(videoId);
  if (!verdict.ok) {
    console.warn(`HIGHLIGHT-FOTMOB-REJECT ${key} ${videoId} ${verdict.reason} (${away} vs ${home})`);
    return null;
  }
  console.log(`HIGHLIGHT-FOTMOB ${key} ${videoId} ${verdict.channel}${verdict.embedBlocked ? " embed-blocked" : ""}`);
  return { id: videoId, channel: verdict.channel, ...flags(verdict) };
}

// End of bake: request tally, the dark-bake streak and the state file.
async function hlFotmobFinish() {
  console.log(`HIGHLIGHT-FOTMOB-REQUESTS n=${hlFotmob.requests} leagues=${hlFotmob.leagueFetches} matches=${hlFotmob.matchFetches} parsed=${hlFotmob.parsed}`);
  if (!hlFotmob.requests && !hlFotmob.state) return;
  const state = await hlFotmobState();
  if (hlFotmob.requests) state.darkBakes = hlFotmob.parsed ? 0 : state.darkBakes + 1;
  if (state.darkBakes === HL_FOTMOB_DARK_BAKES) {
    const message = `FotMob: ${HL_FOTMOB_DARK_BAKES} bakes in a row parsed nothing (last: ${hlFotmob.requests} requests). The page shape or access changed.`;
    console.warn(`HIGHLIGHT-FOTMOB-DARK ${message}`);
    try {
      const { execFile } = await import("node:child_process");
      await new Promise((resolve) => execFile(`${process.env.HOME}/scripts/push.sh`, ["-t", "HideScore FotMob", "-m", message, "-p", "-2"], { timeout: 20000 }, () => resolve()));
    } catch { /* no push script on this host */ }
  }
  const cutoff = Date.now() - HL_ENTRY_TTL_MS;
  for (const [k, at] of Object.entries(state.asked)) if (!(at > cutoff)) delete state.asked[k];
  try {
    await mkdir(dirname(HL_FOTMOB_STATE_PATH), { recursive: true });
    await writeFile(HL_FOTMOB_STATE_PATH, JSON.stringify(state));
  } catch (e) {
    console.warn(`HIGHLIGHT-FOTMOB state not saved: ${e?.message || e}`);
  }
}

async function loadPriorHighlights() {
  let local = null;
  try {
    local = JSON.parse(await readFile(HL_OUT_PATH, "utf8"));
  } catch { /* fresh checkout / ignored generated file */ }
  let live = null;
  try {
    const res = await fetch(`https://hidescore.com/news/highlights.json?ts=${Date.now()}`, { headers: { "User-Agent": UA } });
    if (res.ok) live = await res.json();
  } catch { /* live prior unavailable */ }
  // A long-lived checkout can have an incomplete local ignored file while R2
  // still contains valid recent games (the 2026 MLB All-Star entry exposed this
  // during a manual bake). Merge entry-by-entry and keep the newest timestamp so
  // either source can fill gaps without an older copy overwriting a newer one.
  const games = {};
  for (const source of [live, local]) {
    for (const [key, value] of Object.entries(source?.games ?? {})) {
      if (!value) continue;
      if (!games[key] || (value.t ?? 0) >= (games[key].t ?? 0)) games[key] = value;
    }
  }
  return { games };
}

async function bakeGameHighlights() {
  const now = Date.now();
  let scoreboardResponses = 0;
  // Carry forward recent channel-marked entries only. No sport gets an immortal
  // cache record: old cards can strict-resolve live, while a stale or repurposed
  // video ID cannot survive forever just because it once looked valid.
  // --hl-days=N widens the window for a one-off re-bake after a matcher fix
  // (2026-09-12: four US Open cards from Sep 4–9 missed on name order).
  // Already-baked games short-circuit, so a wide window only re-scrapes the
  // still-missing ones.
  //
  // Default widened 2 → 7 days (2026-09-12). With 2 days a recap that posts
  // late was never retried, so the card stayed buttonless forever — a 9-day
  // one-off resolved four EPL cards, and a 7-day timing run on the mini found
  // three more (UCL, Liga MX, NWSL). Measured cost on the mini, highlights
  // step only: 30 s → 104 s per run (the full run is ~23 min), +110 ESPN
  // scoreboard fetches, and ~2 YouTube searches per still-missing game in the
  // window (24 such games on 2026-09-12) until its clip appears or it ages out.
  // Read before the carry-forward below, which uses it to tell an entry the
  // per-game loop will revisit from one it will not.
  const HL_DEFAULT_DAYS = 7;
  const hlDaysArg = parseInt(process.argv.find((a) => a.startsWith("--hl-days="))?.slice("--hl-days=".length) ?? "", 10);
  const hlDays = Number.isFinite(hlDaysArg) && hlDaysArg > 0 ? Math.min(hlDaysArg, 30) : HL_DEFAULT_DAYS;

  const games = {};
  const prior = await loadPriorHighlights();
  for (const [k, v] of Object.entries(prior?.games ?? {})) {
    if (!v) continue;
    const sportKey = k.split(":")[0];
    // MLB's YouTube row no longer renders; do not keep its old unscoped
    // secondary IDs in a manifest that claims every slot is official-channel.
    if (sportKey === "mlb") continue;
    const populatedSlots = ["official", "extended", "telemundo", "telemundoExtended", "club"].filter((slot) => v[slot]);
    const everySlotNamesItsChannel = populatedSlots.every((slot) => v[`${slot}Channel`]);
    const hasMatchupProvenance = Array.isArray(v.teams) && v.teams.length === 2
      && v.matchup === hlMatchupFingerprint(v.teams[0], v.teams[1]);
    if (v.sourcePolicy !== "official-channel" || !populatedSlots.length || !everySlotNamesItsChannel || !hasMatchupProvenance) continue;
    if ((now - (v.t ?? 0)) >= HL_ENTRY_TTL_MS) continue;
    // HL_FOTMOB=0 clears every FotMob-sourced official id, not only the ones
    // the per-game loop below revisits.
    if (!HL_FOTMOB_ON && v.src === "fotmob") {
      console.warn(`HIGHLIGHT-FOTMOB-REJECT ${k} carried ${v.official} switched-off`);
      if (!populatedSlots.some((slot) => slot !== "official")) continue;
      const rest = { ...v };
      for (const field of ["src", "official", "officialChannel", "officialDurationSec", "officialEmbeddable", "officialTitleScore"]) delete rest[field];
      games[k] = rest;
      continue;
    }

    // AGE SWEEP for the frozen band. The per-game loop below only walks the
    // last `hlDays` (7) of scoreboards, while this carry-forward keeps an entry
    // for HL_ENTRY_TTL_MS (10 days). A game between those two numbers is still
    // SERVED but is never revisited, so the upload-date gate cannot reach it:
    // on the 2026-09-20 bake that band held 14 wrong-season clips, the oldest a
    // 2019 MLS game. Check those slots here instead. Only out-of-window entries
    // pay the fetch — in-window ones are gated by the loop below, and a good
    // watch-page read is kept on disk either way. An entry from before eventDate
    // was stamped has nothing to compare against and is left alone.
    const gameAgeDays = v.eventDate ? Math.floor((now - Date.parse(v.eventDate)) / 86400000) : null;
    if (gameAgeDays === null || !Number.isFinite(gameAgeDays) || gameAgeDays < hlDays) {
      games[k] = v;
      continue;
    }
    const kept = { ...v };
    for (const slot of populatedSlots) {
      if (await hlVideoMatchesDate(kept[slot], kept.eventDate)) continue;
      console.warn(`HIGHLIGHT-AGE-REJECT ${k} carried ${slot}=${kept[slot]} (${kept.eventDate})`);
      delete kept[slot];
      delete kept[`${slot}Channel`];
      delete kept[`${slot}DurationSec`];
    }
    // The date check above just read this id's watch page, so its length is
    // free: stamp it, or a game past the per-game window keeps a bare league
    // badge on its button until it ages out.
    if (kept.official && !Number.isFinite(kept.officialDurationSec)) {
      const { durationSec } = await fetchYtWatchMeta(kept.official);
      if (Number.isFinite(durationSec)) kept.officialDurationSec = durationSec;
    }
    if (kept.extended && !Number.isFinite(kept.extendedDurationSec)) {
      const { durationSec } = await fetchYtWatchMeta(kept.extended);
      if (Number.isFinite(durationSec)) kept.extendedDurationSec = durationSec;
    }
    if (populatedSlots.some((slot) => kept[slot])) games[k] = kept;
    else console.warn(`HIGHLIGHT-AGE-DROP ${k} carried (${kept.eventDate})`);
  }
  for (const [k, seed] of Object.entries(HL_WORLD_CUP_SEEDS)) {
    const teams = seed.teams ?? String(seed.matchup ?? "").split("|").filter(Boolean);
    const verified = { teams, matchup: seed.matchup, sourcePolicy: "official-channel", t: now };
    const slots = [
      ["official", "FIFA", "officialChannel"],
      ["extended", "FOX Sports", "extendedChannel"],
      ["telemundo", "Telemundo Deportes", "telemundoChannel"],
      ["telemundoExtended", "Telemundo Deportes", "telemundoExtendedChannel"],
    ];
    for (const [slot, channel, channelKey] of slots) {
      const id = seed[slot];
      if (!id) continue;
      const channelOk = await hlVideoMatchesChannel(id, channel);
      const matchupOk = teams.length === 2 && await hlVideoMatchesTeams(id, teams[0], teams[1]);
      if (!channelOk || !matchupOk) {
        console.warn(`HIGHLIGHT-SEED-REJECT ${k} ${slot}=${id} channelOk=${channelOk} matchupOk=${matchupOk}`);
        continue;
      }
      verified[slot] = id;
      verified[channelKey] = channel;
    }
    if (slots.some(([slot]) => verified[slot])) games[k] = verified;
    else delete games[k];
  }

  const dates = Array.from({ length: hlDays }, (_, i) => hlEtYmd(-i));
  // World Cup gets a much wider window than the daily leagues. WC has only a
  // handful of games/day but a recap can post late (or a bake can fail while the
  // recap wasn't up yet), and outside the 2-day window that game NEVER gets
  // re-attempted — it stays unbaked and falls back to flaky live-resolve forever
  // (why so many past WC games showed no link). Already-baked games short-circuit
  // the resolve below, so this only re-scrapes the few still-missing ones.
  const fifaDates = Array.from({ length: 16 }, (_, i) => hlEtYmd(-i));
  // CFL gets its own much wider window for the same reason as WC, one gate
  // over: the age-gate fix (#84, 2026-09-20) landed AFTER several CFL games
  // had already baked, so a game outside the default 7-day window never gets
  // its carried id revalidated against the new checks and a bad id (a 2024
  // upload served for wk15 SSK@WPG, baked ~9/13) survives forever — the
  // revalidation logic itself is correct, it is simply never invoked for
  // that key again. CFL is a short, small-volume league (one ~21-week season,
  // at most a couple of games/day), so 30 days of ESPN/theScore scoreboard
  // fetches is cheap: already-baked games short-circuit before any YouTube
  // call, so this only costs one JSON fetch/day plus a couple of oembed
  // lookups per game whose id needs revalidating, never a new search unless
  // a check actually fails. 30 matches the one-off `--hl-days=30` catch-up
  // this same bug needed for the games already stuck with a bad id.
  const HL_CFL_DAYS = 30;
  const cflDates = Array.from({ length: HL_CFL_DAYS }, (_, i) => hlEtYmd(-i));
  let resolved = 0;
  for (const lg of HL_LEAGUES) {
    const lgDates = lg.sport === "fifa" ? fifaDates : (lg.sport === "cfl" ? cflDates : dates);
    for (const ymd of lgDates) {
      let data;
      try {
        const res = await fetch(lg.worker ? `${HL_WORKER_BASE}${lg.path}?dates=${ymd}` : `https://site.api.espn.com/apis/site/v2/sports${lg.path}?dates=${ymd}`, { headers: { "User-Agent": UA } });
        if (!res.ok) continue;
        data = await res.json();
        scoreboardResponses++;
      } catch { continue; }
      const items = lg.sport === "tennis"
        ? hlTennisMatches(data?.events, ymd)
        : (data?.events ?? []).flatMap((event) => {
            if (event?.status?.type?.state !== "post") return [];
            const comp = event.competitions?.[0];
            const comps = comp?.competitors ?? [];
            // Rewritten to the uploader's title form before anything else
            // touches it, so the query, the matchup fingerprint and the title
            // check all agree with the client. Identity outside LLWS.
            const awayTeam = comps.find((c) => c.homeAway === "away")?.team;
            const homeTeam = comps.find((c) => c.homeAway === "home")?.team;
            const away = hlHighlightTeamName(lg.sport, awayTeam?.shortDisplayName, awayTeam?.location);
            const home = hlHighlightTeamName(lg.sport, homeTeam?.shortDisplayName, homeTeam?.location);
            const broadcasts = (comp?.broadcasts ?? []).flatMap((b) => b?.names ?? []);
            const chain = hlFallbackChain(lg.sport, lg.channel, homeTeam, awayTeam, broadcasts);
            // ncaavb has no fixed channel, so the chain's first channel IS the
            // official one and the rest stay fallbacks — mirrors chainIsPrimary
            // in GameHighlights.tsx. A match with no chain is dark there, so it
            // is skipped here before any lookup.
            const chainIsPrimary = !lg.channel && !!HL_COLLEGE_CHANNELS[lg.sport]?.primaryFromChain;
            const channel = chainIsPrimary ? chain[0]?.channel : lg.channel;
            const fallbacks = chainIsPrimary ? chain.slice(1) : chain;
            if (!event.id || !away || !home || (chainIsPrimary && !channel)) return [];
            let series = null;
            for (const note of comp?.notes ?? []) {
              const m = (note?.headline ?? "").match(/Game \d+/i);
              if (m) { series = m[0]; break; }
            }
            // Gridiron REGULAR-season week (see gridironWeekNumber in
            // src/lib/espn.ts for why the postseason is excluded). Undefined
            // everywhere else, which leaves every other league's query
            // byte-identical to before.
            const week = (lg.sport === "nfl" || lg.sport === "ncaaf" || lg.sport === "cfl") && event.season?.type === 2
              ? event.week?.number
              : undefined;
            // NFL exhibitions (see HL_NFL_PRESEASON_TOKENS). Only the NFL keeps
            // its type-1 slate on the board, so this is false everywhere else.
            const preseason = lg.sport === "nfl" && event.season?.type === 1;
            // ESPN abbreviations key the club channel table (NFL only).
            const awayAbbr = comps.find((c) => c.homeAway === "away")?.team?.abbreviation ?? null;
            const homeAbbr = comps.find((c) => c.homeAway === "home")?.team?.abbreviation ?? null;
            // CFL postseason: the round rides on the first note (the worker
            // passes theScore's game_description through as notes[0]).
            const cflPlayoff = lg.sport === "cfl" && event.season?.type === 3
              ? hlCflPlayoffTokens(comp?.notes?.[0]?.headline)
              : null;
            return [{ id: event.id, away, home, date: event.date, series, channel, week, preseason, awayAbbr, homeAbbr, cflPlayoff, fallbacks }];
          });
      for (const item of items) {
        const key = `${lg.sport}:${item.id}`;
        const { away, home, series, week, preseason, cflPlayoff } = item;
        const isFifa = lg.sport === "fifa";
        // CFL-only: see hlVideoMatchesWeek's requireWeek param. NFL/NCAAF keep
        // the old "no token = untouched" behavior — their postseason and some
        // per-team-channel cuts genuinely carry no week.
        const cflWeekRequired = lg.sport === "cfl";
        const matchup = hlMatchupFingerprint(away, home);
        const rawPrev = games[key] ?? {};
        let prev = rawPrev;
        // ESPN event IDs are usually stable, but if one is ever repointed to a
        // different matchup, no cached YouTube ID may survive that identity
        // change. Delete first so a failed re-resolve cannot leave stale IDs.
        if (prev.matchup && prev.matchup !== matchup) {
          console.warn(`HIGHLIGHT-MATCHUP-CHANGED ${key}: ${prev.matchup} -> ${matchup}; discarding cached IDs`);
          delete games[key];
          prev = {};
        }
        const dateStr = hlDateStr(item.date);
        const competition = HL_COMPETITION[lg.sport] ?? null;
        const compTokens = preseason ? HL_NFL_PRESEASON_TOKENS : (cflPlayoff ?? HL_COMPETITION_TOKENS[lg.sport] ?? null);
        const preferExtended = !!competition;
        const primaryChannel = item.channel;
        const secondaryChannel = isFifa ? "FOX Sports" : (lg.secondaryChannel ?? primaryChannel);
        const sameChannel = (actual, expected) => !!actual && !!expected && actual.toLowerCase() === expected.toLowerCase();
        // The official slot may come from the primary channel or, when that
        // skipped the game, from a fallback in this game's chain. Each fallback
        // carries the title token its lookups and revalidation must require.
        const fallbacks = item.fallbacks ?? [];
        const carriedFallback = fallbacks.find((f) => sameChannel(prev.officialChannel, f.channel)) ?? null;
        const carriedOfficial = sameChannel(prev.officialChannel, primaryChannel) || carriedFallback ? prev.official : null;
        let officialChannel = carriedFallback ? carriedFallback.channel : primaryChannel;
        const officialTokensFor = (fb) => (fb && !compTokens?.length ? fb.titleTokens : compTokens);
        const carriedExtended = sameChannel(prev.extendedChannel, secondaryChannel) ? prev.extended : null;
        // 1st button (official/primary) and 2nd button (extended/secondary),
        // deduped so the two buttons never play the same clip — mirrors the
        // concurrent resolve + collision re-resolve in GameHighlights.tsx.
        let prevOfficial = carriedOfficial;
        let prevExtended = carriedExtended;
        // Slots refused by the upload-date gate this run. A resolve MISS and an
        // age REJECT look the same by the time the entry is assembled — both
        // leave the slot null — but they must not be treated the same. See the
        // HIGHLIGHT-AGE-DROP branch at the write below.
        let ageRejected = 0;
        if (prevOfficial && prevExtended && prevOfficial === prevExtended) {
          console.warn(`HIGHLIGHT-DUPLICATE-REJECT ${key} extended=${prevExtended}`);
          prevExtended = null;
        }

        // Revalidate every carried slot against both its uploader and matchup.
        // A channel marker proves provenance, not that the clip is for this game.
        if (prevOfficial && (!(await hlVideoMatchesChannel(prevOfficial, officialChannel)) || !(await hlVideoMatchesTeams(prevOfficial, away, home)) || !(await hlVideoMatchesWeek(prevOfficial, week, cflWeekRequired)) || !(await hlVideoMatchesComp(prevOfficial, officialTokensFor(carriedFallback))))) {
          console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} official=${prevOfficial} (${away} vs ${home}${week ? ` wk${week}` : ""})`);
          prevOfficial = null;
        }
        if (prevOfficial && !(await hlVideoMatchesDate(prevOfficial, item.date))) {
          console.warn(`HIGHLIGHT-AGE-REJECT ${key} official=${prevOfficial} (${away} vs ${home} ${dateStr})`);
          prevOfficial = null;
          ageRejected++;
        }
        if (prevExtended && (!(await hlVideoMatchesChannel(prevExtended, secondaryChannel)) || !(await hlVideoMatchesTeams(prevExtended, away, home)) || !(await hlVideoMatchesWeek(prevExtended, week, cflWeekRequired)) || !(await hlVideoMatchesComp(prevExtended, compTokens)))) {
          console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} extended=${prevExtended} (${away} vs ${home}${week ? ` wk${week}` : ""})`);
          prevExtended = null;
        }
        if (prevExtended && !(await hlVideoMatchesDate(prevExtended, item.date))) {
          console.warn(`HIGHLIGHT-AGE-REJECT ${key} extended=${prevExtended} (${away} vs ${home} ${dateStr})`);
          prevExtended = null;
          ageRejected++;
        }

        let official = prevOfficial ?? null;
        if (!official) {
          officialChannel = primaryChannel;
          official = await hlResolve(away, home, dateStr, series, primaryChannel, undefined, competition, false, week, compTokens);
          if (official && (!(await hlVideoMatchesTeams(official, away, home)) || !(await hlVideoMatchesWeek(official, week, cflWeekRequired)) || !(await hlVideoMatchesComp(official, compTokens)))) {
            console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} newly-resolved official=${official} (${away} vs ${home})`);
            official = null;
          }
          if (official && !(await hlVideoMatchesDate(official, item.date))) {
            console.warn(`HIGHLIGHT-AGE-REJECT ${key} newly-resolved official=${official} (${away} vs ${home} ${dateStr})`);
            official = null;
            ageRejected++;
          }
          for (const fb of official ? [] : fallbacks) {
            const tokens = officialTokensFor(fb);
            const id = await hlResolve(away, home, dateStr, series, fb.channel, undefined, competition, false, week, tokens);
            if (!id) continue;
            if (!(await hlVideoMatchesTeams(id, away, home)) || !(await hlVideoMatchesWeek(id, week, cflWeekRequired)) || !(await hlVideoMatchesComp(id, tokens))) {
              console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} fallback ${fb.channel}=${id} (${away} vs ${home})`);
              continue;
            }
            if (!(await hlVideoMatchesDate(id, item.date))) {
              console.warn(`HIGHLIGHT-AGE-REJECT ${key} fallback ${fb.channel}=${id} (${away} vs ${home} ${dateStr})`);
              ageRejected++;
              continue;
            }
            official = id;
            officialChannel = fb.channel;
            console.log(`${lg.sport} fallback → ${fb.channel} ${id} (${away} vs ${home})`);
            break;
          }
        }
        // Every channel lookup missed: ask FotMob (soccer only, see
        // hlFotmobOfficial). Its channel is whatever uploader FotMob linked —
        // a club, a league or a broadcaster — confirmed through oEmbed.
        let officialSrc = null;
        let officialFotmob = null;
        if (!official) {
          const fotmob = await hlFotmobOfficial(lg.sport, key, item, away, home, prev);
          if (fotmob && fotmob.id !== prevExtended) {
            official = fotmob.id;
            officialChannel = fotmob.channel;
            officialSrc = "fotmob";
            officialFotmob = fotmob;
          }
        }
        let extended = prevExtended ?? null;
        if (!extended) {
          extended = await hlResolve(away, home, dateStr, series, secondaryChannel, undefined, competition, preferExtended, week, compTokens);
          if (extended && official && extended === official) {
            extended = await hlResolve(away, home, dateStr, series, secondaryChannel, [official], competition, preferExtended, week, compTokens);
          }
          if (extended && (!(await hlVideoMatchesTeams(extended, away, home)) || !(await hlVideoMatchesWeek(extended, week, cflWeekRequired)) || !(await hlVideoMatchesComp(extended, compTokens)))) {
            console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} newly-resolved extended=${extended} (${away} vs ${home})`);
            extended = null;
          }
          if (extended && !(await hlVideoMatchesDate(extended, item.date))) {
            console.warn(`HIGHLIGHT-AGE-REJECT ${key} newly-resolved extended=${extended} (${away} vs ${home} ${dateStr})`);
            extended = null;
            ageRejected++;
          }
        }
        // Slot 1 missed but slot 2 hit on the same channel: that is the
        // league's normal cut, so give it the 1st button (no lone "Alt").
        {
          const moved = promoteLoneExtended({ official, officialChannel, extended, primaryChannel, secondaryChannel });
          if (moved.promoted) {
            ({ official, officialChannel, extended } = moved);
            console.log(`HIGHLIGHT-PROMOTED ${key} extended→official ${official} (${away} vs ${home})`);
          }
        }
        let telemundo = isFifa && sameChannel(prev.telemundoChannel, "Telemundo Deportes") ? (prev.telemundo ?? null) : null;
        if (telemundo && (telemundo === official || telemundo === extended)) telemundo = null;
        if (telemundo && !(await hlIsTelemundoVideo(telemundo))) telemundo = null;
        if (telemundo && !(await hlVideoMatchesTeams(telemundo, away, home))) telemundo = null;
        if (isFifa && !telemundo) {
          telemundo = await hlResolveTelemundoWorldCup(away, home, dateStr, series);
          if (telemundo && (telemundo === official || telemundo === extended)) telemundo = null;
          if (telemundo && !(await hlIsTelemundoVideo(telemundo))) telemundo = null;
          if (telemundo && !(await hlVideoMatchesTeams(telemundo, away, home))) {
            console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} newly-resolved telemundo=${telemundo} (${away} vs ${home})`);
            telemundo = null;
          }
        }
        let telemundoExtended = isFifa && sameChannel(prev.telemundoExtendedChannel, "Telemundo Deportes") ? (prev.telemundoExtended ?? null) : null;
        if (telemundoExtended && (telemundoExtended === telemundo || telemundoExtended === official || telemundoExtended === extended)) {
          telemundoExtended = null;
        }
        if (telemundoExtended && !(await hlIsTelemundoVideo(telemundoExtended))) telemundoExtended = null;
        if (telemundoExtended && !(await hlVideoMatchesTeams(telemundoExtended, away, home))) telemundoExtended = null;

        // NFL club short cut (regular season only). The league's per-game cut
        // runs 14–21 min; the two clubs post a 5–10 min package within hours,
        // embed-blocked exactly like the league's, so it is a second hand-off
        // button (GameHighlights renders "NFL 16m" + "Lions 10m"). Resolved
        // through the worker like every other slot — channel-strict, week-gated —
        // and the shorter club package wins when both clubs post. Result-bearing
        // club titles ("Bears' 59-37 win…") are dropped by the worker's spoiler
        // gates by design; that coverage cost is accepted.
        let club = null;
        let clubChannel = null;
        let clubDurationSec = null;
        let officialDurationSec = null;
        let extendedDurationSec = null;
        const clubEligible = lg.sport === "nfl" && !preseason && !!week;
        if (clubEligible) {
          const clubChannels = [...new Set([item.homeAbbr, item.awayAbbr]
            .map((a) => (a ? HL_NFL_CLUB_CHANNELS[String(a).toUpperCase()] : null))
            .filter(Boolean))];
          const carriedClub = prev.club && clubChannels.some((c) => sameChannel(prev.clubChannel, c)) ? prev.club : null;
          const carriedDuration = carriedClub ? (Number.isFinite(prev.clubDurationSec) ? prev.clubDurationSec : await fetchYtDurationSec(carriedClub)) : null;
          const carriedLongEnough = !Number.isFinite(carriedDuration) || carriedDuration >= HL_CLUB_MIN_SEC;
          if (carriedClub && carriedLongEnough && await hlVideoMatchesChannel(carriedClub, prev.clubChannel) && await hlVideoMatchesTeams(carriedClub, away, home) && await hlVideoMatchesWeek(carriedClub, week)) {
            club = carriedClub;
            clubChannel = prev.clubChannel;
            clubDurationSec = carriedDuration;
          } else if (carriedClub) {
            console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} club=${carriedClub} (${away} vs ${home} wk${week})`);
          }
          const recentEnough = (now - new Date(item.date).getTime()) < HL_CLUB_DAYS * 86400000;
          if (!club && recentEnough && clubChannels.length) {
            const candidates = [];
            for (const channel of clubChannels) {
              const id = await hlFetchId(hlQuery(away, home, dateStr, series, competition, false), { channel, strict: true, week, exclude: [official, extended].filter(Boolean) });
              if (!id) continue;
              if (!(await hlVideoMatchesChannel(id, channel)) || !(await hlVideoMatchesTeams(id, away, home)) || !(await hlVideoMatchesWeek(id, week))) {
                console.warn(`HIGHLIGHT-MATCHUP-REJECT ${key} newly-resolved club=${id} (${channel})`);
                continue;
              }
              const durationSec = await fetchYtDurationSec(id);
              if (Number.isFinite(durationSec) && durationSec < HL_CLUB_MIN_SEC) {
                console.warn(`HIGHLIGHT-CLUB-SHORT-REJECT ${key} club=${id} (${channel}) ${durationSec}s`);
                continue;
              }
              candidates.push({ videoId: id, channel, durationSec });
            }
            const best = pickShorterClub(candidates);
            if (best) {
              club = best.videoId;
              clubChannel = best.channel;
              clubDurationSec = best.durationSec;
              console.log(`nfl club → ${clubChannel} ${club} ${Number.isFinite(clubDurationSec) ? `${clubDurationSec}s` : "?s"} (${away} vs ${home} wk${week})`);
            }
          }
        }

        // Every league's official clip carries its length, not just the NFL's:
        // the button reads "9m" and the league name is already the column it
        // sits in. Costs no extra network - hlVideoMatchesDate above already
        // read this id's watch page, fetchYtWatchMeta keeps every good read
        // on disk, and an unchanged carried id short-circuits on rawPrev.
        if (official) {
          officialDurationSec = official === rawPrev.official && Number.isFinite(rawPrev.officialDurationSec)
            ? rawPrev.officialDurationSec
            : await fetchYtDurationSec(official);
        }
        // Same for the 2nd button, so it reads "9m" instead of "Alt".
        if (extended) {
          extendedDurationSec = extended === rawPrev.extended && Number.isFinite(rawPrev.extendedDurationSec)
            ? rawPrev.extendedDurationSec
            : await fetchYtDurationSec(extended);
        }

        const entry = { t: now, teams: [away, home], matchup, eventDate: item.date };
        if (official) {
          entry.official = official;
          entry.officialChannel = officialChannel;
          if (Number.isFinite(officialDurationSec)) entry.officialDurationSec = officialDurationSec;
          if (officialSrc) entry.src = officialSrc;
          if (officialFotmob?.embedBlocked) {
            entry.officialEmbeddable = false;
            if (officialFotmob.titleScore) entry.officialTitleScore = true;
          }
        }
        if (club) {
          entry.club = club;
          entry.clubChannel = clubChannel;
          if (Number.isFinite(clubDurationSec)) entry.clubDurationSec = clubDurationSec;
        }
        if (extended) {
          entry.extended = extended;
          entry.extendedChannel = secondaryChannel;
          if (Number.isFinite(extendedDurationSec)) entry.extendedDurationSec = extendedDurationSec;
        }
        if (primaryChannel || secondaryChannel || telemundo || telemundoExtended) entry.sourcePolicy = "official-channel";
        if (telemundo) {
          entry.telemundo = telemundo;
          entry.telemundoChannel = "Telemundo Deportes";
        }
        if (telemundoExtended) {
          entry.telemundoExtended = telemundoExtended;
          entry.telemundoExtendedChannel = "Telemundo Deportes";
        }
        if (entry.official || entry.extended || entry.telemundo || entry.telemundoExtended || entry.club) {
          games[key] = entry;
          const changedSlots = ["official", "extended", "telemundo", "telemundoExtended", "club"]
            .filter((slot) => entry[slot] && entry[slot] !== rawPrev[slot]);
          if (changedSlots.length) {
            resolved++;
            console.log(`HIGHLIGHT-RESOLVED ${key} ${away} vs ${home}: ${changedSlots.map((slot) => `${slot}=${entry[slot]}`).join(" ")}`);
          } else if (isFifa && !rawPrev.matchup) {
            console.log(`HIGHLIGHT-MATCHUP-STAMPED ${key} ${matchup}`);
          }
        } else if (ageRejected) {
          // Every slot this game had was refused as an earlier season's clip,
          // and nothing replaced it. The guard above deliberately leaves the
          // carried record alone when an entry comes out empty, because a
          // resolve MISS (no recap posted yet, a flaky lookup) must not drop a
          // good cached id. An age REJECT is the opposite: a positive finding
          // that the cached id is WRONG. Without this branch the carry-forward
          // at the top of bakeGameHighlights hands the rejected id straight
          // back into the manifest, which is exactly what happened on the
          // 2026-09-20 bake — 88 ids were rejected and 18 of them were still
          // being served afterwards.
          delete games[key];
          console.warn(`HIGHLIGHT-AGE-DROP ${key} (${away} vs ${home} ${dateStr})`);
        }
      }
    }
  }

  if (scoreboardResponses === 0) {
    throw new Error("all highlight scoreboard requests failed; preserving the prior manifest");
  }

  if (HL_FOTMOB_ON) await hlFotmobFinish();

  const ageLine = `HIGHLIGHT-AGE-UNREADABLE n=${hlAgeUnreadable}/${hlAgeChecks} (upload date unreadable; those ids were KEPT)`;
  if (hlAgeUnreadable > 0) console.warn(ageLine); else console.log(ageLine);

  await mkdir(dirname(HL_OUT_PATH), { recursive: true });
  await writeFile(HL_OUT_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), games }));
  console.log(`wrote ${HL_OUT_PATH} (${Object.keys(games).length} games, ${resolved} newly resolved)`);
}

// ── League-wide recap lookout ─────────────────────────────────────
// Finds the newest LEAGUE-WIDE recap per series (NFL "Top 15 Plays From Week
// N", MLB FastCast / Real Fast, NBA "Top 10 Plays of the Night", EPL / MLS
// "Every goal") and writes /news/recaps.json for LeagueRecapCard, which sits on
// top of each league column on past-date boards. Series table, regexes and the
// pure date/window helpers live in scripts/lib/recaps.mjs so the unit tests can
// exercise them without running this file.
//
// Standalone like bakeGameHighlights (not a `jobs` entry): the runner below
// honours --only=recaps / --skip=recaps. Reads the prior file (local + live)
// and carries records forward, so a run from an IP YouTube or mlb.com refuses
// (GHA) leaves the mini's good records in place instead of writing an empty
// file over them.
const RECAPS_OUT_PATH = `${OUT_DIR}/${RECAP_OUT_NAME}.json`;

function recapIdentity(rec) {
  return `${rec.sport}:${rec.key}:${rec.cadence === "weekly" ? `w${rec.coversWeek}` : rec.coversDate}`;
}

async function loadPriorRecaps() {
  let local = null;
  try {
    local = JSON.parse(await readFile(RECAPS_OUT_PATH, "utf8"));
  } catch { /* fresh checkout / ignored generated file */ }
  let live = null;
  // A 404 is "never baked yet" (safe to write the first file); anything else
  // that is not a 200 means the prior could not be read, which matters below.
  let liveFailed = false;
  try {
    const res = await fetch(`https://hidescore.com/news/${RECAP_OUT_NAME}.json?ts=${Date.now()}`, { headers: { "User-Agent": UA } });
    if (res.ok) live = await res.json();
    else if (res.status !== 404) liveFailed = true;
  } catch { liveFailed = true; }
  // Same entry-by-entry merge as loadPriorHighlights: either copy can fill a
  // gap, the newer timestamp wins.
  const byId = new Map();
  for (const source of [live, local]) {
    for (const list of Object.values(source?.recaps ?? {})) {
      for (const rec of Array.isArray(list) ? list : []) {
        if (!rec?.sport || !rec?.key) continue;
        const id = recapIdentity(rec);
        if (!byId.has(id) || (rec.t ?? 0) >= (byId.get(id).t ?? 0)) byId.set(id, rec);
      }
    }
  }
  return { byId, liveFailed, localOk: !!local?.recaps };
}

// "lengthSeconds":"596" + "publishDate" off the watch page. Every good read is
// kept on disk across runs (see scripts/lib/ytWatchMeta.mjs), so each id costs
// one successful fetch, ever. The file is a dotfile so the mini's
// `public/news/*.json` R2 upload loop skips it. HL_WATCH_CAP overrides the
// per-run live-fetch cap.
const YT_WATCH_META_PATH = `${OUT_DIR}/.yt-watch-meta.json`;
const ytWatchMeta = createWatchMetaStore({
  load: () => JSON.parse(readFileSync(YT_WATCH_META_PATH, "utf8")),
  save: async (data) => {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(YT_WATCH_META_PATH, JSON.stringify(data));
  },
  fetchHtml: (id) => getText(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`),
  parseDuration: parseWatchPageLengthSeconds,
  parsePublished: parseWatchPagePublishMs,
  liveCap: Number.parseInt(process.env.HL_WATCH_CAP ?? "", 10) || 250,
});
async function fetchYtWatchMeta(id) {
  return ytWatchMeta.get(id);
}
// Per-video embed verdict for a recap (see parseEmbedPlayable). The Referer is
// the production origin because embed permission is judged against it.
async function fetchYtEmbeddable(id) {
  try {
    const res = await fetch(`https://www.youtube.com/embed/${id}`, { headers: { "User-Agent": UA, Referer: "https://hidescore.com/" } });
    return res.ok ? parseEmbedPlayable(await res.text()) : null;
  } catch {
    return null;
  }
}

// Whether a clip plays on youtube.com from the mini (see parseWatchPagePlayable).
// Asked only for a FotMob clip that refuses embeds — a handful per bake, so it
// reads the page directly instead of going through the watch-meta disk cache.
async function fetchYtWatchPlayable(id) {
  try {
    return parseWatchPagePlayable(await getText(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}

async function fetchYtDurationSec(id) {
  return (await fetchYtWatchMeta(id)).durationSec;
}

// Channel-scoped results page → candidates. Newest-first order is NOT
// guaranteed here (no cookies → no date sort), which is why the caller ranks by
// parsed week / title date / relative age instead of position.
async function fetchYtChannelSearch(handle, query) {
  const url = `https://www.youtube.com/@${encodeURIComponent(handle)}/search?query=${encodeURIComponent(query)}`;
  const html = await getText(url);
  const now = Date.now();
  return parseYtVideoRenderers(html).map((v) => ({ ...v, publishedMs: parseRelativeTime(v.publishedTimeText, now) }));
}

// Resolve one YouTube series: RSS first (exact publish time, 10 newest), then
// the channel search page, then the oEmbed uploader check before anything is
// accepted. Returns { videoId, week, titleDate, durationSec, publishedMs } or null.
async function resolveYtRecapSeries(series, seasonYear) {
  let pick = null;
  try {
    const rss = await fetchYouTubeChannelVideos(series.channelId, "recap");
    const matches = rss.map((it) => matchSeriesTitle(series, {
      videoId: it.id, title: it.headline, channel: series.channelName,
      publishedMs: it.published ? Date.parse(it.published) : null,
    }, { seasonYear }));
    pick = pickNewest(matches);
  } catch { /* RSS down → search page */ }
  if (!pick && series.handle && series.searchQuery) {
    try {
      const results = await fetchYtChannelSearch(series.handle, series.searchQuery);
      pick = pickNewest(results.map((c) => matchSeriesTitle(series, c, { seasonYear })));
    } catch { /* results page down → none this run */ }
  }
  if (!pick) return null;
  // The results page sometimes omits a card's age. Without one the pick could
  // be months old (a March "Morning Lineup" surfaced with no age on 9/14 and
  // would have been filed under today), so read the watch page's publishDate
  // before trusting it.
  if (!Number.isFinite(pick.publishedMs)) pick.publishedMs = (await fetchYtWatchMeta(pick.videoId)).publishedMs;
  // Out of season the newest cut is months old (NBA in September). It could
  // never cover a day the card shows, so stop before the oEmbed fetch. The
  // write-time prune below is the second net.
  if (Number.isFinite(pick.publishedMs) && Date.now() - pick.publishedMs > (RECAP_TTL_DAYS + 7) * 86400000) {
    console.log(`recaps ${series.channelName} ${series.key}: newest is ${Math.round((Date.now() - pick.publishedMs) / 86400000)}d old, skipping`);
    return null;
  }
  const meta = await hlOembedMeta(pick.videoId);
  if (String(meta?.author ?? "").toLowerCase() !== series.channelName.toLowerCase()) {
    console.warn(`RECAP-CHANNEL-REJECT ${series.channelName} ${series.key} ${pick.videoId} author=${meta?.author ?? "?"}`);
    return null;
  }
  if (!Number.isFinite(pick.durationSec)) pick.durationSec = await fetchYtDurationSec(pick.videoId);
  return pick;
}

// mlb.com topic page → the newest card whose slug matches the series. The page
// lists newest first and its slug names the WEEKDAY, not the date.
async function resolveMlbRecapSeries(series, todayYmd) {
  const html = await getText(series.topicUrl);
  const linkRe = /<a[^>]+href="\/video\/([^"?/]+)"/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const slug = m[1];
    const sm = slug.match(series.slugRx);
    if (!sm) continue;
    const coversDate = weekdayCoversDate(sm[series.weekdayGroup], todayYmd);
    if (!coversDate) continue;
    const meta = await fetchMLBVideoMeta(slug);
    if (!meta?.playbackUrl) continue;
    return { slug, coversDate, ...meta };
  }
  return null;
}

// ESPN's regular-season schedule for one NFL week, cached per run.
const NFL_WEEK_EVENTS = new Map();
async function fetchNflWeekEvents(seasonYear, week) {
  const k = `${seasonYear}:${week}`;
  if (!NFL_WEEK_EVENTS.has(k)) {
    let events = [];
    try {
      const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${seasonYear}&seasontype=2&week=${week}`);
      events = Array.isArray(d?.events) ? d.events : [];
    } catch { /* window falls back to publish-day math */ }
    NFL_WEEK_EVENTS.set(k, events);
  }
  return NFL_WEEK_EVENTS.get(k);
}

async function bakeLeagueRecaps() {
  const now = Date.now();
  const todayYmd = hlEtYmd(0);
  const cutoff = hlEtYmd(-RECAP_TTL_DAYS);
  const prior = await loadPriorRecaps();
  // No prior at all to carry (fresh GHA checkout, live copy unreadable): a
  // partial result from an IP YouTube / mlb.com refuse would be uploaded over
  // the mini's good file, so leave the live file alone this run.
  if (prior.liveFailed && !prior.localOk) {
    console.warn(`${RECAPS_OUT_PATH}: live prior unreadable and no local copy — skipping this run`);
    return;
  }
  const byId = new Map();
  for (const [id, rec] of prior.byId) {
    const end = rec.cadence === "weekly" ? rec.windowEnd : rec.coversDate;
    if (!end || end < cutoff) continue;
    // A daily record dated today or later with no upload time was stamped from
    // an older run's bake clock, not from the cut itself (the `?? now` fallback
    // removed below). It is the premature "Best of the day" pill, so it does
    // not survive the carry.
    if (rec.cadence !== "weekly" && !rec.published && rec.coversDate >= todayYmd) {
      console.log(`recaps: dropping undated ${rec.sport}:${rec.key} stamped ${rec.coversDate}`);
      continue;
    }
    byId.set(id, rec);
  }

  // Season year the NFL scoreboard reports — the title's "| 2026 NFL Season"
  // token must agree, or last season's Week 1 wins the regex.
  let nflSeasonYear = null;
  try {
    const sb = await getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    nflSeasonYear = Number(sb?.season?.year) || null;
  } catch { /* season token check is skipped this run */ }

  let resolved = 0;
  let attempted = 0;
  for (const [sport, list] of Object.entries(RECAP_SERIES)) {
    const found = [];
    for (const series of list) {
      if (!series.enabled) continue;
      attempted++;
      const tag = `recaps ${sport} ${series.key}`;
      try {
        let rec = null;
        if (series.source === "mlbcom") {
          const hit = await resolveMlbRecapSeries(series, todayYmd);
          if (hit) {
            rec = {
              sport, key: series.key, heading: series.heading, label: series.label, cadence: "daily",
              coversDate: hit.coversDate, playbackUrl: hit.playbackUrl, poster: hit.poster,
              pageUrl: `https://www.mlb.com/video/${hit.slug}`, channel: "MLB.com",
              durationSec: hit.durationSec, published: hit.uploadDate, sourcePolicy: "mlb.com",
            };
          }
        } else {
          const seasonYear = sport === "nfl" ? nflSeasonYear : sport === "epl" ? eplSeasonYear() : null;
          const hit = await resolveYtRecapSeries(series, seasonYear);
          if (hit) {
            rec = {
              sport, key: series.key, cadence: series.cadence,
              heading: fillHeading(series.heading, hit.week), label: series.label,
              videoId: hit.videoId, pageUrl: `https://www.youtube.com/watch?v=${hit.videoId}`,
              channel: series.channelName, durationSec: hit.durationSec,
              published: hit.publishedMs ? new Date(hit.publishedMs).toISOString() : undefined,
              sourcePolicy: "official-channel",
            };
            if (series.cadence === "weekly") {
              rec.coversWeek = hit.week;
              let win = null;
              if (sport === "nfl" && nflSeasonYear && hit.week) {
                win = nflWeekWindow(
                  await fetchNflWeekEvents(nflSeasonYear, hit.week),
                  await fetchNflWeekEvents(nflSeasonYear, hit.week + 1),
                  await fetchNflWeekEvents(nflSeasonYear, hit.week + 2),
                );
              }
              if (!win) win = weeklyWindowFromPublished(etYmd(hit.publishedMs ?? now));
              Object.assign(rec, win);
            } else if (hit.titleDate) {
              rec.coversDate = hit.titleDate;
            } else if (hit.publishedMs) {
              rec.coversDate = dailyCoversDate(new Date(hit.publishedMs).toISOString());
            } else {
              // No date in the title and no upload time → the day this cut
              // covers is unknown. Falling back to `now` stamped it with the
              // bake day, which put a "Best of the day" pill on top of a slate
              // still being played (Jacob 9/20, MLB Morning Lineup). A daily
              // record with no readable date is dropped instead.
              console.log(`${tag} → no publish time for a daily cut, skipped`);
              rec = null;
            }
          }
        }
        if (!rec) {
          console.log(`${tag} → none`);
          continue;
        }
        const end = rec.cadence === "weekly" ? rec.windowEnd : rec.coversDate;
        if (!end || end < cutoff) {
          console.log(`${tag} → stale (${end || "no date"}), skipped`);
          continue;
        }
        const id = recapIdentity(rec);
        const prev = byId.get(id);
        // A carried record keeps its first-seen timestamps and duration; only a
        // different id for the same coverage replaces it.
        const sameVideo = prev && (prev.videoId ?? prev.pageUrl) === (rec.videoId ?? rec.pageUrl);
        // Re-probed every run while the series is current: a rights holder
        // can flip embedding either way. A failed probe keeps the last verdict.
        const embeddable = rec.videoId ? (await fetchYtEmbeddable(rec.videoId)) ?? (sameVideo ? prev.embeddable : undefined) : undefined;
        const merged = stripRecapRecord({
          ...rec,
          ...(typeof embeddable === "boolean" ? { embeddable } : {}),
          t: sameVideo ? prev.t : now,
          published: sameVideo && prev.published ? prev.published : rec.published,
          durationSec: Number.isFinite(rec.durationSec) ? rec.durationSec : prev?.durationSec,
        });
        found.push(merged);
        resolved++;
        const dur = Number.isFinite(merged.durationSec) ? `${Math.floor(merged.durationSec / 60)}:${String(merged.durationSec % 60).padStart(2, "0")}` : "?:??";
        const cover = merged.cadence === "weekly" ? `week ${merged.coversWeek} (${merged.windowStart}–${merged.windowEnd})` : merged.coversDate;
        console.log(`${tag} → ${merged.videoId ?? merged.pageUrl} ${dur} ${cover}`);
      } catch (e) {
        console.warn(`${tag} FAILED: ${e?.message ?? e}`);
      }
    }
    // A fallback-only series (MLB's YouTube "Morning Lineup") is written only
    // for a date no primary series covers.
    const primaryDates = new Set(found.filter((r) => !list.find((s) => s.key === r.key)?.fallbackOnly).map((r) => r.coversDate));
    for (const rec of found) {
      const series = list.find((s) => s.key === rec.key);
      if (series?.fallbackOnly && primaryDates.has(rec.coversDate)) continue;
      byId.set(recapIdentity(rec), rec);
    }
  }

  // Nothing found AND no prior to carry: keep whatever is live rather than
  // publishing an empty file (same empty-guard as writeFeed).
  if (resolved === 0 && byId.size === 0) {
    if (attempted > 0) console.warn(`${RECAPS_OUT_PATH}: 0 series resolved and no prior records — skipping write`);
    return;
  }

  const recaps = {};
  for (const rec of byId.values()) (recaps[rec.sport] ??= []).push(rec);
  for (const list of Object.values(recaps)) {
    list.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
  }
  await mkdir(dirname(RECAPS_OUT_PATH), { recursive: true });
  await writeFile(RECAPS_OUT_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), recaps }));
  console.log(`wrote ${RECAPS_OUT_PATH} (${byId.size} records, ${resolved} resolved this run)`);
}

// ── Write ─────────────────────────────────────────────────────────

async function writeFeed(name, items) {
  const path = `${OUT_DIR}/${name}.json`;
  await mkdir(dirname(path), { recursive: true });
  // Empty-guard: a 0-item result almost always means the scrape failed (wrong
  // IP variant, markup change, transient fetch error). Skip the write so the
  // previous good file stays live until a successful run replaces it.
  if (items.length === 0) {
    console.log(`skipped ${path} (0 items — preserving prior file)`);
    return;
  }
  // Media-coverage guard (reddit only). Reddit/redlib silently changes how a
  // post type renders every few months — the video host keeps moving (streamja →
  // streamin → streamff), and image posts now arrive as redlib "no_thumbnail"
  // anchors — and each time the extractor quietly stops capturing that media and
  // cards go blank until someone eyeballs the app (Jacob: "happened multiple
  // times"). A "blank" card has no image, video, youtube, OR selftext: just a
  // headline that links out. Defenses:
  //   1. Video flap: carry a still-fresh prior video onto the SAME post ID when
  //      this bake misses its media. Never freeze the whole listing: current
  //      hot posts matter more than retaining videos that fell out of /hot.
  //   1b. Catastrophic extractor break: this bake is mostly blank but a fresh
  //      prior was healthy → keep prior and shout MEDIA-REGRESSION in the log.
  //   2. Always log coverage so a *partial* degradation (e.g. images vanish while
  //      video still works, the 6/18 r/soccer bug) is visible to the health-check
  //      instead of failing silently. Grep the cron log for MEDIA-REGRESSION /
  //      MEDIA-LOW to alert.
  const isBlank = (i) => !i.imageUrl && !i.imageFullUrl && !i.videoUrl && !i.youtubeVideoId && !i.body;
  let blankFrac = items.length ? items.filter(isBlank).length / items.length : 1;
  let newHasVideo = items.some((i) => i.videoUrl || i.youtubeVideoId);
  if (name.startsWith("reddit-")) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8"));
      const prevItems = prev.items || [];
      const prevHasVideo = prevItems.some((i) => i.videoUrl || i.youtubeVideoId);
      const prevBlankFrac = prevItems.length ? prevItems.filter(isBlank).length / prevItems.length : 1;
      const ageH = prev.fetchedAt ? (Date.now() - Date.parse(prev.fetchedAt)) / 3600e3 : Infinity;
      if (!newHasVideo && prevHasVideo && ageH < 6) {
        const priorById = new Map(prevItems.map((item) => [item.id, item]));
        let carried = 0;
        items = items.map((item) => {
          const prior = priorById.get(item.id);
          if (!prior) return item;
          const carryVideoUrl = !item.videoUrl && !!prior.videoUrl;
          const carryYoutubeId = !item.youtubeVideoId && !!prior.youtubeVideoId;
          if (!carryVideoUrl && !carryYoutubeId) return item;
          carried++;
          return {
            ...item,
            ...(carryVideoUrl ? { videoUrl: prior.videoUrl } : {}),
            ...(carryYoutubeId ? { youtubeVideoId: prior.youtubeVideoId } : {}),
          };
        });
        newHasVideo = items.some((i) => i.videoUrl || i.youtubeVideoId);
        blankFrac = items.length ? items.filter(isBlank).length / items.length : 1;
        if (carried > 0) {
          console.log(`MEDIA-CARRY ${path}: restored video on ${carried} matching post(s) from ${ageH.toFixed(1)}h-old prior; writing fresh hot listing`);
        } else {
          console.warn(`MEDIA-VIDEO-LOW ${path}: fresh hot listing has 0 video and no matching prior video posts; writing fresh listing`);
        }
      }
      if (blankFrac >= 0.5 && prevBlankFrac < 0.25 && ageH < 6) {
        console.warn(`MEDIA-REGRESSION ${path}: ${(blankFrac * 100).toFixed(0)}% blank this bake vs ${(prevBlankFrac * 100).toFixed(0)}% prior (age ${ageH.toFixed(1)}h) — extractor likely broke, KEEPING PRIOR`);
        return;
      }
    } catch { /* no prior file / unreadable — fall through and write the new one */ }
  }
  if (name.startsWith("reddit-") && blankFrac >= 0.35) {
    console.warn(`MEDIA-LOW ${path}: ${(blankFrac * 100).toFixed(0)}% of cards are blank (no image/video/text) — extractor may be missing a media type`);
  }
  const payload = { fetchedAt: new Date().toISOString(), items };
  await writeFile(path, JSON.stringify(payload));
  console.log(`wrote ${path} (${items.length} items)`);
}

// --only-reddit: scoped run for the Mac mini cron (residential IP, can reach
// Reddit when GH Actions can't). Filters jobs to reddit-* and skips the
// YouTube cache I/O entirely so the two crons never fight over the same files.
const ONLY_REDDIT = process.argv.includes("--only-reddit");
// --only=<feed>[,<feed>] — one-off manual refresh of a single feed (e.g.
// --only=espn-top after fixing the scrape regex). Skips the YT cache too.
const ONLY_LIST = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? [];
// --skip=<feed>[,<feed>] — exclude specific feeds from the run. Used by the
// GH Actions workflow to skip espn-top (GHA IPs miss the headlineStack block;
// the residential-IP Mac mini cron owns this feed instead).
const SKIP_LIST = process.argv
  .find((a) => a.startsWith("--skip="))
  ?.slice("--skip=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? [];

const jobs = [
  // Official league sites
  ["mlb", fetchMLB],
  ["mlb-videos", fetchMLBVideos],
  ["nba", fetchNBA],
  ["nba-videos", fetchNBAVideos],
  ["wnba", fetchWNBA],
  ["wnba-videos", fetchWNBAVideos],
  ["nhl", fetchNHL],
  ["nhl-videos", fetchNHLVideos],

  // Leagues with no usable .com video feed lead their column with their
  // official YouTube channel instead (plays natively via youtubeVideoId).
  // World Cup = FIFA's channel; MLS = Major League Soccer's channel.
  ["fifa-videos", () => fetchYouTubeChannelVideos("UCpcTrCXblq78GZrTUTLWeBw", "World Cup Top Videos")],
  ["mls-videos", () => fetchYouTubeChannelVideos("UCSZbXT5TLLW_i-5W8FZpFsg", "MLS Top Videos")],

  // Editorial substitutes — world-class, geo-open RSS for the soccer / tennis /
  // golf columns, where no league .com publishes a usable feed. Both carry
  // per-item images. Wired into leagueSourceCascade() in src/lib/news.ts.
  ["bbc-football", () => fetchEditorialRSS("https://feeds.bbci.co.uk/sport/football/rss.xml", "BBC Sport")],
  ["bbc-tennis", () => fetchEditorialRSS("https://feeds.bbci.co.uk/sport/tennis/rss.xml", "BBC Sport")],
  ["bbc-golf", () => fetchEditorialRSS("https://feeds.bbci.co.uk/sport/golf/rss.xml", "BBC Sport")],
  ["guardian-football", () => fetchEditorialRSS("https://www.theguardian.com/football/rss", "The Guardian")],

  // ESPN homepage top headlines + big-format videos (both scraped from espn.com)
  ["espn-top", fetchESPNTopHeadlines],
  ["espn-videos", fetchESPNTopVideos],

  // CBS Sports
  ["cbs-general", () => fetchCBS("", "CBS Sports")],
  ["cbs-nfl", () => fetchCBS("nfl", "CBS Sports")],
  ["cbs-nba", () => fetchCBS("nba", "CBS Sports")],
  ["cbs-mlb", () => fetchCBS("mlb", "CBS Sports")],
  ["cbs-nhl", () => fetchCBS("nhl", "CBS Sports")],
  ["cbs-ncaam", () => fetchCBS("college-basketball", "CBS Sports")],
  ["cbs-golf", () => fetchCBS("golf", "CBS Sports")],
  ["cbs-tennis", () => fetchCBS("tennis", "CBS Sports")],
  ["cbs-epl", () => fetchCBS("soccer", "CBS Sports")],
  ["cbs-mls", () => fetchCBS("soccer", "CBS Sports")],

  // Reddit — per-league subreddits + r/sports for the general News column.
  ["reddit-general", () => fetchReddit("sports", "r/sports")],
  ["reddit-mlb", () => fetchReddit("baseball", "r/baseball")],
  ["reddit-nba", () => fetchReddit("nba", "r/nba")],
  ["reddit-wnba", () => fetchReddit("wnba", "r/wnba")],
  ["reddit-nhl", () => fetchReddit("hockey", "r/hockey")],
  ["reddit-nfl", () => fetchReddit("nfl", "r/nfl")],
  ["reddit-ncaam", () => fetchReddit("CollegeBasketball", "r/CollegeBasketball")],
  ["reddit-golf", () => fetchReddit("golf", "r/golf")],
  ["reddit-tennis", () => fetchReddit("tennis", "r/tennis")],
  ["reddit-epl", () => fetchReddit("PremierLeague", "r/PremierLeague")],
  ["reddit-mls", () => fetchReddit("MLS", "r/MLS")],
  // 2026-05-31: complete league coverage — every sport the site tracks now has a sub.
  ["reddit-ucl", () => fetchReddit("championsleague", "r/championsleague")],
  ["reddit-uel", () => fetchReddit("EuropaLeague", "r/EuropaLeague")],
  ["reddit-fifa", () => fetchReddit("worldcup", "r/worldcup")],
  // r/soccer (the high-volume general sub) builds out the thin World Cup column
  // alongside r/worldcup — see leagueSourceCascade("fifa") in src/lib/news.ts.
  ["reddit-soccer", () => fetchReddit("soccer", "r/soccer")],
  ["reddit-ncaaf", () => fetchReddit("CFB", "r/CFB")],
  // 2026-08-03: cricket. General sub, not IPL-only, to match our ESPN cricket
  // wire. Adds one 45s gate slot to the bake (see REDDIT_BATCH_COOLDOWN_MS).
  ["reddit-cricket", () => fetchReddit("Cricket", "r/Cricket")],
  ["reddit-ncaaw", () => fetchReddit("ncaaw", "r/ncaaw")],
  // 2026-09-12: NCAA men's hockey. One more 45s gate slot in the reddit bake.
  ["reddit-ncaah", () => fetchReddit("collegehockey", "r/collegehockey")],
  // 2026-09-14: UFL spring football. r/UFL is the University of Florida; the
  // league lives at r/UnitedFootballLeague. One more 45s gate slot.
  ["reddit-ufl", () => fetchReddit("UnitedFootballLeague", "r/UnitedFootballLeague")],
  // 2026-09-14: NCAA baseball. Softball has no reddit card (no sub with volume).
  ["reddit-ncaabase", () => fetchReddit("collegebaseball", "r/collegebaseball")],
  // 2026-09-13: CFL. One more 45s gate slot in the reddit bake.
  ["reddit-cfl", () => fetchReddit("CFL", "r/CFL")],
  ["reddit-ufc", () => fetchReddit("ufc", "r/ufc")],
  ["reddit-boxing", () => fetchReddit("Boxing", "r/Boxing")],
  ["reddit-f1", () => fetchReddit("formula1", "r/formula1")],
  ["reddit-nwsl", () => fetchReddit("NWSL", "r/NWSL")],
  ["reddit-nascar", () => fetchReddit("NASCAR", "r/NASCAR")],
  ["reddit-indycar", () => fetchReddit("INDYCAR", "r/INDYCAR")],

  // theScore — golf and tennis have no dedicated per-league path (API 404s).
  ["thescore-general", () => fetchTheScore("", "theScore")],
  ["thescore-nfl", () => fetchTheScore("nfl", "theScore")],
  ["thescore-nba", () => fetchTheScore("nba", "theScore")],
  ["thescore-mlb", () => fetchTheScore("mlb", "theScore")],
  ["thescore-nhl", () => fetchTheScore("nhl", "theScore")],
  ["thescore-ncaam", () => fetchTheScore("ncaab", "theScore")],
  ["thescore-epl", () => fetchTheScore("epl", "theScore")],
  ["thescore-mls", () => fetchTheScore("mls", "theScore")],
  // 2026-09-13: the CFL column's headline card (ESPN has no CFL feed).
  ["thescore-cfl", () => fetchTheScore("cfl", "theScore")],
];

// Load the YouTube lookup cache once per run so all video feeds share it and
// we only save it back to disk at the end (a single write, not one per job).
// Skip in --only-reddit mode (no YT-needing jobs run, avoids cache file churn
// that would conflict with the GH Actions cron's writes).
const ytCache = ONLY_REDDIT ? {} : await loadYTCache();
const YT_CHANNEL_BY_FEED = {
  "mlb-videos": "MLB",
  "nba-videos": "NBA",
  "wnba-videos": "WNBA",
  "nhl-videos": "NHL",
  "espn-videos": "ESPN",
};

const activeJobs = (ONLY_LIST.length > 0
  ? jobs.filter(([name]) => ONLY_LIST.includes(name))
  : ONLY_REDDIT
    ? jobs.filter(([name]) => name.startsWith("reddit-"))
    : jobs
).filter(([name]) => !SKIP_LIST.some((s) => (s.endsWith("*") ? name.startsWith(s.slice(0, -1)) : s === name)));
if (ONLY_REDDIT) console.log(`--only-reddit: running ${activeJobs.length}/${jobs.length} jobs (reddit-* only)`);
if (ONLY_LIST.length > 0) console.log(`--only=${ONLY_LIST.join(",")}: running ${activeJobs.length}/${jobs.length} jobs`);
if (SKIP_LIST.length > 0) console.log(`--skip=${SKIP_LIST.join(",")}: ${activeJobs.length}/${jobs.length} jobs after skip`);

const results = await Promise.allSettled(
  activeJobs.map(async ([name, fn]) => {
    let items = await fn();
    // YouTube ID lookup disabled 2026-05-02: matches were unreliable, sending
    // users to wrong videos. With no youtubeVideoId, the player falls through
    // to the article URL (ESPN / MLB.com / NBA.com) which is the right home.
    // const channel = YT_CHANNEL_BY_FEED[name];
    // if (channel && Array.isArray(items)) {
    //   items = await attachYouTubeIds(items, channel, ytCache);
    // }
    await writeFeed(name, items);
  })
);

if (!ONLY_REDDIT) await saveYTCache(ytCache);
// Gallery lookups are keyed by post id and never change, so persisting them
// means each multi-picture post costs exactly one extra mirror fetch, ever.
await saveGalleryCache();

// Bake per-game highlight video IDs (score-card buttons read these instead of
// live-scraping). Runs on the same cadence as the video feeds; skipped in
// reddit-only runs and honors --only / --skip via the "highlights" token.
// Wrapped so a lookup/ESPN hiccup never fails the whole cron.
const runHighlights = !ONLY_REDDIT
  && (ONLY_LIST.length === 0 || ONLY_LIST.includes("highlights"))
  && !SKIP_LIST.some((s) => (s.endsWith("*") ? "highlights".startsWith(s.slice(0, -1)) : s === "highlights"));
let highlightsFailed = false;
if (runHighlights) {
  try {
    await bakeGameHighlights();
  } catch (e) {
    console.error("highlights bake FAILED:", e?.message || e);
    highlightsFailed = true;
  }
}

// League-wide recap lookout (see bakeLeagueRecaps). Same standalone shape as
// the highlights bake, token "recaps" for --only / --skip.
const runRecaps = !ONLY_REDDIT
  && (ONLY_LIST.length === 0 || ONLY_LIST.includes("recaps"))
  && !SKIP_LIST.some((s) => (s.endsWith("*") ? "recaps".startsWith(s.slice(0, -1)) : s === "recaps"));
let recapsFailed = false;
if (runRecaps) {
  try {
    await bakeLeagueRecaps();
  } catch (e) {
    console.error("recaps bake FAILED:", e?.message || e);
    recapsFailed = true;
  }
}

// Persist the watch-page reads both bakes above made, then say how many were
// served from disk vs fetched live, so a new YouTube block shows up in the log.
try {
  await ytWatchMeta.flush();
  const w = ytWatchMeta.stats();
  console.log(`YT-WATCH-META stored=${w.stored} disk=${w.disk} live=${w.live} ok=${w.liveOk} fail=${w.liveFail} capped=${w.capped}`);
} catch (e) {
  console.warn("YT-WATCH-META save failed:", e?.message || e);
}

let failed = 0;
results.forEach((r, i) => {
  if (r.status === "rejected") {
    console.error(`${activeJobs[i][0]} FAILED:`, r.reason?.message || r.reason);
    failed++;
  }
});

// Exit non-zero only if EVERY job failed — partial success still commits useful
// feeds and prevents one flaky origin from wedging the whole cron.
if (activeJobs.length > 0 && failed === activeJobs.length) process.exit(1);
if (highlightsFailed && ONLY_LIST.includes("highlights")) process.exit(1);
if (recapsFailed && ONLY_LIST.includes("recaps")) process.exit(1);
