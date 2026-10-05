import assert from "node:assert/strict";
import test from "node:test";

import {
  fillGameLink, gameCheckState, gameQuery, gameRef, normNetwork, parseChannelLinks, playerUrl, resolvePlayer,
  setGameCheckFetch, setTvChannelLinks, tvChannelLink,
} from "../src/lib/tvChannelLinks.ts";
import { withoutDeviceLocalPrefs } from "../src/lib/devicePrefs.ts";

// TV channel links (9/26): a listed network's chip opens the user's own stream
// in IINA (Mac) or VLC (iPhone) instead of the network's website.

const ESPN = "http://tuner.test:9191/proxy/ts/stream/0000-espn";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0";

test("names ignore case, spaces and dots, but + stays: ESPN+ is not ESPN", () => {
  assert.equal(normNetwork("ESPN 2"), normNetwork("espn2"));
  assert.equal(normNetwork("USA Net."), normNetwork("usa net"));
  assert.notEqual(normNetwork("ESPN+"), normNetwork("ESPN"));
});

test("one line per network, aliases after commas, the first = splits so query strings survive", () => {
  const m = parseChannelLinks(`# my tuner\nESPN = ${ESPN}\n\nFS1, FOX Sports 1 = http://x/stream?a=1&b=2\nbad line\n= http://nameless`);
  assert.equal(m.get("espn"), ESPN);
  assert.equal(m.get("fs1"), "http://x/stream?a=1&b=2");
  assert.equal(m.get("foxsports1"), "http://x/stream?a=1&b=2");
  assert.equal(m.size, 3);
});

test("the first line for a network wins", () => {
  assert.equal(parseChannelLinks("ESPN = http://a\nESPN = http://b").get("espn"), "http://a");
});

test("script-capable and scheme-less links are dropped", () => {
  const m = parseChannelLinks("A = javascript:alert(1)\nB = data:text/html,x\nC = JavaScript:alert(1)\nD = just text\nE = vbscript:x\nF = channels://play/channel/6");
  assert.deepEqual([...m.keys()], ["f"]);
});

test("auto picks IINA on a Mac, VLC on iPhone and iPad, the raw link elsewhere", () => {
  assert.equal(resolvePlayer("auto", MAC, 0), "iina");
  assert.equal(resolvePlayer(undefined, IPHONE, 5), "vlc");
  assert.equal(resolvePlayer("auto", MAC, 5), "vlc"); // iPadOS Safari reports a Mac UA
  assert.equal(resolvePlayer("auto", WINDOWS, 0), "raw");
  assert.equal(resolvePlayer("vlc", MAC, 0), "vlc");
});

test("http links are wrapped in the player's scheme; app links pass through", () => {
  assert.equal(playerUrl(ESPN, "iina"), `iina://weblink?url=${encodeURIComponent(ESPN)}`);
  assert.equal(playerUrl(ESPN, "vlc"), `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(ESPN)}`);
  assert.equal(playerUrl(ESPN, "raw"), ESPN);
  assert.equal(playerUrl("channels://play/channel/6", "iina"), "channels://play/channel/6");
});

test("tvChannelLink uses the saved list; unlisted networks keep their website", () => {
  setTvChannelLinks(`ESPN = ${ESPN}`, "iina");
  assert.equal(tvChannelLink("ESPN"), `iina://weblink?url=${encodeURIComponent(ESPN)}`);
  assert.equal(tvChannelLink("ESPN+"), null);
  assert.equal(tvChannelLink("SEC Network"), null);
  setTvChannelLinks(undefined, undefined);
  assert.equal(tvChannelLink("ESPN"), null);
});

test("the player choice stays on this device; the list syncs", () => {
  const pushed = withoutDeviceLocalPrefs({ tvChannelLinks: `ESPN = ${ESPN}`, tvPlayer: "vlc" as const });
  assert.deepEqual(pushed, { tvChannelLinks: `ESPN = ${ESPN}` });
});

test("the RedZone header's show name matches the list line Jacob pastes", () => {
  const RZ = "http://tuner.test:9191/proxy/ts/stream/0000-redzone";
  setTvChannelLinks(`NFL RedZone, RedZone = ${RZ}`, "iina");
  // whiparound.ts sends the show name, "RedZone"; ESPN's chip says "NFL RedZone".
  assert.equal(tvChannelLink("RedZone"), `iina://weblink?url=${encodeURIComponent(RZ)}`);
  assert.equal(tvChannelLink("NFL RedZone"), `iina://weblink?url=${encodeURIComponent(RZ)}`);
  setTvChannelLinks("", "auto");
});

// Per-game links (9/29): Peacock has no fixed channel; a `{game}` line sends the
// game to the user's own resolver, which finds that game's stream.
const PEACOCK = "http://tuner.test:9192/game?{game}";
const CARD = {
  homeTeam: { displayName: "Houston Astros", shortDisplayName: "Astros", abbreviation: "HOU" },
  awayTeam: { displayName: "Chicago White Sox", shortDisplayName: "White Sox", abbreviation: "CHW" },
  date: "2026-09-29T21:00Z",
};

test("gameRef sends every name the board knows, once each; no teams = no game", () => {
  assert.deepEqual(gameRef(CARD), {
    home: ["Houston Astros", "Astros", "HOU"],
    away: ["Chicago White Sox", "White Sox", "CHW"],
    start: "2026-09-29T21:00Z",
  });
  assert.deepEqual(gameRef({ ...CARD, homeTeam: { displayName: "Brooklyn FC", shortDisplayName: "Brooklyn FC", abbreviation: "" } })?.home, ["Brooklyn FC"]);
  assert.equal(gameRef({ date: CARD.date }), undefined);
  assert.equal(gameRef({ ...CARD, date: "" }), undefined);
});

test("{game} fills with net, home, away and start, URL-encoded", () => {
  const q = new URLSearchParams(fillGameLink(PEACOCK, "Peacock", gameRef(CARD))!.split("?")[1]);
  assert.equal(q.get("net"), "Peacock");
  assert.deepEqual(q.getAll("home"), ["Houston Astros", "Astros", "HOU"]);
  assert.deepEqual(q.getAll("away"), ["Chicago White Sox", "White Sox", "CHW"]);
  assert.equal(q.get("start"), "2026-09-29T21:00Z");
  assert.match(gameQuery("A&B", { home: ["x y"], away: ["z=1"], start: "s" }), /^net=A%26B&home=x\+y&away=z%3D1&start=s$/);
  assert.equal(fillGameLink(ESPN, "ESPN"), ESPN);
  assert.equal(fillGameLink(PEACOCK, "Peacock"), null);
});

test("a {game} line opens the player with the game filled in; a chip with no game keeps the website", () => {
  setGameCheckFetch(null);
  setTvChannelLinks(`Peacock = ${PEACOCK}\nESPN = ${ESPN}`, "iina");
  const link = tvChannelLink("Peacock", gameRef(CARD))!;
  assert.ok(link.startsWith("iina://weblink?url="));
  const inner = decodeURIComponent(link.split("url=")[1]);
  assert.ok(inner.startsWith("http://tuner.test:9192/game?net=Peacock&home=Houston+Astros"));
  assert.ok(!inner.includes("{game}"));
  assert.equal(tvChannelLink("Peacock"), null); // golf / RedZone header: no game
  assert.equal(tvChannelLink("ESPN", gameRef(CARD)), `iina://weblink?url=${encodeURIComponent(ESPN)}`);
  setTvChannelLinks(`Peacock = ${PEACOCK}`, "vlc");
  assert.ok(tvChannelLink("Peacock", gameRef(CARD))!.startsWith("vlc-x-callback://x-callback-url/stream?url="));
  setTvChannelLinks("", "auto");
  assert.equal(tvChannelLink("Peacock", gameRef(CARD)), null); // blank list
});

test("{game} lines obey the block list", () => {
  assert.equal(parseChannelLinks("Peacock = javascript:go('{game}')").size, 0);
  assert.equal(parseChannelLinks("Peacock = data:text/html,{game}").size, 0);
});

test("the pre-check: 404 (no stream for this game) sends the chip to the website; other answers keep the player", async () => {
  const asked: string[] = [];
  const answer: Record<string, number | "throw"> = { HOU: 200, SD: 404, NYY: 500, ATL: "throw" };
  setGameCheckFetch(async (u) => {
    asked.push(u);
    const a = answer[new URLSearchParams(u.split("?")[1]).getAll("home").at(-1)!];
    if (a === "throw") throw new Error("offline");
    return { status: a };
  });
  setTvChannelLinks(`Peacock = ${PEACOCK}`, "raw");
  const card = (abbr: string) => ({ ...CARD, homeTeam: { ...CARD.homeTeam, abbreviation: abbr } });
  for (const t of ["HOU", "SD", "NYY", "ATL"]) assert.ok(tvChannelLink("Peacock", gameRef(card(t)))); // pending = player
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(asked.every((u) => u.endsWith("&check=1")) && asked.length === 4);
  assert.ok(tvChannelLink("Peacock", gameRef(card("HOU"))), "200 = player");
  assert.equal(tvChannelLink("Peacock", gameRef(card("SD"))), null, "404 = website");
  assert.ok(tvChannelLink("Peacock", gameRef(card("NYY"))), "500 = player");
  assert.ok(tvChannelLink("Peacock", gameRef(card("ATL"))), "no connection = player");
  assert.equal(asked.length, 4, "answers are cached, not re-asked on every render");
  const url = fillGameLink(PEACOCK, "Peacock", gameRef(card("SD")))!;
  assert.equal(gameCheckState(url), "miss");
  setGameCheckFetch(null);
  setTvChannelLinks("", "auto");
});

test("fixed channel links are never pre-checked", async () => {
  let n = 0;
  setGameCheckFetch(async () => { n++; return { status: 404 }; });
  setTvChannelLinks(`ESPN = ${ESPN}`, "raw");
  assert.equal(tvChannelLink("ESPN", gameRef(CARD)), ESPN);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(n, 0);
  setGameCheckFetch(null);
  setTvChannelLinks("", "auto");
});
