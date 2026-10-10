import assert from "node:assert/strict";
import test from "node:test";

import { trackEvent } from "../src/lib/track.ts";
import { openLiveWatch, watchLinkProps } from "../src/lib/openExternal.ts";
import { setTvChannelLinks } from "../src/lib/tvChannelLinks.ts";

// Umami events, round 2 (2026-10-01): one fire-and-forget helper for every
// custom event. It must never throw, never send for ?demo=1 or the "Don't
// count my visits" toggle, and cut every value to 40 chars.

type Sent = { name: string; data?: Record<string, string> };

function fakeWindow(opts: { search?: string; disabled?: boolean; tracker?: "ok" | "throws" | "none" } = {}) {
  const sent: Sent[] = [];
  const store = new Map<string, string>();
  if (opts.disabled) store.set("umami.disabled", "1");
  const opened: string[] = [];
  const win: Record<string, unknown> = {
    location: { search: opts.search ?? "", assign: (u: string) => opened.push(u) },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    open: (u: string) => { opened.push(u); return null; },
    addEventListener: () => {},
  };
  if (opts.tracker !== "none") {
    win.umami = {
      track: (name: string, data?: Record<string, string>) => {
        if (opts.tracker === "throws") throw new Error("blocked");
        sent.push({ name, data });
      },
    };
  }
  (globalThis as unknown as { window: unknown }).window = win;
  return { sent, opened, win };
}

const click = () => ({ stopPropagation() {}, preventDefault() {} }) as unknown as React.MouseEvent;

test("sends the name and fields, each value cut to 40 chars", () => {
  const { sent } = fakeWindow();
  trackEvent("video-play", { player: "native", source: "x".repeat(60) });
  assert.deepEqual(sent, [{ name: "video-play", data: { player: "native", source: "x".repeat(40) } }]);
});

test("the picker's league list may ask for a longer cut", () => {
  const { sent } = fakeWindow();
  trackEvent("league-picker-done", { leagues: "y".repeat(120) }, 100);
  assert.equal(sent[0].data?.leagues.length, 100);
});

test("nothing goes out with umami.disabled = 1", () => {
  const { sent } = fakeWindow({ disabled: true });
  trackEvent("settings-open");
  assert.deepEqual(sent, []);
});

test("nothing goes out for a ?demo=1 session", () => {
  const { sent } = fakeWindow({ search: "?demo=1" });
  trackEvent("settings-open");
  assert.deepEqual(sent, []);
});

test("a tracker that throws never reaches the caller", () => {
  fakeWindow({ tracker: "throws" });
  assert.doesNotThrow(() => trackEvent("settings-open"));
});

test("a tracker that loads late still gets the event", async () => {
  const { win } = fakeWindow({ tracker: "none" });
  const sent: string[] = [];
  trackEvent("league-picker-shown");
  win.umami = { track: (name: string) => sent.push(name) };
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(sent, ["league-picker-shown"]);
});

test("tv-link-open fires once per tap on a listed chip, with network and league only", () => {
  const { sent, opened } = fakeWindow();
  setTvChannelLinks("ESPN = http://tuner.test/espn", "raw");
  watchLinkProps("ESPN", "https://www.espn.com/watch", undefined, "nfl").onClick(click());
  assert.deepEqual(sent, [{ name: "tv-link-open", data: { network: "ESPN", league: "nfl" } }]);
  assert.deepEqual(opened, ["http://tuner.test/espn"]);
  setTvChannelLinks("", "auto");
});

test("an unlisted chip opens the web link and sends nothing", () => {
  const { sent } = fakeWindow();
  setTvChannelLinks("", "auto");
  watchLinkProps("ESPN", "https://www.espn.com/watch", undefined, "nfl").onClick(click());
  assert.deepEqual(sent, []);
});

test("the live clock's own-stream open counts too; a web stream does not", () => {
  const { sent } = fakeWindow();
  setTvChannelLinks("NBC = http://tuner.test/nbc", "raw");
  openLiveWatch({ broadcasts: ["NBC"], streamUrl: "https://www.nbc.com/live", sport: "nfl" });
  setTvChannelLinks("", "auto");
  openLiveWatch({ broadcasts: ["NBC"], streamUrl: "https://www.nbc.com/live", sport: "nfl" });
  assert.deepEqual(sent, [{ name: "tv-link-open", data: { network: "NBC", league: "nfl" } }]);
});
