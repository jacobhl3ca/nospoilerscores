import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// Two team-gate fixes in the /api/youtube worker (2026-10-03):
//
//   1. JSON escapes. A results page is JSON inside HTML, so YouTube's own
//      "Texas A&M Aggies vs. LSU Tigers" reached the team gate with the
//      escape intact and never matched "texas a&m". Texas A&M at LSU (9/26) and
//      Kentucky at Texas A&M (9/19) went dark with the cut at rank 1.
//   2. School names built on another school's name. The college chains match
//      on ESPN's school name, so "Texas A&M Aggies vs. Ole Miss Rebels" read as
//      a Texas game and "West Virginia" as Virginia. The SEC posts both Texas
//      schools' cuts against the same opponents with no date in the title.
//
// The titles below are the uploaders' own shapes.

function searchHtml(entries) {
  return entries
    .map((e) => {
      const len = e.length ? `,"lengthText":{"accessibility":{},"simpleText":"${e.length}"}` : "";
      return `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}${len}}`;
    })
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

// `oembed: false` answers every oEmbed call 404, so only the parsed byline can
// pass the uploader gate.
async function lookup({ query, channel, comp = "", week = "", html, oembed = true }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.startsWith("https://www.youtube.com/results")) return new Response(html, { status: 200 });
    if (u.startsWith("https://www.youtube.com/oembed")) {
      if (!oembed) return new Response("Not Found", { status: 404 });
      return new Response(JSON.stringify({ author_name: channel }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    let path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1&channel=${encodeURIComponent(channel)}`;
    if (comp) path += `&comp=${encodeURIComponent(comp)}`;
    if (week) path += `&week=${week}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("a title carrying YouTube's \\u0026 escape matches Texas A&M (ESPN College Football, 9/26)", async () => {
  const html = searchHtml([
    { id: "1ttIjBSsLMI", title: "Texas A\\u0026M Aggies vs. LSU Tigers | Full Game Highlights | ESPN College Football", owner: "ESPN College Football", length: "27:37" },
  ]);
  const { body } = await lookup({ query: "Texas A&M vs LSU highlights Sep 26, 2026", channel: "ESPN College Football", comp: "football", week: 4, html });
  assert.equal(body.videoId, "1ttIjBSsLMI");
});

test("a byline carrying the escape still names the channel without the oEmbed round-trip", async () => {
  const html = searchHtml([
    { id: "aandmByline", title: "Kentucky Wildcats vs. Texas A\\u0026M Aggies | Game Highlights", owner: "Texas A\\u0026M Athletics", length: "8:01" },
  ]);
  const { body } = await lookup({ query: "Kentucky vs Texas A&M highlights Sep 19, 2026", channel: "Texas A&M Athletics", html, oembed: false });
  assert.equal(body.videoId, "aandmByline");
});

const SEC_SOCCER = "women's soccer|sec soccer";

test("a Texas lookup skips the Texas A&M cut of the same opponent and takes its own", async () => {
  const html = searchHtml([
    { id: "aggiesOleMs", title: "Texas A\\u0026M Aggies vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer", owner: "SEC", length: "3:20" },
    { id: "BjPKAQzfEAA", title: "Texas Longhorns vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer", owner: "SEC", length: "2:32" },
  ]);
  const { body } = await lookup({ query: "Texas vs Ole Miss highlights Oct 1, 2026", channel: "SEC", comp: SEC_SOCCER, html });
  assert.equal(body.videoId, "BjPKAQzfEAA");
});

test("a Texas lookup with only the Texas A&M, Texas Tech or East Texas A&M cut finds nothing", async () => {
  for (const title of [
    "Texas A\\u0026M Aggies vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer",
    "Texas Tech Red Raiders vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer",
    "East Texas A\\u0026M Lions vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer",
    "Texas State Bobcats vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer",
  ]) {
    const html = searchHtml([{ id: "otherTexasx", title, owner: "SEC", length: "3:00" }]);
    const { status } = await lookup({ query: "Texas vs Ole Miss highlights Oct 1, 2026", channel: "SEC", comp: SEC_SOCCER, html });
    assert.equal(status, 404, title);
  }
});

test("a school keeps its own longer name: Texas A&M, West Virginia, Miami (OH)", async () => {
  const cases = [
    ["Texas A&M vs Kentucky highlights Oct 1, 2026", "SEC", "Texas A\\u0026M Aggies vs. Kentucky Wildcats | Game Highlights | 2026 SEC Soccer"],
    ["West Virginia vs Houston highlights Oct 2, 2026", "Big 12 Conference", "West Virginia vs. Houston Highlights (10.2.26) | 2026 Big 12 Women's Soccer"],
    ["Miami (OH) vs Ohio highlights Oct 2, 2026", "Get Some MACtion", "Miami (OH) vs. Ohio | Highlights | 10.2.26"],
  ];
  for (const [query, channel, title] of cases) {
    const html = searchHtml([{ id: "ownLongName", title, owner: channel, length: "3:00" }]);
    const { body } = await lookup({ query, channel, html });
    assert.equal(body.videoId, "ownLongName", title);
  }
});

test("Virginia, Miami, Kansas and Houston do not match the school built on their name", async () => {
  const cases = [
    ["Virginia vs Duke highlights Oct 2, 2026", "ACC Digital Network", "West Virginia vs. Duke Match Highlights | 2026 ACC Women's Soccer"],
    ["Virginia vs Duke highlights Oct 2, 2026", "ACC Digital Network", "Virginia Tech vs. Duke Match Highlights | 2026 ACC Women's Soccer"],
    ["Miami vs Clemson highlights Oct 2, 2026", "ACC Digital Network", "Miami (OH) vs. Clemson Match Highlights | 2026 ACC Women's Soccer"],
    ["Kansas vs Baylor highlights Oct 2, 2026", "Big 12 Conference", "Kansas City vs. Baylor Highlights (10.2.26) | 2026 Big 12 Women's Soccer"],
    ["Kansas vs Baylor highlights Oct 2, 2026", "Big 12 Conference", "Kansas State vs. Baylor Highlights (10.2.26) | 2026 Big 12 Women's Soccer"],
    ["Houston vs Baylor highlights Oct 2, 2026", "Big 12 Conference", "Sam Houston vs. Baylor Highlights (10.2.26) | 2026 Big 12 Women's Soccer"],
    ["Florida vs Kentucky highlights Oct 2, 2026", "SEC", "Florida State Seminoles vs. Kentucky Wildcats | Game Highlights | 2026 SEC Soccer"],
  ];
  for (const [query, channel, title] of cases) {
    const html = searchHtml([{ id: "wrongSchool", title, owner: channel, length: "3:00" }]);
    const { status } = await lookup({ query, channel, html });
    assert.equal(status, 404, title);
  }
});

test("both schools in one title still match (Washington State vs. Washington)", async () => {
  const html = searchHtml([
    { id: "appleCupxxx", title: "Washington State vs. Washington | Game Highlights | 2026 Pac-12 Football", owner: "Pac-12", length: "3:10" },
  ]);
  const { body } = await lookup({ query: "Washington vs Washington State highlights Nov 27, 2026", channel: "Pac-12", html });
  assert.equal(body.videoId, "appleCupxxx");
});

test("pro clubs: North Melbourne is not Melbourne, and the bare names still match", async () => {
  const wrong = searchHtml([
    { id: "northMelbxx", title: "North Melbourne v Carlton Highlights | Round 5, 2026 | AFL", owner: "AFL", length: "8:10" },
  ]);
  assert.equal((await lookup({ query: "Carlton vs Melbourne highlights Apr 12, 2026", channel: "AFL", html: wrong })).status, 404);
  const right = searchHtml([
    { id: "melbCarltxx", title: "Melbourne v Carlton Highlights | Round 5, 2026 | AFL", owner: "AFL", length: "8:10" },
  ]);
  assert.equal((await lookup({ query: "Carlton vs Melbourne highlights Apr 12, 2026", channel: "AFL", html: right })).body.videoId, "melbCarltxx");
  const chiefs = searchHtml([
    { id: "chiefsBillx", title: "Kansas City Chiefs vs. Buffalo Bills Game Highlights | NFL 2026 Season Week 4", owner: "NFL", length: "16:01" },
  ]);
  assert.equal((await lookup({ query: "Bills vs Chiefs highlights Sep 27, 2026", channel: "NFL", week: 4, html: chiefs })).body.videoId, "chiefsBillx");
});

test("a title separator is not part of a school name: Chicago Fire FC - St. Louis CITY SC", async () => {
  const html = searchHtml([
    { id: "fireStlxxxx", title: "Chicago Fire FC - St. Louis CITY SC | Full Match Highlights | October 4, 2026", owner: "Major League Soccer", length: "10:01" },
  ]);
  const { body } = await lookup({ query: "St. Louis CITY SC vs Chicago Fire FC highlights Oct 4, 2026", channel: "Major League Soccer", html });
  assert.equal(body.videoId, "fireStlxxxx");
});

test("a bare hyphen still joins a school name: Texas A&M-Commerce is not Texas A&M", async () => {
  const html = searchHtml([
    { id: "commercexxx", title: "Texas A\\u0026M-Commerce Lions vs. Abilene Christian | Highlights", owner: "Southland Conference", length: "3:00" },
  ]);
  const { status } = await lookup({ query: "Abilene Christian vs Texas A&M highlights Oct 2, 2026", channel: "Southland Conference", html });
  assert.equal(status, 404);
});

test("a team owns a longer name that holds a blanked phrase (Southern Miss Golden Eagles)", async () => {
  const html = searchHtml([
    { id: "usmTroyxxxx", title: "Southern Miss Golden Eagles vs. Troy Trojans | Highlights | October 2, 2026", owner: "Sun Belt Conference", length: "3:00" },
  ]);
  const { body } = await lookup({ query: "Troy Trojans vs Southern Miss Golden Eagles highlights Oct 2, 2026", channel: "Sun Belt Conference", html });
  assert.equal(body.videoId, "usmTroyxxxx");
});

const ACC_WSOC = "women's soccer|sec soccer";

test("ACC titles shorten Pittsburgh and California: Pitt and Cal match", async () => {
  const pitt = searchHtml([{ id: "dukePittxxx", title: "Duke vs. Pitt Match Highlights | 2026 ACC Women's Soccer", owner: "ACC Digital Network", length: "12:53" }]);
  assert.equal((await lookup({ query: "Pittsburgh vs Duke highlights Sep 24, 2026", channel: "ACC Digital Network", comp: ACC_WSOC, html: pitt })).body.videoId, "dukePittxxx");
  const cal = searchHtml([{ id: "stanCalxxxx", title: "Stanford vs. Cal Match Highlights | 2026 ACC Women's Soccer", owner: "ACC Digital Network", length: "12:40" }]);
  assert.equal((await lookup({ query: "California vs Stanford highlights Oct 2, 2026", channel: "ACC Digital Network", comp: ACC_WSOC, html: cal })).body.videoId, "stanCalxxxx");
});

test("Cal never matches Cal Poly, Cal State or a word that holds it", async () => {
  for (const title of [
    "Stanford vs. Cal Poly Match Highlights | 2026 ACC Women's Soccer",
    "Stanford vs. Cal State Fullerton Match Highlights | 2026 ACC Women's Soccer",
    "Stanford vs. Pacific Match Highlights, a physical game | 2026 ACC Women's Soccer",
  ]) {
    const html = searchHtml([{ id: "notCalxxxxx", title, owner: "ACC Digital Network", length: "12:00" }]);
    const { status } = await lookup({ query: "California vs Stanford highlights Oct 2, 2026", channel: "ACC Digital Network", comp: ACC_WSOC, html });
    assert.equal(status, 404, title);
  }
});

test("a name under four letters must stand as a word: NEC is not Necaxa", async () => {
  const html = searchHtml([{ id: "necaxaxxxxx", title: "Juventus vs. Necaxa: Extended Highlights | Friendly | CBS Sports Golazo", owner: "CBS Sports Golazo - Europe", length: "9:50" }]);
  assert.equal((await lookup({ query: "NEC vs Juventus highlights Sep 17, 2026", channel: "CBS Sports Golazo - Europe", html })).status, 404);
  const ok = searchHtml([{ id: "juveNecxxxx", title: "Juventus vs. NEC Nijmegen: Extended Highlights | UEL League Phase MD1 | CBS Sports Golazo", owner: "CBS Sports Golazo - Europe", length: "9:50" }]);
  assert.equal((await lookup({ query: "NEC vs Juventus highlights Sep 17, 2026", channel: "CBS Sports Golazo - Europe", html: ok })).body.videoId, "juveNecxxxx");
});
