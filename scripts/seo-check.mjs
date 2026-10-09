#!/usr/bin/env node
// Technical SEO crawl of the static build. Serves ./out with the same clean-URL
// rules Cloudflare Pages uses (/foo -> foo.html, /foo/ -> 308 /foo), crawls every
// internal link from /, and checks each HTML page for:
//   - exactly one <title> and one meta description, both unique across the site
//   - an absolute, https, self-referencing canonical with no trailing slash
//   - og:title/description/image (+ width/height matching the real image) and
//     twitter:card/title/description/image
//   - JSON-LD that parses and carries the fields its @type needs
//   - exactly one <h1>, and alt on every <img>
//   - every internal link resolving to a 200
// and checks sitemap.xml against the crawl: every indexable page listed, no
// noindex, redirected or missing URL listed, and robots.txt pointing at it.
// Over-length titles (> 60) and descriptions (outside 70-160) are warnings.
//
//   npm run build && npm run seo:check
//   npm run seo:check -- --json report.json   # also write the per-page data
//
// Exits non-zero on any error. Warnings never fail the run.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repo, "out");
const ORIGIN = "https://hidescore.com";
const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.error("seo-check: no out/index.html — run `npm run build` first.");
  process.exit(2);
}

// --- static server with Cloudflare Pages clean URLs ------------------------
const TYPES = { ".html": "text/html; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".js": "text/javascript", ".css": "text/css" };
function resolveFile(pathname) {
  const p = decodeURIComponent(pathname);
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(OUT, safe);
  if (!abs.startsWith(OUT)) return null;
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  if (p.endsWith("/")) return isFile(path.join(abs, "index.html")) ? path.join(abs, "index.html") : null;
  if (isFile(abs)) return abs;
  if (isFile(`${abs}.html`)) return `${abs}.html`;
  return null;
}
const server = http.createServer((req, res) => {
  const { pathname, search } = new URL(req.url, "http://x");
  if (pathname.length > 1 && pathname.endsWith("/") && resolveFile(pathname.slice(0, -1))) {
    res.writeHead(308, { Location: pathname.slice(0, -1) + search });
    return res.end();
  }
  const file = resolveFile(pathname);
  if (!file) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// --- small HTML helpers -----------------------------------------------------
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const attrs = (tag) => {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)(?:=("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
};
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}(?=[\\s>/])[^>]*>`, "gi"))].map((m) => attrs(m[0].slice(name.length + 1)));
const metaBy = (metas, key, val) => metas.filter((m) => m[key] === val).map((m) => m.content);
// Strip <script>/<style>/<template> bodies so their text cannot fake tags.
const visible = (html) => html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// --- JSON-LD field checks (Google rich-result required fields) -------------
function* nodes(v) {
  if (Array.isArray(v)) { for (const x of v) yield* nodes(x); return; }
  if (v && typeof v === "object") {
    if (v["@type"]) yield v;
    for (const [k, x] of Object.entries(v)) if (k !== "@type") yield* nodes(x);
  }
}
const has = (o, k) => o[k] !== undefined && o[k] !== null && o[k] !== "";
function checkLd(node) {
  const types = [].concat(node["@type"]);
  const errs = [];
  const need = (...keys) => { for (const k of keys) if (!has(node, k)) errs.push(`${types.join("/")} missing ${k}`); };
  if (types.includes("WebSite") || types.includes("Organization")) need("name", "url");
  if (types.includes("WebPage")) need("name", "url");
  if (types.includes("FAQPage")) {
    need("mainEntity");
    for (const q of [].concat(node.mainEntity ?? [])) {
      if (!q || q["@type"] !== "Question" || !has(q, "name")) errs.push("FAQPage Question missing name");
      else if (!q.acceptedAnswer || !has(q.acceptedAnswer, "text")) errs.push(`FAQPage "${q.name}" missing acceptedAnswer.text`);
    }
  }
  if (types.includes("BreadcrumbList")) {
    const items = [].concat(node.itemListElement ?? []);
    if (items.length === 0) errs.push("BreadcrumbList has no itemListElement");
    items.forEach((it, i) => {
      if (it.position !== i + 1) errs.push(`BreadcrumbList item ${i + 1} position is ${it.position}`);
      if (!has(it, "name")) errs.push(`BreadcrumbList item ${i + 1} missing name`);
      if (i < items.length - 1 && !has(it, "item")) errs.push(`BreadcrumbList item ${i + 1} missing item`);
      if (has(it, "item") && !/^https:\/\//.test(typeof it.item === "string" ? it.item : it.item["@id"] ?? "")) errs.push(`BreadcrumbList item ${i + 1} item is not an absolute https URL`);
    });
  }
  if (types.some((t) => /Event$/.test(t))) {
    need("name", "startDate", "location");
    if (has(node, "startDate") && Number.isNaN(Date.parse(node.startDate))) errs.push(`${types[0]} startDate "${node.startDate}" is not ISO 8601`);
  }
  if (types.some((t) => /Article$/.test(t))) need("headline");
  if (types.includes("HowTo")) need("name", "step");
  if (types.includes("ItemList")) need("itemListElement");
  if (types.includes("SportsTeam") || types.includes("SportsOrganization")) need("name");
  return errs;
}

// --- crawl -----------------------------------------------------------------
const pages = new Map(); // path -> record
const linkStatus = new Map(); // path -> status
const inbound = new Map(); // path -> Set(from)
const queue = ["/"];
const seen = new Set(queue);
const errors = [];
const warnings = [];
const err = (p, m) => errors.push(`${p}  ${m}`);
const warn = (p, m) => warnings.push(`${p}  ${m}`);

const isInternal = (href) => href.startsWith("/") && !href.startsWith("//") || href.startsWith(ORIGIN);
function toPath(href, from) {
  const u = new URL(href, `${ORIGIN}${from}`);
  if (u.origin !== ORIGIN) return null;
  return u.pathname;
}

async function fetchPath(p) {
  const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
  return { status: r.status, type: r.headers.get("content-type") ?? "", body: r.status === 200 ? await r.text() : "", location: r.headers.get("location") };
}

while (queue.length) {
  const p = queue.shift();
  const r = await fetchPath(p);
  linkStatus.set(p, r.status);
  if (r.status !== 200 || !r.type.startsWith("text/html")) continue;
  const html = r.body;
  const head = html.slice(0, html.indexOf("</head>") + 7);
  const metas = tags(head, "meta");
  const links = tags(head, "link");
  const body = visible(html.slice(head.length));
  const rec = { path: p, errors: [], warnings: [] };
  const e = (m) => { rec.errors.push(m); err(p, m); };
  const w = (m) => { rec.warnings.push(m); warn(p, m); };

  const titles = [...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1]));
  rec.title = titles[0] ?? null;
  if (titles.length !== 1) e(`${titles.length} <title> tags`);
  const descs = metaBy(metas, "name", "description");
  rec.description = descs[0] ?? null;
  if (descs.length !== 1) e(`${descs.length} meta descriptions`);
  if (rec.title && rec.title.length > 60) w(`title is ${rec.title.length} chars: "${rec.title}"`);
  if (rec.description && (rec.description.length > 160 || rec.description.length < 70)) w(`description is ${rec.description.length} chars`);

  const robots = metaBy(metas, "name", "robots").join(",");
  rec.noindex = /noindex/i.test(robots);

  const canon = links.filter((l) => (l.rel ?? "").split(/\s+/).includes("canonical")).map((l) => l.href);
  rec.canonical = canon[0] ?? null;
  if (canon.length !== 1) e(`${canon.length} canonical links`);
  else {
    const c = canon[0];
    const expect = `${ORIGIN}${p === "/" ? "" : p}`;
    if (!/^https:\/\//.test(c)) e(`canonical not absolute https: ${c}`);
    else if (c.replace(/\/$/, "") !== expect && !rec.noindex) e(`canonical ${c} is not self (${expect})`);
    else if (p !== "/" && c.endsWith("/")) e(`canonical has a trailing slash: ${c}`);
  }

  for (const k of ["og:title", "og:description", "og:image", "og:url", "og:type"]) {
    if (metaBy(metas, "property", k).length !== 1) e(`${metaBy(metas, "property", k).length} ${k}`);
  }
  for (const k of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    if (metaBy(metas, "name", k).length !== 1) e(`${metaBy(metas, "name", k).length} ${k}`);
  }
  const ogUrl = metaBy(metas, "property", "og:url")[0];
  if (ogUrl && rec.canonical && ogUrl.replace(/\/$/, "") !== rec.canonical.replace(/\/$/, "")) e(`og:url ${ogUrl} differs from canonical ${rec.canonical}`);
  const ogImg = metaBy(metas, "property", "og:image")[0];
  for (const img of [ogImg, metaBy(metas, "name", "twitter:image")[0]]) {
    if (img && !img.startsWith(`${ORIGIN}/`)) e(`share image is not an absolute ${ORIGIN} URL: ${img}`);
  }
  if (ogImg) {
    const ow = Number(metaBy(metas, "property", "og:image:width")[0]);
    const oh = Number(metaBy(metas, "property", "og:image:height")[0]);
    const ip = toPath(ogImg, p);
    const file = ip && resolveFile(ip);
    if (!file) e(`og:image ${ogImg} does not resolve in out/`);
    else {
      const real = pngSize(file);
      if (!ow || !oh) e("og:image has no width/height");
      else if (real && (real.width !== ow || real.height !== oh)) e(`og:image declared ${ow}x${oh}, real ${real.width}x${real.height}`);
    }
  }

  const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  rec.jsonld = [];
  for (const raw of ldBlocks) {
    let data;
    try { data = JSON.parse(raw); } catch (x) { e(`JSON-LD does not parse: ${x.message}`); continue; }
    if (!data["@context"] && !(Array.isArray(data) && data.every((d) => d["@context"]))) e("JSON-LD block has no @context");
    for (const n of nodes(data)) {
      rec.jsonld.push([].concat(n["@type"]).join("/"));
      for (const m of checkLd(n)) e(`JSON-LD ${m}`);
    }
  }

  const h1 = (body.match(/<h1[\s>]/gi) ?? []).length;
  rec.h1 = h1;
  if (h1 !== 1) e(`${h1} <h1> elements`);
  const imgs = tags(body, "img");
  const noAlt = imgs.filter((i) => !("alt" in i));
  if (noAlt.length) e(`${noAlt.length} <img> without alt (${noAlt.slice(0, 3).map((i) => i.src).join(", ")})`);

  for (const a of tags(body, "a")) {
    const href = a.href;
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/.test(href) || !isInternal(href)) continue;
    const t = toPath(href, p);
    if (!t) continue;
    if (!inbound.has(t)) inbound.set(t, new Set());
    inbound.get(t).add(p);
    if (!seen.has(t)) { seen.add(t); queue.push(t); }
  }
  pages.set(p, rec);
}

for (const [t, status] of linkStatus) {
  if (status !== 200) {
    const from = [...(inbound.get(t) ?? [])];
    err(t, `link target returns ${status} (linked from ${from.slice(0, 3).join(", ")}${from.length > 3 ? ` +${from.length - 3}` : ""})`);
  }
}

// --- uniqueness -------------------------------------------------------------
for (const key of ["title", "description"]) {
  const by = new Map();
  for (const r of pages.values()) if (r[key] && !r.noindex) by.set(r[key], [...(by.get(r[key]) ?? []), r.path]);
  for (const [v, ps] of by) if (ps.length > 1) err(ps.join(", "), `share the same ${key}: "${v.slice(0, 70)}"`);
}

// --- sitemap + robots -------------------------------------------------------
const sm = await fetchPath("/sitemap.xml");
const smUrls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const smPaths = new Set();
for (const u of smUrls) {
  if (!u.startsWith(`${ORIGIN}`)) { err("sitemap", `non-canonical origin: ${u}`); continue; }
  const p = new URL(u).pathname;
  if (p !== "/" && p.endsWith("/")) err("sitemap", `trailing slash: ${u}`);
  smPaths.add(p);
  const r = pages.get(p) ?? null;
  const status = linkStatus.get(p) ?? (await fetchPath(p)).status;
  if (status !== 200) err("sitemap", `${u} returns ${status}`);
  else if (r?.noindex) err("sitemap", `${u} is noindex`);
  else if (r?.canonical && r.canonical.replace(/\/$/, "") !== u.replace(/\/$/, "")) err("sitemap", `${u} canonicalises to ${r.canonical}`);
}
for (const r of pages.values()) {
  if (!r.noindex && !smPaths.has(r.path) && r.canonical?.replace(/\/$/, "") === `${ORIGIN}${r.path === "/" ? "" : r.path}`) {
    warn(r.path, "indexable page not in sitemap.xml");
  }
}
const rb = await fetchPath("/robots.txt");
if (!rb.body.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) err("robots.txt", "does not point at the sitemap");
for (const m of rb.body.matchAll(/^Disallow:\s*(\S+)/gim)) {
  for (const p of smPaths) if (p.startsWith(m[1])) err("robots.txt", `disallows ${p}, which is in the sitemap`);
}

// llms.txt names pages for answer engines; each must resolve and be indexable.
const llms = await fetchPath("/llms.txt");
for (const u of new Set(llms.body.match(/https:\/\/hidescore\.com[^\s)>\]"]*/g) ?? [])) {
  const p = new URL(u).pathname;
  if (p !== "/" && p.endsWith("/")) err("llms.txt", `trailing slash: ${u}`);
  const status = linkStatus.get(p) ?? (await fetchPath(p)).status;
  if (status !== 200) err("llms.txt", `${u} returns ${status}`);
  else if (pages.get(p)?.noindex) err("llms.txt", `${u} is noindex`);
}

server.close();

console.log(`seo-check: ${pages.size} pages crawled, ${linkStatus.size} internal URLs, ${smUrls.length} sitemap URLs`);
for (const x of warnings) console.log(`WARN  ${x}`);
for (const x of errors) console.log(`FAIL  ${x}`);
console.log(`${errors.length} errors, ${warnings.length} warnings`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify([...pages.values()], null, 1));
process.exit(errors.length ? 1 : 0);
