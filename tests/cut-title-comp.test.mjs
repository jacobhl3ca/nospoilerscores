import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// YouTube cuts every title at 100 characters. Conference USA titles each
// football cut "… - Highlights | 2026 Regular Season Week N", and the ncaaf
// chain sends comp=football|regular season week for that channel. FIU at
// Jacksonville State (2026-10-13) has two long school names, so the title
// ends "Regular Season W" and the card stayed dark with the right cut on the
// page. See compTitleMatches / cutTitleEndsInToken in public/_worker.js.

const FIU_CUT = "Florida International Panthers vs. Jacksonville State Gamecocks - Highlights | 2026 Regular Season W";

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"Conference USA"}]},"publishedTimeText":{"simpleText":"14 hours ago"},"lengthText":{"accessibility":{},"simpleText":"5:02"}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup(query, title) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(searchHtml([{ id: "zzXGp7TNiMc", title }]), { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return new Response(JSON.stringify({ author_name: "Conference USA", title }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const comp = encodeURIComponent("football|regular season week");
    const path = `/api/youtube?q=${encodeURIComponent(query)}&channel=Conference%20USA&comp=${comp}&week=7&strict=1`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("a CUSA cut that YouTube cut inside \"Regular Season Week\" resolves", async () => {
  assert.equal([...FIU_CUT].length, 100);
  const { body } = await lookup("Florida International vs Jacksonville State highlights Oct 13, 2026", FIU_CUT);
  assert.equal(body.videoId, "zzXGp7TNiMc");
});

test("the same ending under 100 characters is a title without the token", async () => {
  const short = "FIU Panthers vs. Jacksonville State Gamecocks - Highlights | 2026 Regular Season W";
  const { status } = await lookup("FIU vs Jacksonville State highlights Oct 13, 2026", short);
  assert.equal(status, 404);
});

test("a cut right after the token's first word does not count", async () => {
  const regular = "Florida International Panthers vs. Jacksonville State Gamecocks - Highlights | xxxxxxxx 2026 Regular";
  assert.equal([...regular].length, 100);
  const { status } = await lookup("Florida International vs Jacksonville State highlights Oct 13, 2026", regular);
  assert.equal(status, 404);
});
