import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Legal text (2026-10-16, report #399): /privacy names each outside service the
// code talks to, and /terms carries the DMCA agent line, the repeat-infringer
// line and the bracket picks rules. Each row below pairs a host the code uses
// with the name /privacy gives it. The test reads the code for the host, so a
// row whose host is gone fails too, and the list stays true both ways.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const CODE = [
  "src/app/layout.tsx",
  "src/instrumentation-client.ts",
  "src/components/FeedbackBox.tsx",
  "src/components/VideoModal.tsx",
  "src/lib/news.ts",
  "src/lib/weather.ts",
  "src/lib/rateApp.ts",
  "src/lib/requestedBuilds.ts",
  "public/_worker.js",
  "wrangler.toml",
].map(read).join("\n");
const PRIVACY = read("src/app/privacy/page.tsx");
const TERMS = read("src/app/terms/page.tsx");

const SERVICES = [
  { name: "Cloudflare", host: /\[\[r2_buckets\]\]/ },
  { name: "Umami", host: /stats\.hidescore\.com/ },
  { name: "GoatCounter", host: /gc\.zgo\.at/ },
  { name: "Sentry", host: /ingest\.us\.sentry\.io/ },
  { name: "Apple", host: /appleid\.apple\.com/ },
  { name: "Google", host: /accounts\.google\.com/ },
  { name: "Resend", host: /api\.resend\.com/ },
  { name: "Formspree", host: /formspree\.io/ },
  { name: "GitHub", host: /The repo is public/ },
  { name: "images.weserv.nl", host: /images\.weserv\.nl/ },
  { name: "Open-Meteo", host: /open-meteo\.com/ },
  { name: "ESPN", host: /espn\.com/ },
  { name: "MLB", host: /statsapi\.mlb\.com/ },
  { name: "NHL", host: /api-web\.nhle\.com/ },
  { name: "YouTube", host: /youtube\.com\/iframe_api/ },
  { name: "Brightcove", host: /brightcove/i },
  { name: "FotMob", host: /fotmob/i },
  { name: "Reddit", host: /v\.redd\.it/ },
  { name: "Wikimedia", host: /upload\.wikimedia\.org/ },
  { name: "theScore", host: /api\.thescore\.com/ },
  { name: "PandaScore", host: /api\.pandascore\.co/ },
  { name: "Lichess", host: /lichess\.org\/api/ },
  { name: "World Climbing", host: /ifsc\.results\.info/ },
];

for (const s of SERVICES) {
  test(`/privacy names ${s.name}, and the code still uses it`, () => {
    assert.match(CODE, s.host, `${s.name}: host not found in the code; drop the row and the policy line`);
    assert.ok(PRIVACY.includes(s.name), `${s.name} is used by the code but not named on /privacy`);
  });
}

test("/privacy carries a new date", () => {
  assert.match(PRIVACY, /dateTime="2026-10-16"/);
});

test("/terms has the DMCA agent placeholder and the repeat-infringer line", () => {
  assert.match(TERMS, /const DMCA_AGENT = "\[DMCA AGENT: [^"]+TO BE ADDED BY THE OWNER\]"/);
  assert.match(TERMS, /\{DMCA_AGENT\}/);
  assert.match(TERMS, /We end the accounts of repeat infringers in appropriate circumstances/);
});

test("/terms has the bracket picks rules with the store disclaimer", () => {
  assert.match(TERMS, /id="bracket-rules"/);
  assert.match(TERMS, /Apple and Google\s+are not sponsors/);
  assert.match(TERMS, /18 or older/);
  assert.match(TERMS, /No purchase or account is needed/);
});
