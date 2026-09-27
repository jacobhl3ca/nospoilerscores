import assert from "node:assert/strict";
import test from "node:test";

import { normNetwork, parseChannelLinks, playerUrl, resolvePlayer, setTvChannelLinks, tvChannelLink } from "../src/lib/tvChannelLinks.ts";
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
