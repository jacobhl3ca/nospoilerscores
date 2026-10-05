import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";
import { titleLacksHighlightWord } from "../scripts/lib/recaps.mjs";

// NFL "highlight" title rule, 2026-10-05. The NFL channel posts an "NFL Daily"
// talk show per game: both teams, the week, the year and "Recap", so it cleared
// every other gate and held the 2nd button on 7 of 49 NFL cards. Every real
// league cut says "Game Highlights". Titles below are the channel's own, from
// the live highlights.json sweep that day.

const TALK_SHOW = "Lions vs. Panthers Week 4 SNF Recap | NFL Daily";
const TALK_SHOW_2 = "Week 3 Recap Ravens vs Cowboys | NFL Daily";
const GAME_CUT = "Detroit Lions vs Carolina Panthers Game Highlights | 2026 NFL Season Week 4";

function searchHtml(entries) {
  return entries
    .map((e) => `"videoRenderer":{"videoId":"${e.id}","title":{"runs":[{"text":"${e.title}"}]},"ownerText":{"runs":[{"text":"${e.owner ?? "NFL"}"}]}}`)
    .join(",");
}

const stubEnv = () => ({ ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });

async function lookup({ query, channel = "NFL", html, extra = "" }) {
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
    const path = `/api/youtube?q=${encodeURIComponent(query)}&strict=1&channel=${encodeURIComponent(channel)}${extra}`;
    const res = await worker.fetch(new Request(`https://hidescore.com${path}`), stubEnv());
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The bake and GameCard ask with ESPN's short names.
const Q = "Lions vs Panthers highlights Oct 4, 2026";

test("worker: the talk show ranked first loses to the game cut", async () => {
  const html = searchHtml([{ id: "l_ewHLccrss", title: TALK_SHOW }, { id: "sD0WZLGybRw", title: GAME_CUT }]);
  const { body } = await lookup({ query: Q, html, extra: "&week=4" });
  assert.equal(body.videoId, "sD0WZLGybRw");
});

test("worker: 2nd slot (official excluded) finds no talk show, so one button", async () => {
  const html = searchHtml([{ id: "l_ewHLccrss", title: TALK_SHOW }, { id: "sD0WZLGybRw", title: GAME_CUT }]);
  const { status } = await lookup({ query: Q, html, extra: "&week=4&exclude=sD0WZLGybRw" });
  assert.equal(status, 404);
});

test("worker: a second swept NFL Daily title is refused too", async () => {
  const html = searchHtml([{ id: "xTGdigjGVQI", title: TALK_SHOW_2 }]);
  const { status } = await lookup({ query: "Ravens vs Cowboys highlights Sep 27, 2026", html, extra: "&week=3" });
  assert.equal(status, 404);
});

test("worker: another channel's bare Recap title is unchanged", async () => {
  const html = searchHtml([{ id: "nbaRecapxxx", title: "Lakers vs Celtics Recap | Oct 4, 2026", owner: "NBA" }]);
  const { body } = await lookup({ query: "Lakers vs Celtics highlights Oct 4, 2026", channel: "NBA", html });
  assert.equal(body.videoId, "nbaRecapxxx");
});

test("worker: the bare NFL preseason title still passes under comp=preseason", async () => {
  const html = searchHtml([{ id: "preseasonxx", title: "Detroit Lions vs Indianapolis Colts | 2026 Preseason Week 3" }]);
  const { body } = await lookup({ query: "Lions vs Colts highlights Aug 22, 2026", html, extra: "&comp=preseason%7Chall%20of%20fame" });
  assert.equal(body.videoId, "preseasonxx");
});

test("bake: carried talk show fails, game cut passes", () => {
  assert.equal(titleLacksHighlightWord("NFL", TALK_SHOW), true);
  assert.equal(titleLacksHighlightWord("NFL", TALK_SHOW_2), true);
  assert.equal(titleLacksHighlightWord("NFL", GAME_CUT), false);
});

test("bake: other channels, preseason cards and unreadable titles pass", () => {
  assert.equal(titleLacksHighlightWord("Detroit Lions", TALK_SHOW), false);
  assert.equal(titleLacksHighlightWord("NBA", "Lakers vs Celtics Recap"), false);
  assert.equal(titleLacksHighlightWord("NFL", "Detroit Lions vs Indianapolis Colts | 2026 Preseason Week 3", true), false);
  assert.equal(titleLacksHighlightWord("NFL", "Detroit Lions vs Indianapolis Colts | 2026 Preseason Week 3", false), true);
  assert.equal(titleLacksHighlightWord("NFL", ""), false);
});
