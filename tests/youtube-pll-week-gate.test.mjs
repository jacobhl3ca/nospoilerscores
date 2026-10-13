import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// The PLL channel titles every 2026 regular-season cut "Away vs. Home Week N
// Game Highlights | 2026 Season" (no date) and every playoff cut by its round
// ("… Semifinals Game Highlights | 2026 Season", no week). Six pairs met two or
// three times in 2026, so before the week gate the live worker served the Week
// 12 Atlas–Outlaws cut for their Week 3 game, and the pair's Semifinals cut for
// a Week 2 Waterdogs at Cannons game (probed 2026-10-13). These tests pin the
// gate: a week query takes only its own week, a round query takes only its
// round and never a week, and an older season's dated cut never passes.

const CHANNEL = "Premier Lacrosse League";
const WEEK_3 = "J718zSen4UE";
const WEEK_12 = "xrnSE2MEzrs";
const CHAMPIONSHIP = "hxOo9yBO-6o";
const CS_FINAL = "lwrl_MsMeIg";
const SEMIS = "k4cCMnK7zNk";
const WEEK_2_PAIR = "aaaaaaaaaaa";
const OLD_SEASON = "bbbbbbbbbbb";

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner ?? CHANNEL}"}]}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, week, comp, html }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: CHANNEL }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}&channel=${encodeURIComponent(CHANNEL)}&strict=1`;
    if (week) path += `&week=${week}`;
    if (comp) path += `&comp=${encodeURIComponent(comp)}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return await res.json();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The two Atlas–Outlaws meetings, the later one ranked first (as the live
// search page ranked them on 2026-10-13).
const ATLAS_OUTLAWS_HTML = searchHtml([
  { id: WEEK_12, title: "New York Atlas vs. Denver Outlaws Week 12 Game Highlights | 2026 Season" },
  { id: WEEK_3, title: "New York Atlas vs. Denver Outlaws Week 3 Game Highlights | 2026 Season" },
]);

test("May 30 Atlas at Outlaws (Week 3) gets the Week 3 cut, not the Week 12 rematch ranked above it", async () => {
  const res = await lookup({ query: "Atlas vs Outlaws highlights May 30, 2026", week: 3, html: ATLAS_OUTLAWS_HTML });
  assert.equal(res.videoId, WEEK_3);
  const later = await lookup({ query: "Atlas vs Outlaws highlights Aug 8, 2026", week: 12, html: ATLAS_OUTLAWS_HTML });
  assert.equal(later.videoId, WEEK_12);
});

test("a week with no cut of its own finds nothing, and a week-less playoff cut never fills a week slot", async () => {
  const none = await lookup({ query: "Atlas vs Outlaws highlights Jun 20, 2026", week: 5, html: ATLAS_OUTLAWS_HTML });
  assert.equal(none.videoId, undefined);
  const semisOnly = searchHtml([
    { id: SEMIS, title: "Boston Cannons vs. Philadelphia Waterdogs Semifinals Game Highlights | 2026 Season" },
  ]);
  const wk2 = await lookup({ query: "Waterdogs vs Cannons highlights May 16, 2026", week: 2, html: semisOnly });
  assert.equal(wk2.videoId, undefined);
});

test("a 2025 dated cut of the same pair is refused", async () => {
  const html = searchHtml([
    { id: OLD_SEASON, title: "New York Atlas vs. Denver Outlaws Full Game Highlights | May 31, 2025" },
  ]);
  const res = await lookup({ query: "Atlas vs Outlaws highlights May 30, 2026", week: 3, html });
  assert.equal(res.videoId, undefined);
});

test("a Semifinals query refuses a Week N cut of the same pair and takes the Semifinals cut", async () => {
  const html = searchHtml([
    { id: WEEK_2_PAIR, title: "Boston Cannons vs. Philadelphia Waterdogs Week 2 Game Highlights | 2026 Season" },
    { id: SEMIS, title: "Boston Cannons vs. Philadelphia Waterdogs Semifinals Game Highlights | 2026 Season" },
  ]);
  const res = await lookup({ query: "Cannons vs Waterdogs highlights Sep 7, 2026", comp: "semifinals", html });
  assert.equal(res.videoId, SEMIS);
  const weekOnly = searchHtml([
    { id: WEEK_2_PAIR, title: "Boston Cannons vs. Philadelphia Waterdogs Week 2 Semifinals Preview Game Highlights | 2026 Season" },
  ]);
  const refused = await lookup({ query: "Cannons vs Waterdogs highlights Sep 7, 2026", comp: "semifinals", html: weekOnly });
  assert.equal(refused.videoId, undefined, "a title that names a week is a regular-season meeting");
});

test("the Championship query takes the Championship Game cut, never the Championship Series final", async () => {
  const html = searchHtml([
    { id: CS_FINAL, title: "Denver Outlaws vs Philadelphia Waterdogs | 2026 Championship Series Final Full Game Highlights" },
    { id: CHAMPIONSHIP, title: "Denver Outlaws vs. Philadelphia Waterdogs Championship Game Highlights | 2026 Season" },
  ]);
  const res = await lookup({ query: "Outlaws vs Waterdogs highlights Sep 20, 2026", comp: "championship game", html });
  assert.equal(res.videoId, CHAMPIONSHIP);
});
