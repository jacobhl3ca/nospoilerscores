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
// existing dates keep resolving. MLB drops today's row from the upcoming-
// shows page the moment it starts airing, so we also merge recent entries
// (within 2 days) from prior sources when the new scrape lacks them —
// otherwise the LIVE indicator would vanish mid-air. We merge from BOTH the
// live published file (hidescore.com R2) and the local checked-out copy so
// the workflow doesn't need to download R2 first.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_URL = "https://www.mlb.com/network/modules/shows/mlbn-big-inning";
const LIVE_PRIOR_URL = "https://hidescore.com/big-inning-schedule.json";
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

  // Merge forward from prior sources so today's entry survives MLB rolling
  // it off the page mid-air. Drop anything older than 2 days to keep the file
  // tight. Sources: live published file (R2), then local committed copy.
  const isoToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const cutoff = new Date(`${isoToday}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 2);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const priorSources = [];
  try {
    const liveRes = await fetch(LIVE_PRIOR_URL, {
      headers: { "user-agent": UA },
      cache: "no-store",
    });
    if (liveRes.ok) {
      const liveDoc = await liveRes.json();
      if (liveDoc?.schedule) priorSources.push(["live", liveDoc.schedule]);
    }
  } catch (e) {
    console.warn(`Live prior fetch failed: ${e.message}`);
  }
  if (existsSync(OUT_PATH)) {
    try {
      const localDoc = JSON.parse(readFileSync(OUT_PATH, "utf8"));
      if (localDoc?.schedule) priorSources.push(["local", localDoc.schedule]);
    } catch (e) {
      console.warn(`Local prior parse failed: ${e.message}`);
    }
  }

  let preserved = 0;
  for (const [, priorSchedule] of priorSources) {
    for (const [date, entry] of Object.entries(priorSchedule)) {
      if (date < cutoffIso) continue;
      if (!schedule[date]) {
        schedule[date] = entry;
        preserved++;
      }
    }
  }

  const sorted = Object.fromEntries(
    Object.entries(schedule).sort(([a], [b]) => a.localeCompare(b))
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    schedule: sorted,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${Object.keys(sorted).length} entries to ${OUT_PATH}` +
      (preserved ? ` (${preserved} preserved from prior file)` : "")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
