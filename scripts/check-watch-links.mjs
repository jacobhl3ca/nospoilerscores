#!/usr/bin/env node
// Watch-link rot check.
//
// Every "Watch on …" button ultimately resolves to a hand-maintained third-
// party URL hardcoded in src/lib/espn.ts — sportStreamFallback() (per-sport
// streamer landings) and networkStreamUrl() (per-broadcaster deep-links like
// tntdrama.com/watchtnt, cbs.com/live-tv, usanetwork.com/live). When a network
// reorganizes its site one of these silently starts 404ing. Unit tests can't
// catch it: the destinations live on third-party infrastructure, so the only
// way to know is to actually hit them.
//
// This script reads those URLs STRAIGHT FROM THE SOURCE FILE (regex over the
// two stream functions), so any link added to espn.ts is covered automatically
// with no second list to drift out of sync. Templated gamecast/API URLs (the
// ones with ${...}) are skipped — they aren't watch destinations.
//
// Classification (deliberately conservative to match the repo's "don't email
// on infra noise" philosophy — see check-highlight-fallbacks.mjs):
//   FAIL (exit 1 → GitHub Actions emails the owner)
//     • 404 / 410            path moved or removed — the actual rot we're after
//     • DNS failure          domain gone (ENOTFOUND / EAI_AGAIN)
//   WARN (logged, no email)
//     • 403 / 429            bot-blocked (page almost certainly still exists)
//     • 5xx / timeout / other network errors (transient)
//
// Limitation: status-based only. A "soft 404" (HTTP 200 page that says "not
// found") won't be caught — but a real path move returns a real 404.
//
// Run locally:  node scripts/check-watch-links.mjs

import { readFileSync } from "node:fs";

const SRC = new URL("../src/lib/espn.ts", import.meta.url);
const TIMEOUT_MS = 12_000;
const RETRIES = 2;          // attempts after the first, for WARN-class results
const CONCURRENCY = 6;      // be polite to third-party sites
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --- Extract the hardcoded watch URLs from the two stream functions ---------
// Slice from sportStreamFallback() through the end of networkStreamUrl()
// (buildStreamUrl is the next declaration) and pull every non-templated https
// literal. Keeps API endpoints (BASE_URL) and score-revealing gamecast links
// out of the check — they're not "watch" destinations.
function extractWatchUrls(source) {
  const start = source.indexOf("export function sportStreamFallback");
  const end = source.indexOf("function buildStreamUrl");
  if (start === -1 || end === -1 || end < start) {
    console.error(
      "Could not locate the stream functions in espn.ts — the markers moved. " +
        "Update extractWatchUrls() to match the new function names.",
    );
    process.exit(2);
  }
  const slice = source.slice(start, end);
  const urls = new Set();
  for (const m of slice.matchAll(/https:\/\/[^"`\s)]+/g)) {
    const url = m[0];
    if (url.includes("${")) continue; // templated, not a static destination
    urls.add(url);
  }
  return [...urls].sort();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One liveness probe. Returns { kind: 'ok'|'warn'|'fail', status, detail }.
async function probe(url, method = "HEAD") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const s = res.status;
    // Some servers reject HEAD outright (405/501) or hide a real page behind a
    // HEAD-specific 403/404 — re-probe with GET before trusting a hard verdict.
    if (method === "HEAD" && (s === 405 || s === 501 || s === 403 || s === 404)) {
      return probe(url, "GET");
    }
    if (s === 404 || s === 410) return { kind: "fail", status: s, detail: `HTTP ${s}` };
    if (s >= 200 && s < 400) return { kind: "ok", status: s, detail: `HTTP ${s}` };
    // 403 / 429 / 5xx — exists-but-blocked or transient.
    return { kind: "warn", status: s, detail: `HTTP ${s}` };
  } catch (err) {
    const code = err?.cause?.code || err?.code || "";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      return { kind: "fail", status: 0, detail: `DNS: ${code}` };
    }
    const reason = err?.name === "AbortError" ? "timeout" : code || err?.message || "network error";
    return { kind: "warn", status: 0, detail: reason };
  } finally {
    clearTimeout(timer);
  }
}

// Probe with retries — only re-tries WARN/transient results; a clean 404 or a
// 200 is taken at face value immediately.
async function checkUrl(url) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    last = await probe(url);
    if (last.kind === "ok" || last.kind === "fail") return { url, ...last };
    if (attempt < RETRIES) await sleep(1500 * (attempt + 1));
  }
  return { url, ...last };
}

// Simple concurrency-limited map.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// --- Run --------------------------------------------------------------------
const source = readFileSync(SRC, "utf8");
const urls = extractWatchUrls(source);

console.log("hidescore watch-link rot check");
console.log(`source:   src/lib/espn.ts`);
console.log(`checking: ${urls.length} hardcoded watch URL(s)\n`);

const results = await mapLimit(urls, CONCURRENCY, checkUrl);

const fails = results.filter((r) => r.kind === "fail");
const warns = results.filter((r) => r.kind === "warn");
const oks = results.filter((r) => r.kind === "ok");

if (oks.length) {
  console.log(`--- OK (${oks.length}) ---`);
  for (const r of oks.sort((a, b) => a.url.localeCompare(b.url))) {
    console.log(`  ✅ ${r.detail.padEnd(9)} ${r.url}`);
  }
  console.log("");
}

if (warns.length) {
  console.log(`--- WARN (${warns.length}) — bot-blocked or transient, no email ---`);
  for (const r of warns.sort((a, b) => a.url.localeCompare(b.url))) {
    console.log(`  ⚠️  ${r.detail.padEnd(9)} ${r.url}`);
  }
  console.log("");
}

if (fails.length) {
  console.log(`--- FAIL (${fails.length}) — DEAD watch link(s) ---`);
  for (const r of fails.sort((a, b) => a.url.localeCompare(b.url))) {
    console.log(`  ❌ ${r.detail.padEnd(9)} ${r.url}`);
  }
  console.log(
    "\nFix path: find the matching return in sportStreamFallback() or " +
      "networkStreamUrl() in src/lib/espn.ts and point it at the network's " +
      "current live/watch page (or its sportStreamFallback default).",
  );
  process.exit(1);
}

console.log("✅ no dead watch links.");
process.exit(0);
