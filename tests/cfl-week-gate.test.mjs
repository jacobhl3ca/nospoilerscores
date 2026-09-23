import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// 2026-09-22 QA: all 61 CFL 2026 regular-season + playoff finals probed
// against production turned up three failure modes on top of the existing
// gridiron week gate, all specific to TSN/CFL:
//
//   1. TSN spells weeks 1–5 out in full ("CFL WEEK ONE" … "WEEK FIVE") and
//      only switches to digits from week 6 on. The old digit-only week regex
//      read a spelled title as carrying NO week token — which the wrong-week
//      hard-skip treats as "untouched", the correct behaviour for NFL/NCAAF —
//      so a Week 1 recap served for a Week 6/8 query (wk6 OTT@EDM, wk8
//      CGY@WPG, wk8 HAM@MTL; 3/3 wrong, live).
//   2. TSN's OWN 2024/2025 "Away vs. Home | CFL HIGHLIGHTS" re-uploads carry
//      no week and no year. Unlike NFL/NCAAF, a no-week TSN title is always
//      that older format, never a legitimate same-season cut, so it has to be
//      a hard REJECT rather than a pass-through (wk6 HAM@SSK live, wk15
//      SSK@WPG baked — both served a 2024 upload).
//   3. Team-name mismatches: theScore's plain "BC Lions" against TSN's
//      punctuated "B.C. Lions" (wk9 BC@WPG, 404 though TSN had posted one),
//      and TSN's own typos "Saskatechewan"/"Roughiders".
//   4. TSN doesn't always append "| Full Highlights" — a bare "CFL WEEK N:
//      Away vs. Home" with no highlight/recap keyword at all (wk9 EDM@SSK).
//
// These tests pin all four against the real titles measured live, plus the
// age-gate's own miss (see the "2y ago" cases): the case is folded in here
// rather than highlight-upload-age.test.mjs because it is the SAME live CFL
// slate this file already reproduces.

function searchHtml(entries) {
  return entries
    .map((e) => {
      const stamp = e.published ? `,"publishedTimeText":{"simpleText":"${e.published}"}` : "";
      return `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}${stamp}}`;
    })
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel = "TSN", week, html, oembedAuthor = "TSN" }) {
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
    let path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1`;
    if (channel) path += `&channel=${encodeURIComponent(channel)}`;
    if (week) path += `&week=${week}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── 1. Spelled-out week tokens ──────────────────────────────────────────────

test("wk6 OTT@EDM: a spelled-out 'WEEK ONE' title no longer passes as a wk6 match", async () => {
  const html = searchHtml([
    { id: "aWrong1xxxx", title: "CFL WEEK ONE: Edmonton Elks vs. Ottawa Redblacks", owner: "TSN", published: "2mo ago" },
    { id: "aRight1xxxx", title: "CFL WEEK 6: Ottawa Redblacks vs. Edmonton Elks | Full Highlights", owner: "TSN", published: "5d ago" },
  ]);
  const { body } = await lookup({
    query: "Ottawa Redblacks vs Edmonton Elks highlights Jul 10, 2026",
    week: 6,
    html,
  });
  assert.equal(body.videoId, "aRight1xxxx");
});

test("wk8 CGY@WPG: 'WEEK ONE' rejected, the real wk8 cut wins", async () => {
  const html = searchHtml([
    { id: "aWrong2xxxx", title: "CFL WEEK ONE: Winnipeg Blue Bombers vs. Calgary Stampeders", owner: "TSN", published: "2mo ago" },
    { id: "aRight2xxxx", title: "CFL WEEK 8: Calgary Stampeders vs. Winnipeg Blue Bombers | Full Highlights", owner: "TSN", published: "3d ago" },
  ]);
  const { body } = await lookup({
    query: "Calgary Stampeders vs Winnipeg Blue Bombers highlights Jul 25, 2026",
    week: 8,
    html,
  });
  assert.equal(body.videoId, "aRight2xxxx");
});

test("wk8 HAM@MTL: 'WEEK ONE' rejected, the real wk8 cut wins", async () => {
  const html = searchHtml([
    { id: "aWrong3xxxx", title: "CFL WEEK ONE: Montreal Alouettes vs. Hamilton Tiger-Cats", owner: "TSN", published: "2mo ago" },
    { id: "aRight3xxxx", title: "CFL WEEK 8: Hamilton Tiger-Cats vs. Montreal Alouettes | Full Highlights", owner: "TSN", published: "3d ago" },
  ]);
  const { body } = await lookup({
    query: "Hamilton Tiger-Cats vs Montreal Alouettes highlights Jul 26, 2026",
    week: 8,
    html,
  });
  assert.equal(body.videoId, "aRight3xxxx");
});

test("a bare 'twenty-one' resolves to week 21, 'twenty' alone stays 20", async () => {
  const htmlOne = searchHtml([
    { id: "aWeekTwoOne", title: "CFL WEEK TWENTY-ONE: Toronto Argonauts vs. Hamilton Tiger-Cats | Full Highlights", owner: "TSN", published: "1d ago" },
  ]);
  const one = await lookup({ query: "Toronto Argonauts vs Hamilton Tiger-Cats highlights Sep 20, 2026", week: 21, html: htmlOne });
  assert.equal(one.body.videoId, "aWeekTwoOne");

  const htmlTwenty = searchHtml([
    { id: "aWeekTwenty", title: "CFL WEEK TWENTY: Toronto Argonauts vs. Hamilton Tiger-Cats | Full Highlights", owner: "TSN", published: "1d ago" },
  ]);
  const mismatch = await lookup({ query: "Toronto Argonauts vs Hamilton Tiger-Cats highlights Sep 20, 2026", week: 21, html: htmlTwenty });
  assert.equal(mismatch.status, 404); // week 20 title must not satisfy a week=21 query
});

// ── 2. CFL no-week-token titles are a hard reject (unlike NFL/NCAAF) ────────

test("wk6 HAM@SSK: TSN's own no-week 2024 re-upload is rejected outright, even alone", async () => {
  const html = searchHtml([
    { id: "aOld2024xxx", title: "Saskatchewan Roughriders vs. Hamilton Tiger-Cats | CFL HIGHLIGHTS", owner: "TSN", published: "2y ago" },
  ]);
  const { status } = await lookup({
    query: "Hamilton Tiger-Cats vs Saskatchewan Roughriders highlights Jul 12, 2026",
    week: 6,
    html,
  });
  // Rejected twice over: the age gate (2y ago predates the game) AND, even if
  // it somehow read as fresh, the no-week-token CFL reject. Confirms neither
  // gate alone was carrying this — see the next test for the token gate in
  // isolation with an unreadable age stamp.
  assert.equal(status, 404);
});

test("a fresh-looking no-week CFL title is still rejected on the token alone", async () => {
  // Same title, but with no publishedTimeText at all (age gate's "unreadable
  // stamp → unchanged" case) so ONLY the week-token requirement can be doing
  // the rejecting here.
  const html = searchHtml([
    { id: "aNoWeekxxxx", title: "Saskatchewan Roughriders vs. Hamilton Tiger-Cats | CFL HIGHLIGHTS", owner: "TSN" },
  ]);
  const { status } = await lookup({
    query: "Hamilton Tiger-Cats vs Saskatchewan Roughriders highlights Jul 12, 2026",
    week: 6,
    html,
  });
  assert.equal(status, 404);
});

test("NFL/NCAAF keep the old pass-through: a no-week title is untouched, not rejected", async () => {
  const html = searchHtml([
    { id: "aNflOkxxxxx", title: "New York Giants vs Washington Commanders Game Highlights | NFL 2025 Season", owner: "NFL", published: "3d ago" },
  ]);
  const { body } = await lookup({
    query: "Washington Commanders vs New York Giants highlights Dec 14, 2025",
    channel: "NFL",
    week: 15,
    oembedAuthor: "NFL",
    html,
  });
  assert.equal(body.videoId, "aNflOkxxxxx");
});

// ── 3. Team-name aliasing ────────────────────────────────────────────────────

test("wk9 BC@WPG: theScore's 'BC Lions' matches TSN's punctuated 'B.C. Lions'", async () => {
  const html = searchHtml([
    { id: "aBcWpgxxxxx", title: "CFL WEEK 9: B.C. Lions vs. Winnipeg Blue Bombers | Full Highlights", owner: "TSN", published: "1mo ago" },
  ]);
  const { body } = await lookup({
    query: "BC Lions vs Winnipeg Blue Bombers highlights Aug 15, 2026",
    week: 9,
    html,
  });
  assert.equal(body.videoId, "aBcWpgxxxxx");
});

test("TSN's 'Saskatechewan' and 'Roughiders' typos both still match Saskatchewan Roughriders", async () => {
  const htmlProvince = searchHtml([
    { id: "aTypoOnexxx", title: "CFL WEEK 15: Saskatechewan Roughriders vs. Winnipeg Blue Bombers | Full Highlights", owner: "TSN", published: "1w ago" },
  ]);
  const province = await lookup({
    query: "Saskatchewan Roughriders vs Winnipeg Blue Bombers highlights Sep 12, 2026",
    week: 15,
    html: htmlProvince,
  });
  assert.equal(province.body.videoId, "aTypoOnexxx");

  const htmlNickname = searchHtml([
    { id: "aTypoTwoxxx", title: "CFL WEEK 6:  Saskatchewan Roughiders vs. Hamilton Tiger-Cats | Full Highlights", owner: "TSN", published: "2mo ago" },
  ]);
  const nickname = await lookup({
    query: "Saskatchewan Roughriders vs Hamilton Tiger-Cats highlights Jul 12, 2026",
    week: 6,
    html: htmlNickname,
  });
  assert.equal(nickname.body.videoId, "aTypoTwoxxx");
});

// ── 4. Bare "CFL WEEK N" title with no highlight/recap keyword ──────────────

test("wk9 SSK@EDM: a bare 'CFL WEEK N' title with no 'Highlights'/'Recap' word still counts", async () => {
  const html = searchHtml([
    { id: "aBareNinexx", title: "CFL WEEK 9: Edmonton Elks vs. Saskatchewan Roughriders", owner: "TSN", published: "1mo ago" },
  ]);
  const { body } = await lookup({
    query: "Saskatchewan Roughriders vs Edmonton Elks highlights Aug 15, 2026",
    week: 9,
    html,
  });
  assert.equal(body.videoId, "aBareNinexx");
});

test("the bare-title carve-out still requires the week to agree", async () => {
  const html = searchHtml([
    { id: "aBareWrongW", title: "CFL WEEK 3: Edmonton Elks vs. Saskatchewan Roughriders", owner: "TSN", published: "1mo ago" },
  ]);
  const { status } = await lookup({
    query: "Saskatchewan Roughriders vs Edmonton Elks highlights Aug 15, 2026",
    week: 9,
    html,
  });
  assert.equal(status, 404);
});

test("the bare-title carve-out is TSN-only — it does not widen NFL's keyword requirement", async () => {
  const html = searchHtml([
    { id: "aNflBarexxx", title: "NFL WEEK 9: Some Team vs. Other Team", owner: "NFL", published: "2d ago" },
  ]);
  const { status } = await lookup({
    query: "Some Team vs Other Team highlights Sep 6, 2026",
    channel: "NFL",
    week: 9,
    oembedAuthor: "NFL",
    html,
  });
  assert.equal(status, 404); // no "highlight"/"recap" keyword, and NFL gets no bare-week carve-out
});

// ── 5. Age gate reads YouTube's abbreviated relative stamps too ────────────

test("'2y ago' (abbreviated) is read by the age gate exactly like '2 years ago'", async () => {
  const html = searchHtml([
    { id: "aAbbrOldxxx", title: "Saskatchewan Roughriders vs. Winnipeg Blue Bombers | CFL HIGHLIGHTS", owner: "TSN", published: "2y ago" },
  ]);
  const { status } = await lookup({
    query: "Saskatchewan Roughriders vs Winnipeg Blue Bombers highlights Sep 12, 2026",
    week: 15,
    html,
  });
  assert.equal(status, 404); // age gate alone must reject this, before the week-token gate even runs
});

test("'1mo ago' and '3d ago' (abbreviated) both parse as fresh enough to keep", async () => {
  const html = searchHtml([
    { id: "aFreshAbbrx", title: "CFL WEEK 15: Saskatchewan Roughriders vs. Winnipeg Blue Bombers | Full Highlights", owner: "TSN", published: "3d ago" },
  ]);
  const { body } = await lookup({
    query: "Saskatchewan Roughriders vs Winnipeg Blue Bombers highlights Sep 12, 2026",
    week: 15,
    html,
  });
  assert.equal(body.videoId, "aFreshAbbrx");
});
