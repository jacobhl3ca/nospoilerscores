import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// /api/youtube returns the clip's running time beside its id, read from the
// search page's lengthText. A live-resolved button needs it to show "9m" like a
// baked one: UCL 2026-09-10 Roma–Fenerbahce (never baked) read "UCL" while
// Shakhtar–PSV (baked) read "9m" on the same board.

const HIT_ID = "O83kM__1F5Q";
const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

function block({ id, title, owner, length }) {
  const len = length
    ? `,"lengthText":{"accessibility":{"accessibilityData":{"label":"${length} long"}},"simpleText":"${length}"}`
    : "";
  return `"videoRenderer":{"videoId":"${id}","title":{"runs":[{"text":"${title}"}]},"ownerText":{"runs":[{"text":"${owner}"}]}${len},"viewCountText":{"simpleText":"1,234 views"}}`;
}

async function lookup(html) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: "CBS Sports Golazo" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const q = "AS Roma vs Fenerbahce highlights Sep 10, 2026";
    const res = await worker.fetch(new Request(`https://hidescore.com/api/youtube?q=${encodeURIComponent(q)}&channel=${encodeURIComponent("CBS Sports Golazo")}&strict=1`), stubEnv());
    return await res.json();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const TITLE = "HIGHLIGHTS | Fenerbahce vs. AS Roma | UEFA Champions League 2026/27";

test("the lookup reports the chosen clip's length in seconds", async () => {
  const body = await lookup(block({ id: HIT_ID, title: TITLE, owner: "CBS Sports Golazo", length: "8:46" }));
  assert.equal(body.videoId, HIT_ID);
  assert.equal(body.lengthSec, 526);
});

test("hour-long clips parse h:mm:ss", async () => {
  const body = await lookup(block({ id: HIT_ID, title: TITLE, owner: "CBS Sports Golazo", length: "1:02:15" }));
  assert.equal(body.lengthSec, 3735);
});

test("no lengthText → no lengthSec, id still served", async () => {
  const body = await lookup(block({ id: HIT_ID, title: TITLE, owner: "CBS Sports Golazo" }));
  assert.equal(body.videoId, HIT_ID);
  assert.equal(body.lengthSec, undefined);
});
