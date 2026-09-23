import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";
import { uploadFitsGameDate, HL_UPLOAD_WINDOW_EARLY_MS, HL_UPLOAD_WINDOW_LATE_MS } from "../scripts/lib/recaps.mjs";

// The 2nd ("extended") highlight button asks the worker again with the 1st
// video excluded. For a soccer fixture whose recap title carries no date and
// no year — ESPN FC, CBS, MLS, Serie A all title theirs "A vs B | Highlights"
// — the next-best hit is the SAME fixture in an EARLIER SEASON, and every
// existing gate (teams, competition, week, year) waves it through. Measured on
// the live manifest 2026-09-20: about 105 of 135 soccer `extended` slots held
// the wrong season, the oldest a 2012 MLS game.
// The results page's publishedTimeText is the only season signal those blocks
// carry, so the worker gates on it. These tests pin that gate and the two
// things it must NOT touch: a page with no stamp, and a query with no date.

const FRESH_ID = "aaaaaaaaaaa";
const OLD_ID = "bbbbbbbbbbb";

const DAY = 24 * 60 * 60 * 1000;

// One videoRenderer block per entry, in the shape the handler splits on.
// `published` omitted → no publishedTimeText key at all, like a live page that
// drops the stamp.
function searchHtml(entries) {
  return entries
    .map((e) => {
      const stamp = e.published ? `,"publishedTimeText":{"simpleText":"${e.published}"}` : "";
      return `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner}"}]}${stamp}}`;
    })
    .join(",");
}

// "Sep 17, 2026" for a game N days back, in UTC so it lines up with the UTC
// midnight the worker builds from the parsed query date.
function queryDate(daysAgo) {
  return new Date(Date.now() - daysAgo * DAY).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel = "ESPN FC", exclude, html, oembedAuthor = "ESPN FC" }) {
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
    if (exclude) path += `&exclude=${encodeURIComponent(exclude)}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("the 2nd button gets nothing rather than last season's meeting", async () => {
  // This is the live failure, reduced: same two clubs, same channel, no date
  // in either title. With the fresh cut excluded, the old one used to win.
  const html = searchHtml([
    { id: FRESH_ID, title: "Real Betis vs. Espanyol | LALIGA Highlights", owner: "ESPN FC", published: "2 days ago" },
    { id: OLD_ID, title: "Real Betis vs. Espanyol | LALIGA Highlights", owner: "ESPN FC", published: "6 months ago" },
  ]);
  const { status, body } = await lookup({
    query: `Real Betis vs Espanyol highlights LALIGA ${queryDate(3)}`,
    exclude: FRESH_ID,
    html,
  });
  assert.equal(status, 404);
  assert.equal(body.videoId, undefined);
});

test("the same page without the exclusion still serves the fresh cut", async () => {
  const html = searchHtml([
    { id: FRESH_ID, title: "Real Betis vs. Espanyol | LALIGA Highlights", owner: "ESPN FC", published: "2 days ago" },
    { id: OLD_ID, title: "Real Betis vs. Espanyol | LALIGA Highlights", owner: "ESPN FC", published: "6 months ago" },
  ]);
  const { body } = await lookup({
    query: `Real Betis vs Espanyol highlights LALIGA ${queryDate(3)}`,
    html,
  });
  assert.equal(body.videoId, FRESH_ID);
});

test("'1 month ago' loses to a five-day-old game — the stamp is floored, not exact", async () => {
  // "1 month ago" means 30 to 59 days back. Its NEWEST reading is still three
  // weeks before this game, so it cannot be this game's recap.
  const html = searchHtml([
    { id: OLD_ID, title: "Inter Miami vs. Orlando City | MLS Highlights", owner: "Major League Soccer", published: "1 month ago" },
  ]);
  const { status } = await lookup({
    query: `Inter Miami vs Orlando City highlights ${queryDate(5)}`,
    channel: "Major League Soccer",
    html,
    oembedAuthor: "Major League Soccer",
  });
  assert.equal(status, 404);
});

test("a stamp inside this game's window is kept", async () => {
  const html = searchHtml([
    { id: FRESH_ID, title: "Inter Miami vs. Orlando City | MLS Highlights", owner: "Major League Soccer", published: "5 days ago" },
  ]);
  const { body } = await lookup({
    query: `Inter Miami vs Orlando City highlights ${queryDate(5)}`,
    channel: "Major League Soccer",
    html,
    oembedAuthor: "Major League Soccer",
  });
  assert.equal(body.videoId, FRESH_ID);
});

test("a live-stream stamp parses the same way", async () => {
  const html = searchHtml([
    { id: OLD_ID, title: "Inter Miami vs. Orlando City | MLS Highlights", owner: "Major League Soccer", published: "Streamed 5 months ago" },
  ]);
  const { status } = await lookup({
    query: `Inter Miami vs Orlando City highlights ${queryDate(5)}`,
    channel: "Major League Soccer",
    html,
    oembedAuthor: "Major League Soccer",
  });
  assert.equal(status, 404);
});

test("no publishedTimeText → unchanged behaviour, the video is still served", async () => {
  const html = searchHtml([
    { id: OLD_ID, title: "Inter Miami vs. Orlando City | MLS Highlights", owner: "Major League Soccer" },
  ]);
  const { body } = await lookup({
    query: `Inter Miami vs Orlando City highlights ${queryDate(5)}`,
    channel: "Major League Soccer",
    html,
    oembedAuthor: "Major League Soccer",
  });
  assert.equal(body.videoId, OLD_ID);
});

test("a query with no calendar date is untouched — golf and tournaments keep their reach", async () => {
  // Golf and tournament queries name a round or an event, never an M/D/YYYY.
  // Without a game date the gate has nothing to compare against, so even a
  // two-year-old upload must come back exactly as it did before.
  const html = searchHtml([
    { id: OLD_ID, title: "Inter Miami vs. Orlando City | MLS Highlights", owner: "Major League Soccer", published: "2 years ago" },
  ]);
  const { body } = await lookup({
    query: "Inter Miami vs Orlando City highlights",
    channel: "Major League Soccer",
    html,
    oembedAuthor: "Major League Soccer",
  });
  assert.equal(body.videoId, OLD_ID);
});

// ── Bake-side window (scripts/lib/recaps.mjs) ────────────────────────────────

test("the bake window accepts an upload from the hours after full time", () => {
  const game = Date.parse("2026-09-19T23:30:00Z");
  assert.equal(uploadFitsGameDate(game + 2 * 60 * 60 * 1000, game), true);
});

test("the bake window rejects an upload from an earlier season", () => {
  const game = Date.parse("2026-09-19T23:30:00Z");
  assert.equal(uploadFitsGameDate(Date.parse("2025-09-20T12:00:00Z"), game), false);
});

test("the bake window holds its two edges", () => {
  const game = Date.parse("2026-09-19T23:30:00Z");
  assert.equal(uploadFitsGameDate(game - HL_UPLOAD_WINDOW_EARLY_MS, game), true);
  assert.equal(uploadFitsGameDate(game - HL_UPLOAD_WINDOW_EARLY_MS - 1, game), false);
  assert.equal(uploadFitsGameDate(game + HL_UPLOAD_WINDOW_LATE_MS, game), true);
  assert.equal(uploadFitsGameDate(game + HL_UPLOAD_WINDOW_LATE_MS + 1, game), false);
});

test("an unknown upload time keeps the id — a network blip never drops a highlight", () => {
  const game = Date.parse("2026-09-19T23:30:00Z");
  assert.equal(uploadFitsGameDate(null, game), true);
  assert.equal(uploadFitsGameDate(NaN, game), true);
  assert.equal(uploadFitsGameDate(game, null), true);
});
