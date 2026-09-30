import assert from "node:assert/strict";
import test from "node:test";

import { liveWatchUrl } from "../src/lib/openExternal.ts";
import { setTvChannelLinks } from "../src/lib/tvChannelLinks.ts";

// Live clock + "Watch live" (9/27): both follow the Settings TV channel list the
// way the network chips do, instead of always opening the network's website.

const NBC = "http://tuner.test/nbc";
const WEB = "https://www.nbc.com/live";

test("a listed broadcaster opens the user's own stream in the chosen player", () => {
  setTvChannelLinks(`NBC = ${NBC}`, "iina");
  assert.deepEqual(liveWatchUrl({ broadcasts: ["NBC"], streamUrl: WEB }), {
    url: `iina://weblink?url=${encodeURIComponent(NBC)}`,
    network: "NBC",
    scheme: true,
  });
});

test("a blank list keeps the web stream", () => {
  setTvChannelLinks("", "iina");
  assert.deepEqual(liveWatchUrl({ broadcasts: ["NBC"], streamUrl: WEB }), { url: WEB, network: null, scheme: false });
});

test("the first LISTED broadcaster wins over an unlisted first name", () => {
  setTvChannelLinks(`NBC = ${NBC}`, "raw");
  assert.deepEqual(liveWatchUrl({ broadcasts: ["Peacock", "NBC"], streamUrl: "https://peacocktv.com" }), {
    url: NBC,
    network: "NBC",
    scheme: true,
  });
});

test("a listed broadcaster still opens with no web stream at all", () => {
  setTvChannelLinks(`NBC = ${NBC}`, "raw");
  assert.equal(liveWatchUrl({ broadcasts: ["NBC"], streamUrl: null })?.url, NBC);
});

test("no list hit and no web stream = nothing to open", () => {
  setTvChannelLinks("", "auto");
  assert.equal(liveWatchUrl({ broadcasts: ["NBC"], streamUrl: null }), null);
});

test("a per-game {game} line fills from the game; a known no-stream answer falls to the next listed broadcaster", async () => {
  const { setGameCheckFetch } = await import("../src/lib/tvChannelLinks.ts");
  const game = {
    broadcasts: ["Peacock", "NBC"],
    streamUrl: WEB,
    homeTeam: { displayName: "Houston Astros", shortDisplayName: "Astros", abbreviation: "HOU" } as never,
    awayTeam: { displayName: "Chicago White Sox", shortDisplayName: "White Sox", abbreviation: "CHW" } as never,
    date: "2026-09-29T21:00Z",
  };
  let status = 200;
  setGameCheckFetch(async () => ({ status }));
  setTvChannelLinks(`Peacock = http://tuner.test:9192/game?{game}\nNBC = ${NBC}`, "raw");
  const first = liveWatchUrl(game)!;
  assert.equal(first.network, "Peacock");
  assert.match(first.url, /^http:\/\/tuner\.test:9192\/game\?net=Peacock&home=Houston\+Astros/);
  // No game on the call (older callers): the {game} line is skipped, NBC wins.
  assert.equal(liveWatchUrl({ broadcasts: ["Peacock", "NBC"], streamUrl: WEB })?.network, "NBC");
  setGameCheckFetch(async () => ({ status: 404 }));
  status = 404;
  liveWatchUrl(game);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(liveWatchUrl(game), { url: NBC, network: "NBC", scheme: true });
  setGameCheckFetch(null);
  setTvChannelLinks("", "auto");
});
