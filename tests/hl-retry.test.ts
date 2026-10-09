import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// Second-chance highlight lookups, added 2026-10-09 from the 10/2–10/8 gap
// audit. Real misses:
//   WNBA  Aces @ Valkyries, 9:30 PM ET 10/7 — clip titled by the UTC day (Oct 8)
//   URC   Zebre @ Cardiff Blues, 10/2 — "Cardiff v Zebre Parma", no "Rugby"
//   Nations  Luxembourg @ Estonia, 10/3 — TUDN "Estonia vs Lexemburgo" (typo)
const jiti = createJiti(import.meta.url);
const retry = await jiti.import<{
  hlDateStrs: (iso: string) => string[];
  hlNamePairs: (away: string, home: string) => [string, string][];
  hlTypoWordIndex: (title: string, variant: string) => number;
  HL_TEAM_SHORT_ALIASES: Record<string, string>;
}>("../scripts/lib/hl-retry.mjs");
const yt = await jiti.import<{
  highlightDateStrs: (date: Date, timeZone: string) => string[];
  highlightNamePairs: (away: string, home: string) => [string, string][];
  resolveHighlightVideo: (away: string, home: string, dateStr: string | string[], series: string | null, channel?: string) => Promise<string | null>;
}>("../src/lib/youtube.ts");

test("bake: a night game also tries the UTC date, a day game only the ET date", () => {
  assert.deepEqual(retry.hlDateStrs("2026-10-08T01:30Z"), ["Oct 7, 2026", "Oct 8, 2026"]);
  assert.deepEqual(retry.hlDateStrs("2026-10-07T23:30Z"), ["Oct 7, 2026"]);
  assert.deepEqual(retry.hlDateStrs("not a date"), ["Invalid Date"]);
});

test("live: same date rule in the reader's zone; invalid date degrades to empty", () => {
  const night = new Date("2026-10-08T01:30Z");
  assert.deepEqual(yt.highlightDateStrs(night, "America/New_York"), ["Oct 7, 2026", "Oct 8, 2026"]);
  assert.deepEqual(yt.highlightDateStrs(night, "Europe/London"), ["Oct 8, 2026"]);
  assert.deepEqual(yt.highlightDateStrs(new Date("bad"), "America/New_York"), [""]);
});

test("Cardiff Blues gets a short-name retry, other teams do not", () => {
  assert.deepEqual(retry.hlNamePairs("Zebre", "Cardiff Blues"), [["Zebre", "Cardiff Blues"], ["Zebre", "Cardiff"]]);
  assert.deepEqual(retry.hlNamePairs("Connacht", "Benetton Treviso"), [["Connacht", "Benetton Treviso"]]);
  assert.deepEqual(yt.highlightNamePairs("Zebre", "Cardiff Blues"), retry.hlNamePairs("Zebre", "Cardiff Blues"));
});

test("short alias tables match between bake and client", () => {
  const ytSrc = readFileSync(new URL("../src/lib/youtube.ts", import.meta.url), "utf8");
  for (const [espn, short] of Object.entries(retry.HL_TEAM_SHORT_ALIASES)) {
    assert.ok(ytSrc.includes(`"${espn}": "${short}"`), `${espn} missing from TEAM_NAME_SHORT_ALIASES`);
  }
});

test("typo match: one letter off, whole word, 7+ letters only", () => {
  const title = "highlights estonia vs lexemburgo uefa nations league";
  assert.equal(retry.hlTypoWordIndex(title, "luxemburgo"), title.indexOf("lexemburgo"));
  assert.equal(retry.hlTypoWordIndex(title, "luxembourg"), -1); // 3 letters off
  assert.equal(retry.hlTypoWordIndex(title, "estonia"), -1); // exact is not a typo
  assert.equal(retry.hlTypoWordIndex("raiders vs rangers", "rangers"), -1); // exact word present elsewhere, 2 off from raiders
  assert.equal(retry.hlTypoWordIndex("jets vs nets", "jets"), -1); // too short
  assert.equal(retry.hlTypoWordIndex("new york giants", "new york giant"), -1); // multi-word variant
  assert.equal(retry.hlTypoWordIndex("slovakia vs malta", "slovenia"), -1); // 2 off
});

test("bake: the team gate accepts one exact team plus a one-letter typo, never two typos", () => {
  const bake = readFileSync(new URL("../scripts/prebake-news.mjs", import.meta.url), "utf8");
  assert.match(bake, /if \(!exactAway && !exactHome\) return false;/);
  assert.match(bake, /hlNamePairs\(away, home\)/);
  assert.match(bake, /hlDateStrs\(item\.date\)/);
});

test("live resolve: retries the UTC date, then the short names, and stops at the first hit", async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const q = new URL(url, "https://x").searchParams.get("q") ?? "";
    seen.push(q);
    const hit = q.includes("Oct 8, 2026") || q.startsWith("Zebre vs Cardiff highlights");
    return new Response(JSON.stringify(hit ? { videoId: "abc" } : { error: "No results" }), { status: hit ? 200 : 404 });
  }) as typeof fetch;
  try {
    assert.equal(await yt.resolveHighlightVideo("Aces", "Valkyries", ["Oct 7, 2026", "Oct 8, 2026"], null, "WNBA"), "abc");
    assert.deepEqual(seen, ["Aces vs Golden State Valkyries highlights Oct 7, 2026", "Aces vs Golden State Valkyries highlights Oct 8, 2026"]);
    seen.length = 0;
    assert.equal(await yt.resolveHighlightVideo("Zebre", "Cardiff Blues", "Oct 2, 2026", null, "United Rugby Championship"), "abc");
    assert.deepEqual(seen, ["Zebre vs Cardiff Rugby highlights Oct 2, 2026", "Zebre vs Cardiff highlights Oct 2, 2026"]);
    seen.length = 0;
    assert.equal(await yt.resolveHighlightVideo("Dream", "Liberty", "Oct 5, 2026", null, "WNBA"), null);
    assert.equal(seen.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
