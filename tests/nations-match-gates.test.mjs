import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// UEFA Nations League, 2026-10-03. FOX Sports cuts 8 of the 70 league-phase
// games; TUDN USA (Spanish commentary) is the 2nd slot. Two gates ride with
// both channels (`order=home`, `minsec=300`, see HIGHLIGHT_MATCH_GATES in
// src/lib/youtube.ts):
//
//   1. Each pair meets twice, the return leg 10–12 days later, and no title
//      carries a date. Both channels name the HOME team first (99/99 TUDN
//      titles), so a title naming the away side first is the other leg.
//   2. TUDN posts 1–2 min goal clips beside each 15-minute match cut.
//
// Titles below are TUDN's and FOX's own, as measured 2026-10-03.

function searchHtml(entries) {
  return entries
    .map((e) => {
      const stamp = e.published ? `,"publishedTimeText":{"simpleText":"${e.published}"}` : "";
      const len = e.length ? `,"lengthText":{"accessibility":{},"simpleText":"${e.length}"}` : "";
      return `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}${stamp}${len}}`;
    })
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel = "TUDN USA", html, gates = true }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: channel }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1&channel=${encodeURIComponent(channel)}&comp=nations%20league`;
    if (gates) path += "&order=home&minsec=300";
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Query is "Away vs Home": Czechia hosted Croatia on 9/26 (ESPN 401861063,
// TUDN UCBytbDtcfo "Chequia vs Croacia"). The return leg is in Croatia.
const legs = searchHtml([
  // The return leg (Croatia at home), ranked first.
  { id: "returnLegxx", title: "HIGHLIGHTS - Croatia vs Czech Republic | UEFA Nations League - Matchday 4 2026-27 | TUDN", owner: "TUDN USA", published: "1d ago", length: "15:12" },
  { id: "UCBytbDtcfo", title: "HIGHLIGHTS - Chequia vs Croacia | UEFA Nations League - Jornada 1 2026-27 | TUDN", owner: "TUDN USA", published: "1w ago", length: "15:17" },
]);

test("home-first: the 9/26 card skips the return leg and takes its own game", async () => {
  const { body } = await lookup({ query: "Croatia vs Czechia highlights Sep 26, 2026", html: legs });
  assert.equal(body.videoId, "UCBytbDtcfo");
});

test("home-first: home and away swapped returns nothing when only the other order exists", async () => {
  const html = searchHtml([
    { id: "UCBytbDtcfo", title: "HIGHLIGHTS - Chequia vs Croacia | UEFA Nations League - Jornada 1 2026-27 | TUDN", owner: "TUDN USA", published: "1w ago", length: "15:17" },
  ]);
  const { status } = await lookup({ query: "Czechia vs Croatia highlights Sep 26, 2026", html });
  assert.equal(status, 404);
});

test("without order=home the gate is off (every other league is unchanged)", async () => {
  const { body } = await lookup({ query: "Croatia vs Czechia highlights Sep 26, 2026", html: legs, gates: false });
  assert.equal(body.videoId, "returnLegxx");
});

test("FOX titles pass the same gate (home first)", async () => {
  const html = searchHtml([
    { id: "foxEngSpaxx", title: "England vs Spain Highlights ⚽ UEFA Nations League", owner: "FOX Sports", published: "6d ago", length: "20:51" },
  ]);
  const hit = await lookup({ query: "Spain vs England highlights Sep 26, 2026", channel: "FOX Sports", html });
  assert.equal(hit.body.videoId, "foxEngSpaxx");
  const swapped = await lookup({ query: "England vs Spain highlights Sep 26, 2026", channel: "FOX Sports", html });
  assert.equal(swapped.status, 404);
});

test("duration floor: a 111 s goal clip with 'highlights' in the title is refused", async () => {
  const html = searchHtml([
    { id: "goalClipxxx", title: "HIGHLIGHTS Portugal goal - Denmark vs Portugal | UEFA Nations League - Matchday 3 2026-27 | TUDN", owner: "TUDN USA", published: "2d ago", length: "1:51" },
    { id: "matchCutxxx", title: "HIGHLIGHTS - Dinamarca vs Portugal | UEFA Nations League - Jornada 3 2026-27 | TUDN", owner: "TUDN USA", published: "2d ago", length: "15:17" },
  ]);
  const { body } = await lookup({ query: "Portugal vs Denmark highlights Oct 1, 2026", html });
  assert.equal(body.videoId, "matchCutxxx");
});

test("goal clips without 'highlights' and score-in-title clips never qualify", async () => {
  const html = searchHtml([
    { id: "goalNoHlxxx", title: "PORTUGAL GOAL! Denmark vs Portugal | UEFA Nations League - Matchday 3 2026-27 | TUDN", owner: "TUDN USA", published: "2d ago", length: "10:00" },
    { id: "scoreLinexx", title: "HIGHLIGHTS - Denmark 2-4 Portugal | UEFA Nations League - Matchday 3 2026-27 | TUDN", owner: "TUDN USA", published: "2d ago", length: "15:00" },
  ]);
  const { status } = await lookup({ query: "Portugal vs Denmark highlights Oct 1, 2026", html });
  assert.equal(status, 404);
});

test("Spanish names match: Países Bajos vs Alemania for Germany at Netherlands", async () => {
  const html = searchHtml([
    { id: "VW2NXp9RaOE", title: "HIGHLIGHTS - Países Bajos vs Alemania | UEFA Nations League - Jornada 1 2026-27 | TUDN", owner: "TUDN USA", published: "1w ago", length: "14:47" },
  ]);
  const { body } = await lookup({ query: "Germany vs Netherlands highlights Sep 24, 2026", html });
  assert.equal(body.videoId, "VW2NXp9RaOE");
});

test("Rep Ireland matches 'Irlanda' but never 'Irlanda del Norte' / 'Northern Ireland'", async () => {
  const ireland = searchHtml([
    { id: "eJZca-jevHg", title: "HIGHLIGHTS - Kosovo vs Irlanda | UEFA Nations League - Jornada 1 2026-27 | TUDN", owner: "TUDN USA", published: "1w ago", length: "15:17" },
  ]);
  assert.equal((await lookup({ query: "Rep Ireland vs Kosovo highlights Sep 24, 2026", html: ireland })).body.videoId, "eJZca-jevHg");

  const northern = searchHtml([
    { id: "nIrelandxxx", title: "HIGHLIGHTS - Ucrania vs Irlanda del Norte | UEFA Nations League - Jornada 3 2026-27 | TUDN", owner: "TUDN USA", published: "1d ago", length: "15:14" },
    { id: "nIrelandEng", title: "HIGHLIGHTS - Ukraine vs Northern Ireland | UEFA Nations League - Matchday 3 2026-27 | TUDN", owner: "TUDN USA", published: "1d ago", length: "15:14" },
  ]);
  const wrong = await lookup({ query: "Rep Ireland vs Ukraine highlights Oct 2, 2026", html: northern });
  assert.equal(wrong.status, 404);
  const right = await lookup({ query: "N Ireland vs Ukraine highlights Oct 2, 2026", html: northern });
  assert.equal(right.body.videoId, "nIrelandxxx");
});

test("Concacaf Nations League cuts on the same channel never match a UEFA card", async () => {
  const html = searchHtml([
    { id: "concacafxxx", title: "HIGHLIGHTS - El Salvador vs Jamaica | Concacaf Nations League - Jornada 3 2026-27 | TUDN", owner: "TUDN USA", published: "1d ago", length: "15:10" },
  ]);
  const { status } = await lookup({ query: "Wales vs Norway highlights Oct 1, 2026", html });
  assert.equal(status, 404);
});
