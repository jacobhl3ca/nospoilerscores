import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// 2026-10-01: every WNBA first-round card's 1st highlight button played the
// postgame press conference. The WNBA channel streams one per playoff game,
// titled "Minnesota Lynx vs. New York Liberty Game 2 Postgame Press
// Conference" — both teams, the series game, no date, no "highlights". The
// strict bare-WNBA-recap carve-out let it count as a highlight, and it beat
// the real "… | FULL GAME HIGHLIGHTS | September 29, 2026" cut, which the
// full-game demote parks in the extended tier. Titles below are the real ones.

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel = "WNBA", html, oembedAuthor = "WNBA" }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: oembedAuthor }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const path = `/api/youtube?q=${encodeURIComponent(query)}&channel=${encodeURIComponent(channel)}&strict=1`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const QUERY = "Lynx vs Liberty highlights Sep 29, 2026 Game 2";
const PRESSER = { id: "p64rNPhCiXY", title: "Minnesota Lynx vs. New York Liberty Game 2 Postgame Press Conference", owner: "WNBA" };
const FULL_GAME = { id: "bOpl7OvzeG4", title: "Minnesota Lynx vs. New York Liberty | FULL GAME HIGHLIGHTS | September 29, 2026", owner: "WNBA" };

test("Lynx-Liberty G2: the full-game highlights win over the postgame press conference", async () => {
  const { body } = await lookup({ query: QUERY, html: searchHtml([PRESSER, FULL_GAME]) });
  assert.equal(body.videoId, FULL_GAME.id);
});

test("a press conference alone resolves to nothing, so the button hides", async () => {
  const { status } = await lookup({ query: QUERY, html: searchHtml([PRESSER]) });
  assert.equal(status, 404);
});

test("a press conference is refused even when its title says highlights", async () => {
  const mixed = { id: "mixedPress1", title: "Minnesota Lynx vs. New York Liberty Game 2 Highlights & Press Conference", owner: "WNBA" };
  const { status } = await lookup({ query: QUERY, html: searchHtml([mixed]) });
  assert.equal(status, 404);
});

test("the bare dated WNBA recap still counts as a highlight", async () => {
  const bare = { id: "bareRecap01", title: "Minnesota Lynx vs. New York Liberty | September 29, 2026", owner: "WNBA" };
  const { body } = await lookup({ query: QUERY, html: searchHtml([bare]) });
  assert.equal(body.videoId, bare.id);
});

test("an undated bare WNBA title is not a recap", async () => {
  const show = { id: "pregameShow", title: "Minnesota Lynx vs. New York Liberty Game 2 Pregame Show", owner: "WNBA" };
  const { status } = await lookup({ query: QUERY, html: searchHtml([show]) });
  assert.equal(status, 404);
});
