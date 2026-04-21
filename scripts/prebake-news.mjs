// Prebake news feeds to /public/news/*.json.
// Runs via GitHub Actions every 30 min (see .github/workflows/news-prebake.yml).
// Covers origins that block browser CORS (MLB.com, NBA.com, NHL.com, CBS, theScore)
// plus the ESPN homepage "TOP HEADLINES" widget (scraped from HTML for exact order).

import { writeFile, mkdir } from "node:fs/promises";
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

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Official league sites ─────────────────────────────────────────

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
    if (!title || !link) continue;
    items.push({
      id: link,
      headline: title,
      description: "",
      published: pub ? new Date(pub).toISOString() : "",
      imageUrl: null,
      articleUrl: link,
      byline: "",
      section: "MLB.com",
    });
  }
  return items.slice(0, 15);
}

async function fetchNBA() {
  const data = await getJson("https://content-api-prod.nba.com/public/1/content/news?count=20");
  const raw = data?.results?.items || [];
  return raw
    .filter((i) => i.type === "post" && (i.permalink || "").includes("/news/"))
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
  return raw.slice(0, 15).map((i) => ({
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

async function fetchESPNTopHeadlines() {
  const html = await getText("https://www.espn.com/");
  const blockMatch = html.match(/<div class="headlineStack top-headlines">([\s\S]{0,30000}?)<\/div>\s*<\/div>/);
  if (!blockMatch) return [];
  const block = blockMatch[1];
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
    items.push({
      id: url,
      headline: title,
      description: "",
      published: "",
      imageUrl: null,
      articleUrl: url,
      byline: "",
      section: "ESPN",
    });
  }
  return items.slice(0, 15);
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
  return items.slice(0, 12).map((a) => ({
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

const jobs = [
  // Official league sites
  ["mlb", fetchMLB],
  ["nba", fetchNBA],
  ["nhl", fetchNHL],

  // ESPN homepage top headlines (scraped)
  ["espn-top", fetchESPNTopHeadlines],

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

const results = await Promise.allSettled(
  jobs.map(async ([name, fn]) => {
    const items = await fn();
    await writeFeed(name, items);
  })
);

let failed = 0;
results.forEach((r, i) => {
  if (r.status === "rejected") {
    console.error(`${jobs[i][0]} FAILED:`, r.reason?.message || r.reason);
    failed++;
  }
});

// Exit non-zero only if EVERY job failed — partial success still commits useful
// feeds and prevents one flaky origin from wedging the whole cron.
if (failed === jobs.length) process.exit(1);
