// Prebake official-site news feeds + ESPN top headlines to /public/news/*.json.
// Run via GitHub Actions cron (see .github/workflows/news-prebake.yml) — the
// committed JSON triggers a Cloudflare rebuild so the client gets fresh news
// without needing a runtime proxy for CORS-locked origins (MLB.com, NBA.com, NHL.com).

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const OUT_DIR = "public/news";

// NBA.com 403s the obvious-bot UA; use a realistic browser string.
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
    const isoDate = pub ? new Date(pub).toISOString() : "";
    items.push({
      id: link,
      headline: title,
      description: "",
      published: isoDate,
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

async function fetchESPNTop() {
  const data = await getJson("https://now.core.api.espn.com/v1/sports/news?limit=20");
  const raw = data?.headlines || [];
  return raw.slice(0, 15).map((h) => ({
    id: String(h.id || h.nowId || h.contentKey || h.links?.web?.href || ""),
    headline: h.headline || h.title || "",
    description: h.description || "",
    published: h.published || h.lastModified || "",
    imageUrl: null,
    articleUrl: h.links?.web?.href || h.links?.mobile?.href || "",
    byline: h.byline || "",
    section: h.section || h.root || "ESPN",
  }));
}

async function writeFeed(name, items) {
  const path = `${OUT_DIR}/${name}.json`;
  await mkdir(dirname(path), { recursive: true });
  const payload = { fetchedAt: new Date().toISOString(), items };
  await writeFile(path, JSON.stringify(payload));
  console.log(`wrote ${path} (${items.length} items)`);
}

const jobs = [
  ["mlb", fetchMLB],
  ["nba", fetchNBA],
  ["nhl", fetchNHL],
  ["espn-top", fetchESPNTop],
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

// Exit non-zero only if ALL jobs failed — partial success still useful and we
// don't want the cron to skip commits when one feed is flaky.
if (failed === jobs.length) process.exit(1);
