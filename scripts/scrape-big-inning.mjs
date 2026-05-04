// Scrape MLB Network's Big Inning schedule from the show's lazy-loaded iframe
// at /network/modules/shows/mlbn-big-inning. Each row in the table is RSC-
// streamed with a key like "mlbn-big-inning-MM/DD/YYYY-H:MM AM/PM" — a single
// regex pulls every entry from the static HTML response, no headless browser.
//
// Output: public/big-inning-schedule.json keyed by ISO date (YYYY-MM-DD).
// Off-days (Big Inning doesn't air every night) are simply absent from the
// map; the subtitle hides on those days.
//
// Runs on cron. On a parse failure with no entries we keep the prior file so
// existing dates keep resolving.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_URL = "https://www.mlb.com/network/modules/shows/mlbn-big-inning";
const OUT_PATH = resolve("public/big-inning-schedule.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15";

const ROW_RE =
  /mlbn-big-inning-(\d{2})\/(\d{2})\/(\d{4})-(\d{1,2}:\d{2}\s*(?:AM|PM))/g;

async function main() {
  const res = await fetch(SOURCE_URL, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${SOURCE_URL}`);
  const html = await res.text();

  const schedule = {};
  for (const m of html.matchAll(ROW_RE)) {
    const [, mm, dd, yyyy, timeET] = m;
    schedule[`${yyyy}-${mm}-${dd}`] = { timeET: timeET.trim() };
  }

  if (!Object.keys(schedule).length) {
    if (existsSync(OUT_PATH)) {
      console.warn("No entries scraped; preserving previous file");
      return;
    }
    throw new Error("No entries scraped and no previous file to preserve");
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    schedule,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(schedule).length} entries to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
