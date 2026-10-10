import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import worker from "../public/_worker.js";

const { getHighlightFallbackChannels } = await createJiti(import.meta.url).import("../src/lib/youtube.ts");

// UEFA Europa League, 2026-10-03. CBS Sports Golazo - Europe is the official
// channel; TUDN USA (Spanish commentary) is the fallback when CBS skips a game
// (the uel chain in collegeHighlightChannels.json). Both ride the home-first +
// 5-minute gates (`order=home`, `minsec=300`, HIGHLIGHT_MATCH_GATES). The
// titles below are the channels' own from Matchday 1 (9/16–17): CBS's English
// ones, TUDN's Spanish originals (oEmbed) and English search cards.

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]},"publishedTimeText":{"simpleText":"${e.published ?? "2w ago"}"},"lengthText":{"accessibility":{},"simpleText":"${e.length}"}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, html, channel, comp = "" }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: channel }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1&channel=${encodeURIComponent(channel)}&order=home&minsec=300`;
    if (comp) path += `&comp=${encodeURIComponent(comp)}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const CBS = "CBS Sports Golazo - Europe";
const TUDN = "TUDN USA";

test("the four clubs no lookup matched on Matchday 1 match CBS's title forms", async () => {
  const cases = [
    ["NK Celje vs Leverkusen highlights Sep 16, 2026", "AxDvvDN1YyE", "Bayer Leverkusen vs. Celje: Extended Highlights | UEL League Phase MD1 | CBS Sports", "9:43"],
    ["Dinamo Zagreb vs Hapoel Be'er highlights Sep 16, 2026", "kSpATogEltU", "Hapoel Beer-Sheva vs. Dinamo Zagreb: Extended Highlights | UEL League Phase MD1 | CBS Sports", "8:27"],
    ["Torreense vs Lillestrom highlights Sep 17, 2026", "iVilxgb9b5M", "Lillestrøm vs. Torreense: Extended Highlights | UEL League Phase MD1 | CBS Sports Golazo", "10:42"],
    ["Union SG vs Viktoria Plzen highlights Sep 17, 2026", "CqYVt-ZO5oY", "Viktoria Plzeň vs. Union Saint-Gilloise: Extended Highlights | UEL League Phase MD1 | CBS Sports", "10:06"],
  ];
  for (const [query, id, title, length] of cases) {
    const { body } = await lookup({ query, channel: CBS, html: searchHtml([{ id, title, owner: CBS, length }]) });
    assert.equal(body.videoId, id, query);
  }
});

test("TUDN's Spanish and short club names match", async () => {
  const cases = [
    ["Marseille vs Besiktas highlights Sep 17, 2026", "DuIjPzUby38", "HIGHLIGHTS - Besiktas vs Marsella | UEFA Europa League - Jornada 1 Fase de Liga | TUDN"],
    ["Celta Vigo vs Omonia highlights Sep 16, 2026", "Gle8dJQtbck", "HIGHLIGHTS - Omonia vs Celta de Vigo | UEFA Europa League - Fase de Liga Fase de Liga | TUDN"],
    ["RB Salzburg vs Levski Sofia highlights Sep 17, 2026", "37SUJVE9jIs", "HIGHLIGHTS - Levski Sofia vs Salzburg | UEFA Europa League - Fase de Liga Fase de Liga | TUDN"],
    ["Rennes vs Sturm Graz highlights Sep 16, 2026", "ivejCCzykYU", "HIGHLIGHTS - Sturm vs Rennes | UEFA Europa League - Fase de Liga Fase de Liga | TUDN"],
    ["Hoffenheim vs OFI Crete highlights Sep 17, 2026", "Vjb6CfaOqIM", "HIGHLIGHTS - OFI vs Hoffenheim | UEFA Europa League - Fase de Liga Fase de Liga | TUDN"],
    ["Dinamo Zagreb vs Hapoel Be'er highlights Sep 16, 2026", "2iPugwa3EXQ", "HIGHLIGHTS - H Beer Sheva vs Dinamo Zagreb | UEFA Europa League - Fase de Liga Fase de Liga | TUDN"],
  ];
  for (const [query, id, title] of cases) {
    const { body } = await lookup({ query, channel: TUDN, comp: "europa league", html: searchHtml([{ id, title, owner: TUDN, length: "15:00" }]) });
    assert.equal(body.videoId, id, query);
  }
});

test("TUDN: a goal clip is refused, the match cut taken; the away-first leg is refused", async () => {
  const html = searchHtml([
    { id: "i1YGUFvOwSc", title: "A 5-0 WIN! Juventus 5-0 NEC | UEFA Europa League - League Stage | TUDN", owner: TUDN, length: "1:36" },
    { id: "goalHlClipx", title: "HIGHLIGHTS Juventus goal - Juventus vs NEC | UEFA Europa League - League Phase | TUDN", owner: TUDN, length: "1:50" },
    { id: "qsslasQvIc8", title: "HIGHLIGHTS - Juventus vs NEC | UEFA Europa League - League Phase | TUDN", owner: TUDN, length: "15:20" },
  ]);
  assert.equal((await lookup({ query: "NEC vs Juventus highlights Sep 17, 2026", channel: TUDN, comp: "europa league", html })).body.videoId, "qsslasQvIc8");
  // The reverse fixture: Juventus away at NEC.
  assert.equal((await lookup({ query: "Juventus vs NEC highlights Sep 17, 2026", channel: TUDN, comp: "europa league", html })).status, 404);
});

test("a TUDN cut of the same pair in another competition never matches a Europa League card", async () => {
  const html = searchHtml([
    { id: "otherCompxx", title: "HIGHLIGHTS - Juventus vs NEC | UEFA Nations League - Jornada 1 2026-27 | TUDN", owner: TUDN, length: "15:00" },
  ]);
  assert.equal((await lookup({ query: "NEC vs Juventus highlights Sep 17, 2026", channel: TUDN, comp: "europa league", html })).status, 404);
});

test("the uel chain: TUDN after CBS, live (not search-only), gated on its own token", () => {
  const chain = getHighlightFallbackChannels("uel", CBS, { id: "uel-111", conferenceId: null }, { id: "uel-222", conferenceId: null }, []);
  assert.deepEqual(chain, [{ channel: TUDN, titleTokens: ["europa league"] }]);
  // CBS titles read "UEL League Phase MD1": a sport-wide token would refuse them.
  const youtube = readFileSync(new URL("../src/lib/youtube.ts", import.meta.url), "utf8");
  assert.ok(!/^\s*uel: \[/m.test(youtube.slice(youtube.indexOf("const COMPETITION_TITLE_TOKENS"), youtube.indexOf("const NFL_PRESEASON_TITLE_TOKENS"))));
});
