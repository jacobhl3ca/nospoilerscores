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
    return data?.files?.mp4?.url || data?.files?.["mp4-mobile"]?.url || null;
  } catch {
    return null;
  }
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
  /\bbetting\s+(?:odds|line|trends|preview|picks?)\b/i,
  /\bodds,?\s+picks?\b/i,
  /\bpicks?,?\s+predictions?\b/i,
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

async function fetchNHL() {
  const data = await getJson(
    "https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=news&context.slug=nhl&%24limit=20"
  );
  const raw = data?.items || [];
  return raw
    .filter((i) => passesArticleBlocklist(i.title || "", i.summary || ""))
    .slice(0, 15)
    .map((i) => ({
      id: i._entityId || i.slug,
      headline: i.title || "",
      description: i.summary || "",
      published: i.contentDate || "",
      imageUrl: i.fields?.thumbnail?.thumbnailUrl || null,
      articleUrl: `https://www.nhl.com/news/${i.slug}`,
      byline: "",
      section: "NHL.com",
    }));
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

// Use SPORT_ICON (the ball / equipment) consistently for ball sports — mixing
// brand-shield team logos (NBA silhouette, NFL shield) with plain ball icons
// for college / soccer / tennis read poorly side-by-side. Result: every row
// gets the same visual weight regardless of league prestige. Non-ball sports
// keep their own iconography (F1 wordmark, MMA gloves, jockey emoji).
const TWEMOJI = (hex) =>
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${hex}.png`;

const PATH_TO_LOGO = {
  // Ball sports — show the ball
  nba: SPORT_ICON("basketball"),
  wnba: SPORT_ICON("basketball"),
  mlb: SPORT_ICON("baseball"),
  nhl: SPORT_ICON("hockey"),
  nfl: SPORT_ICON("football"),
  mls: SPORT_ICON("soccer"),
  fifa: SPORT_ICON("soccer"),
  soccer: SPORT_ICON("soccer"),
  golf: SPORT_ICON("golf"),
  pga: SPORT_ICON("golf"),
  lpga: SPORT_ICON("golf"),
  tennis: SPORT_ICON("tennis"),
  cricket: SPORT_ICON("cricket"),
  rugby: SPORT_ICON("rugby"),
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
  olympics: SPORT_ICON("olympics"),
  // Combat sports — gloves
  ufc: SPORT_ICON("mma"),
  mma: SPORT_ICON("mma"),
  boxing: SPORT_ICON("boxing"),
  // Motorsports — keep F1 wordmark, NASCAR sport-icon. No generic ball.
  f1: TEAMLOGOS("f1"),
  racing: SPORT_ICON("nascar"),
  nascar: SPORT_ICON("nascar"),
  // Horse racing — Twemoji jockey 🏇 (ESPN's equestrian icon is Olympic
  // show-jumping, not racing).
  "horse-racing": TWEMOJI("1f3c7"),
  equestrian: TWEMOJI("1f3c7"),
};

// Walk up to two URL segments so /recruiting/basketball/... still resolves
// to the basketball icon (first-segment "recruiting" isn't a sport).
function espnArticleLogo(articleUrl) {
  try {
    const u = new URL(articleUrl);
    const segs = u.pathname.split("/").filter(Boolean).slice(0, 2);
    for (const seg of segs) {
      const hit = PATH_TO_LOGO[seg.toLowerCase()];
      if (hit) return hit;
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback when the homepage scrape misses the headlineStack block (ESPN A/B
// tests + occasional region-specific layouts ship variants without it). The
// `now.core` API is JSON and stable; matches "Top Headlines" closely enough.
async function fetchESPNTopHeadlinesViaApi() {
  try {
    const data = await getJson("https://now.core.api.espn.com/v1/sports/news?limit=20");
    const items = [];
    for (const a of data?.headlines || []) {
      const url = a?.links?.web?.href || a?.links?.mobile?.href || "";
      const title = a?.headline || a?.title || "";
      if (!url || !title) continue;
      if (!passesArticleBlocklist(title)) continue;
      items.push({
        id: url,
        headline: title,
        description: "",
        published: a?.published || a?.lastModified || "",
        imageUrl: null,
        leagueLogo: espnArticleLogo(url),
        articleUrl: url,
        byline: "",
        section: "ESPN",
      });
      if (items.length >= 15) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchESPNTopHeadlines() {
  const html = await getESPNHomeHtml();
  // ESPN occasionally swaps the inner wrapper element (div ↔ section) inside
  // the top-headlines block, and splits the headline list across two adjacent
  // <ul class="headlineStack__list"> elements (5 + 4 today). Anchor on the
  // parent class, then concat every headline UL found until the section closes.
  const topIdx = html.indexOf('class="headlineStack top-headlines"');
  if (topIdx < 0) return fetchESPNTopHeadlinesViaApi();
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
  return items.length > 0 ? items.slice(0, 15) : fetchESPNTopHeadlinesViaApi();
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
  /\bdan orlovsky\b/i,
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

async function fetchESPNTopVideos() {
  // ICYMI is ESPN's hand-picked headline video — pinned to slot 2 so the day's
  // newest big-format video leads and ICYMI sits below it as a clearly-labeled
  // "in case you missed it" anchor.
  const icymi = await fetchESPNICYMI().catch(() => null);
  const html = await getESPNHomeHtml();
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
  return await persistVideos("espn-videos", items, icymi?.id);
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
  const carry = existingETDay === currentETDay ? (existing?.items || []) : [];
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
// Reddit started 403'ing GitHub Actions datacenter IPs on the public
// www.reddit.com JSON endpoints in late April 2026. OAuth (oauth.reddit.com)
// is unaffected because the bearer token is the auth signal, not the IP. When
// REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set we run app-only OAuth ("web
// app" type with client_credentials grant); without them we fall back to the
// public path so local runs keep working without any setup.
const REDDIT_UA = "web:com.hidescore.prebake:v1.0 (by /u/Reasonable_Stick_329)";
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

async function fetchReddit(subreddit, sectionLabel) {
  const token = await getRedditToken().catch(() => null);
  const url = token
    ? `https://oauth.reddit.com/r/${subreddit}/hot?limit=25&raw_json=1`
    : `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
  const headers = { "User-Agent": REDDIT_UA };
  if (token) headers.Authorization = `Bearer ${token}`;
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
    const preview = p.preview?.images?.[0]?.source?.url;
    let imageUrl = null;
    if (preview) {
      imageUrl = preview.replace(/&amp;/g, "&");
    } else if (p.thumbnail && /^https?:\/\//.test(p.thumbnail)) {
      imageUrl = p.thumbnail;
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
      if (m) videoUrl = await fetchStreamableMp4(m[1]);
    }
    // i.redd.it image posts: surface the original full-res URL so the client
    // can pop a lightbox instead of bouncing out to reddit.com to view a JPEG.
    let imageFullUrl = null;
    if (p.post_hint === "image" && /^https:\/\/i\.redd\.it\//.test(p.url || "")) {
      imageFullUrl = p.url;
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
  const payload = { fetchedAt: new Date().toISOString(), items };
  await writeFile(path, JSON.stringify(payload));
  console.log(`wrote ${path} (${items.length} items)`);
}

// --only-reddit: scoped run for the Mac mini cron (residential IP, can reach
// Reddit when GH Actions can't). Filters jobs to reddit-* and skips the
// YouTube cache I/O entirely so the two crons never fight over the same files.
const ONLY_REDDIT = process.argv.includes("--only-reddit");

const jobs = [
  // Official league sites
  ["mlb", fetchMLB],
  ["mlb-videos", fetchMLBVideos],
  ["nba", fetchNBA],
  ["nba-videos", fetchNBAVideos],
  ["nhl", fetchNHL],

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
  ["reddit-nhl", () => fetchReddit("hockey", "r/hockey")],
  ["reddit-nfl", () => fetchReddit("nfl", "r/nfl")],
  ["reddit-ncaam", () => fetchReddit("CollegeBasketball", "r/CollegeBasketball")],
  ["reddit-golf", () => fetchReddit("golf", "r/golf")],
  ["reddit-tennis", () => fetchReddit("tennis", "r/tennis")],
  ["reddit-epl", () => fetchReddit("PremierLeague", "r/PremierLeague")],
  ["reddit-mls", () => fetchReddit("MLS", "r/MLS")],

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
  "espn-videos": "ESPN",
};

const activeJobs = ONLY_REDDIT ? jobs.filter(([name]) => name.startsWith("reddit-")) : jobs;
if (ONLY_REDDIT) console.log(`--only-reddit: running ${activeJobs.length}/${jobs.length} jobs (reddit-* only)`);

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
