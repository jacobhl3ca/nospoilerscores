import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";
import { channelSearchTitleTokens, titleHasCompToken } from "../scripts/lib/channel-search.mjs";

// Top 14, lit 2026-10-03 on "TOP 14 - Officiel" behind the "top 14" token and
// the home-first + 2-minute gates (HIGHLIGHT_MATCH_GATES in src/lib/youtube.ts).
// Titles below are the channel's own, rounds 3 and 4 (Sep 19–27, 2026).
//
//   1. ESPN's "Pau", "La Rochelle", "Lyon", "Bayonne" and "Bordeaux Begles"
//      are not in the titles ("Section Paloise", "Stade Rochelais", "LOU
//      Rugby", "Aviron Bayonnais", "Union Bordeaux-Bègles").
//   2. Some cuts say "Match Summary" instead of "Highlights".
//   3. Each try gets its own 30–100 s clip naming both clubs.
//   4. Each pair meets twice a season; the home club is named first.

function searchHtml(entries) {
  return entries
    .map((e) => {
      const stamp = e.published ? `,"publishedTimeText":{"simpleText":"${e.published}"}` : "";
      const len = e.length ? `,"lengthText":{"accessibility":{},"simpleText":"${e.length}"}` : "";
      return `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner ?? "TOP 14 - Officiel"}"}]}${stamp}${len}}`;
    })
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, html, channel = "TOP 14 - Officiel", comp = "top 14", gates = "&order=home&minsec=120" }) {
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
    const path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1&channel=${encodeURIComponent(channel)}&comp=${encodeURIComponent(comp)}${gates}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// La Rochelle at Pau, 2026-09-26 (ESPN 604386).
const pauTries = [
  { id: "GpDuBTolC4o", title: "TOP 14 - Essai de Rodrigo MARTA (SP) - Section Paloise - Stade Rochelais", published: "6d ago", length: "1:16" },
  { id: "cEr463kGo6Q", title: "TOP 14 - Karl SORIN Try (SR) - Section Paloise - Stade Rochelais", published: "6d ago", length: "0:34" },
];

test("ESPN's club names match the channel's: Pau is Section Paloise, La Rochelle is Stade Rochelais", async () => {
  const html = searchHtml([
    ...pauTries,
    { id: "-KEAsCuZMJk", title: "TOP 14 2026-2027 Season - Round 4 - Section Paloise vs. Stade Rochelais Highlights", published: "6d ago", length: "3:24" },
  ]);
  const { body } = await lookup({ query: "La Rochelle vs Pau highlights Sep 26, 2026", html });
  assert.equal(body.videoId, "-KEAsCuZMJk");
});

test("try clips are never the match cut", async () => {
  const { status } = await lookup({ query: "La Rochelle vs Pau highlights Sep 26, 2026", html: searchHtml(pauTries) });
  assert.equal(status, 404);
  // Without the 2-minute floor the 76 s try still has no highlight word.
  const { status: ungated } = await lookup({ query: "La Rochelle vs Pau highlights Sep 26, 2026", html: searchHtml(pauTries), gates: "&order=home" });
  assert.equal(ungated, 404);
});

test("a \"Match Summary\" cut counts on the TOP 14 channel only", async () => {
  // Montpellier Herault at Stade Toulousain, 2026-09-27 (ESPN 604387).
  const html = searchHtml([
    { id: "hO3RYmTWjW0", title: "TOP 14 - Essai de Antoine DUPONT (ST) - Stade Toulousain - Montpellier Hérault Rugby", published: "5d ago", length: "0:49" },
    { id: "QUqwj9ovZlY", title: "TOP 14 Season 2026-2027 - Round 4 - Match Summary: Stade Toulousain - Montpellier Hérault Rugby", published: "5d ago", length: "3:40" },
  ]);
  const { body } = await lookup({ query: "Montpellier Herault vs Stade Toulousain highlights Sep 27, 2026", html });
  assert.equal(body.videoId, "QUqwj9ovZlY");
  // Round 3's "Summary" form, and a French "Résumé".
  const r3 = searchHtml([
    { id: "6rdHwxRgQms", title: "TOP 14 Season 2026-2027 - Matchday 3 - Summary Union Bordeaux-Bègles - Stade Français Paris", published: "1w ago", length: "3:54" },
  ]);
  assert.equal((await lookup({ query: "Stade Francais Paris vs Bordeaux Begles highlights Sep 20, 2026", html: r3 })).body.videoId, "6rdHwxRgQms");
  const fr = searchHtml([
    { id: "resumeFrxxx", title: "TOP 14 - Résumé Union Bordeaux-Bègles - Stade Français Paris - J03 - Saison 2026-2027", published: "1w ago", length: "3:54" },
  ]);
  assert.equal((await lookup({ query: "Stade Francais Paris vs Bordeaux Begles highlights Sep 20, 2026", html: fr })).body.videoId, "resumeFrxxx");
  // Another channel's "summary" is still not a highlight.
  const urc = searchHtml([
    { id: "urcSummaryx", title: "Match Summary: Leinster Rugby v Munster Rugby | Round 1 | URC 2026/27", owner: "United Rugby Championship", published: "6d ago", length: "3:40" },
  ]);
  const { status } = await lookup({ query: "Munster vs Leinster highlights Sep 27, 2026", html: urc, channel: "United Rugby Championship", comp: "", gates: "" });
  assert.equal(status, 404);
});

test("home-first: the card takes its own meeting, not the return fixture", async () => {
  // Pau at Lyon, 2026-09-19 (ESPN 604377). The return fixture at Pau is later
  // in the season; a newer upload of it would rank first.
  const html = searchHtml([
    { id: "returnFixtu", title: "TOP 14 2026-2027 Season - Round 16 - Section Paloise vs. LOU Rugby Highlights", published: "1d ago", length: "3:59" },
    { id: "Hhm9WeU0Th8", title: "TOP 14 2026-2027 Season - Round 3 - LOU Rugby vs. Section Paloise Highlights", published: "1w ago", length: "3:59" },
  ]);
  const { body } = await lookup({ query: "Pau vs Lyon highlights Sep 19, 2026", html });
  assert.equal(body.videoId, "Hhm9WeU0Th8");
});

test("the 2-minute floor keeps a 2:17 cut", async () => {
  // Castres Olympique at Clermont Auvergne, 2026-09-26 (ESPN 604382).
  const html = searchHtml([
    { id: "5EkKmuwLojs", title: "TOP 14 - Alivereti RAKA (ASM) Try - ASM Clermont vs Castres Olympique", published: "6d ago", length: "0:55" },
    { id: "tECpKEhEsfw", title: "TOP 14 2026-2027 Season - Round 4 - Highlights: ASM Clermont vs. Castres Olympique", published: "6d ago", length: "2:17" },
  ]);
  const { body } = await lookup({ query: "Castres Olympique vs Clermont Auvergne highlights Sep 26, 2026", html });
  assert.equal(body.videoId, "tECpKEhEsfw");
});

test("a title with the score is still refused", async () => {
  const html = searchHtml([
    { id: "scoreTitlex", title: "TOP 14 - Section Paloise 24-17 Stade Rochelais - Highlights", published: "6d ago", length: "3:24" },
  ]);
  const { status } = await lookup({ query: "La Rochelle vs Pau highlights Sep 26, 2026", html });
  assert.equal(status, 404);
});

test("the bake's own search of the channel keeps the cut and drops the try clips", () => {
  const tokens = channelSearchTitleTokens("TOP 14 - Officiel");
  const ok = (title) => titleHasCompToken(title, ["top 14"]) && titleHasCompToken(title, tokens);
  assert.equal(ok("TOP 14 2026-2027 Season - R4 - RC Toulon vs RC Vannes Highlights"), true);
  assert.equal(ok("TOP 14 Season 2026-2027 - Round 4 - Match Summary: Stade Toulousain - Montpellier Hérault Rugby"), true);
  assert.equal(ok("TOP 14 - Essai de Romain NTAMACK (ST) - Stade Toulousain - Montpellier Hérault Rugby"), false);
  assert.equal(ok("TOP 14 - Try by Lucas MARTIN (AB) - Racing 92 - Aviron Bayonnais"), false);
});
