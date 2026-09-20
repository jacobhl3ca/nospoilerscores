import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// /api/youtube?strict=1 resolves ONLY through the channel tiers, and those tiers
// used to require the search page's ownerText to equal the requested channel
// byte for byte. YouTube bylines a co-upload as "A and B", so TUDN's
// Puebla–Atlante recap of 2026-09-18 read "TUDN USA and ViX" on the results page
// while oembed named it "TUDN USA" — the Liga MX card went dark holding the
// right clip. These tests pin the tolerance AND the oembed gate that backs it.

const HIT_ID = "CjUnfhfmG1s";
const OTHER_ID = "j-OO8M-uf_g";

// One videoRenderer block per entry, in the shape the handler splits on.
function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel, strict = true, comp, html, oembedAuthor, oembedStatus = 200 }) {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input) => {
    const u = String(input);
    seen.push(u);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      return oembedStatus === 200
        ? new Response(JSON.stringify({ author_name: oembedAuthor }), { status: 200, headers: { "Content-Type": "application/json" } })
        : new Response("nope", { status: oembedStatus });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) path += `&channel=${encodeURIComponent(channel)}`;
    if (strict) path += "&strict=1";
    if (comp) path += `&comp=${encodeURIComponent(comp)}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { body: await res.json(), seen };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const LIGAMX_HTML = searchHtml([
  { id: HIT_ID, title: "HIGHLIGHTS - Puebla vs Atlante | Liga MX - Matchday 9 Apertura 2026 | TUDN", owner: "TUDN USA and ViX" },
  { id: OTHER_ID, title: "ATLANTE GOAL! Puebla vs Atlante | Liga MX - Matchday 9 Apertura 2026", owner: "TUDN USA" },
]);

test("a strict lookup accepts a co-upload byline the oembed owner confirms", async () => {
  const { body } = await lookup({
    query: "Atlante vs Puebla highlights Sep 18, 2026",
    channel: "TUDN USA",
    html: LIGAMX_HTML,
    oembedAuthor: "TUDN USA",
  });
  assert.equal(body.videoId, HIT_ID);
});

test("the co-upload tolerance is not a channel bypass — oembed still decides", async () => {
  // Same page, same byline, but the real uploader is the OTHER half of the
  // collaboration. Strict must return nothing rather than serve ViX's copy.
  const { body } = await lookup({
    query: "Atlante vs Puebla highlights Sep 18, 2026",
    channel: "TUDN USA",
    html: searchHtml([
      { id: HIT_ID, title: "HIGHLIGHTS - Puebla vs Atlante | Liga MX - Matchday 9 Apertura 2026 | TUDN", owner: "TUDN USA and ViX" },
    ]),
    oembedAuthor: "ViX",
  });
  assert.equal(body.videoId, undefined);
  assert.ok(body.error);
});

test("a byline that merely contains the channel name is still rejected", async () => {
  // "and" joins whole accounts. A different channel whose name happens to
  // embed the requested one must not open the channel tiers.
  const { body } = await lookup({
    query: "Atlante vs Puebla highlights Sep 18, 2026",
    channel: "TUDN USA",
    html: searchHtml([
      { id: HIT_ID, title: "HIGHLIGHTS - Puebla vs Atlante | Liga MX - Matchday 9 Apertura 2026", owner: "TUDN USA Fan Uploads" },
    ]),
    oembedAuthor: "TUDN USA Fan Uploads",
  });
  assert.equal(body.videoId, undefined);
});

test("La Liga keeps its ESPN FC cut and refuses one without LALIGA in the title", async () => {
  const espnHtml = searchHtml([
    { id: HIT_ID, title: "Real Sociedad vs. Atletico Madrid | LALIGA Highlights | ESPN FC", owner: "ESPN FC" },
  ]);
  const { body: kept } = await lookup({
    query: "Atlético vs Real Sociedad highlights Sep 13, 2026",
    channel: "ESPN FC",
    comp: "laliga|la liga",
    html: espnHtml,
    oembedAuthor: "ESPN FC",
  });
  assert.equal(kept.videoId, HIT_ID);

  // The Copa del Rey failure shape: the right channel, the right two clubs, the
  // right year — and the wrong competition.
  const cupHtml = searchHtml([
    { id: HIT_ID, title: "Real Sociedad vs. Atletico Madrid | Copa del Rey Highlights | ESPN FC", owner: "ESPN FC" },
  ]);
  const { body: refused } = await lookup({
    query: "Atlético vs Real Sociedad highlights Sep 13, 2026",
    channel: "ESPN FC",
    comp: "laliga|la liga",
    html: cupHtml,
    oembedAuthor: "ESPN FC",
  });
  assert.equal(refused.videoId, undefined);
});

test("Ligue 1 requires the league name, so a Coupe de France cut cannot win", async () => {
  const mk = (title) => searchHtml([{ id: HIT_ID, title, owner: "beIN SPORTS USA" }]);
  const { body: kept } = await lookup({
    query: "Lyon vs Paris FC highlights Sep 12, 2026",
    channel: "beIN SPORTS USA",
    comp: "ligue 1",
    html: mk("Paris FC vs Lyon | HIGHLIGHTS Ligue 1 | 09/12/2026 | beIN SPORTS USA"),
    oembedAuthor: "beIN SPORTS USA",
  });
  assert.equal(kept.videoId, HIT_ID);

  const { body: refused } = await lookup({
    query: "Lyon vs Paris FC highlights Sep 12, 2026",
    channel: "beIN SPORTS USA",
    comp: "ligue 1",
    html: mk("Paris FC vs Lyon | HIGHLIGHTS Coupe de France | 09/12/2026 | beIN SPORTS USA"),
    oembedAuthor: "beIN SPORTS USA",
  });
  assert.equal(refused.videoId, undefined);
});
