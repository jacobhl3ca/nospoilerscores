import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// Atlantic Hockey America titles its women's hockey cuts as a bare scoreline
// with the date — "Ohio State 2, Penn State 1 OT - Sept. 24, 2026" — no
// "highlights", score in the title, month abbreviated with a period. Before
// 2026-09-26 the worker refused every one of them twice over (no highlight
// word; score-bearing title), and read "Sept." as no date at all. These tests
// pin the carve-out: strict + that channel + the house shape only, with the
// explicit-date gate still deciding between two nights of the same pair.

const NIGHT_ONE = "aaaaaaaaaaa";
const NIGHT_TWO = "bbbbbbbbbbb";
const EXHIBITION = "ccccccccccc";
const SHOW = "ddddddddddd";

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel, strict = true, comp, html, oembedAuthor = "Atlantic Hockey America" }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: oembedAuthor }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) path += `&channel=${encodeURIComponent(channel)}`;
    if (strict) path += "&strict=1";
    if (comp) path += `&comp=${encodeURIComponent(comp)}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return await res.json();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The channel's real feed on 2026-09-26, two nights of the same pair, the
// undated exhibition and a show trailer.
const AHA_HTML = searchHtml([
  { id: SHOW, title: "The AHA Show Trailer: Sept. 24, 2026", owner: "Atlantic Hockey America" },
  { id: NIGHT_TWO, title: "Ohio State 2, Penn State 1 - Sept. 25, 2026", owner: "Atlantic Hockey America" },
  { id: NIGHT_ONE, title: "Ohio State 2, Penn State 1 OT - Sept. 24, 2026", owner: "Atlantic Hockey America" },
  { id: EXHIBITION, title: "Robert Morris 8, Post 3", owner: "Atlantic Hockey America" },
]);

test("a strict AHA lookup serves the scoreline cut whose date matches the query", async () => {
  const one = await lookup({ query: "Ohio State vs Penn State highlights Sep 24, 2026", channel: "Atlantic Hockey America", html: AHA_HTML });
  assert.equal(one.videoId, NIGHT_ONE);
  const two = await lookup({ query: "Ohio State vs Penn State highlights Sep 25, 2026", channel: "Atlantic Hockey America", html: AHA_HTML });
  assert.equal(two.videoId, NIGHT_TWO);
});

test("the undated exhibition and a third night find nothing", async () => {
  const exhibition = await lookup({ query: "Post vs Robert Morris highlights Sep 25, 2026", channel: "Atlantic Hockey America", html: AHA_HTML });
  assert.equal(exhibition.videoId, undefined);
  const nothing = await lookup({ query: "Ohio State vs Penn State highlights Sep 26, 2026", channel: "Atlantic Hockey America", html: AHA_HTML });
  assert.equal(nothing.videoId, undefined);
});

test("the carve-out is the channel's alone: the same title on another channel, or unscoped, is still refused", async () => {
  const other = searchHtml([{ id: NIGHT_ONE, title: "Ohio State 2, Penn State 1 OT - Sept. 24, 2026", owner: "ECAC Hockey" }]);
  const strictOther = await lookup({ query: "Ohio State vs Penn State highlights Sep 24, 2026", channel: "ECAC Hockey", html: other, oembedAuthor: "ECAC Hockey" });
  assert.equal(strictOther.videoId, undefined);
  const unscoped = await lookup({ query: "Ohio State vs Penn State highlights Sep 24, 2026", strict: false, html: AHA_HTML });
  assert.equal(unscoped.videoId, undefined);
});

test("an AHA title outside the scoreline shape is not accepted", async () => {
  const odd = searchHtml([{ id: SHOW, title: "Ohio State and Penn State: the rivalry - Sept. 24, 2026", owner: "Atlantic Hockey America" }]);
  const res = await lookup({ query: "Ohio State vs Penn State highlights Sep 24, 2026", channel: "Atlantic Hockey America", html: odd });
  assert.equal(res.videoId, undefined);
});
