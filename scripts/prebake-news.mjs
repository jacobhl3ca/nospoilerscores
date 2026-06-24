// Prebake news feeds to /public/news/*.json.
// Runs via GitHub Actions every 30 min (see .github/workflows/news-prebake.yml).
// Covers origins that block browser CORS (MLB.com, NBA.com, NHL.com, CBS, theScore)
// plus the ESPN homepage "TOP HEADLINES" widget (scraped from HTML for exact order).

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

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
async function fetchStreamffMp4(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": UA, Referer: "https://www.reddit.com/" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/property="og:image"\s+content="(https?:\/\/cdn\.streamff\.\w+\/[^"]+)"/i) ||
      html.match(/(https?:\/\/cdn\.streamff\.\w+\/[a-z0-9]+\.(?:jpe?g|png|webp))/i);
    if (!m) return null;
    // The same og:image doubles as the row poster — keep it alongside the mp4
    // (just swap the extension) so r/soccer clip posts render a preview tile.
    const thumb = m[1].split(/[?#]/)[0];
    return { mp4: thumb.replace(/\.(?:jpe?g|png|webp)$/i, ".mp4"), thumb };
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

// Route an external clip-host /v/<id> page URL to the matching mp4 resolver.
// Used by the redlib + RSS paths, which capture the host URL into one map.
function fetchClipMp4(url) {
  if (/^https?:\/\/streamff\.\w+\/v\//i.test(url)) return fetchStreamffMp4(url);
  if (/^https?:\/\/streamin\.\w+\/v\//i.test(url)) return fetchStreaminMp4(url);
  if (/^https?:\/\/dropr\.\w+\/v\//i.test(url)) return fetchDroprMp4(url);
  return Promise.resolve(null);
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
        if (url && url.includes(".m3u8")) return url;
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

async function fetchESPNTopHeadlines() {
  // First try the shared cached homepage HTML — most jobs hit the same fetch.
  let html = await getESPNHomeHtml();
  let items = await fetchESPNTopHeadlinesFromHtml(html);
  if (items.length > 0) return items;
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
        return items;
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
  /daily (discussion|game) thread|game thread index|post[- ]?game thread|free talk|sunday brunch|shitpost saturday|moronic monday|megathread|simple questions|weekly|^\s*\[?\s*off[- ]?topic/i;

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
    let html;
    try {
      const res = await fetch(`${base}/r/${subreddit}/hot`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue; // dead / blocked mirror — try the next
    }
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
      // streamff / streamin goal clips render as a "no_thumbnail" link anchor
      // (no <img>), so capture the /v/<id> url here for fetchRedditRSS to resolve
      // into a playable mp4 (fetchClipMp4). v.redd.it wins if both.
      const cl = block.match(/href="(https?:\/\/(?:streamff|streamin|dropr)\.\w+\/v\/[^"]+)"/i);
      if (cl && !map.has(idm[1])) clips.set(idm[1], decodeEntities(cl[1]));
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
async function fetchRedlibHTML(subreddit) {
  // Try the instance that last worked first (usually one volunteer host is up at
  // a time), then the hash-rotated rest, so we don't re-pay dead-mirror timeouts
  // on every sub.
  const order = [];
  if (_redlibWinner) order.push(_redlibWinner);
  const offset = [...subreddit].reduce((a, c) => a + c.charCodeAt(0), 0) % REDLIB_INSTANCES.length;
  for (let k = 0; k < REDLIB_INSTANCES.length; k++) {
    const inst = REDLIB_INSTANCES[(offset + k) % REDLIB_INSTANCES.length];
    if (!order.includes(inst)) order.push(inst);
  }
  for (const base of order) {
    try {
      const res = await fetch(`${base}/r/${subreddit}/hot`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (/<div class="post[ "]/.test(html)) {
        _redlibWinner = base;
        return html;
      }
    } catch {
      continue; // dead / blocked mirror — try the next
    }
  }
  return null;
}

// Rewrite a redlib media-proxy path to Reddit's own open CDN so display/playback
// never touches the volunteer instance. Returns null for shapes we don't know.
function redlibMediaToReddit(path) {
  if (!path) return null;
  const p = decodeEntities(path);
  if (/^https?:\/\//.test(p)) return p;
  if (p.startsWith("/img/")) return "https://i.redd.it/" + p.slice(5);
  if (p.startsWith("/preview/external-pre/")) return "https://external-preview.redd.it/" + p.slice(22);
  if (p.startsWith("/preview/pre/")) return "https://preview.redd.it/" + p.slice(13);
  return null;
}

async function parseRedlibListing(html, subreddit, sectionLabel) {
  const out = [];
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
    if (/^AutoModerator$/i.test(author)) continue;
    // Date lives in <span class="created" title="Jun 12 2026, 08:30:10 UTC">.
    const dtitle = (block.match(/class="created"[^>]*title="([^"]+)"/) || [])[1] || "";
    const ts = dtitle ? Date.parse(dtitle.replace(/\sUTC$/, " GMT")) : NaN;
    if (ts && Date.now() - ts > 21 * 864e5) continue; // drop stale pins

    let videoUrl = null;
    let imageUrl = null;
    let imageFullUrl = null;
    let youtubeVideoId = null;
    let body = null;

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
        if (tImg) imageUrl = redlibMediaToReddit(tImg[1]);
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
        // streamff / streamin — r/soccer's goal-clip hosts (streamff is current).
        // The /v/<id> page yields a direct mp4 + an og:image poster we resolve
        // (fetchStreamff/StreaminMp4). These post as "no_thumbnail" links, so the
        // clip's own poster is the only preview tile they get — without it the
        // row collapses to text, unlike image-bearing posts from other subs.
        const streamin = /^https?:\/\/streamin\.\w+\/v\//i.test(extUrl);
        const streamff = /^https?:\/\/streamff\.\w+\/v\//i.test(extUrl);
        const dropr = /^https?:\/\/dropr\.\w+\/v\//i.test(extUrl);
        if (sm || streamff || streamin || dropr) {
          const clip = sm
            ? await fetchStreamableMp4(sm[1])
            : streamff
              ? await fetchStreamffMp4(extUrl)
              : streamin
                ? await fetchStreaminMp4(extUrl)
                : await fetchDroprMp4(extUrl);
          if (clip) {
            videoUrl = clip.mp4;
            if (!imageUrl) imageUrl = clip.thumb;
          }
        } else if (ym) youtubeVideoId = ym[1];
        else if (gifv) videoUrl = `https://i.imgur.com/${gifv[1]}.mp4`;
        else if (mp4) videoUrl = extUrl;
      }
    }

    // 5) Selftext body for text posts with no media (parity with OAuth path).
    //    Key on the actual selftext container `<div class="md">` — link posts
    //    render an EMPTY post_body (no md div), so this skips them instead of
    //    capturing the stray markup around an empty preview.
    if (!videoUrl && !imageFullUrl && !imageUrl) {
      const mi = block.indexOf('<div class="md">');
      if (mi >= 0) {
        const fi = block.indexOf('class="post_footer"', mi);
        const seg = block.slice(mi, fi > mi ? fi : mi + 4000);
        const text = decodeEntities(seg.replace(/<[^>]+>/g, " ")).trim();
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
    let html;
    try {
      const res = await fetch(`${base}/r/${subreddit}/hot`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue; // dead / blocked mirror — try the next
    }
    if (!/<div class="post[ "]/.test(html)) continue;
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
    const html = await fetchRedlibHTML(subreddit);
    if (html) {
      const items = await parseRedlibListing(html, subreddit, sectionLabel);
      if (items.length) return await fillMissingRedlibVideos(items, subreddit);
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
const REDDIT_BATCH_SIZE = 2;
const REDDIT_BATCH_COOLDOWN_MS = 90000;
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
    if (/^AutoModerator$/i.test(author)) continue;
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
      // host URL. Host-agnostic so a future rotation only needs a fetchClipMp4
      // entry (streamff → streamin → dropr so far, Jacob 6/23).
      const clipUrl =
        media.clips.get(postId) ||
        (content.match(/https?:\/\/(?:streamff|streamin|dropr)\.\w+\/v\/[a-z0-9]+/i) || [])[0] ||
        null;
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

async function fetchReddit(subreddit, sectionLabel) {
  const token = await getRedditToken().catch(() => null);
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
    } else if (/^streamin\.\w+$/i.test(p.domain || "") && /\/v\//.test(p.url || "")) {
      const clip = await fetchStreaminMp4(p.url);
      if (clip) { videoUrl = clip.mp4; if (!imageUrl) imageUrl = clip.thumb; }
    } else if (/^streamff\.\w+$/i.test(p.domain || "") && /\/v\//.test(p.url || "")) {
      const clip = await fetchStreamffMp4(p.url);
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
    items.push({
      id: link,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      imageUrl: null,
      articleUrl: link,
      byline: "",
      section: sectionLabel,
    });
  }
  return items.slice(0, 12);
}

// ── BBC Sport / The Guardian RSS — editorial substitute feeds for the soccer,
// tennis, and golf columns, where no league .com publishes an open feed. Both
// are clean RSS WITH per-item images (unlike CBS): BBC carries a single
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
  //   1. Video flap: 0 playable video now but a still-fresh prior HAD video →
  //      keep prior so clips don't flap to static (the original guard).
  //   1b. Catastrophic extractor break: this bake is mostly blank but a fresh
  //      prior was healthy → keep prior and shout MEDIA-REGRESSION in the log.
  //   2. Always log coverage so a *partial* degradation (e.g. images vanish while
  //      video still works, the 6/18 r/soccer bug) is visible to the health-check
  //      instead of failing silently. Grep the cron log for MEDIA-REGRESSION /
  //      MEDIA-LOW to alert.
  const isBlank = (i) => !i.imageUrl && !i.imageFullUrl && !i.videoUrl && !i.youtubeVideoId && !i.body;
  const blankFrac = items.length ? items.filter(isBlank).length / items.length : 1;
  const newHasVideo = items.some((i) => i.videoUrl || i.youtubeVideoId);
  if (name.startsWith("reddit-")) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8"));
      const prevItems = prev.items || [];
      const prevHasVideo = prevItems.some((i) => i.videoUrl || i.youtubeVideoId);
      const prevBlankFrac = prevItems.length ? prevItems.filter(isBlank).length / prevItems.length : 1;
      const ageH = prev.fetchedAt ? (Date.now() - Date.parse(prev.fetchedAt)) / 3600e3 : Infinity;
      if (!newHasVideo && prevHasVideo && ageH < 6) {
        console.log(`skipped ${path} (0 video this bake — keeping prior with-video file, age ${ageH.toFixed(1)}h)`);
        return;
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
  ["reddit-ncaaw", () => fetchReddit("ncaaw", "r/ncaaw")],

  // theScore — golf and tennis have no dedicated per-league path (API 404s).
  ["thescore-general", () => fetchTheScore("", "theScore")],
  ["thescore-nfl", () => fetchTheScore("nfl", "theScore")],
  ["thescore-nba", () => fetchTheScore("nba", "theScore")],
  ["thescore-mlb", () => fetchTheScore("mlb", "theScore")],
  ["thescore-nhl", () => fetchTheScore("nhl", "theScore")],
  ["thescore-ncaam", () => fetchTheScore("ncaab", "theScore")],
  ["thescore-epl", () => fetchTheScore("epl", "theScore")],
  ["thescore-mls", () => fetchTheScore("mls", "theScore")],
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

let failed = 0;
results.forEach((r, i) => {
  if (r.status === "rejected") {
    console.error(`${activeJobs[i][0]} FAILED:`, r.reason?.message || r.reason);
    failed++;
  }
});

// Exit non-zero only if EVERY job failed — partial success still commits useful
// feeds and prevents one flaky origin from wedging the whole cron.
if (failed === activeJobs.length) process.exit(1);
