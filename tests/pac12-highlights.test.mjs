import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// Pac-12 football (the ncaaf chain, 2026-10-03). The conference's own cuts
// name the winner or print the score in the title, so a strict lookup on the
// "Pac-12" channel may return one: the client keeps that channel's title bar
// masked (`maskTitle` in src/lib/collegeHighlightChannels.json). Every other
// channel, and every unscoped lookup, still refuses such a title. Titles are
// the channel's own, 2026-09-26.

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]},"publishedTimeText":{"simpleText":"${e.published}"},"lengthText":{"accessibility":{},"simpleText":"${e.length}"}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, html, params }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: "Pac-12" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const res = await worker.fetch(new Request(`https://hidescore.com/api/youtube?q=${encodeURIComponent(query)}${params}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const PAC12 = `&strict=1&channel=${encodeURIComponent("Pac-12")}&comp=${encodeURIComponent("game highlights|game recap")}&week=5`;
const scored = (owner) => searchHtml([
  { id: "Q8CJqkvJRLI", title: "Colorado State at UTSA: Rams See 500 YDS of Offense, Fall 59-45 | FULL Game Highlights (9/26/2026)", owner, published: "6 days ago", length: "3:58" },
]);
const QUERY = "Colorado State vs UTSA highlights Sep 26, 2026";

test("a strict Pac-12 lookup takes the channel's own cut, score and all", async () => {
  const { body } = await lookup({ query: QUERY, html: scored("Pac-12"), params: PAC12 });
  assert.equal(body.videoId, "Q8CJqkvJRLI");
  const win = searchHtml([
    { id: "PyLybmxGWKk", title: "Washington State vs. Arizona: Cougs Battle in Loss, Total 335 YDS | FULL Game Highlights (9/26/2026)", owner: "Pac-12", published: "6 days ago", length: "3:23" },
  ]);
  assert.equal((await lookup({ query: "Arizona vs Washington State highlights Sep 26, 2026", html: win, params: PAC12 })).body.videoId, "PyLybmxGWKk");
});

test("the same title from another channel, or unscoped, is still refused", async () => {
  const cbs = `&strict=1&channel=${encodeURIComponent("CBS Sports College Football")}&comp=football&week=5`;
  assert.equal((await lookup({ query: QUERY, html: scored("CBS Sports College Football"), params: cbs })).status, 404);
  assert.equal((await lookup({ query: QUERY, html: scored("Pac-12"), params: "" })).status, 404);
});

test("the channel's weekly shows and interviews are not a game cut", async () => {
  const html = searchHtml([
    { id: "KNOoq8CyFHE", title: "Every Touchdown From Week 4 | Football Highlights | Pac-12", owner: "Pac-12", published: "6 days ago", length: "7:42" },
    { id: "fcvK2RwvqMs", title: "Boise State Head Coach Spencer Danielson Postgame Interview on ESPN2 | Pac-12 Conference", owner: "Pac-12", published: "6 days ago", length: "1:04" },
  ]);
  assert.equal((await lookup({ query: "Boise State vs Western Michigan highlights Sep 26, 2026", html, params: PAC12 })).status, 404);
});
